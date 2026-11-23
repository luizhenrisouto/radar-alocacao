// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { gerarNexo } from "../../../src/demo/nexo";
import { perfilPorRegra, setoresDe } from "../../../src/regras/mercado";
import type { DadosEmpresa, VagaExterna } from "../../../src/regras/tipos";
import type { Api } from "../api";
import { apiDemo } from "../api-demo";
import Mercado from "./Mercado";

const HOJE = "2026-11-24";
const nexo = gerarNexo(HOJE);
const TEXTO = "Buscamos QA Sênior\nPlaywright, Type Script e REST Assured. Desejável k6.";
const alfa: VagaExterna = {
  id: "x1", empresaAlvo: "Clínica Alfa", titulo: "QA Sênior", senioridade: "senior", skillsObrigatorias: ["Playwright", "TypeScript"],
  skillsDesejaveis: [], cidade: null, remoto: true, url: null, inicioPrevisto: "2026-12-24", origem: "regra", criadaEm: HOJE,
};
const comAlfa: DadosEmpresa = { ...nexo, vagasExternas: [alfa] };
const apiReal = (extra: Partial<Api>): Api => ({ ...apiDemo(HOJE), modo: "real", ...extra });

function abrir(dados: DadosEmpresa, api: Api = apiDemo(HOJE), extra: { recarregar?: () => void; foco?: string | null } = {}) {
  render(<Mercado dados={dados} hoje={HOJE} api={api} recarregar={extra.recarregar ?? (() => {})} foco={extra.foco ?? null} />);
}

test("colar uma vaga na demonstração extrai pela regra, permite editar e salvar", async () => {
  const api = apiDemo(HOJE);
  const recarregar = vi.fn();
  abrir(await api.dados(), api, { recarregar });
  await userEvent.type(screen.getByLabelText("Texto da vaga"), TEXTO);
  await userEvent.click(screen.getByRole("button", { name: "Ler vaga" }));
  const form = await screen.findByRole("form", { name: "Vaga lida" });
  expect(within(form).getByText("Regra")).toBeInTheDocument();
  expect(within(form).getByLabelText("Senioridade")).toHaveDisplayValue("Sênior");
  expect(within(form).getByLabelText("Skills obrigatórias")).toHaveValue("Playwright, TypeScript, Rest Assured, k6");
  await userEvent.type(within(form).getByLabelText("Empresa"), "Clínica Alfa");
  await userEvent.click(within(form).getByRole("button", { name: "Salvar vaga" }));
  const salvas = (await api.dados()).vagasExternas;
  expect(salvas).toHaveLength(1);
  expect(salvas[0]).toMatchObject({ empresaAlvo: "Clínica Alfa", titulo: "Buscamos QA Sênior", inicioPrevisto: "2026-12-24", origem: "regra" });
  expect(recarregar).toHaveBeenCalled();
});

test("com a IA, o formulário vem preenchido pela IA", async () => {
  const extrairVaga = vi.fn(async () => ({
    empresaAlvo: "Clínica Alfa", titulo: "QA Sênior", senioridade: "senior" as const, skillsObrigatorias: ["Playwright"], skillsDesejaveis: [], cidade: null, remoto: true,
  }));
  abrir(nexo, apiReal({ extrairVaga }));
  await userEvent.type(screen.getByLabelText("Texto da vaga"), TEXTO);
  await userEvent.click(screen.getByRole("button", { name: "Ler vaga" }));
  const form = await screen.findByRole("form", { name: "Vaga lida" });
  expect(within(form).getByText("IA")).toBeInTheDocument();
  expect(within(form).getByLabelText("Empresa")).toHaveValue("Clínica Alfa");
  expect(extrairVaga).toHaveBeenCalledWith(TEXTO);
});

test("vaga salva vira lead com quem encaixa", () => {
  abrir(comAlfa);
  const lead = screen.getAllByTestId("lead")[0];
  expect(lead).toHaveTextContent("Clínica Alfa");
  expect(lead).toHaveTextContent("Ana Ribeiro");
});

async function abrirPerfilDaAna() {
  const ana = screen.getAllByTestId("pessoa-mercado").find((el) => el.textContent?.includes("Ana Ribeiro"))!;
  await userEvent.click(within(ana).getByRole("button", { name: "Perfil anônimo" }));
  return screen.findByTestId("perfil");
}

test("perfil da IA que cita o nome cai para a regra", async () => {
  const perfilAnonimo = vi.fn(async () => ({ titulo: "QA Sênior", resumo: "Ana Ribeiro é QA com Playwright.", destaques: [], origem: "ia" as const }));
  abrir(comAlfa, apiReal({ perfilAnonimo }));
  const perfil = await abrirPerfilDaAna();
  const c01 = nexo.consultores.find((c) => c.id === "c01")!;
  expect(perfil).toHaveTextContent(perfilPorRegra(c01, setoresDe(nexo, "c01")).resumo);
  expect(within(perfil).getByText("Regra")).toBeInTheDocument();
  expect(perfil).not.toHaveTextContent("Ana Ribeiro");
});

