import { describe, expect, test } from "vitest";
import {
  PREMISSAS_PADRAO, TEXTO_COOPERADO, contaDoGrupo, contaManterOuDesligar, normalizarPremissas,
  type ContaPessoa, type Parcela,
} from "./desligamento";
import { alocacao, consultor, dados } from "./testes/fabrica";

const HOJE = "2026-11-18";
const P = PREMISSAS_PADRAO;
const parcela = (lista: Parcela[], chave: Parcela["chave"]) => lista.find((p) => p.chave === chave);
const valor = (lista: Parcela[], chave: Parcela["chave"]) => parcela(lista, chave)?.valor;
const todas = (c: ContaPessoa) => [...c.desligar, ...c.recontratar];

const clt = consultor("c1", { custoMensal: 17000, admitidoEm: "2024-05-10" });
const pj = consultor("c2", { regime: "PJ", custoMensal: 15000 });
const outro = consultor("c3");
const base = dados({
  consultores: [clt, pj, outro],
  alocacoes: [alocacao("a1", "c1", "cli1", "2025-01-01", "2026-10-31"), alocacao("a3", "c3", "cli1", "2026-01-01", null, { valorHora: 150 })],
});

describe("contaManterOuDesligar", () => {
  test("CLT sem salário estima pelo fator e soma aviso proporcional e multa do FGTS", () => {
    const c = contaManterOuDesligar(base, clt, HOJE, P);
    expect(c.salario).toBe(10000);
    expect(c.salarioEstimado).toBe(true);
    expect(c.diasAviso).toBe(36);
    expect(valor(c.desligar, "aviso")).toBeCloseTo(15373.33, 2);
    expect(valor(c.desligar, "multaFgts")).toBeCloseTo(10666.67, 2);
    expect(c.totalDesligar).toBeCloseTo(26040, 2);
    expect(valor(c.recontratar, "recrutamento")).toBeCloseTo(17000, 2);
    expect(valor(c.recontratar, "rampa")).toBeCloseTo(8500, 2);
    // margem perdida = 33 dias × (8 h × R$ 100 − R$ 17.000 ÷ 22) = 26.400 − 25.500
    expect(valor(c.recontratar, "margemPerdida")).toBeCloseTo(900, 2);
    expect(c.totalRecontratar).toBeCloseTo(26400, 2);
    expect(c.pontoDeVirada).toBe(67);
    // FGTS: 12 salários + 13º + 1/3 de férias por ano (as férias substituem o salário do mês); no aviso, sem FGTS sobre férias indenizadas.
    expect(parcela(c.desligar, "aviso")!.formula).toContain("× 1,28");
    expect(parcela(c.desligar, "multaFgts")!.formula).toContain("× 1,11");
    expect(Object.fromEntries(todas(c).map((p) => [p.chave, p.origem]))).toEqual({
      aviso: "lei", multaFgts: "lei", recrutamento: "estimativa", rampa: "estimativa", margemPerdida: "mercado",
    });
  });

  test("CLT com salário informado usa o salário e ignora o fator", () => {
    const c = contaManterOuDesligar(base, consultor("c9", { salario: 8000, admitidoEm: HOJE }), HOJE, P);
    expect(c.salario).toBe(8000);
    expect(c.salarioEstimado).toBe(false);
    expect(c.diasAviso).toBe(30);
    expect(valor(c.desligar, "aviso")).toBeCloseTo(10248.89, 2);
    expect(valor(c.desligar, "multaFgts")).toBe(0);
  });

  test("aviso CLT para em 90 dias", () => {
    expect(contaManterOuDesligar(base, consultor("c9", { admitidoEm: "2000-01-01" }), HOJE, P).diasAviso).toBe(90);
  });

  test("admissão no futuro não gera valor negativo", () => {
    const c = contaManterOuDesligar(base, consultor("c9", { admitidoEm: "2026-12-01" }), HOJE, P);
    expect(c.diasAviso).toBe(30);
    expect(valor(c.desligar, "multaFgts")).toBe(0);
    for (const p of todas(c)) expect(p.valor).toBeGreaterThanOrEqual(0);
  });

  test("PJ paga o aviso do contrato, sem multa, e usa a média da empresa quando não tem alocação", () => {
    const c = contaManterOuDesligar(base, pj, HOJE, P);
    expect(c.desligar.map((p) => p.chave)).toEqual(["aviso"]);
    expect(valor(c.desligar, "aviso")).toBeCloseTo(15000, 2);
    expect(c.salario).toBeNull();
    expect(valor(c.recontratar, "margemPerdida")).toBeCloseTo(39600 - 22500, 2);
    expect(c.pontoDeVirada).toBe(80);
    expect(c.aviso).toBeNull();
  });

  test("cooperado usa o aviso do cooperado e traz o aviso de risco", () => {
    const coop = consultor("c9", { regime: "Cooperado", custoMensal: 10000 });
    const c = contaManterOuDesligar(base, coop, HOJE, { ...P, diasAvisoCooperado: 45 });
    expect(valor(c.desligar, "aviso")).toBeCloseTo(15000, 2);
    expect(valor(c.desligar, "multaFgts")).toBeUndefined();
    expect(c.aviso).toBe(TEXTO_COOPERADO);
    expect(contaManterOuDesligar(base, clt, HOJE, P).aviso).toBeNull();
  });

  test("sem receita parada quando a premissa está desligada ou não há alocação ativa", () => {
    const desligada = contaManterOuDesligar(base, clt, HOJE, { ...P, contarReceitaParada: false });
    expect(parcela(desligada.recontratar, "margemPerdida")).toBeUndefined();
    expect(desligada.totalRecontratar).toBeCloseTo(25500, 2);
    const semAtivas = dados({ consultores: [pj] });
    expect(valor(contaManterOuDesligar(semAtivas, pj, HOJE, P).recontratar, "margemPerdida")).toBe(0);
  });

  test("margem negativa enquanto contrata conta como zero", () => {
    const caro = consultor("c9", { custoMensal: 40000 });
    const d = dados({ consultores: [caro], alocacoes: [alocacao("a9", "c9", "cli1", "2025-01-01", "2026-10-31")] });
    expect(valor(contaManterOuDesligar(d, caro, HOJE, P).recontratar, "margemPerdida")).toBe(0);
  });

  test("sem histórico, usa a média das alocações ativas da mesma senioridade", () => {
    const junior = consultor("j1", { senioridade: "junior", custoMensal: 6000 });
    const outroJunior = consultor("j2", { senioridade: "junior" });
    const senior = consultor("s1", { senioridade: "senior" });
    const d = dados({
      consultores: [junior, outroJunior, senior],
      alocacoes: [alocacao("a1", "j2", "cli1", "2026-01-01", null, { valorHora: 60 }), alocacao("a2", "s1", "cli1", "2026-01-01", null, { valorHora: 200 })],
    });
    const m = parcela(contaManterOuDesligar(d, junior, HOJE, P).recontratar, "margemPerdida")!;
    expect(m.valor).toBeCloseTo(33 * 8 * 60 - 33 * (6000 / 22), 2);
    expect(m.formula).toContain("média dos júnior alocados");
    const semJunior = dados({ consultores: [junior, senior], alocacoes: [alocacao("a2", "s1", "cli1", "2026-01-01", null, { valorHora: 200 })] });
    const m2 = parcela(contaManterOuDesligar(semJunior, junior, HOJE, P).recontratar, "margemPerdida")!;
    expect(m2.valor).toBeCloseTo(33 * 8 * 200 - 33 * (6000 / 22), 2);
    expect(m2.formula).toContain("média da empresa");
  });

  test("salário zero ou negativo é ignorado e o salário volta a ser estimado", () => {
    for (const salario of [0, -8000]) {
      const c = contaManterOuDesligar(base, consultor("c9", { salario, custoMensal: 17000, admitidoEm: "2024-05-10" }), HOJE, P);
      expect(c.salario).toBe(10000);
      expect(c.salarioEstimado).toBe(true);
      for (const p of todas(c)) expect(p.valor).toBeGreaterThanOrEqual(0);
    }
  });

  test("custo mensal 0 não tem ponto de virada", () => {
    const c = contaManterOuDesligar(base, consultor("c9", { custoMensal: 0 }), HOJE, P);
    expect(c.custoDiario).toBe(0);
    expect(c.pontoDeVirada).toBeNull();
  });
});

