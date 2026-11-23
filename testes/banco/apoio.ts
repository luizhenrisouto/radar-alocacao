import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "../..");

/** O que o Supabase já tem e as migrações usam: papéis, schema auth e auth.uid(). */
const STUBS_SUPABASE = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export const USUARIO_A = "11111111-1111-4111-8111-111111111111";
export const USUARIO_B = "22222222-2222-4222-8222-222222222222";

export async function novoBanco(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(STUBS_SUPABASE);
  const pasta = path.join(RAIZ, "supabase/migrations");
  for (const arq of fs.readdirSync(pasta).filter((a) => a.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(pasta, arq), "utf8"));
  }
  return db;
}

/** Executa como um papel do Supabase (e usuário, se houver), depois volta ao dono do banco. */
export async function como<T>(db: PGlite, papel: "anon" | "authenticated" | "service_role", usuario: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set request.jwt.claim.sub = '${usuario ?? ""}'; set role ${papel};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; set request.jwt.claim.sub = '';`);
  }
}

export async function um<T = any>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}

export async function criarEmpresaComMembro(db: PGlite, userId: string, nome: string): Promise<string> {
  const { id } = await um<{ id: string }>(db, "insert into empresas (nome) values ($1) returning id", [nome]);
  await db.query("insert into membros (user_id, empresa_id) values ($1, $2)", [userId, id]);
  return id;
}

/** Chama uma RPC de importação como o usuário e devolve o jsonb. */
export async function importar(db: PGlite, usuario: string, tipo: "consultores" | "alocacoes" | "vagas" | "ponto_colaboradores", linhas: unknown[]) {
  return como(db, "authenticated", usuario, async () =>
    (await um<{ r: { gravadas: number; erros: { linha: number; motivo: string }[] } }>(db, `select importar_${tipo}($1::jsonb) as r`, [JSON.stringify(linhas)])).r,
  );
}
