// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { gerarNexo } from "../../../src/demo/nexo";
import { pontoNexo } from "../../../src/demo/ponto-nexo";
import { mensagemPessoa, rotuloDia, type DadosPonto } from "../../../supabase/functions/_shared/ponto.ts";
import type { Api } from "../api";
import { apiDemo } from "../api-demo";
import Ponto from "./Ponto";

const HOJE = "2026-11-24";
const nexo = gerarNexo(HOJE);

function abrir(api: Api = apiDemo(HOJE)) {
  render(<Ponto dados={nexo} hoje={HOJE} api={api} recarregar={() => {}} />);
  return api;
}
const numero = (rotulo: string) => screen.getByText(rotulo).nextElementSibling;
const pessoa = async (nome: string) => (await screen.findAllByTestId("ponto-pessoa")).find((el) => el.textContent?.includes(nome))!;

test("mostra os números e as pessoas com pendência", async () => {
  abrir();
  expect(await screen.findAllByTestId("ponto-pessoa")).toHaveLength(5);
  expect(numero("Pendências abertas")).toHaveTextContent("6");
  expect(numero("Pessoas com pendência")).toHaveTextContent("5");
  expect(numero("Acertadas em 7 dias")).toHaveTextContent("2");
  expect(screen.getByText(/O Radar só envia mensagens neste módulo/)).toBeInTheDocument();
});

test("Ver mensagem mostra o texto que a pessoa recebe", async () => {
  abrir();
  const isabela = await pessoa("Isabela Teixeira");
  await userEvent.click(within(isabela).getByRole("button", { name: "Ver mensagem" }));
  const p = pontoNexo(HOJE);
  const col = p.colaboradores.find((c) => c.nome === "Isabela Teixeira")!;
  const m = mensagemPessoa(col, p.pendencias.filter((x) => x.matricula === col.matricula && x.resolvidaEm == null), HOJE, "RH");
  const caixa = within(isabela).getByTestId("ponto-mensagem");
  expect(caixa).toHaveTextContent(m.assunto);
  expect(caixa.textContent).toContain(m.texto.split("\n")[0]);
  expect(caixa.textContent).toContain("Por favor, ajuste no Senior");
});

test("Simular cobrança de hoje acrescenta envios Simulado e atualiza os lembretes", async () => {
  abrir();
  const antes = (await screen.findAllByTestId("ponto-envio")).length;
  await userEvent.click(screen.getByRole("button", { name: "Simular cobrança de hoje" }));
  expect(await screen.findByRole("status")).toHaveTextContent("5 mensagens simuladas.");
  const envios = await screen.findAllByTestId("ponto-envio");
  expect(envios.length).toBe(antes + 5);
  expect(envios[0]).toHaveTextContent("Simulado");
  expect(await pessoa("Bruno Carvalho")).toHaveTextContent("1 lembrete");
});

test("no modo real, Cobrar agora chama a api e recarrega", async () => {
  const p = pontoNexo(HOJE);
  const ponto = vi.fn(async () => p);
  const cobrarPonto = vi.fn(async () => ({ enviados: 4, falhas: 1 }));
  abrir({ ...apiDemo(HOJE), modo: "real", ponto, cobrarPonto });
  await userEvent.click(await screen.findByRole("button", { name: "Cobrar agora" }));
  expect(cobrarPonto).toHaveBeenCalled();
  expect(await screen.findByRole("status")).toHaveTextContent("4 mensagens enviadas, 1 falhou.");
  expect(ponto).toHaveBeenCalledTimes(2);
});

test("envio que falhou aparece com o erro", async () => {
  const p: DadosPonto = pontoNexo(HOJE);
  const falha = { ...p.envios[0], id: "f1", enviadoEm: `${HOJE}T12:00:00.000Z`, ok: false, erro: "resend 422" };
  abrir({ ...apiDemo(HOJE), ponto: async () => ({ ...p, envios: [...p.envios, falha] }) });
  expect((await screen.findAllByTestId("ponto-envio"))[0]).toHaveTextContent("Falhou: resend 422");
});

test("mostra Sem gestor e Gestor avisado", async () => {
  const p = pontoNexo(HOJE);
  const vitor = p.colaboradores.find((c) => c.emailGestor == null)!;
  const comVitor = { ...p, pendencias: [...p.pendencias, { ...p.pendencias[0], id: "pv", matricula: vitor.matricula }] };
  abrir({ ...apiDemo(HOJE), ponto: async () => comVitor });
  expect(await pessoa(vitor.nome)).toHaveTextContent("Sem gestor");
  expect(await pessoa("Otávio Barros")).toHaveTextContent("Gestor avisado");
});

