import { atenderPonto, type DependenciasPonto } from "../_shared/ponto-envio.ts";
import { comLimite, enviarResend, postarTeams } from "../_shared/ponto-canais.ts";
import { CONFIG_PONTO_PADRAO, type Pendencia } from "../_shared/ponto.ts";
import { clienteServico, emailDoUsuario, empresaDoUsuario, servir } from "../_shared/deno.ts";

// Ponto em dia: lembretes de marcação por e-mail (Resend) e Teams (fluxo do Workflows).
// Publicar com --no-verify-jwt: a autenticação é feita aqui (login do app, ou o cabeçalho
// x-chave-agendamento igual ao segredo CHAVE_AGENDAMENTO, usado pelo pg_cron).
// Segredos: RESEND_API_KEY e PONTO_REMETENTE (o e-mail que envia; precisa de domínio verificado no Resend).
const hojeSaoPaulo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;
const paraPendencia = (p: Linha): Pendencia => ({
  id: p.id, matricula: p.matricula, data: p.data, tipo: p.tipo, abertaEm: p.aberta_em, resolvidaEm: p.resolvida_em ?? null,
  cobrancas: Number(p.cobrancas), ultimaCobranca: p.ultima_cobranca ?? null, escalada: Boolean(p.escalada),
});

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

servir(async (req) => {
  const sb = clienteServico();
  // O Resend aceita poucas requisições por segundo: espaça os e-mails e tenta de novo uma vez em 429.
  const email = comLimite(
    (destino: string, m: Parameters<DependenciasPonto["enviarEmail"]>[1], remetente: string) =>
      enviarResend(fetch, { chave: Deno.env.get("RESEND_API_KEY"), de: Deno.env.get("PONTO_REMETENTE") }, destino, m, remetente),
    { intervaloMs: 600, esperar },
  );
  const corpo = (await req.json().catch(() => null)) as { empresaId?: unknown; acao?: unknown } | null;
  const deps: DependenciasPonto = {
    hoje: hojeSaoPaulo(),
    agora: () => new Date().toISOString(),
    async carregar(empresaId) {
      const [c, p, cfg] = await Promise.all([
        sb.from("ponto_colaboradores").select("*").eq("empresa_id", empresaId),
        sb.from("ponto_pendencias").select("*").eq("empresa_id", empresaId).is("resolvida_em", null),
        sb.from("ponto_config").select("*").eq("empresa_id", empresaId).maybeSingle(),
      ]);
      if (c.error || p.error || cfg.error) throw new Error("leitura do ponto");
      const k = cfg.data as Linha | null;
      return {
        colaboradores: (c.data ?? []).map((x: Linha) => ({
          matricula: x.matricula, nome: x.nome, email: x.email, emailGestor: x.email_gestor ?? null, ativo: Boolean(x.ativo),
        })),
        pendencias: (p.data ?? []).map(paraPendencia),
        config: k
          ? {
            emailAtivo: k.email_ativo, teamsAtivo: k.teams_ativo, teamsConfigurado: k.teams_url != null,
            remetenteNome: k.remetente_nome, intervaloDias: k.intervalo_dias, escalarApos: k.escalar_apos,
          }
          : CONFIG_PONTO_PADRAO,
        teamsUrl: k?.teams_url ?? null,
      };
    },
    enviarEmail: (destino, m, remetenteNome) => email(destino, m, remetenteNome),
    enviarTeams: (url, destino, m) => postarTeams(fetch, url, destino, m),
    async iniciarRodada(empresaId) {
      const { data, error } = await sb.rpc("iniciar_rodada_ponto", { p_empresa: empresaId });
      if (error) throw new Error("trava da rodada");
      return data === true;
    },
    async terminarRodada(empresaId) {
      await sb.rpc("terminar_rodada_ponto", { p_empresa: empresaId });
    },
    async gravar(empresaId, envios, pendencias) {
      const e = await sb.from("ponto_envios").insert(envios.map((x) => ({
        empresa_id: empresaId, matricula: x.matricula, destino: x.destino, canal: x.canal, nivel: x.nivel,
        assunto: x.assunto, enviado_em: x.enviadoEm, ok: x.ok, erro: x.erro,
      })));
      if (e.error) throw new Error("gravar envios");
      for (const p of pendencias) {
        const u = await sb.from("ponto_pendencias")
          .update({ cobrancas: p.cobrancas, ultima_cobranca: p.ultimaCobranca, escalada: p.escalada })
          .eq("id", p.id).eq("empresa_id", empresaId);
        if (u.error) throw new Error("gravar pendências");
      }
    },
  };
  return await atenderPonto(
    {
      empresaDoUsuario: await empresaDoUsuario(req),
      emailDoUsuario: await emailDoUsuario(req),
      chaveRecebida: req.headers.get("x-chave-agendamento"),
      chaveEsperada: Deno.env.get("CHAVE_AGENDAMENTO") ?? null,
      empresaPedida: typeof corpo?.empresaId === "string" ? corpo.empresaId : null,
      acao: corpo?.acao,
    },
    deps,
  );
});
