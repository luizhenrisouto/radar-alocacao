/** Simulador de corte: e se um cliente encerrar os contratos de parte do time numa data? */
import { alocacaoAtiva, estaNoBench } from "./bench";
import { concentracao, HORAS_MES } from "./concentracao";
import { somarDias } from "./datas";
import { rankearCandidatos } from "./matching";
import type { Alocacao, Consultor, DadosEmpresa, Vaga } from "./tipos";

/** `data` é o último dia de trabalho das pessoas no cliente. */
export interface Corte { clienteId: string; consultorIds: string[]; data: string }

const SEM_FIM = "9999-12-31";

/** Quem está alocado no cliente hoje, na ordem de quem sai primeiro: contrato terminando antes, sem fim por último, empate por nome. */
export function alocadosNoCliente(d: DadosEmpresa, clienteId: string, hoje: string): Consultor[] {
  const fimPorPessoa = new Map<string, string>();
  for (const a of d.alocacoes) {
    if (a.clienteId !== clienteId || !alocacaoAtiva(a, hoje)) continue;
    const fim = a.fim ?? SEM_FIM;
    const atual = fimPorPessoa.get(a.consultorId);
    if (atual == null || fim > atual) fimPorPessoa.set(a.consultorId, fim);
  }
  return d.consultores
    .filter((c) => fimPorPessoa.has(c.id))
    .sort((a, b) => (fimPorPessoa.get(a.id) as string).localeCompare(fimPorPessoa.get(b.id) as string) || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Quem estaria no cliente depois da data (os demais já saem até lá, com ou sem corte), na ordem de quem sai primeiro. */
export function cortaveis(d: DadosEmpresa, clienteId: string, hoje: string, data: string): Consultor[] {
  return alocadosNoCliente(d, clienteId, hoje).filter((c) =>
    d.alocacoes.some((a) => a.consultorId === c.id && a.clienteId === clienteId && alocacaoAtiva(a, hoje) && (a.fim == null || a.fim > data)),
  );
}

/** O cliente corta `percentual` de quem está alocado hoje; saem os primeiros de `cortaveis`. */
export function escolherPorPercentual(d: DadosEmpresa, clienteId: string, percentual: number, hoje: string, data: string): string[] {
  const total = alocadosNoCliente(d, clienteId, hoje).length;
  // Arredonda antes do ceil para 0,1 × 30 não virar 3,0000000004 → 4.
  const n = Math.ceil(Math.round(total * percentual * 1e6) / 1e6);
  return cortaveis(d, clienteId, hoje, data).slice(0, n).map((c) => c.id);
}

function cortada(a: Alocacao, c: Corte, ids: Set<string>): boolean {
  return a.status === "ativa" && a.clienteId === c.clienteId && ids.has(a.consultorId) && a.inicio <= c.data && (a.fim == null || a.fim > c.data);
}

/** Cópia dos dados com as alocações cortadas terminando na data. Não altera `d`. */
export function aplicarCorte(d: DadosEmpresa, c: Corte): { dados: DadosEmpresa; cortadas: Alocacao[] } {
  const ids = new Set(c.consultorIds);
  const cortadas: Alocacao[] = [];
  const alocacoes = d.alocacoes.map((a) => {
    if (!cortada(a, c, ids)) return a;
    cortadas.push(a);
    return { ...a, fim: c.data };
  });
  return { dados: { ...d, alocacoes }, cortadas };
}

export interface AfetadoCorte { consultor: Consultor; receitaMensal: number; ficaSemAlocacao: boolean; vagaInterna: { vaga: Vaga; posicao: number } | null }
export interface ResultadoCorte {
  afetados: AfetadoCorte[]; receitaPerdidaMensal: number; custoBenchMensal: number; custoBenchDia: number;
  comVagaInterna: number; parcelaAntes: number; parcelaDepois: number;
}

function parcela(d: DadosEmpresa, clienteId: string, dia: string): number {
  return concentracao(d, dia).find((r) => r.cliente.id === clienteId)?.parcelaConsultores ?? 0;
}

export function simularCorte(d: DadosEmpresa, c: Corte, hoje: string): ResultadoCorte {
  const { dados: depois, cortadas } = aplicarCorte(d, c);
  const diaSeguinte = somarDias(c.data, 1);
  const abertas = depois.vagas.filter((v) => v.status === "aberta");
  const rankings = abertas.map((v) => ({ vaga: v, ids: rankearCandidatos(depois, v.id, hoje, 3).map((x) => x.consultor.id) }));

  const afetados: AfetadoCorte[] = d.consultores
    .filter((p) => cortadas.some((a) => a.consultorId === p.id))
    .map((p) => {
      const receitaMensal = cortadas.filter((a) => a.consultorId === p.id).reduce((s, a) => s + a.valorHora * HORAS_MES, 0);
      const opcoes = rankings
        .map((r) => ({ vaga: r.vaga, posicao: r.ids.indexOf(p.id) + 1 }))
        .filter((o) => o.posicao > 0)
        .sort((a, b) => a.posicao - b.posicao || a.vaga.inicioPrevisto.localeCompare(b.vaga.inicioPrevisto));
      return { consultor: p, receitaMensal, ficaSemAlocacao: estaNoBench(p, depois.alocacoes, diaSeguinte), vagaInterna: opcoes[0] ?? null };
    });

  const custoBenchMensal = afetados.filter((a) => a.ficaSemAlocacao).reduce((s, a) => s + a.consultor.custoMensal, 0);
  return {
    afetados,
    receitaPerdidaMensal: afetados.reduce((s, a) => s + a.receitaMensal, 0),
    custoBenchMensal,
    custoBenchDia: custoBenchMensal / d.empresa.diasUteisMes,
    comVagaInterna: afetados.filter((a) => a.vagaInterna).length,
    parcelaAntes: parcela(d, c.clienteId, hoje),
    parcelaDepois: parcela(depois, c.clienteId, diaSeguinte),
  };
}
