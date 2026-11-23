// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { gerarNexo } from "../../../src/demo/nexo";
import { resumoBench } from "../../../src/regras/bench";
import { PREMISSAS_PADRAO, TEXTO_COOPERADO, contaManterOuDesligar } from "../../../src/regras/desligamento";
import type { DadosEmpresa } from "../../../src/regras/tipos";
import { apiDemo } from "../api-demo";
import Bench from "./Bench";

const HOJE = "2026-11-24";
const nexo = gerarNexo(HOJE);

beforeEach(() => localStorage.clear());

function abrir(dados: DadosEmpresa = nexo) {
  render(<Bench dados={dados} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} />);
}
const linha = (nome: string) => screen.getAllByTestId("bench-linha").find((l) => l.textContent?.includes(nome))!;
const diasUteis = (n: number) => `${n.toLocaleString("pt-BR")} dias úteis`;
const renata = nexo.consultores.find((c) => c.id === "c37")!;

test("cada pessoa no bench mostra até quando manter sai mais barato", () => {
  abrir();
  const itens = resumoBench(nexo, HOJE);
  expect(itens.length).toBeGreaterThan(0);
  for (const i of itens) {
    const n = contaManterOuDesligar(nexo, i.consultor, HOJE, PREMISSAS_PADRAO).pontoDeVirada!;
    expect(linha(i.consultor.nome)).toHaveTextContent(diasUteis(n));
    expect(linha(i.consultor.nome)).toHaveTextContent(i.consultor.regime);
  }
});

test("Ver a conta de um CLT mostra aviso, multa do FGTS e a nota das férias", async () => {
  abrir();
  await userEvent.click(within(linha("Renata Farias")).getByRole("button", { name: "Ver a conta" }));
  const conta = screen.getByTestId("conta");
  expect(conta).toHaveTextContent("Aviso prévio indenizado");
  expect(conta).toHaveTextContent("Multa de 40% do FGTS");
  expect(conta).toHaveTextContent("Férias e 13º proporcionais não entram");
  expect(conta).toHaveTextContent("Salário estimado: custo mensal ÷ 1,7");
  expect(conta).toHaveTextContent("Lei");
  expect(conta).toHaveTextContent("Estimativa");
  expect(conta).toHaveTextContent("A conta supõe que vai aparecer uma vaga para esse perfil.");
  expect(conta).toHaveTextContent(/A partir de hoje, por até \d+ dias úteis, manter sai mais barato/);
  expect(conta).toHaveTextContent("Margem perdida enquanto contrata");
  await userEvent.click(within(linha("Renata Farias")).getByRole("button", { name: "Fechar a conta" }));
  expect(screen.queryByTestId("conta")).not.toBeInTheDocument();
});

test("a coluna diz que o prazo conta a partir de hoje", () => {
  abrir();
  expect(screen.getByRole("columnheader", { name: "Manter por mais" })).toBeInTheDocument();
});

test("Ver a conta de um cooperado mostra o aviso de risco", async () => {
  abrir();
  await userEvent.click(within(linha("Sérgio Antunes")).getByRole("button", { name: "Ver a conta" }));
  expect(screen.getByTestId("conta")).toHaveTextContent(TEXTO_COOPERADO);
  expect(screen.getByTestId("conta")).not.toHaveTextContent("Multa de 40% do FGTS");
});

test("mudar dias para contratar recalcula e grava no navegador", () => {
  abrir();
  fireEvent.change(screen.getByLabelText("Dias para contratar (corridos)"), { target: { value: "90" } });
  const n = contaManterOuDesligar(nexo, renata, HOJE, { ...PREMISSAS_PADRAO, diasParaContratar: 90 }).pontoDeVirada!;
  expect(linha("Renata Farias")).toHaveTextContent(diasUteis(n));
  expect(localStorage.getItem("radar.premissas")).toContain('"diasParaContratar":90');
});

test("premissa apagada volta ao padrão sem mostrar NaN", () => {
  abrir();
  fireEvent.change(screen.getByLabelText("Fator de encargos CLT"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Rampa (% do primeiro mês)"), { target: { value: "-5" } });
  expect(document.body.textContent).not.toContain("NaN");
  const n = contaManterOuDesligar(nexo, renata, HOJE, PREMISSAS_PADRAO).pontoDeVirada!;
  expect(linha("Renata Farias")).toHaveTextContent(diasUteis(n));
});

test("desmarcar a receita parada recalcula", async () => {
  abrir();
  await userEvent.click(screen.getByLabelText("Contar a margem perdida enquanto contrata"));
  const n = contaManterOuDesligar(nexo, renata, HOJE, { ...PREMISSAS_PADRAO, contarReceitaParada: false }).pontoDeVirada!;
  expect(linha("Renata Farias")).toHaveTextContent(diasUteis(n));
});

test("Voltar aos padrões restaura os valores", async () => {
  abrir();
  const campo = screen.getByLabelText("Dias para contratar (corridos)");
  fireEvent.change(campo, { target: { value: "90" } });
  await userEvent.click(screen.getByRole("button", { name: "Voltar aos padrões" }));
  expect(campo).toHaveValue("45");
  const n = contaManterOuDesligar(nexo, renata, HOJE, PREMISSAS_PADRAO).pontoDeVirada!;
  expect(linha("Renata Farias")).toHaveTextContent(diasUteis(n));
});

test("abre com as premissas gravadas no navegador", () => {
  localStorage.setItem("radar.premissas", JSON.stringify({ ...PREMISSAS_PADRAO, diasParaContratar: 20 }));
  abrir();
  expect(screen.getByLabelText("Dias para contratar (corridos)")).toHaveValue("20");
});

test("pessoa sem custo cadastrado mostra sem custo cadastrado", () => {
  abrir({ ...nexo, consultores: nexo.consultores.map((c) => (c.id === "c40" ? { ...c, custoMensal: 0 } : c)) });
  expect(linha("Vítor Campos")).toHaveTextContent("sem custo cadastrado");
});
