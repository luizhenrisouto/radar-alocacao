import { describe, expect, test } from "vitest";
import { alocacaoAtiva, custoDiario, diasDeBench, estaNoBench, receitaParadaPorDia, resumoBench } from "./bench";
import { alocacao, consultor, dados, empresa } from "./testes/fabrica";

const HOJE = "2026-11-17"; // terça

describe("bench", () => {
  test("quem tem alocação ativa não está no bench", () => {
    const c = consultor("c1");
    expect(estaNoBench(c, [alocacao("a1", "c1", "cli1", "2026-01-01", "2026-12-31")], HOJE)).toBe(false);
  });

  test("alocação que terminou na sexta: no bench há 2 dias úteis na terça", () => {
    const c = consultor("c1");
    const als = [alocacao("a1", "c1", "cli1", "2026-01-01", "2026-11-13", { status: "encerrada" })];
    expect(estaNoBench(c, als, HOJE)).toBe(true);
    expect(diasDeBench(c, als, HOJE)).toBe(2);
  });

  test("nunca alocado e admitido hoje: 0 dias e custo acumulado 0", () => {
    const c = consultor("c1", { admitidoEm: HOJE });
    expect(diasDeBench(c, [], HOJE)).toBe(0);
    const [item] = resumoBench(dados({ consultores: [c] }), HOJE);
    expect(item.custoAcumulado).toBe(0);
  });

  test("duas alocações ativas em clientes diferentes: não está no bench", () => {
    const als = [alocacao("a1", "c1", "cli1", "2026-01-01", null), alocacao("a2", "c1", "cli2", "2026-01-01", "2027-01-01")];
    expect(estaNoBench(consultor("c1"), als, HOJE)).toBe(false);
  });

  test("alocação prevista que começa amanhã não conta como ativa", () => {
    const a = alocacao("a1", "c1", "cli1", "2026-11-18", null, { status: "prevista" });
    expect(alocacaoAtiva(a, HOJE)).toBe(false);
    expect(estaNoBench(consultor("c1"), [a], HOJE)).toBe(true);
  });

  test("custo diário = custo mensal / dias úteis do mês", () => {
    expect(custoDiario(consultor("c1", { custoMensal: 11000 }), empresa)).toBe(500);
  });

  test("resumo do bench ordena por custo acumulado", () => {
    const d = dados({
      consultores: [consultor("c1", { admitidoEm: "2026-11-16" }), consultor("c2", { admitidoEm: "2026-11-02" }), consultor("c3")],
      alocacoes: [alocacao("a3", "c3", "cli1", "2026-01-01", null)],
    });
    const r = resumoBench(d, HOJE);
    expect(r.map((i) => i.consultor.id)).toEqual(["c2", "c1"]);
    expect(r[0].custoAcumulado).toBe(500 * 11);
  });

  test("receita parada por dia = valor/hora médio das ativas × 8 × pessoas no bench", () => {
    const d = dados({
      consultores: [consultor("c1"), consultor("c2"), consultor("c3"), consultor("c4")],
      alocacoes: [alocacao("a1", "c1", "cli1", "2026-01-01", null, { valorHora: 100 }), alocacao("a2", "c2", "cli1", "2026-01-01", null, { valorHora: 140 })],
    });
    expect(receitaParadaPorDia(d, HOJE)).toBe(1920);
  });
});
