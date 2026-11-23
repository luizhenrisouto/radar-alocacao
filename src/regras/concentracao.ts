/** Risco de concentração: quanto do time alocado e da receita depende de cada cliente. */
import { alocacaoAtiva } from "./bench";
import type { Cliente, DadosEmpresa } from "./tipos";

export const HORAS_MES = 168;

export interface RiscoCliente {
  cliente: Cliente; consultores: number; parcelaConsultores: number; receitaMensal: number; parcelaReceita: number; alerta: boolean;
}

export function concentracao(d: DadosEmpresa, hoje: string): RiscoCliente[] {
  const ativas = d.alocacoes.filter((a) => alocacaoAtiva(a, hoje));
  const totalConsultores = new Set(ativas.map((a) => a.consultorId)).size;
  const totalReceita = ativas.reduce((s, a) => s + a.valorHora * HORAS_MES, 0);
  const limite = d.empresa.limiteConcentracao;
  return d.clientes
    .map((cliente) => {
      const doCliente = ativas.filter((a) => a.clienteId === cliente.id);
      const consultores = new Set(doCliente.map((a) => a.consultorId)).size;
      const receitaMensal = doCliente.reduce((s, a) => s + a.valorHora * HORAS_MES, 0);
      const parcelaConsultores = totalConsultores ? consultores / totalConsultores : 0;
      const parcelaReceita = totalReceita ? receitaMensal / totalReceita : 0;
      return { cliente, consultores, parcelaConsultores, receitaMensal, parcelaReceita, alerta: parcelaConsultores > limite || parcelaReceita > limite };
    })
    .filter((r) => r.consultores > 0)
    .sort((a, b) => b.parcelaConsultores - a.parcelaConsultores);
}
