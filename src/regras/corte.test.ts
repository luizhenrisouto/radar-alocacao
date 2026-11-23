import { expect, test } from "vitest";
import { aplicarCorte, escolherPorPercentual, simularCorte } from "./corte";
import { alocacao, cliente, consultor, dados, vaga } from "./testes/fabrica";

const HOJE = "2026-11-24";

function quatroNaCooperativa() {
  return dados({
    clientes: [cliente("cli1"), cliente("cli2")],
    consultores: ["c1", "c2", "c3", "c4"].map((id) => consultor(id)),
    alocacoes: [
      alocacao("a1", "c1", "cli1", "2026-01-01", "2027-01-10"),
      alocacao("a2", "c2", "cli1", "2026-01-01", "2026-12-20"),
      alocacao("a3", "c3", "cli1", "2026-01-01", null),
      alocacao("a4", "c4", "cli1", "2026-01-01", "2027-03-01"),
    ],
  });
}

test("escolherPorPercentual tira primeiro quem tem contrato terminando antes", () => {
  expect(escolherPorPercentual(quatroNaCooperativa(), "cli1", 0.5, HOJE, "2026-12-15")).toEqual(["c2", "c1"]);
});

test("quem já sai até a data não entra no corte por percentual", () => {
  // c2 termina em 20/12, antes do corte em 31/12: saem c1 e c4 (sem fim fica por último).
  expect(escolherPorPercentual(quatroNaCooperativa(), "cli1", 0.5, HOJE, "2026-12-31")).toEqual(["c1", "c4"]);
  expect(escolherPorPercentual(quatroNaCooperativa(), "cli1", 1, HOJE, "2026-12-31")).toEqual(["c1", "c4", "c3"]);
});

test("percentual arredonda para cima e 0% não tira ninguém", () => {
  const d = dados({
    clientes: [cliente("cli1")],
    consultores: ["c1", "c2", "c3"].map((id) => consultor(id)),
    alocacoes: ["c1", "c2", "c3"].map((id) => alocacao(`a${id}`, id, "cli1", "2026-01-01", null)),
  });
  expect(escolherPorPercentual(d, "cli1", 0.34, HOJE, "2026-12-31")).toHaveLength(2);
  expect(escolherPorPercentual(d, "cli1", 0, HOJE, "2026-12-31")).toEqual([]);
});

test("aplicarCorte encerra na data só a alocação do cliente cortado", () => {
  const d = dados({
    clientes: [cliente("cli1"), cliente("cli2")],
    consultores: [consultor("c1")],
    alocacoes: [alocacao("a1", "c1", "cli1", "2026-01-01", null), alocacao("a2", "c1", "cli2", "2026-01-01", null)],
  });
  const r = aplicarCorte(d, { clienteId: "cli1", consultorIds: ["c1"], data: "2026-12-31" });
  expect(r.dados.alocacoes.find((a) => a.id === "a1")?.fim).toBe("2026-12-31");
  expect(r.dados.alocacoes.find((a) => a.id === "a2")?.fim).toBeNull();
  expect(r.cortadas).toHaveLength(1);
  expect(d.alocacoes[0].fim).toBeNull();
});

test("contrato que já terminaria antes da data não muda", () => {
  const d = dados({
    clientes: [cliente("cli1")],
    consultores: [consultor("c1")],
    alocacoes: [alocacao("a1", "c1", "cli1", "2026-01-01", "2026-12-10")],
  });
  expect(aplicarCorte(d, { clienteId: "cli1", consultorIds: ["c1"], data: "2026-12-31" }).cortadas).toEqual([]);
});

test("simularCorte soma a receita perdida e o custo do bench", () => {
  const d = dados({
    clientes: [cliente("cli1")],
    consultores: [consultor("c1"), consultor("c2")],
    alocacoes: [alocacao("a1", "c1", "cli1", "2026-01-01", null), alocacao("a2", "c2", "cli1", "2026-01-01", null)],
  });
  const r = simularCorte(d, { clienteId: "cli1", consultorIds: ["c1", "c2"], data: "2026-12-31" }, HOJE);
  expect(r.afetados).toHaveLength(2);
  expect(r.receitaPerdidaMensal).toBe(33600);
  expect(r.custoBenchMensal).toBe(22000);
  expect(r.custoBenchDia).toBe(1000);
});

test("quem tem outra alocação ativa não entra no custo do bench", () => {
  const d = dados({
    clientes: [cliente("cli1"), cliente("cli2")],
    consultores: [consultor("c1")],
    alocacoes: [alocacao("a1", "c1", "cli1", "2026-01-01", null), alocacao("a2", "c1", "cli2", "2026-01-01", null)],
  });
  const r = simularCorte(d, { clienteId: "cli1", consultorIds: ["c1"], data: "2026-12-31" }, HOJE);
  expect(r.afetados[0].ficaSemAlocacao).toBe(false);
  expect(r.custoBenchMensal).toBe(0);
});

test("quem fica no top 3 de uma vaga aberta conta como vaga interna", () => {
  const d = dados({
    clientes: [cliente("cli1"), cliente("cli2")],
    consultores: [consultor("c1", { skills: ["Java"] })],
    alocacoes: [alocacao("a1", "c1", "cli1", "2026-01-01", null)],
    vagas: [vaga("v1", { clienteId: "cli2", skillsObrigatorias: ["Java"], inicioPrevisto: "2027-01-15" })],
  });
  const r = simularCorte(d, { clienteId: "cli1", consultorIds: ["c1"], data: "2026-12-31" }, HOJE);
  expect(r.afetados[0].vagaInterna?.vaga.id).toBe("v1");
  expect(r.afetados[0].vagaInterna?.posicao).toBe(1);
  expect(r.comVagaInterna).toBe(1);
});

test("parcela do cliente antes e depois do corte", () => {
  const d = dados({
    clientes: [cliente("cli1"), cliente("cli2")],
    consultores: ["c1", "c2", "c3", "c4"].map((id) => consultor(id)),
    alocacoes: [
      alocacao("a1", "c1", "cli1", "2026-01-01", null),
      alocacao("a2", "c2", "cli1", "2026-01-01", null),
      alocacao("a3", "c3", "cli2", "2026-01-01", null),
      alocacao("a4", "c4", "cli2", "2026-01-01", null),
    ],
  });
  const r = simularCorte(d, { clienteId: "cli1", consultorIds: ["c1"], data: "2026-12-31" }, HOJE);
  expect(r.parcelaAntes).toBe(0.5);
  expect(r.parcelaDepois).toBeCloseTo(1 / 3);
});

test("data no passado deixa a pessoa no bench já", () => {
  const d = dados({
    clientes: [cliente("cli1")],
    consultores: [consultor("c1")],
    alocacoes: [alocacao("a1", "c1", "cli1", "2026-01-01", null)],
  });
  const r = simularCorte(d, { clienteId: "cli1", consultorIds: ["c1"], data: "2026-11-20" }, HOJE);
  expect(r.afetados[0].ficaSemAlocacao).toBe(true);
});
