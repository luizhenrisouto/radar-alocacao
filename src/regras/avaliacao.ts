/** Eval do matching: o candidato do gabarito ficou entre os 3 primeiros? */
import { vencimentos } from "./contratos";
import { rankearCandidatos } from "./matching";
import type { DadosEmpresa, TipoSinal } from "./tipos";

export function avaliarMatching(d: DadosEmpresa, gabarito: Record<string, string>, hoje: string): { acertos: number; total: number } {
  const vagas = Object.keys(gabarito);
  const acertos = vagas.filter((vagaId) =>
    rankearCandidatos(d, vagaId, hoje, 3).some((c) => c.consultor.id === gabarito[vagaId]),
  ).length;
  return { acertos, total: vagas.length };
}

/** Dos contratos que vencem em até `horizonte` dias, quantos já têm uma vaga aberta em que a pessoa está no top 3. */
export function encaixesAntesDoFim(d: DadosEmpresa, hoje: string, horizonte = 60): { comEncaixe: number; total: number } {
  const saindo = new Set(vencimentos(d, hoje).filter((v) => v.diasRestantes <= horizonte).map((v) => v.consultor.id));
  const comVaga = new Set(
    d.vagas.filter((v) => v.status === "aberta").flatMap((v) => rankearCandidatos(d, v.id, hoje, 3).map((c) => c.consultor.id)),
  );
  return { comEncaixe: [...saindo].filter((id) => comVaga.has(id)).length, total: saindo.size };
}

/** Eval da classificação de notícias: quantas manchetes do gabarito recebem o tipo esperado. */
export function avaliarClassificacao(gabarito: { titulo: string; tipo: TipoSinal }[], classificar: (titulo: string) => TipoSinal): { acertos: number; total: number } {
  return { acertos: gabarito.filter((g) => classificar(g.titulo) === g.tipo).length, total: gabarito.length };
}
