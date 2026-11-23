/** Contratos (alocações ativas) que vencem nos próximos 30, 60 ou 90 dias. */
import { alocacaoAtiva } from "./bench";
import { diasEntre } from "./datas";
import type { Alocacao, Cliente, Consultor, DadosEmpresa } from "./tipos";

export interface Vencimento { faixa: 30 | 60 | 90; diasRestantes: number; alocacao: Alocacao; consultor: Consultor; cliente: Cliente }

export function vencimentos(d: DadosEmpresa, hoje: string): Vencimento[] {
  const lista: Vencimento[] = [];
  for (const a of d.alocacoes) {
    if (!alocacaoAtiva(a, hoje) || a.fim == null) continue;
    const diasRestantes = diasEntre(hoje, a.fim);
    if (diasRestantes > 90) continue;
    const consultor = d.consultores.find((c) => c.id === a.consultorId);
    const cliente = d.clientes.find((c) => c.id === a.clienteId);
    if (!consultor || !cliente) continue;
    const faixa = diasRestantes <= 30 ? 30 : diasRestantes <= 60 ? 60 : 90;
    lista.push({ faixa, diasRestantes, alocacao: a, consultor, cliente });
  }
  return lista.sort((x, y) => x.diasRestantes - y.diasRestantes);
}
