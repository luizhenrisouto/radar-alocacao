// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { gerarNexo } from "../../../src/demo/nexo";
import { rankearCandidatos } from "../../../src/regras/matching";
import { consultor, dados, vaga } from "../../../src/regras/testes/fabrica";
import type { Api } from "../api";
import { apiDemo } from "../api-demo";
import Bench from "./Bench";
import Vagas from "./Vagas";

const HOJE = "2026-11-24";
const nexo = gerarNexo(HOJE);

function apiReal(explicar: Api["explicar"]): Api {
  return { ...apiDemo(HOJE), modo: "real", explicar };
}

test("abrir uma vaga mostra os candidatos em ordem de nota, com explicação", async () => {
  render(<Vagas dados={nexo} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /Dev Java Pleno · Pagamentos/ }));
  const esperados = rankearCandidatos(nexo, "v03", HOJE).map((c) => c.consultor.nome);
  const nomes = screen.getAllByTestId("candidato").map((el) => within(el).getByRole("heading").textContent);
  expect(nomes).toEqual(esperados);
  expect(screen.getAllByTestId("candidato")[0]).toHaveTextContent("Cobre todas as skills obrigatórias.");
  expect(screen.queryByRole("button", { name: "Gerar de novo com IA" })).not.toBeInTheDocument();
});

test("vaga que ninguém cobre mostra a mensagem, sem erro", () => {
  const d = dados({ consultores: [consultor("c1", { skills: ["Python"] })], vagas: [vaga("v1", { titulo: "Dev Cobol", skillsObrigatorias: ["Cobol"] })] });
  render(<Vagas dados={d} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} />);
  expect(screen.getByText("Nenhum consultor cobre as skills obrigatórias desta vaga.")).toBeInTheDocument();
});

test("se a IA falhar, avisa e mantém a lista com a explicação da regra", async () => {
  const api = apiReal(() => Promise.reject(new Error("fora do ar")));
  render(<Vagas dados={nexo} hoje={HOJE} api={api} recarregar={() => {}} />);
  const antes = screen.getAllByTestId("candidato").length;
  await userEvent.click(screen.getByRole("button", { name: "Gerar de novo com IA" }));
  expect(await screen.findByText("Não foi possível gerar agora; mostrando a explicação da regra.")).toBeInTheDocument();
  expect(screen.getAllByTestId("candidato")).toHaveLength(antes);
});

test("com a IA respondendo, mostra as novas explicações com o selo IA", async () => {
  const api = apiReal(async (v, cands) =>
    cands.map((c) => ({ vagaId: v.id, consultorId: c.consultor.id, nota: c.nota, explicacao: `Texto da IA para ${c.consultor.nome}`, origem: "ia", geradoEm: HOJE })),
  );
  render(<Vagas dados={nexo} hoje={HOJE} api={api} recarregar={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "Gerar de novo com IA" }));
  const primeiro = (await screen.findAllByTestId("candidato"))[0];
  expect(await within(primeiro).findByText(/^Texto da IA para/)).toBeInTheDocument();
  expect(within(primeiro).getByText("IA")).toBeInTheDocument();
});

test("bench mostra o custo acumulado total e uma linha por pessoa", () => {
  render(<Bench dados={nexo} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} />);
  expect(screen.getByText(/^Custo acumulado:/)).toBeInTheDocument();
  expect(screen.getAllByRole("row")).toHaveLength(5); // cabeçalho + 4
});
