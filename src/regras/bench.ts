/** Bench: quem está sem alocação ativa, há quanto tempo e quanto custa. */
import { diasUteisEntre } from "./datas";
import type { Alocacao, Consultor, DadosEmpresa, Empresa } from "./tipos";

export function alocacaoAtiva(a: Alocacao, hoje: string): boolean {
  return a.status === "ativa" && a.inicio <= hoje && (a.fim == null || a.fim >= hoje);
}

export function estaNoBench(c: Consultor, alocacoes: Alocacao[], hoje: string): boolean {
  return !alocacoes.some((a) => a.consultorId === c.id && alocacaoAtiva(a, hoje));
}

/** Dias úteis desde o fim da última alocação (antes de hoje); sem histórico, desde a admissão. */
export function diasDeBench(c: Consultor, alocacoes: Alocacao[], hoje: string): number {
  const fins = alocacoes
    .filter((a) => a.consultorId === c.id && a.fim != null && a.fim < hoje)
    .map((a) => a.fim as string)
    .sort();
  const desde = fins.at(-1) ?? c.admitidoEm;
  return diasUteisEntre(desde, hoje);
}

export function custoDiario(c: Consultor, empresa: Empresa): number {
  return c.custoMensal / empresa.diasUteisMes;
}

export interface ItemBench { consultor: Consultor; dias: number; custoDiario: number; custoAcumulado: number }

export function resumoBench(d: DadosEmpresa, hoje: string): ItemBench[] {
  return d.consultores
    .filter((c) => estaNoBench(c, d.alocacoes, hoje))
    .map((c) => {
      const dias = diasDeBench(c, d.alocacoes, hoje);
      const diario = custoDiario(c, d.empresa);
      return { consultor: c, dias, custoDiario: diario, custoAcumulado: diario * dias };
    })
    .sort((a, b) => b.custoAcumulado - a.custoAcumulado);
}

/** Valor/hora médio das alocações ativas × 8 horas × pessoas no bench. */
export function receitaParadaPorDia(d: DadosEmpresa, hoje: string): number {
  const ativas = d.alocacoes.filter((a) => alocacaoAtiva(a, hoje));
  if (ativas.length === 0) return 0;
  const media = ativas.reduce((s, a) => s + a.valorHora, 0) / ativas.length;
  return media * 8 * resumoBench(d, hoje).length;
}
