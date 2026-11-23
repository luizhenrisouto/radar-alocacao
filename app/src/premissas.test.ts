// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PREMISSAS_PADRAO } from "../../src/regras/desligamento";
import { gravarPremissas, lerPremissas } from "./premissas";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

test("sem nada gravado, valem os padrões", () => {
  expect(lerPremissas()).toEqual(PREMISSAS_PADRAO);
});

test("grava e lê de volta", () => {
  gravarPremissas({ ...PREMISSAS_PADRAO, diasParaContratar: 60 });
  expect(localStorage.getItem("radar.premissas")).toContain('"diasParaContratar":60');
  expect(lerPremissas().diasParaContratar).toBe(60);
});

test("JSON inválido ou localStorage que lança erro dá os padrões", () => {
  localStorage.setItem("radar.premissas", "{não é json");
  expect(lerPremissas()).toEqual(PREMISSAS_PADRAO);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
  expect(lerPremissas()).toEqual(PREMISSAS_PADRAO);
});

test("gravar com o armazenamento bloqueado não quebra", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("cheio"); });
  expect(() => gravarPremissas(PREMISSAS_PADRAO)).not.toThrow();
});
