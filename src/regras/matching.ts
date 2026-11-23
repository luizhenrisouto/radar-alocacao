/** Matching de vaga com consultor: nota por regra (determinística) e explicação de fallback. */
import { alocacaoAtiva, estaNoBench } from "./bench";
import { somarDias } from "./datas";
import { NIVEIS, type Alocacao, type Consultor, type DadosEmpresa, type Vaga } from "./tipos";

/** "Node.js", "NodeJS" e " nodejs " viram "nodejs"; acentos saem. */
export function normalizarSkill(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s.\-_/]+/g, "");
}

export interface Candidato { consultor: Consultor; nota: number; cobertas: string[]; faltando: string[]; disponivelEm: string }

const SEM_FIM = "9999-12-31";

/** Hoje, se está no bench; senão o dia seguinte ao maior fim das alocações ativas (sem fim: nunca). */
export function disponibilidade(c: Consultor, alocacoes: Alocacao[], hoje: string): string {
  if (estaNoBench(c, alocacoes, hoje)) return hoje;
  const ativas = alocacoes.filter((a) => a.consultorId === c.id && alocacaoAtiva(a, hoje));
  if (ativas.some((a) => a.fim == null)) return SEM_FIM;
  const ultimo = ativas.map((a) => a.fim as string).sort().at(-1) as string;
  return somarDias(ultimo, 1);
}

export function notaMatch(c: Consultor, v: Vaga): { nota: number; cobertas: string[]; faltando: string[] } | null {
  const tem = new Set(c.skills.map(normalizarSkill));
  const cobertas = v.skillsObrigatorias.filter((s) => tem.has(normalizarSkill(s)));
  if (cobertas.length === 0) return null;
  const faltando = v.skillsObrigatorias.filter((s) => !tem.has(normalizarSkill(s)));
  const desejaveis = v.skillsDesejaveis.length
    ? v.skillsDesejaveis.filter((s) => tem.has(normalizarSkill(s))).length / v.skillsDesejaveis.length
    : 1;
  const distancia = Math.abs(NIVEIS.indexOf(c.senioridade) - NIVEIS.indexOf(v.senioridade));
  const senioridade = distancia === 0 ? 10 : distancia === 1 ? 5 : 0;
  const nota = Math.round(70 * (cobertas.length / v.skillsObrigatorias.length) + 20 * desejaveis + senioridade);
  return { nota, cobertas, faltando };
}

export function rankearCandidatos(d: DadosEmpresa, vagaId: string, hoje: string, limite = 5): Candidato[] {
  const v = d.vagas.find((x) => x.id === vagaId);
  return v ? rankearParaVaga(d, v, hoje, limite) : [];
}

/** O ranking de uma vaga que não precisa estar em d.vagas (uma vaga do mercado, por exemplo). */
export function rankearParaVaga(d: DadosEmpresa, v: Vaga, hoje: string, limite = 5): Candidato[] {
  const candidatos: Candidato[] = [];
  for (const c of d.consultores) {
    const disponivelEm = disponibilidade(c, d.alocacoes, hoje);
    if (disponivelEm > v.inicioPrevisto) continue;
    const m = notaMatch(c, v);
    if (m) candidatos.push({ consultor: c, disponivelEm, ...m });
  }
  return candidatos
    .sort((a, b) => b.nota - a.nota || a.disponivelEm.localeCompare(b.disponivelEm) || a.consultor.nome.localeCompare(b.consultor.nome, "pt-BR"))
    .slice(0, limite);
}

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function explicacaoPorRegra(c: Candidato, v: Vaga, hoje: string): string {
  const total = v.skillsObrigatorias.length;
  const cobertura = c.faltando.length === 0
    ? "Cobre todas as skills obrigatórias."
    : `Cobre ${c.cobertas.length} de ${total} skills obrigatórias; falta ${c.faltando.join(", ")}.`;
  const quando = c.disponivelEm <= hoje ? "Disponível agora." : `Disponível a partir de ${dataBr(c.disponivelEm)}.`;
  return `${cobertura} ${quando}`;
}
