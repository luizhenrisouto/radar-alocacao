import { describe, expect, test } from "vitest";
import { concentracao } from "./concentracao";
import { vencimentos } from "./contratos";
import { somarDias } from "./datas";
import { alocacao, cliente, consultor, dados } from "./testes/fabrica";

const HOJE = "2026-11-17";

describe("vencimentos", () => {
  test("faixas de 30, 60 e 90 dias; depois de 90 fica de fora", () => {
    const prazos = [10, 30, 31, 60, 90, 91];
    const d = dados({
      clientes: [cliente("cli1")],
      consultores: prazos.map((_, i) => consultor(`c${i}`)),
      alocacoes: prazos.map((p, i) => alocacao(`a${i}`, `c${i}`, "cli1", "2026-01-01", somarDias(HOJE, p))),
    });
    const v = vencimentos(d, HOJE);
    expect(v.map((x) => [x.diasRestantes, x.faixa])).toEqual([[10, 30], [30, 30], [31, 60], [60, 60], [90, 90]]);
    expect(v[0].cliente.id).toBe("cli1");
    expect(v[0].consultor.id).toBe("c0");
  });

  test("alocação sem fim nunca vence", () => {
    const d = dados({ clientes: [cliente("cli1")], consultores: [consultor("c1")], alocacoes: [alocacao("a1", "c1", "cli1", "2026-01-01", null)] });
    expect(vencimentos(d, HOJE)).toEqual([]);
  });
});

describe("concentração", () => {
  const dezAlocados = (porCliente: Record<string, number>) => {
    const als = [] as ReturnType<typeof alocacao>[];
    let n = 0;
    for (const [cli, qtd] of Object.entries(porCliente)) for (let i = 0; i < qtd; i++) { n++; als.push(alocacao(`a${n}`, `c${n}`, cli, "2026-01-01", null)); }
    return dados({
      clientes: Object.keys(porCliente).map((id) => cliente(id)),
      consultores: als.map((a) => consultor(a.consultorId)),
      alocacoes: als,
    });
  };

  test("40% num cliente dispara alerta; 30% não", () => {
    const r = concentracao(dezAlocados({ A: 4, B: 3, C: 3 }), HOJE);
    expect(r[0]).toMatchObject({ consultores: 4, parcelaConsultores: 0.4, alerta: true });
    expect(r[0].cliente.id).toBe("A");
    const b = r.find((x) => x.cliente.id === "B")!;
    expect(b.parcelaConsultores).toBeCloseTo(0.3);
    expect(b.alerta).toBe(false);
  });

  test("consultor em dois clientes conta em cada um, mas uma vez só no total", () => {
    const d = dados({
      clientes: [cliente("A"), cliente("B")],
      consultores: [consultor("c1"), consultor("c2")],
      alocacoes: [alocacao("a1", "c1", "A", "2026-01-01", null), alocacao("a2", "c1", "B", "2026-01-01", null), alocacao("a3", "c2", "B", "2026-01-01", null)],
    });
    const r = concentracao(d, HOJE);
    expect(r.find((x) => x.cliente.id === "A")!.parcelaConsultores).toBe(0.5);
    expect(r.find((x) => x.cliente.id === "B")!.parcelaConsultores).toBe(1);
  });

  test("receita mensal = soma de valor/hora × 168", () => {
    const d = dados({
      clientes: [cliente("A")],
      consultores: [consultor("c1"), consultor("c2")],
      alocacoes: [alocacao("a1", "c1", "A", "2026-01-01", null, { valorHora: 100 }), alocacao("a2", "c2", "A", "2026-01-01", null, { valorHora: 150 })],
    });
    expect(concentracao(d, HOJE)[0]).toMatchObject({ receitaMensal: 250 * 168, parcelaReceita: 1 });
  });
});
