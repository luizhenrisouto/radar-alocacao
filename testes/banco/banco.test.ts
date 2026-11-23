import { beforeEach, describe, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { USUARIO_A, USUARIO_B, como, criarEmpresaComMembro, importar, novoBanco, um } from "./apoio";

const ana = { linha: 2, nome: "Ana", email: "Ana@Exemplo.com", cargo: "QA", senioridade: "senior", skills: ["Playwright"], regime: "CLT", custoMensal: 14000, cidade: null, aceitaRemoto: true, admitidoEm: "2025-01-10" };
const beto = { ...ana, linha: 3, nome: "Beto", email: "beto@exemplo.com", senioridade: "pleno" };

let db: PGlite;
beforeEach(async () => {
  db = await novoBanco();
  await criarEmpresaComMembro(db, USUARIO_A, "Empresa A");
  await criarEmpresaComMembro(db, USUARIO_B, "Empresa B");
});

describe("acesso", () => {
  test("cada usuário só vê e altera os consultores da própria empresa", async () => {
    await importar(db, USUARIO_A, "consultores", [ana]);
    await importar(db, USUARIO_B, "consultores", [beto]);
    const vistosPorA = await como(db, "authenticated", USUARIO_A, async () => (await db.query<{ nome: string }>("select nome from consultores")).rows);
    expect(vistosPorA.map((r) => r.nome)).toEqual(["Ana"]);
    const alterados = await como(db, "authenticated", USUARIO_A, async () => (await db.query("update consultores set cargo = 'X' where nome = 'Beto'")).affectedRows);
    expect(alterados).toBe(0);
  });

  test("anônimo não lê consultores", async () => {
    await expect(como(db, "anon", null, () => db.query("select * from consultores"))).rejects.toThrow();
  });

  test("usuário autenticado não grava matches direto", async () => {
    await expect(como(db, "authenticated", USUARIO_A, () => db.query("select salvar_matches(gen_random_uuid(), '[]'::jsonb)"))).rejects.toThrow();
  });
});

describe("importação", () => {
  test("consultores: cria e depois atualiza pelo e-mail, sem diferenciar maiúsculas", async () => {
    expect(await importar(db, USUARIO_A, "consultores", [ana, beto])).toEqual({ gravadas: 2, erros: [] });
    expect(await importar(db, USUARIO_A, "consultores", [{ ...ana, email: "ana@exemplo.com", cargo: "QA Líder" }])).toEqual({ gravadas: 1, erros: [] });
    const r = await um(db, "select count(*)::int as n, max(cargo) filter (where nome = 'Ana') as cargo from consultores");
    expect(r).toEqual({ n: 2, cargo: "QA Líder" });
  });

  test("alocações: e-mail desconhecido vira erro, as demais são gravadas e o cliente novo é criado", async () => {
    await importar(db, USUARIO_A, "consultores", [ana]);
    const r = await importar(db, USUARIO_A, "alocacoes", [
      { linha: 2, email: "ana@exemplo.com", cliente: "Cooperativa X", inicio: "2026-01-01", fim: "2026-12-31", valorHora: 150 },
      { linha: 3, email: "x@y.com", cliente: "Cooperativa X", inicio: "2026-01-01", fim: null, valorHora: 100 },
    ]);
    expect(r).toEqual({ gravadas: 1, erros: [{ linha: 3, motivo: "consultor não encontrado: x@y.com" }] });
    expect(await um(db, "select count(*)::int as n from clientes where nome = 'Cooperativa X'")).toEqual({ n: 1 });
  });

  test("vagas: reimportar substitui as anteriores", async () => {
    const v = (titulo: string, linha: number) => ({ linha, cliente: "Banco Y", titulo, senioridade: "pleno", skillsObrigatorias: ["Java"], skillsDesejaveis: [], inicioPrevisto: "2026-12-10", valorHora: 110 });
    await importar(db, USUARIO_A, "vagas", [v("Dev 1", 2), v("Dev 2", 3)]);
    await importar(db, USUARIO_A, "vagas", [v("Dev 3", 2)]);
    expect((await db.query<{ titulo: string }>("select titulo from vagas")).rows.map((x) => x.titulo)).toEqual(["Dev 3"]);
  });

  test("alterar uma vaga apaga as explicações salvas dela", async () => {
    await importar(db, USUARIO_A, "consultores", [ana]);
    await importar(db, USUARIO_A, "vagas", [{ linha: 2, cliente: "Banco Y", titulo: "QA", senioridade: "senior", skillsObrigatorias: ["Playwright"], skillsDesejaveis: [], inicioPrevisto: "2026-12-10", valorHora: 150 }]);
    const { vaga, consultor } = await um(db, "select (select id from vagas) as vaga, (select id from consultores) as consultor");
    await como(db, "service_role", null, () =>
      db.query("select salvar_matches($1, $2::jsonb)", [vaga, JSON.stringify([{ consultorId: consultor, nota: 90, explicacao: "Boa", origem: "ia" }])]),
    );
    expect(await um(db, "select count(*)::int as n from matches")).toEqual({ n: 1 });
    await db.query("update vagas set titulo = 'QA Sênior'");
    expect(await um(db, "select count(*)::int as n from matches")).toEqual({ n: 0 });
  });
});