test("no modo real, Salvar envia a configuração", async () => {
  const salvarConfigPonto = vi.fn(async () => {});
  abrir({ ...apiDemo(HOJE), modo: "real", ponto: async () => pontoNexo(HOJE), salvarConfigPonto });
  await userEvent.click(await screen.findByText("Configurações"));
  await userEvent.click(screen.getByLabelText("Teams"));
  await userEvent.clear(screen.getByLabelText("Nome do remetente"));
  await userEvent.type(screen.getByLabelText("Nome do remetente"), "RH Datum");
  await userEvent.clear(screen.getByLabelText("Avisar o gestor depois de (lembretes)"));
  await userEvent.type(screen.getByLabelText("Avisar o gestor depois de (lembretes)"), "3");
  await userEvent.type(screen.getByLabelText("URL do fluxo do Teams"), "https://fluxo.exemplo/abc");
  await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
  expect(salvarConfigPonto).toHaveBeenCalledWith({
    emailAtivo: true, teamsAtivo: true, remetenteNome: "RH Datum", intervaloDias: 1, escalarApos: 3, teamsUrl: "https://fluxo.exemplo/abc",
  });
  expect(await screen.findByText("Configurações salvas.")).toBeInTheDocument();
});

test("URL do Teams em branco não apaga a configurada", async () => {
  const salvarConfigPonto = vi.fn(async () => {});
  const p = pontoNexo(HOJE);
  abrir({ ...apiDemo(HOJE), modo: "real", ponto: async () => ({ ...p, config: { ...p.config, teamsConfigurado: true } }), salvarConfigPonto });
  await userEvent.click(await screen.findByText("Configurações"));
  expect(screen.getByLabelText("URL do fluxo do Teams")).toHaveAttribute("placeholder", "configurada");
  await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
  expect(salvarConfigPonto).toHaveBeenCalledWith(expect.objectContaining({ teamsUrl: null }));
});

test("no modo real, Enviar teste para mim chama a api", async () => {
  const testarEnvioPonto = vi.fn(async () => {});
  abrir({ ...apiDemo(HOJE), modo: "real", ponto: async () => pontoNexo(HOJE), testarEnvioPonto });
  await userEvent.click(await screen.findByText("Configurações"));
  await userEvent.click(screen.getByRole("button", { name: "Enviar teste para mim" }));
  expect(testarEnvioPonto).toHaveBeenCalled();
  expect(await screen.findByText("Teste enviado para o seu e-mail.")).toBeInTheDocument();
});

test("na demonstração, as configurações ficam travadas", async () => {
  abrir();
  await userEvent.click(await screen.findByText("Configurações"));
  expect(screen.getByLabelText("Nome do remetente")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  expect(screen.getByText("Entre com sua conta para configurar e enviar de verdade.")).toBeInTheDocument();
});

test("com uma rodada em andamento, avisa para tentar depois", async () => {
  abrir({ ...apiDemo(HOJE), modo: "real", ponto: async () => pontoNexo(HOJE), cobrarPonto: async () => ({ enviados: 0, falhas: 0, ocupado: true }) });
  await userEvent.click(await screen.findByRole("button", { name: "Cobrar agora" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Já há uma cobrança em andamento. Confira o registro em alguns minutos.");
});

test("Marcar como acertada fecha a pendência e conta como acertada", async () => {
  abrir();
  const p = pontoNexo(HOJE);
  const bruno = p.colaboradores.find((c) => c.nome === "Bruno Carvalho")!;
  const dia = p.pendencias.find((x) => x.matricula === bruno.matricula && x.resolvidaEm == null)!;
  const linha = await pessoa("Bruno Carvalho");
  await userEvent.click(within(linha).getByRole("button", { name: `Marcar ${rotuloDia(dia.data)} como acertada` }));
  expect(await screen.findByRole("status")).toHaveTextContent(`${rotuloDia(dia.data)} de Bruno Carvalho marcado como acertado.`);
  expect(screen.getAllByTestId("ponto-pessoa").some((el) => el.textContent?.includes("Bruno Carvalho"))).toBe(false);
  expect(numero("Acertadas em 7 dias")).toHaveTextContent("3");
});
