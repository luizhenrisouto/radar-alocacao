import { expect, test } from "vitest";
import { dataBr, porcento, reais } from "./formatar";

test("reais no formato brasileiro, com espaço comum", () => {
  expect(reais(1234.56)).toBe("R$ 1.234,56");
  expect(reais(500)).toBe("R$ 500,00");
});

test("data dd/mm/aaaa", () => {
  expect(dataBr("2026-12-05")).toBe("05/12/2026");
});

test("porcentagem inteira", () => {
  expect(porcento(0.35)).toBe("35%");
  expect(porcento(0.3611)).toBe("36%");
});
