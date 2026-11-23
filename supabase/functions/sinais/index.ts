import Anthropic from "npm:@anthropic-ai/sdk";
import { MODELO_PADRAO } from "../_shared/explicar.ts";
import { atenderSinais, type NovoSinal } from "../_shared/sinais.ts";
import { clienteServico, empresaDoUsuario, servir } from "../_shared/deno.ts";

// Notícias dos clientes. Publicar com --no-verify-jwt: a autenticação é feita aqui
// (login do app, ou o cabeçalho x-chave-agendamento igual ao segredo CHAVE_AGENDAMENTO, usado pelo pg_cron).
const ia = new Anthropic();
const hojeSaoPaulo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

servir(async (req) => {
  const sb = clienteServico();
  const corpo = (await req.json().catch(() => null)) as { empresaId?: unknown } | null;
  return await atenderSinais(
    {
      empresaDoUsuario: await empresaDoUsuario(req),
      chaveRecebida: req.headers.get("x-chave-agendamento"),
      chaveEsperada: Deno.env.get("CHAVE_AGENDAMENTO") ?? null,
      empresaPedida: typeof corpo?.empresaId === "string" ? corpo.empresaId : null,
    },
    {
      ia,
      modelo: Deno.env.get("MODELO_IA") ?? MODELO_PADRAO,
      hoje: hojeSaoPaulo(),
      async buscarRss(url) {
        const r = await fetch(url, { headers: { "User-Agent": "RadarAlocacao/1.0" }, signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error(`rss ${r.status}`);
        return await r.text();
      },
      async clientes(empresaId) {
        const { data, error } = await sb.from("clientes").select("id, nome, termo_busca").eq("empresa_id", empresaId);
        if (error) throw new Error(error.message);
        return (data ?? []).map((c) => ({ id: c.id, nome: c.nome, termoBusca: c.termo_busca }));
      },
      async salvasRecentes(empresaId, desde) {
        const { data, error } = await sb.from("sinais").select("url, titulo").eq("empresa_id", empresaId).gte("publicado_em", desde);
        if (error) throw new Error(error.message);
        return (data ?? []).map((s) => ({ url: s.url as string, titulo: s.titulo as string }));
      },
      async gravar(empresaId, sinais: NovoSinal[]) {
        const linhas = sinais.map((s) => ({
          empresa_id: empresaId, cliente_id: s.clienteId, titulo: s.titulo, url: s.url, fonte: s.fonte, publicado_em: s.publicadoEm,
          tipo: s.tipo, gravidade: s.gravidade, resumo: s.resumo, origem: s.origem,
        }));
        const { error } = await sb.from("sinais").upsert(linhas, { onConflict: "empresa_id,url", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      },
    },
  );
});
