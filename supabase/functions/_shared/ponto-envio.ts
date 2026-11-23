/**
 * Rodada de cobrança do ponto: planeja, envia por e-mail e Teams, registra cada envio e atualiza as pendências.
 * Sem APIs do Deno: a função `ponto` injeta o envio (Resend, fluxo do Teams) e o banco.
 */
import type { Resposta } from "./explicar.ts";
import {
  aplicarCobranca, mensagemPessoa, planejarCobrancas,
  type ColaboradorPonto, type ConfigPonto, type EnvioPonto, type Mensagem, type Pendencia,
} from "./ponto.ts";

export interface DependenciasPonto {
  hoje: string;
  agora: () => string;
  /** Trava a empresa para uma rodada só por vez (cron e "Cobrar agora" juntos). false = já há uma rodada em andamento. */
  iniciarRodada(empresaId: string): Promise<boolean>;
  terminarRodada(empresaId: string): Promise<void>;
  carregar(empresaId: string): Promise<{ colaboradores: ColaboradorPonto[]; pendencias: Pendencia[]; config: ConfigPonto; teamsUrl: string | null }>;
  /** Lança em falha. */
  enviarEmail(destino: string, m: Mensagem, remetenteNome: string): Promise<void>;
  /** Lança em falha. */
  enviarTeams(url: string, destino: string, m: Mensagem): Promise<void>;
  /** Chamado logo depois de cada cobrança, com os envios dela e só as pendências que mudaram. */
  gravar(empresaId: string, envios: Omit<EnvioPonto, "id" | "simulado">[], pendencias: Pendencia[]): Promise<void>;
}

const mensagemDeErro = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 200);

export interface ResultadoCobranca { enviados: number; falhas: number; ocupado?: true }

export async function cobrarEmpresa(empresaId: string, deps: DependenciasPonto): Promise<ResultadoCobranca> {
  if (!(await deps.iniciarRodada(empresaId))) return { enviados: 0, falhas: 0, ocupado: true };
  try {
    return await rodada(empresaId, deps);
  } finally {
    await deps.terminarRodada(empresaId);
  }
}

async function rodada(empresaId: string, deps: DependenciasPonto): Promise<ResultadoCobranca> {
  const { colaboradores, pendencias, config, teamsUrl } = await deps.carregar(empresaId);
  const { cobrancas } = planejarCobrancas({ colaboradores, pendencias, config, dias: [], envios: [] }, deps.hoje);
  let atualizadas = pendencias;
  let enviados = 0;
  let falhas = 0;

  for (const c of cobrancas) {
    const canais: { canal: "email" | "teams"; enviar: () => Promise<void> }[] = [];
    if (config.emailAtivo) canais.push({ canal: "email", enviar: () => deps.enviarEmail(c.destino, c.mensagem, config.remetenteNome) });
    if (config.teamsAtivo && teamsUrl) canais.push({ canal: "teams", enviar: () => deps.enviarTeams(teamsUrl, c.destino, c.mensagem) });
    const envios: Omit<EnvioPonto, "id" | "simulado">[] = [];
    let algumOk = false;
    for (const { canal, enviar } of canais) {
      let erro: string | null = null;
      try {
        await enviar();
        algumOk = true;
        enviados++;
      } catch (e) {
        erro = mensagemDeErro(e);
        falhas++;
      }
      envios.push({
        matricula: c.matricula, destino: c.destino, canal, nivel: c.nivel, assunto: c.mensagem.assunto,
        enviadoEm: deps.agora(), ok: erro == null, erro,
      });
    }
    const depois = aplicarCobranca(atualizadas, c, algumOk, deps.hoje);
    const mudadas = depois.filter((p, i) => p !== atualizadas[i]);
    atualizadas = depois;
    // Grava já: se a função for encerrada no meio, o que saiu fica registrado e não é repetido amanhã.
    if (envios.length) await deps.gravar(empresaId, envios, mudadas);
  }
  return { enviados, falhas };
}

/** Uma cobrança de exemplo só para quem pediu o teste. Não grava nada. */
export async function enviarTeste(empresaId: string, email: string, deps: DependenciasPonto): Promise<void> {
  const { config } = await deps.carregar(empresaId);
  const exemplo: ColaboradorPonto = { matricula: "0", nome: "Colaborador de teste", email, emailGestor: null, ativo: true };
  const dias = ["2026-11-03", "2026-11-05"];
  const pendencias: Pendencia[] = dias.map((data, i) => ({
    id: `teste${i}`, matricula: "0", data, tipo: i === 0 ? "sem_marcacao" : "incompleta", abertaEm: data, resolvidaEm: null,
    cobrancas: 0, ultimaCobranca: null, escalada: false,
  }));
  const m = mensagemPessoa(exemplo, pendencias, deps.hoje, config.remetenteNome);
  await deps.enviarEmail(email, { assunto: m.assunto, texto: `${m.texto}\n\n(Mensagem de teste do Radar: os dias acima são de exemplo.)` }, config.remetenteNome);
}

export async function atenderPonto(
  a: {
    empresaDoUsuario: string | null; emailDoUsuario: string | null; chaveRecebida: string | null; chaveEsperada: string | null;
    empresaPedida: string | null; acao: unknown;
  },
  deps: DependenciasPonto,
): Promise<Resposta> {
  if (a.empresaDoUsuario) {
    if (a.acao === "teste") {
      if (!a.emailDoUsuario) return { status: 422, corpo: { erro: "pedido" } };
      await enviarTeste(a.empresaDoUsuario, a.emailDoUsuario, deps);
      return { status: 200, corpo: { ok: true } };
    }
    return { status: 200, corpo: await cobrarEmpresa(a.empresaDoUsuario, deps) };
  }
  const agendado = Boolean(a.chaveEsperada) && a.chaveRecebida === a.chaveEsperada;
  if (!agendado || a.acao === "teste") return { status: 403, corpo: { erro: "acesso" } };
  if (!a.empresaPedida) return { status: 422, corpo: { erro: "pedido" } };
  return { status: 200, corpo: await cobrarEmpresa(a.empresaPedida, deps) };
}
