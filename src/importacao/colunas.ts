/** Campos de cada planilha importável, com os nomes de coluna aceitos. */
import { normalizarSkill as normalizar } from "../regras/matching";

export type TipoImportacao = "consultores" | "alocacoes" | "vagas" | "ponto_colaboradores" | "ponto_marcacoes";
export interface CampoImportacao { campo: string; rotulo: string; obrigatorio: boolean; sinonimos: string[] }

const c = (campo: string, rotulo: string, obrigatorio: boolean, ...sinonimos: string[]): CampoImportacao => ({ campo, rotulo, obrigatorio, sinonimos });

export const CAMPOS: Record<TipoImportacao, CampoImportacao[]> = {
  consultores: [
    c("nome", "Nome", true, "nome completo", "consultor", "pessoa"),
    c("email", "E-mail", true, "email corporativo", "e-mail corporativo"),
    c("cargo", "Cargo", false, "função", "funcao"),
    c("senioridade", "Senioridade", true, "nível", "nivel"),
    c("skills", "Skills", false, "habilidades", "tecnologias", "competências", "stack"),
    c("regime", "Regime", false, "contrato", "tipo de contrato"),
    c("custoMensal", "Custo mensal", false, "custo"),
    c("salario", "Salário", false, "salario", "salário base", "remuneração"),
    c("cidade", "Cidade", false, "local"),
    c("aceitaRemoto", "Remoto", false, "aceita remoto", "home office"),
    c("admitidoEm", "Admissão", false, "data de admissão", "admitido em", "admitido"),
  ],
  alocacoes: [
    c("email", "E-mail", true, "email do consultor", "e-mail do consultor"),
    c("cliente", "Cliente", true, "empresa cliente"),
    c("inicio", "Início", true, "data de início", "data inicio"),
    c("fim", "Fim", false, "data de fim", "término", "termino", "fim do contrato"),
    c("valorHora", "Valor/hora", false, "valor hora", "taxa", "valor da hora"),
  ],
  vagas: [
    c("titulo", "Título", true, "vaga", "nome da vaga"),
    c("cliente", "Cliente", true, "empresa cliente"),
    c("senioridade", "Senioridade", true, "nível", "nivel"),
    c("skillsObrigatorias", "Skills obrigatórias", true, "obrigatórias", "requisitos"),
    c("skillsDesejaveis", "Skills desejáveis", false, "desejáveis", "diferenciais"),
    c("inicioPrevisto", "Início previsto", true, "início", "data de início"),
    c("valorHora", "Valor/hora", false, "valor hora", "taxa"),
  ],
  ponto_colaboradores: [
    c("matricula", "Matrícula", true, "chapa", "cadastro", "número de cadastro"),
    c("nome", "Nome", true, "colaborador", "nome completo"),
    c("email", "E-mail", true, "email corporativo", "e-mail corporativo"),
    c("emailGestor", "E-mail do gestor", false, "gestor", "e-mail do líder", "email do lider", "e-mail do lider", "email gestor"),
    c("ativo", "Ativo", false, "status", "situação do colaborador", "ativo no ponto"),
  ],
  ponto_marcacoes: [
    c("matricula", "Matrícula", true, "chapa", "cadastro", "número de cadastro"),
    c("data", "Data", true, "dia"),
    c("marcacoes", "Marcações", false, "batidas", "horários", "horarios"),
    c("situacao", "Situação", false, "ocorrência", "ocorrencia", "justificativa", "abono"),
  ],
};

/** Para cada campo, o índice da coluna do cabeçalho que corresponde a ele (ou null). Cada coluna serve a um campo só. */
export function mapearColunas(tipo: TipoImportacao, cabecalho: string[]): Record<string, number | null> {
  const nomes = cabecalho.map((h) => normalizar(h ?? ""));
  const usadas = new Set<number>();
  const mapa: Record<string, number | null> = {};
  for (const campo of CAMPOS[tipo]) {
    const aceitos = new Set([campo.rotulo, campo.campo, ...campo.sinonimos].map(normalizar));
    const i = nomes.findIndex((n, idx) => !usadas.has(idx) && aceitos.has(n));
    mapa[campo.campo] = i >= 0 ? i : null;
    if (i >= 0) usadas.add(i);
  }
  return mapa;
}
