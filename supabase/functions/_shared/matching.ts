/**
 * Cópia de normalizarSkill e explicacaoPorRegra de src/regras/matching.ts para as funções do Supabase (Deno),
 * que não resolvem os imports sem extensão do app. explicar.test.ts confere que as duas versões dão o mesmo resultado.
 */
export function normalizarSkill(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s.\-_/]+/g, "");
}

export interface CandidatoBase { cobertas: string[]; faltando: string[]; disponivelEm: string }

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function explicacaoPorRegra(c: CandidatoBase, v: { skillsObrigatorias: string[] }, hoje: string): string {
  const total = v.skillsObrigatorias.length;
  const cobertura = c.faltando.length === 0
    ? "Cobre todas as skills obrigatórias."
    : `Cobre ${c.cobertas.length} de ${total} skills obrigatórias; falta ${c.faltando.join(", ")}.`;
  const quando = c.disponivelEm <= hoje ? "Disponível agora." : `Disponível a partir de ${dataBr(c.disponivelEm)}.`;
  return `${cobertura} ${quando}`;
}