test("perfil da IA que cita skill que a pessoa não tem cai para a regra", async () => {
  const perfilAnonimo = vi.fn(async () => ({ titulo: "QA Sênior", resumo: "Automação com Playwright e Kubernetes.", destaques: [], origem: "ia" as const }));
  abrir(comAlfa, apiReal({ perfilAnonimo }));
  const perfil = await abrirPerfilDaAna();
  expect(within(perfil).getByText("Regra")).toBeInTheDocument();
  expect(perfil).not.toHaveTextContent("Kubernetes");
});

test("e-mail da IA que cita skill fora dos perfis e das vagas cai para a regra", async () => {
  const rascunhoEmail = vi.fn(async () => ({ assunto: "Profissionais", corpo: "Temos gente forte em Terraform.", origem: "ia" as const }));
  abrir(comAlfa, apiReal({ rascunhoEmail }));
  await userEvent.click(within(screen.getAllByTestId("lead")[0]).getByRole("button", { name: "Rascunho de e-mail" }));
  const email = await screen.findByTestId("email");
  expect(within(email).getByText("Regra")).toBeInTheDocument();
});

test("enquanto a IA gera o perfil, mostra Gerando… e trava os outros pedidos", async () => {
  let responder: (p: { titulo: string; resumo: string; destaques: string[]; origem: "ia" }) => void = () => {};
  const perfilAnonimo = vi.fn(() => new Promise<any>((r) => { responder = r; }));
  abrir(comAlfa, apiReal({ perfilAnonimo }));
  const pessoas = screen.getAllByTestId("pessoa-mercado");
  const ana = pessoas.find((el) => el.textContent?.includes("Ana Ribeiro"))!;
  const outra = pessoas.find((el) => !el.textContent?.includes("Ana Ribeiro"))!;
  await userEvent.click(within(ana).getByRole("button", { name: "Perfil anônimo" }));
  expect(within(ana).getByRole("button", { name: "Gerando…" })).toBeDisabled();
  expect(within(outra).getByRole("button", { name: "Perfil anônimo" })).toBeDisabled();
  expect(within(screen.getAllByTestId("lead")[0]).getByRole("button", { name: "Rascunho de e-mail" })).toBeDisabled();
  responder({ titulo: "QA Sênior", resumo: "Automação de testes na saúde.", destaques: [], origem: "ia" });
  expect(await screen.findByTestId("perfil")).toHaveTextContent("Automação de testes na saúde.");
  expect(within(outra).getByRole("button", { name: "Perfil anônimo" })).toBeEnabled();
});

test("perfil anônimo da IA aparece com o selo IA e tem botão Imprimir", async () => {
  const perfilAnonimo = vi.fn(async () => ({ titulo: "QA Sênior", resumo: "Automação de testes na saúde.", destaques: ["Playwright"], origem: "ia" as const }));
  abrir(comAlfa, apiReal({ perfilAnonimo }));
  const perfil = await abrirPerfilDaAna();
  expect(perfil).toHaveTextContent("Automação de testes na saúde.");
  expect(within(perfil).getByText("IA")).toBeInTheDocument();
  expect(within(perfil).getByText(/Perfil · Nexo Consultoria/)).toBeInTheDocument();
  expect(within(perfil).getByRole("button", { name: "Imprimir" })).toBeInTheDocument();
});

test("rascunho de e-mail tem Copiar e não tem Enviar", async () => {
  abrir(comAlfa);
  await userEvent.click(within(screen.getAllByTestId("lead")[0]).getByRole("button", { name: "Rascunho de e-mail" }));
  const email = await screen.findByTestId("email");
  expect((within(email).getByLabelText("Corpo") as HTMLTextAreaElement).value).toContain("Clínica Alfa");
  expect(within(email).getByRole("button", { name: "Copiar" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Enviar/ })).not.toBeInTheDocument();
});

test("foco numa pessoa abre os encaixes dela", () => {
  abrir(comAlfa, apiDemo(HOJE), { foco: "c01" });
  const ana = screen.getAllByTestId("pessoa-mercado").find((el) => el.textContent?.includes("Ana Ribeiro"))!;
  expect(ana).toHaveAttribute("aria-current", "true");
  expect(ana).toHaveTextContent("QA Sênior · Clínica Alfa");
});

test("foco em quem ainda não sai (vindo do simulador de corte) também aparece em Por pessoa", () => {
  abrir(comAlfa, apiDemo(HOJE), { foco: "c08" });
  const foco = screen.getAllByTestId("pessoa-mercado").find((el) => el.getAttribute("aria-current") === "true");
  expect(foco).toHaveTextContent("Henrique Prado");
});

test("apagar uma vaga do mercado chama a api e recarrega", async () => {
  const apagarVagaExterna = vi.fn(async () => {});
  const recarregar = vi.fn();
  abrir(comAlfa, apiReal({ apagarVagaExterna }), { recarregar });
  await userEvent.click(within(screen.getByTestId("vaga-externa")).getByRole("button", { name: "Apagar" }));
  expect(apagarVagaExterna).toHaveBeenCalledWith("x1");
  expect(recarregar).toHaveBeenCalled();
});
