// Só para as funções do Supabase (Deno). Monta as dependências reais a partir das variáveis de ambiente.
// ANTHROPIC_API_KEY é gravada pelo autor com `npx supabase secrets set`. ORIGEM_PAINEL aceita várias origens separadas por vírgula.
import { createClient } from "npm:@supabase/supabase-js@2";
import type { Resposta } from "./explicar.ts";

function variavel(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Variável ${nome} não configurada`);
  return v;
}

export function clienteServico() {
  return createClient(variavel("SUPABASE_URL"), variavel("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

/** A empresa da pessoa logada (pelo token do app), ou null. */
export async function empresaDoUsuario(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const sb = createClient(variavel("SUPABASE_URL"), variavel("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await sb.rpc("minha_empresa");
  return error ? null : (data as string | null);
}

/** O e-mail da pessoa logada (pelo token do app), ou null. */
export async function emailDoUsuario(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const sb = createClient(variavel("SUPABASE_URL"), variavel("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  return error ? null : data.user?.email ?? null;
}

function cors(req: Request): Record<string, string> {
  const permitidas = (Deno.env.get("ORIGEM_PAINEL") ?? "*").split(",").map((o) => o.trim());
  const origem = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": permitidas.includes("*") ? "*" : permitidas.includes(origem) ? origem : permitidas[0],
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

/** Responde ao OPTIONS e devolve JSON com CORS; erro inesperado vira 500 sem dados pessoais no log. */
export function servir(fn: (req: Request) => Promise<Resposta>) {
  Deno.serve(async (req) => {
    const cabecalhos = { ...cors(req), "Content-Type": "application/json" };
    if (req.method === "OPTIONS") return new Response("ok", { headers: cabecalhos });
    try {
      const r = await fn(req);
      return new Response(JSON.stringify(r.corpo), { status: r.status, headers: cabecalhos });
    } catch (e) {
      console.log(`erro: ${(e as Error)?.name ?? "desconhecido"}`);
      return new Response(JSON.stringify({ erro: "interno" }), { status: 500, headers: cabecalhos });
    }
  });
}
