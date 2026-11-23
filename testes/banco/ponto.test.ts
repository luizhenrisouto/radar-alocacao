import { beforeEach, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { tipoDoDia, type DiaPonto } from "../../supabase/functions/_shared/ponto.ts";
import { USUARIO_A, USUARIO_B, como, criarEmpresaComMembro, importar, novoBanco, um } from "./apoio";

const HOJE = "2026-11-19";
const QUATRO = ["08:00", "12:00", "13:00", "17:00"];
const colaborador = (linha: number, matricula: string, extra: Record<string, unknown> = {}) =>
  ({ linha, matricula, nome: `Pessoa ${matricula}`, email: `p${matricula}@x.exemplo`, emailGestor: "gestor@x.exemplo", ...extra });
const marcacao = (linha: number, matricula: string, data: string, marcacoes: string[], situacao: string | null = null) =>
  ({ linha, matricula, data, marcacoes, situacao });

let db: PGlite;
beforeEach(async () => {
  db = await novoBanco();
  await criarEmpresaComMembro(db, USUARIO_A, "Empresa A");
  await criarEmpresaComMembro(db, USUARIO_B, "Empresa B");
});

const marcar = (usuario: string, linhas: unknown[]) =>
  como(db, "authenticated", usuario, async () =>
    (await um<{ r: { gravadas: number; erros: { linha: number; motivo: string }[]; abertas: number; fechadas: number } }>(
      db, "select importar_ponto_marcacoes($1::jsonb, $2::date) as r", [JSON.stringify(linhas), HOJE])).r);
const abertas = async () =>
  (await db.query<{ matricula: string; data: string; tipo: string }>(
    "select matricula, data::text as data, tipo from ponto_pendencias where resolvida_em is null order by matricula, data")).rows;

test("importar colaboradores e marcações abre pendências", async () => {
  expect((await importar(db, USUARIO_A, "ponto_colaboradores", [colaborador(2, "1"), colaborador(3, "2")])).gravadas).toBe(2);
  const r = await marcar(USUARIO_A, [marcacao(2, "1", "2026-11-17", []), marcacao(3, "2", "2026-11-17", ["08:00"]), marcacao(4, "2", "2026-11-18", QUATRO)]);
  expect(r).toMatchObject({ gravadas: 3, erros: [], abertas: 2, fechadas: 0 });
  expect(await abertas()).toEqual([
    { matricula: "1", data: "2026-11-17", tipo: "sem_marcacao" },
    { matricula: "2", data: "2026-11-17", tipo: "incompleta" },
  ]);
});

test("reimportar o dia acertado fecha a pendência e não apaga", async () => {
  await importar(db, USUARIO_A, "ponto_colaboradores", [colaborador(2, "1")]);
  await marcar(USUARIO_A, [marcacao(2, "1", "2026-11-17", [])]);
  const r = await marcar(USUARIO_A, [marcacao(2, "1", "2026-11-17", QUATRO)]);
  expect(r).toMatchObject({ abertas: 0, fechadas: 1 });
  expect(await abertas()).toEqual([]);
  expect(await um(db, "select count(*)::int as n, count(resolvida_em)::int as resolvidas from ponto_pendencias")).toEqual({ n: 1, resolvidas: 1 });
});

test("pendência não duplica ao reimportar o mesmo dia e muda o tipo", async () => {
  await importar(db, USUARIO_A, "ponto_colaboradores", [colaborador(2, "1")]);
  await marcar(USUARIO_A, [marcacao(2, "1", "2026-11-17", [])]);
  await marcar(USUARIO_A, [marcacao(2, "1", "2026-11-17", [])]);
  await marcar(USUARIO_A, [marcacao(2, "1", "2026-11-17", ["08:00"])]);
  expect(await abertas()).toEqual([{ matricula: "1", data: "2026-11-17", tipo: "incompleta" }]);
  expect(await um(db, "select count(*)::int as n from ponto_pendencias")).toEqual({ n: 1 });
});

test("matrícula desconhecida vira erro", async () => {
  const r = await marcar(USUARIO_A, [marcacao(2, "99", "2026-11-17", [])]);
  expect(r.erros).toEqual([{ linha: 2, motivo: "matrícula não encontrada: 99" }]);
  expect(r.gravadas).toBe(0);
});

test("colaborador sem matrícula ou e-mail vira erro", async () => {
  const r = await importar(db, USUARIO_A, "ponto_colaboradores", [colaborador(2, "1", { email: "" }), colaborador(3, "")]);
  expect(r.gravadas).toBe(0);
  expect(r.erros.map((e) => e.linha)).toEqual([2, 3]);
});

test("outra empresa não vê o ponto", async () => {
  await importar(db, USUARIO_A, "ponto_colaboradores", [colaborador(2, "1")]);
  await marcar(USUARIO_A, [marcacao(2, "1", "2026-11-17", [])]);
  const vistos = await como(db, "authenticated", USUARIO_B, async () => ({
    colaboradores: (await db.query("select * from ponto_colaboradores")).rows.length,
    dias: (await db.query("select * from ponto_dias")).rows.length,
    pendencias: (await db.query("select * from ponto_pendencias")).rows.length,
  }));
  expect(vistos).toEqual({ colaboradores: 0, dias: 0, pendencias: 0 });
  await expect(como(db, "authenticated", USUARIO_A, () => db.query("update ponto_pendencias set cobrancas = 9"))).rejects.toThrow();
});

test("membro não lê a URL do Teams, só configurada", async () => {
  const cfg = await como(db, "authenticated", USUARIO_A, async () => {
    await db.query("select salvar_config_ponto($1::jsonb)", [JSON.stringify({
      emailAtivo: true, teamsAtivo: true, remetenteNome: "RH Datum", intervaloDias: 1, escalarApos: 3, teamsUrl: "https://fluxo.exemplo/abc",
    })]);
    return (await um<{ c: Record<string, unknown> }>(db, "select config_ponto() as c")).c;
  });
  expect(cfg).toEqual({ emailAtivo: true, teamsAtivo: true, teamsConfigurado: true, remetenteNome: "RH Datum", intervaloDias: 1, escalarApos: 3 });
  await expect(como(db, "authenticated", USUARIO_A, () => db.query("select * from ponto_config"))).rejects.toThrow();
  // teamsUrl null mantém; "" apaga.
  const depois = await como(db, "authenticated", USUARIO_A, async () => {
    await db.query("select salvar_config_ponto($1::jsonb)", [JSON.stringify({ emailAtivo: true, teamsAtivo: true, remetenteNome: "RH", intervaloDias: 1, escalarApos: 2, teamsUrl: null })]);
    const mantida = (await um<{ c: Record<string, unknown> }>(db, "select config_ponto() as c")).c.teamsConfigurado;
    await db.query("select salvar_config_ponto($1::jsonb)", [JSON.stringify({ emailAtivo: true, teamsAtivo: false, remetenteNome: "RH", intervaloDias: 1, escalarApos: 2, teamsUrl: "" })]);
    return { mantida, apagada: (await um<{ c: Record<string, unknown> }>(db, "select config_ponto() as c")).c.teamsConfigurado };
  });
  expect(depois).toEqual({ mantida: true, apagada: false });
  expect(await como(db, "authenticated", USUARIO_B, async () => (await um<{ c: Record<string, unknown> }>(db, "select config_ponto() as c")).c))
    .toMatchObject({ emailAtivo: true, teamsAtivo: false, teamsConfigurado: false, remetenteNome: "RH", intervaloDias: 1, escalarApos: 2 });
});

test("a regra do SQL bate com a do TS", async () => {
  const casos: DiaPonto[] = [
    { matricula: "1", data: "2026-11-17", marcacoes: [], situacao: null },
    { matricula: "2", data: "2026-11-17", marcacoes: ["08:00", "12:00", "13:00"], situacao: null },
    { matricula: "3", data: "2026-11-17", marcacoes: QUATRO, situacao: null },
    { matricula: "4", data: "2026-11-14", marcacoes: [], situacao: null },
    { matricula: "5", data: "2026-11-17", marcacoes: [], situacao: "Atestado" },
    { matricula: "6", data: HOJE, marcacoes: [], situacao: null },
    { matricula: "7", data: "2026-11-20", marcacoes: [], situacao: null },
    { matricula: "8", data: "2026-11-17", marcacoes: [], situacao: "  " },
  ];
  await importar(db, USUARIO_A, "ponto_colaboradores", casos.map((c, i) => colaborador(i + 2, c.matricula)));
  await marcar(USUARIO_A, casos.map((c, i) => marcacao(i + 2, c.matricula, c.data, c.marcacoes, c.situacao)));
  const esperado = casos.flatMap((c) => {
    const tipo = tipoDoDia(c, HOJE);
    return tipo ? [{ matricula: c.matricula, data: c.data, tipo }] : [];
  });
  expect(await abertas()).toEqual(esperado);
});

test("colaborador marcado como inativo deixa de ter pendências abertas", async () => {
  await importar(db, USUARIO_A, "ponto_colaboradores", [colaborador(2, "1"), colaborador(3, "2")]);
  await marcar(USUARIO_A, [marcacao(2, "1", "2026-11-17", []), marcacao(3, "2", "2026-11-17", [])]);
  await importar(db, USUARIO_A, "ponto_colaboradores", [colaborador(2, "1", { ativo: false })]);
  expect(await abertas()).toEqual([{ matricula: "2", data: "2026-11-17", tipo: "sem_marcacao" }]);
  expect(await um(db, "select ativo from ponto_colaboradores where matricula = '1'")).toEqual({ ativo: false });
  await importar(db, USUARIO_A, "ponto_colaboradores", [colaborador(2, "1")]);
  expect(await um(db, "select ativo from ponto_colaboradores where matricula = '1'")).toEqual({ ativo: true });
});

test("só uma rodada de cobrança por vez, e só a função pode travar", async () => {
  const empresa = (await um<{ id: string }>(db, "select id from empresas where nome = 'Empresa A'")).id;
  const rodada = (sql: string) => como(db, "service_role", null, async () => (await um<{ r: boolean | null }>(db, sql, [empresa])).r);
  expect(await rodada("select iniciar_rodada_ponto($1) as r")).toBe(true);
  expect(await rodada("select iniciar_rodada_ponto($1) as r")).toBe(false);
  await rodada("select terminar_rodada_ponto($1) is null as r");
  expect(await rodada("select iniciar_rodada_ponto($1) as r")).toBe(true);
  // Rodada travada há mais de 10 minutos (função encerrada no meio) é liberada.
  await db.query("update ponto_rodadas set iniciada_em = now() - interval '11 minutes'");
  expect(await rodada("select iniciar_rodada_ponto($1) as r")).toBe(true);
  await expect(como(db, "authenticated", USUARIO_A, () => db.query("select iniciar_rodada_ponto($1)", [empresa]))).rejects.toThrow();
});

test("RH marca uma pendência como acertada; outra empresa não consegue; dia ainda pendente reabre na importação", async () => {
  await importar(db, USUARIO_A, "ponto_colaboradores", [colaborador(2, "1")]);
  await marcar(USUARIO_A, [marcacao(2, "1", "2026-11-17", [])]);
  const { id } = await um<{ id: string }>(db, "select id from ponto_pendencias");
  const acertar = (usuario: string) => como(db, "authenticated", usuario, async () => (await um<{ r: boolean }>(db, "select marcar_ponto_acertado($1) as r", [id])).r);
  expect(await acertar(USUARIO_B)).toBe(false);
  expect(await abertas()).toHaveLength(1);
  expect(await acertar(USUARIO_A)).toBe(true);
  expect(await abertas()).toEqual([]);
  expect(await um(db, "select resolvida_manualmente as m from ponto_pendencias where id = $1", [id])).toEqual({ m: true });
  expect(await acertar(USUARIO_A)).toBe(false);
  // Se o Senior ainda mostra o dia sem marcação, a próxima importação abre de novo.
  await marcar(USUARIO_A, [marcacao(2, "1", "2026-11-17", [])]);
  expect(await abertas()).toEqual([{ matricula: "1", data: "2026-11-17", tipo: "sem_marcacao" }]);
});
