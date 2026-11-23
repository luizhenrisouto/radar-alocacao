import type { Corte } from "../../src/regras/corte";
import type { Candidato } from "../../src/regras/matching";
import type { Lead, Perfil, RascunhoEmail, RascunhoVaga } from "../../src/regras/mercado";
import type { Consultor, DadosEmpresa, Match, Vaga, VagaExterna } from "../../src/regras/tipos";
import type { ConfigPonto, DadosPonto } from "../../supabase/functions/_shared/ponto.ts";

export type { TipoImportacao } from "../../src/importacao/colunas";
import type { TipoImportacao } from "../../src/importacao/colunas";
export interface ResultadoImportacao { gravadas: number; erros: { linha: number; motivo: string }[] }

/** Tudo que as telas pedem ao servidor. A demonstração responde em memória; a real fala com o Supabase. */
export interface Api {
  modo: "demo" | "real";
  sessao(): Promise<{ email: string } | null>;
  entrar(email: string, senha: string): Promise<void>;
  sair(): Promise<void>;
  dados(): Promise<DadosEmpresa>;
  /** Pede à IA uma explicação por candidato, na mesma ordem. */
  explicar(vaga: Vaga, candidatos: Candidato[]): Promise<Match[]>;
  importar(tipo: TipoImportacao, linhas: unknown[]): Promise<ResultadoImportacao>;
  /** Encerra na data as alocações das pessoas no cliente e guarda o corte. */
  registrarCorte(c: Corte & { motivo: string }): Promise<{ encerradas: number }>;
  // Mercado. null = sem resposta válida da IA: a tela usa a regra.
  extrairVaga(texto: string): Promise<RascunhoVaga | null>;
  salvarVagaExterna(v: Omit<VagaExterna, "id" | "criadaEm">): Promise<void>;
  apagarVagaExterna(id: string): Promise<void>;
  perfilAnonimo(c: Consultor, setores: string[]): Promise<Perfil | null>;
  rascunhoEmail(lead: Lead, perfis: Perfil[], remetente: string): Promise<RascunhoEmail | null>;
  /** Busca agora as notícias dos clientes da empresa (função sinais). */
  buscarSinais(): Promise<{ novos: number }>;
  // Ponto em dia. Único módulo que envia mensagens (ao colaborador e ao gestor dele); a demonstração só simula.
  ponto(): Promise<DadosPonto>;
  /** ocupado = já havia uma rodada em andamento (agendamento ou outro clique); nada foi enviado. */
  cobrarPonto(): Promise<{ enviados: number; falhas: number; ocupado?: true }>;
  testarEnvioPonto(): Promise<void>;
  /** O RH fecha a pendência à mão (acertada no Senior). */
  acertarPendencia(id: string): Promise<void>;
  /** teamsUrl null = mantém a atual; "" apaga. */
  salvarConfigPonto(c: Omit<ConfigPonto, "teamsConfigurado"> & { teamsUrl: string | null }): Promise<void>;
}
