import { describe, expect, test } from "vitest";
import { resumoBench } from "../regras/bench";
import { concentracao } from "../regras/concentracao";
import { vencimentos } from "../regras/contratos";
import { rankearCandidatos } from "../regras/matching";
import { avaliarMatching, encaixesAntesDoFim } from "../regras/avaliacao";
import { GABARITO_NEXO, gerarNexo } from "./nexo";

describe.each(["2026-11-24", "2027-03-01"])("Nexo Consultoria em %s", (hoje) => {
  const d = gerarNexo(hoje);

  test("tem 40 consultores, 8 clientes e 10 vagas abertas", () => {
    expect(d.empresa.nome).toBe("Nexo Consultoria");
    expect(d.consultores).toHaveLength(40);
    expect(d.clientes).toHaveLength(8);
    expect(d.vagas.filter((v) => v.status === "aberta")).toHaveLength(10);
  });

  test("4 pessoas no bench", () => {
    expect(resumoBench(d, hoje)).toHaveLength(4);
  });

  test("a Cooperativa Saúde Sul concentra cerca de 36% e dispara o alerta", () => {
    const coop = concentracao(d, hoje)[0];
    expect(coop.cliente.nome).toBe("Cooperativa Saúde Sul");
    expect(coop.parcelaConsultores).toBeGreaterThanOrEqual(0.35);
    expect(coop.parcelaConsultores).toBeLessThanOrEqual(0.37);
    expect(coop.alerta).toBe(true);
  });

  test("7 contratos da Cooperativa vencem em até 60 dias", () => {
    const daCoop = vencimentos(d, hoje).filter((v) => v.cliente.nome === "Cooperativa Saúde Sul" && v.diasRestantes <= 60);
    expect(daCoop).toHaveLength(7);
  });

  test("e-mails únicos no domínio fictício", () => {
    const emails = d.consultores.map((c) => c.email);
    expect(new Set(emails).size).toBe(40);
    expect(emails.every((e) => e.endsWith("@nexo.exemplo"))).toBe(true);
  });

  test("toda vaga tem candidato, e há explicação salva para cada um", () => {
    for (const v of d.vagas) {
      const cands = rankearCandidatos(d, v.id, hoje);
      expect(cands.length, v.id).toBeGreaterThan(0);
      for (const c of cands) expect(d.matches.some((m) => m.vagaId === v.id && m.consultorId === c.consultor.id)).toBe(true);
    }
  });

  test("o matching acerta o gabarito nas 10 vagas", () => {
    expect(avaliarMatching(d, GABARITO_NEXO, hoje)).toEqual({ acertos: 10, total: 10 });
  });

  test("6 dos 7 que saem em até 60 dias já têm vaga com encaixe no top 3", () => {
    expect(encaixesAntesDoFim(d, hoje)).toEqual({ comEncaixe: 6, total: 7 });
  });
});

test("a demonstração tem os três regimes no bench", () => {
  const hoje = "2026-11-24";
  const regimes = new Set(resumoBench(gerarNexo(hoje), hoje).map((i) => i.consultor.regime));
  expect([...regimes].sort()).toEqual(["CLT", "Cooperado", "PJ"]);
});
