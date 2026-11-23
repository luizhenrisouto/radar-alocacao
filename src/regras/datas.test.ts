import { expect, test } from "vitest";
import { diasEntre, diasUteisEntre, hojeSaoPaulo, somarDias } from "./datas";

test("hoje é a data de São Paulo, não a de UTC", () => {
  expect(hojeSaoPaulo(new Date("2026-11-18T02:30:00Z"))).toBe("2026-11-17");
});

test("somar dias atravessa o mês", () => {
  expect(somarDias("2026-11-28", 3)).toBe("2026-12-01");
  expect(somarDias("2026-12-01", -3)).toBe("2026-11-28");
});

test("dias corridos entre duas datas", () => {
  expect(diasEntre("2026-11-17", "2026-11-30")).toBe(13);
});

test("dias úteis contam segunda a sexta, depois de 'de' até 'ate' inclusive", () => {
  expect(diasUteisEntre("2026-11-13", "2026-11-17")).toBe(2);
  expect(diasUteisEntre("2026-11-17", "2026-11-17")).toBe(0);
  expect(diasUteisEntre("2026-11-20", "2026-11-10")).toBe(0);
  expect(diasUteisEntre("2026-11-01", "2026-11-30")).toBe(21);
});
