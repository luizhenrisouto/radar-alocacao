import { beforeEach, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { USUARIO_A, criarEmpresaComMembro, importar, novoBanco } from "./apoio";

const pessoa = (extra: Record<string, unknown>) => ({
  linha: 2, nome: "Ana", email: "ana@x.com", cargo: "QA", senioridade: "senior", skills: [], regime: "CLT", custoMensal: 14000,
  cidade: null, aceitaRemoto: true, admitidoEm: "2025-01-10", ...extra,
});

let db: PGlite;
beforeEach(async () => {
  db = await novoBanco();
  await criarEmpresaComMembro(db, USUARIO_A, "Empresa A");
});

test("importar grava cooperado e salário, e o update também", async () => {
  expect((await importar(db, USUARIO_A, "consultores", [pessoa({ regime: "Cooperado", salario: 8000 })])).erros).toEqual([]);
  expect((await db.query("select regime, salario::float as salario from consultores")).rows).toEqual([{ regime: "Cooperado", salario: 8000 }]);
  await importar(db, USUARIO_A, "consultores", [pessoa({ regime: "Cooperado", salario: 9000 })]);
  expect((await db.query("select regime, salario::float as salario from consultores")).rows).toEqual([{ regime: "Cooperado", salario: 9000 }]);
  await importar(db, USUARIO_A, "consultores", [pessoa({ regime: "PJ", salario: null })]);
  expect((await db.query("select regime, salario from consultores")).rows).toEqual([{ regime: "PJ", salario: null }]);
});

test("regime fora da lista é recusado pelo banco", async () => {
  await expect(importar(db, USUARIO_A, "consultores", [pessoa({ regime: "Autônomo" })])).rejects.toThrow(/regime/);
});
