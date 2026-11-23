// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { gerarNexo } from "../../../src/demo/nexo";
import { escolherPorPercentual, simularCorte } from "../../../src/regras/corte";
import { PREMISSAS_PADRAO, contaDoGrupo } from "../../../src/regras/desligamento";
import { apiDemo } from "../api-demo";
import { diasUteis, reais } from "../formatar";
import SimularCorte from "./SimularCorte";

const HOJE = "2026-11-24";
const DATA = "2026-12-24";
const nexo = gerarNexo(HOJE);

function abrir(api = apiDemo(HOJE), recarregar = () => {}) {
  render(<SimularCorte dados={nexo} hoje={HOJE} api={api} recarregar={recarregar} />);
  return api;
}
const percentual = (v: number) => fireEvent.change(screen.getByLabelText("Quanto o cliente corta"), { target: { value: String(v) } });
const marcadas = () => screen.getAllByRole("checkbox").filter((c) => (c as HTMLInputElement).checked);
const numero = (rotulo: string) => screen.getByText(rotulo).nextElementSibling;

test("começa pelo cliente mais concentrado e com a data em hoje + 30 dias", () => {
  abrir();
  expect(screen.getByLabelText("Cliente")).toHaveDisplayValue("Cooperativa Saúde Sul");
  expect(screen.getByLabelText("Último dia")).toHaveValue(DATA);
});

test("50% marca 7 pessoas da Cooperativa e mostra os números da simulação", () => {
  abrir();
  percentual(50);
  expect(marcadas()).toHaveLength(7);
  const r = simularCorte(nexo, { clienteId: "cli1", consultorIds: escolherPorPercentual(nexo, "cli1", 0.5, HOJE, DATA), data: DATA }, HOJE);
  expect(numero("Pessoas afetadas")).toHaveTextContent("7");
  expect(numero("Receita perdida por mês")).toHaveTextContent(reais(r.receitaPerdidaMensal));
  expect(numero("Custo do bench por mês")).toHaveTextContent(reais(r.custoBenchMensal));
  expect(numero("Já têm vaga interna")).toHaveTextContent(`${r.comVagaInterna} de 7`);
});

test("marcar à mão substitui o percentual", async () => {
  abrir();
  percentual(50);
  await userEvent.click(marcadas()[0]);
  expect(numero("Pessoas afetadas")).toHaveTextContent("6");
});

test("registrar na demonstração pede confirmação, aplica o corte e recarrega", async () => {
  const recarregar = vi.fn();
  const api = abrir(apiDemo(HOJE), recarregar);
  percentual(50);
  await userEvent.click(screen.getByRole("button", { name: "Registrar corte" }));
  expect(screen.getByText("Encerrar 7 alocações em 24/12/2026?")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  expect(await screen.findByText("7 alocações encerradas.")).toBeInTheDocument();
  const ids = new Set(escolherPorPercentual(nexo, "cli1", 0.5, HOJE, DATA));
  const cortadas = (await api.dados()).alocacoes.filter((a) => ids.has(a.consultorId) && a.clienteId === "cli1");
  expect(cortadas.map((a) => a.fim)).toEqual(Array(7).fill(DATA));
  expect(recarregar).toHaveBeenCalled();
});

test("quem fica sem vaga interna tem atalho para o mercado", async () => {
  const navegar = vi.fn();
  render(<SimularCorte dados={nexo} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} navegar={navegar} />);
  percentual(50);
  const r = simularCorte(nexo, { clienteId: "cli1", consultorIds: escolherPorPercentual(nexo, "cli1", 0.5, HOJE, DATA), data: DATA }, HOJE);
  const semVaga = r.afetados.filter((a) => !a.vagaInterna && a.ficaSemAlocacao);
  expect(semVaga.length).toBeGreaterThan(0);
  await userEvent.click(screen.getAllByRole("button", { name: "Ver no mercado" })[0]);
  expect(navegar).toHaveBeenCalledWith("Mercado", semVaga[0].consultor.id);
});

test("no modo real, depois de registrar, avisa que reimportar a planilha antiga desfaz o corte", async () => {
  const api = { ...apiDemo(HOJE), modo: "real" as const, registrarCorte: vi.fn(async () => ({ encerradas: 7 })) };
  render(<SimularCorte dados={nexo} hoje={HOJE} api={api} recarregar={() => {}} />);
  percentual(50);
  await userEvent.click(screen.getByRole("button", { name: "Registrar corte" }));
  await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  expect(await screen.findByText(/7 alocações encerradas\. Atualize também a sua planilha de alocações/)).toBeInTheDocument();
});

test("sem ninguém marcado, Registrar corte fica desabilitado", () => {
  abrir();
  percentual(0);
  expect(screen.getByRole("button", { name: "Registrar corte" })).toBeDisabled();
});

test("50% mostra a conta de manter ou desligar do grupo", () => {
  localStorage.clear();
  abrir();
  percentual(50);
  const r = simularCorte(nexo, { clienteId: "cli1", consultorIds: escolherPorPercentual(nexo, "cli1", 0.5, HOJE, DATA), data: DATA }, HOJE);
  const ids = r.afetados.filter((a) => a.ficaSemAlocacao).map((a) => a.consultor.id);
  const g = contaDoGrupo(nexo, ids, HOJE, PREMISSAS_PADRAO);
  expect(screen.getByTestId("grupo-desligar")).toHaveTextContent(
    `Desligar os ${g.pessoas} custaria ${reais(g.totalDesligar)} agora e ${reais(g.totalRecontratar)} para recontratar depois. ` +
    `Manter os ${g.pessoas} parados custa ${reais(g.custoMensal)} por mês. Manter sai mais barato por até ${diasUteis(g.pontoDeVirada!)}.`,
  );
  expect(screen.getByTestId("grupo-desligar")).toHaveTextContent("45 dias para contratar, recrutamento de 1 custo mensal, rampa de 50%");
});

test("o grupo usa as premissas gravadas no navegador", () => {
  localStorage.setItem("radar.premissas", JSON.stringify({ ...PREMISSAS_PADRAO, diasParaContratar: 90 }));
  abrir();
  percentual(50);
  expect(screen.getByTestId("grupo-desligar")).toHaveTextContent("90 dias para contratar");
  localStorage.clear();
});

test("sem ninguém ficando sem vaga, o cartão não aparece", () => {
  abrir();
  percentual(0);
  expect(screen.queryByTestId("grupo-desligar")).not.toBeInTheDocument();
});

test("Ajustar premissas leva à aba Bench", async () => {
  const navegar = vi.fn();
  render(<SimularCorte dados={nexo} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} navegar={navegar} />);
  percentual(50);
  await userEvent.click(screen.getByRole("button", { name: "Ajustar premissas" }));
  expect(navegar).toHaveBeenCalledWith("Bench");
});
