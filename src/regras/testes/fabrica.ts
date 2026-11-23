/** Fábrica de dados mínimos para os testes das regras. */
import type { Alocacao, Cliente, Consultor, DadosEmpresa, Vaga } from "../tipos";

export const empresa = { id: "e1", nome: "Teste", limiteConcentracao: 0.3, diasUteisMes: 22 };

export function consultor(id: string, extra: Partial<Consultor> = {}): Consultor {
  return {
    id, nome: `Pessoa ${id}`, email: `${id}@teste.exemplo`, cargo: "Dev", senioridade: "pleno", skills: [],
    regime: "CLT", custoMensal: 11000, cidade: null, aceitaRemoto: true, admitidoEm: "2025-01-01", ...extra,
  };
}

export function alocacao(id: string, consultorId: string, clienteId: string, inicio: string, fim: string | null, extra: Partial<Alocacao> = {}): Alocacao {
  return { id, consultorId, clienteId, inicio, fim, valorHora: 100, status: "ativa", ...extra };
}

export function cliente(id: string, nome = `Cliente ${id}`): Cliente {
  return { id, nome, setor: null };
}

export function vaga(id: string, extra: Partial<Vaga> = {}): Vaga {
  return {
    id, clienteId: "cli1", titulo: "Vaga", senioridade: "pleno", skillsObrigatorias: [], skillsDesejaveis: [],
    inicioPrevisto: "2026-12-01", valorHora: 120, status: "aberta", ...extra,
  };
}

export function dados(parcial: Partial<DadosEmpresa>): DadosEmpresa {
  return { empresa, clientes: [], consultores: [], alocacoes: [], vagas: [], matches: [], vagasExternas: [], sinais: [], ...parcial };
}
