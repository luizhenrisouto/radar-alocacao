/** Modo real: login, dados da empresa do usuário (RLS), importação por RPC e IA pela Edge Function. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { somarDias } from "../../src/regras/datas";
import type { Candidato } from "../../src/regras/matching";
import type { Perfil, RascunhoEmail, RascunhoVaga } from "../../src/regras/mercado";
import type { DadosEmpresa, Match, Vaga } from "../../src/regras/tipos";
import { CONFIG_PONTO_PADRAO, type ConfigPonto, type DadosPonto } from "../../supabase/functions/_shared/ponto.ts";
import type { Api, ResultadoImportacao, TipoImportacao } from "./api";

type Linha = Record<string, any>;
const num = (v: unknown) => (v == null ? null : Number(v));

export function paraDadosPonto(b: { colaboradores: Linha[]; dias: Linha[]; pendencias: Linha[]; envios: Linha[]; config: Partial<ConfigPonto> | null }): DadosPonto {
  return {
    colaboradores: b.colaboradores.map((c) => ({ matricula: c.matricula, nome: c.nome, email: c.email, emailGestor: c.email_gestor ?? null, ativo: Boolean(c.ativo) })),
    dias: b.dias.map((d) => ({ matricula: d.matricula, data: d.data, marcacoes: d.marcacoes ?? [], situacao: d.situacao ?? null })),
    pendencias: b.pendencias.map((p) => ({
      id: p.id, matricula: p.matricula, data: p.data, tipo: p.tipo, abertaEm: p.aberta_em, resolvidaEm: p.resolvida_em ?? null,
      cobrancas: Number(p.cobrancas), ultimaCobranca: p.ultima_cobranca ?? null, escalada: Boolean(p.escalada),
    })),
    envios: b.envios.map((e) => ({
      id: e.id, matricula: e.matricula ?? null, destino: e.destino, canal: e.canal, nivel: e.nivel, assunto: e.assunto,
      enviadoEm: new Date(e.enviado_em).toISOString(), ok: Boolean(e.ok), erro: e.erro ?? null, simulado: false,
    })),
    config: { ...CONFIG_PONTO_PADRAO, ...(b.config ?? {}) },
  };
}

export function paraDadosEmpresa(b: {
  empresa: Linha; clientes: Linha[]; consultores: Linha[]; alocacoes: Linha[]; vagas: Linha[]; matches: Linha[]; vagasExternas?: Linha[]; sinais?: Linha[];
}): DadosEmpresa {
  return {
    empresa: { id: b.empresa.id, nome: b.empresa.nome, limiteConcentracao: Number(b.empresa.limite_concentracao), diasUteisMes: Number(b.empresa.dias_uteis_mes) },
    clientes: b.clientes.map((c) => ({ id: c.id, nome: c.nome, setor: c.setor ?? null })),
    consultores: b.consultores.map((c) => ({
      id: c.id, nome: c.nome, email: c.email, cargo: c.cargo ?? "", senioridade: c.senioridade, skills: c.skills ?? [], regime: c.regime,
      custoMensal: Number(c.custo_mensal), salario: c.salario == null ? null : Number(c.salario), cidade: c.cidade ?? null, aceitaRemoto: c.aceita_remoto, admitidoEm: c.admitido_em,
    })),
    alocacoes: b.alocacoes.map((a) => ({
      id: a.id, consultorId: a.consultor_id, clienteId: a.cliente_id, inicio: a.inicio, fim: a.fim ?? null, valorHora: Number(a.valor_hora), status: a.status,
    })),
    vagas: b.vagas.map((v) => ({
      id: v.id, clienteId: v.cliente_id, titulo: v.titulo, senioridade: v.senioridade, skillsObrigatorias: v.skills_obrigatorias ?? [],
      skillsDesejaveis: v.skills_desejaveis ?? [], inicioPrevisto: v.inicio_previsto, valorHora: num(v.valor_hora), status: v.status,
    })),
    matches: b.matches.map((m) => ({
      vagaId: m.vaga_id, consultorId: m.consultor_id, nota: m.nota, explicacao: m.explicacao, origem: m.origem, geradoEm: m.gerado_em,
    })),
    vagasExternas: (b.vagasExternas ?? []).map((v) => ({
      id: v.id, empresaAlvo: v.empresa_alvo ?? "", titulo: v.titulo, senioridade: v.senioridade, skillsObrigatorias: v.skills_obrigatorias ?? [],
      skillsDesejaveis: v.skills_desejaveis ?? [], cidade: v.cidade ?? null, remoto: Boolean(v.remoto), url: v.url ?? null,
      inicioPrevisto: v.inicio_previsto, origem: v.origem, criadaEm: v.criada_em,
    })),
    sinais: (b.sinais ?? []).map((x) => ({
      id: x.id, clienteId: x.cliente_id, titulo: x.titulo, url: x.url ?? null, fonte: x.fonte ?? "", publicadoEm: x.publicado_em,
      tipo: x.tipo, gravidade: Number(x.gravidade), resumo: x.resumo ?? "", origem: x.origem,
    })),
  };
}

/** `sb` só é passado nos testes (um dublê do supabase-js). */
export function apiSupabase(url: string, chave: string, hoje: () => string, sb: SupabaseClient = createClient(url, chave)): Api {

  /** A função mercado não grava nada: erro ou resposta inválida viram null, e a tela usa a regra. */
  async function mercado(body: Record<string, unknown>): Promise<unknown | null> {
    const { data, error } = await sb.functions.invoke("mercado", { body });
    return error ? null : (data?.resultado ?? null);
  }

  /** Só as notícias que ainda pesam na nota (90 dias), das mais novas primeiro: a tabela cresce toda semana. */
  async function noticiasRecentes(): Promise<Linha[]> {
    const { data, error } = await sb.from("sinais").select("*")
      .gte("publicado_em", somarDias(hoje(), -90)).order("publicado_em", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async function tabela(nome: string): Promise<Linha[]> {
    const { data, error } = await sb.from(nome).select("*");
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  return {
    modo: "real",
    async sessao() {
      const { data } = await sb.auth.getSession();
      return data.session?.user.email ? { email: data.session.user.email } : null;
    },
    async entrar(email, senha) {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw new Error("E-mail ou senha incorretos.");
    },
    async sair() {
      await sb.auth.signOut();
    },
    async dados() {
      const [empresas, clientes, consultores, alocacoes, vagas, matches, vagasExternas, sinais] = await Promise.all([
        ...["empresas", "clientes", "consultores", "alocacoes", "vagas", "matches", "vagas_externas"].map(tabela),
        noticiasRecentes(),
      ]);
      if (empresas.length === 0) throw new Error("Sua conta ainda não está ligada a uma empresa.");
      return paraDadosEmpresa({ empresa: empresas[0], clientes, consultores, alocacoes, vagas, matches, vagasExternas, sinais });
    },
    async explicar(vaga: Vaga, candidatos: Candidato[]): Promise<Match[]> {
      const { data, error } = await sb.functions.invoke("explicar-match", {
        body: {
          vagaId: vaga.id, hoje: hoje(),
          candidatos: candidatos.map((c) => ({ consultorId: c.consultor.id, nota: c.nota, cobertas: c.cobertas, faltando: c.faltando, disponivelEm: c.disponivelEm })),
        },
      });
      if (error || !data?.matches) throw new Error("A IA não respondeu agora.");
      return data.matches as Match[];
    },
    async importar(tipo: TipoImportacao, linhas: unknown[]): Promise<ResultadoImportacao> {
      const { data, error } = await sb.rpc(`importar_${tipo}`, { p_linhas: linhas });
      if (error) throw new Error(error.message);
      return data as ResultadoImportacao;
    },
    async registrarCorte(c) {
      const { data, error } = await sb.rpc("registrar_corte", { p_cliente: c.clienteId, p_consultores: c.consultorIds, p_data: c.data, p_motivo: c.motivo });
      if (error) throw new Error(error.message);
      return { encerradas: Number((data as { encerradas: number }).encerradas) };
    },
    async extrairVaga(texto) {
      return (await mercado({ tarefa: "extrair_vaga", texto })) as RascunhoVaga | null;
    },
    async salvarVagaExterna(v) {
      const { error } = await sb.from("vagas_externas").insert({
        empresa_alvo: v.empresaAlvo, titulo: v.titulo, senioridade: v.senioridade, skills_obrigatorias: v.skillsObrigatorias,
        skills_desejaveis: v.skillsDesejaveis, cidade: v.cidade, remoto: v.remoto, url: v.url, inicio_previsto: v.inicioPrevisto, origem: v.origem,
      });
      if (error) throw new Error(error.message);
    },
    async apagarVagaExterna(id) {
      const { error } = await sb.from("vagas_externas").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    async perfilAnonimo(c, setores) {
      const r = await mercado({
        tarefa: "perfil",
        consultor: { cargo: c.cargo, senioridade: c.senioridade, skills: c.skills, setores, cidade: c.cidade, aceitaRemoto: c.aceitaRemoto },
      });
      return r ? { ...(r as Omit<Perfil, "origem">), origem: "ia" } : null;
    },
    async buscarSinais() {
      const { data, error } = await sb.functions.invoke("sinais", { body: {} });
      if (error || typeof data?.novos !== "number") throw new Error("Não foi possível buscar agora.");
      return { novos: data.novos };
    },
    async rascunhoEmail(lead, perfis, remetente) {
      const r = await mercado({
        tarefa: "email", empresa: lead.empresa, remetente,
        vagas: lead.vagas.map((v) => ({ titulo: v.titulo, skills: [...v.skillsObrigatorias, ...v.skillsDesejaveis] })),
        perfis: perfis.map((p, i) => ({ titulo: p.titulo, resumo: p.resumo, skills: lead.pessoas[i]?.skills ?? [] })),
      });
      return r ? { ...(r as Omit<RascunhoEmail, "origem">), origem: "ia" } : null;
    },
    async ponto() {
      const desde = somarDias(hoje(), -120);
      const consulta = async (q: PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>) => {
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return data ?? [];
      };
      const [colaboradores, dias, pendencias, envios, config] = await Promise.all([
        tabela("ponto_colaboradores"),
        consulta(sb.from("ponto_dias").select("*").gte("data", desde).order("data", { ascending: false }).limit(2000)),
        consulta(sb.from("ponto_pendencias").select("*").or(`resolvida_em.is.null,resolvida_em.gte.${desde}`).limit(2000)),
        consulta(sb.from("ponto_envios").select("*").order("enviado_em", { ascending: false }).limit(200)),
        sb.rpc("config_ponto").then(({ data, error }) => {
          if (error) throw new Error(error.message);
          return data as Partial<ConfigPonto> | null;
        }),
      ]);
      return paraDadosPonto({ colaboradores, dias, pendencias, envios, config });
    },
    async cobrarPonto() {
      const { data, error } = await sb.functions.invoke("ponto", { body: { acao: "cobrar" } });
      if (error || typeof data?.enviados !== "number") throw new Error("Não foi possível cobrar agora.");
      return data.ocupado ? { enviados: 0, falhas: 0, ocupado: true } : { enviados: data.enviados, falhas: Number(data.falhas ?? 0) };
    },
    async testarEnvioPonto() {
      const { data, error } = await sb.functions.invoke("ponto", { body: { acao: "teste" } });
      if (error || !data?.ok) throw new Error("Não foi possível enviar o teste.");
    },
    async acertarPendencia(id) {
      const { error } = await sb.rpc("marcar_ponto_acertado", { p_id: id });
      if (error) throw new Error(error.message);
    },
    async salvarConfigPonto(c) {
      const { error } = await sb.rpc("salvar_config_ponto", { p: c });
      if (error) throw new Error(error.message);
    },
  };
}