describe("contaDoGrupo", () => {
  test("o grupo soma desligar, recontratar e custo diário", () => {
    const a = contaManterOuDesligar(base, clt, HOJE, P);
    const b = contaManterOuDesligar(base, pj, HOJE, P);
    const g = contaDoGrupo(base, ["c1", "c2"], HOJE, P);
    expect(g.pessoas).toBe(2);
    expect(g.totalDesligar).toBeCloseTo(a.totalDesligar + b.totalDesligar, 2);
    expect(g.totalRecontratar).toBeCloseTo(a.totalRecontratar + b.totalRecontratar, 2);
    expect(g.custoMensal).toBe(32000);
    expect(g.custoDiario).toBeCloseTo(32000 / 22, 6);
    expect(g.pontoDeVirada).toBe(Math.floor((g.totalDesligar + g.totalRecontratar) / (32000 / 22)));
  });

  test("grupo vazio não tem ponto de virada", () => {
    const g = contaDoGrupo(base, [], HOJE, P);
    expect(g.pessoas).toBe(0);
    expect(g.pontoDeVirada).toBeNull();
  });
});

describe("normalizarPremissas", () => {
  test("normalizarPremissas troca campo inválido pelo padrão", () => {
    expect(normalizarPremissas({ fatorEncargosClt: 0.5, diasAvisoPj: -1, diasParaContratar: "x", rampaPercentual: 80 }))
      .toEqual({ ...PREMISSAS_PADRAO, rampaPercentual: 80 });
    expect(normalizarPremissas(null)).toEqual(PREMISSAS_PADRAO);
    expect(normalizarPremissas({ contarReceitaParada: false }).contarReceitaParada).toBe(false);
  });

  test("os padrões são os do spec", () => {
    expect(PREMISSAS_PADRAO).toEqual({
      fatorEncargosClt: 1.7, diasAvisoPj: 30, diasAvisoCooperado: 30, diasParaContratar: 45,
      recrutamentoMeses: 1, rampaPercentual: 50, contarReceitaParada: true,
    });
  });
});
