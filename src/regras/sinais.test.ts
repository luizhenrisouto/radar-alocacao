import { expect, test } from "vitest";
import { nivelRisco, notaRisco } from "./sinais";
import type { Sinal, TipoSinal } from "./tipos";

const HOJE = "2026-11-24";
let n = 0;
function sinal(tipo: TipoSinal, gravidade: number, publicadoEm: string, clienteId = "cli1"): Sinal {
  n += 1;
  return { id: `s${n}`, clienteId, titulo: "x", url: null, fonte: "", publicadoEm, tipo, gravidade, resumo: "", origem: "regra" };
}

test("sinal de hoje com gravidade 3 vale 45", () => {
  expect(notaRisco([sinal("corte", 3, HOJE)], "cli1", HOJE)).toBe(45);
});

test("sinal de 45 dias vale metade", () => {
  expect(notaRisco([sinal("corte", 3, "2026-10-10")], "cli1", HOJE)).toBe(22.5);
});

test("sinal com mais de 90 dias não conta, e só conta o cliente pedido", () => {
  expect(notaRisco([sinal("corte", 3, "2026-08-01"), sinal("corte", 3, HOJE, "cli2")], "cli1", HOJE)).toBe(0);
});

test("expansão e irrelevante não contam", () => {
  expect(notaRisco([sinal("expansao", 1, HOJE), sinal("irrelevante", 0, HOJE)], "cli1", HOJE)).toBe(0);
});

test("a nota tem teto de 100", () => {
  expect(notaRisco([sinal("corte", 3, HOJE), sinal("corte", 3, HOJE), sinal("resultado_ruim", 2, HOJE)], "cli1", HOJE)).toBe(100);
});

test("níveis em 20 e 50", () => {
  expect(nivelRisco(19)).toBe("baixo");
  expect(nivelRisco(20)).toBe("atencao");
  expect(nivelRisco(49.9)).toBe("atencao");
  expect(nivelRisco(50)).toBe("alto");
});
