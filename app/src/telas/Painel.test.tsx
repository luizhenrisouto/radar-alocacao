// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { GABARITO_SINAIS } from "../../../src/demo/gabarito-sinais";
import { avaliarClassificacao } from "../../../src/regras/avaliacao";
import type { Sinal } from "../../../src/regras/tipos";
import { classificarPorRegra } from "../../../supabase/functions/_shared/sinais.ts";
import type { Api } from "../api";
import { gerarNexo } from "../../../src/demo/nexo";
import { alocacao, cliente, consultor, dados } from "../../../src/regras/testes/fabrica";
import { concentracao } from "../../../src/regras/concentracao";
import { apiDemo } from "../api-demo";
import { reais } from "../formatar";
import Painel from "./Painel";

const HOJE = "2026-11-24";

test("conta a história da Nexo: bench, alerta de concentração e como medimos", () => {
  render(<Painel dados={gerarNexo(HOJE)} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} />);
  expect(screen.getByText("No bench").nextElementSibling).toHaveTextContent("4");
  expect(screen.getByText("Cooperativa Saúde Sul concentra 36% dos alocados e 7 contratos vencem em até 60 dias.")).toBeInTheDocument();
  expect(screen.getByText("Acerto do matching: 10 de 10 vagas (gabarito no top 3)")).toBeInTheDocument();
  expect(screen.getByText("Quem sai nos próximos 60 dias e já tem vaga: 6 de 7")).toBeInTheDocument();
});

test("concentração mostra a receita mensal de cada cliente", () => {
  const nexo = gerarNexo(HOJE);
  render(<Painel dados={nexo} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} />);
  const coop = concentracao(nexo, HOJE).find((r) => r.cliente.id === "cli1")!;
  expect(screen.getByText(`${reais(coop.receitaMensal)}/mês`)).toBeInTheDocument();
});

test("na Nexo, a Cooperativa aparece com risco alto nas notícias", () => {
  render(<Painel dados={gerarNexo(HOJE)} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} />);
  const linhas = [...document.querySelectorAll(".barra-linha")];
  expect(linhas.find((el) => el.textContent?.includes("Cooperativa Saúde Sul"))).toHaveTextContent("Notícias: alto");
  expect(linhas.find((el) => el.textContent?.includes("LogTrans"))).not.toHaveTextContent("Notícias");
});

test("o card de notícias lista os sinais mais recentes sem os irrelevantes", () => {
  render(<Painel dados={gerarNexo(HOJE)} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} />);
  const itens = within(screen.getByRole("region", { name: "Notícias dos clientes" })).getAllByRole("listitem");
  expect(itens).toHaveLength(4);
  expect(itens[0]).toHaveTextContent("Corte");
  expect(itens[0]).toHaveTextContent("Cooperativa Saúde Sul");
  expect(itens[0]).toHaveTextContent("exemplo fictício");
  expect(within(itens[0]).queryByRole("link")).not.toBeInTheDocument();
});

const sinalReal: Sinal = {
  id: "s1", clienteId: "A", titulo: "Banco A demite 100", url: "https://exemplo.com/n1", fonte: "Jornal", publicadoEm: "2026-11-20",
  tipo: "corte", gravidade: 3, resumo: "Demissão de 100 pessoas.", origem: "ia",
};

test("notícia real abre em outra aba", () => {
  render(<Painel dados={dados({ clientes: [cliente("A", "Banco A")], sinais: [sinalReal] })} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} />);
  const link = screen.getByRole("link", { name: /Abrir notícia/ });
  expect(link).toHaveAttribute("href", "https://exemplo.com/n1");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

test("Buscar agora só aparece no modo real, mostra quantas chegaram e recarrega", async () => {
  render(<Painel dados={gerarNexo(HOJE)} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} />);
  expect(screen.queryByRole("button", { name: "Buscar agora" })).not.toBeInTheDocument();
  cleanup();
  const recarregar = vi.fn();
  const api: Api = { ...apiDemo(HOJE), modo: "real", buscarSinais: vi.fn(async () => ({ novos: 3 })) };
  render(<Painel dados={gerarNexo(HOJE)} hoje={HOJE} api={api} recarregar={recarregar} />);
  await userEvent.click(screen.getByRole("button", { name: "Buscar agora" }));
  expect(await screen.findByText("3 notícias novas.")).toBeInTheDocument();
  expect(recarregar).toHaveBeenCalled();
});

test("se a busca falhar, avisa sem quebrar o painel", async () => {
  const api: Api = { ...apiDemo(HOJE), modo: "real", buscarSinais: vi.fn(async () => { throw new Error("fora"); }) };
  render(<Painel dados={gerarNexo(HOJE)} hoje={HOJE} api={api} recarregar={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "Buscar agora" }));
  expect(await screen.findByText("Não foi possível buscar agora.")).toBeInTheDocument();
  expect(screen.getByText("No bench")).toBeInTheDocument();
});

test("Como medimos mostra o acerto da classificação de notícias", () => {
  render(<Painel dados={gerarNexo(HOJE)} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} />);
  const r = avaliarClassificacao(GABARITO_SINAIS, (t) => classificarPorRegra(t).tipo);
  expect(screen.getByText(new RegExp(`^Classificação de notícias: ${r.acertos} de 30 pela regra`))).toBeInTheDocument();
});

test("sem cliente acima do limite, não mostra o alerta", () => {
  const d = dados({
    clientes: [cliente("A"), cliente("B"), cliente("C"), cliente("D")],
    consultores: ["1", "2", "3", "4"].map((i) => consultor(`c${i}`)),
    alocacoes: ["A", "B", "C", "D"].map((cli, i) => alocacao(`a${i}`, `c${i + 1}`, cli, "2026-01-01", null)),
  });
  render(<Painel dados={d} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText(/Acerto do matching/)).not.toBeInTheDocument();
});
