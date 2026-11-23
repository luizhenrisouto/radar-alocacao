/** Tipos do domínio do Radar de Alocação. Todas as datas são "YYYY-MM-DD". */
export type Senioridade = "junior" | "pleno" | "senior" | "especialista";
export const NIVEIS: Senioridade[] = ["junior", "pleno", "senior", "especialista"];

export interface Empresa { id: string; nome: string; limiteConcentracao: number; diasUteisMes: number }
export interface Cliente { id: string; nome: string; setor: string | null }
export interface Consultor {
  id: string; nome: string; email: string; cargo: string; senioridade: Senioridade; skills: string[];
  regime: Regime; custoMensal: number; cidade: string | null; aceitaRemoto: boolean; admitidoEm: string;
  /** Salário informado na planilha (só faz diferença para CLT); ausente ou null = estimado pelo custo. */
  salario?: number | null;
}
export type Regime = "CLT" | "PJ" | "Cooperado";
export const REGIMES: Regime[] = ["CLT", "PJ", "Cooperado"];
export interface Alocacao {
  id: string; consultorId: string; clienteId: string; inicio: string; fim: string | null; valorHora: number;
  status: "ativa" | "encerrada" | "prevista";
}
export interface Vaga {
  id: string; clienteId: string; titulo: string; senioridade: Senioridade; skillsObrigatorias: string[];
  skillsDesejaveis: string[]; inicioPrevisto: string; valorHora: number | null; status: "aberta" | "fechada";
}
export interface Match { vagaId: string; consultorId: string; nota: number; explicacao: string; origem: "ia" | "regra"; geradoEm: string }
export type TipoSinal = "corte" | "resultado_ruim" | "fusao" | "troca_diretoria" | "congelamento" | "expansao" | "irrelevante";
/** Notícia de um cliente, classificada. Notícia de exemplo não tem link (url null). */
export interface Sinal {
  id: string; clienteId: string; titulo: string; url: string | null; fonte: string; publicadoEm: string;
  tipo: TipoSinal; gravidade: number; resumo: string; origem: "ia" | "regra";
}
/** Vaga vista no mercado (fora dos clientes), colada pelo comercial. */
export interface VagaExterna {
  id: string; empresaAlvo: string; titulo: string; senioridade: Senioridade; skillsObrigatorias: string[]; skillsDesejaveis: string[];
  cidade: string | null; remoto: boolean; url: string | null; inicioPrevisto: string; origem: "ia" | "regra" | "manual"; criadaEm: string;
}
export interface DadosEmpresa {
  empresa: Empresa; clientes: Cliente[]; consultores: Consultor[]; alocacoes: Alocacao[]; vagas: Vaga[]; matches: Match[];
  vagasExternas: VagaExterna[]; sinais: Sinal[];
}
