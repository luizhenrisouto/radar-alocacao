const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "R$ 1.234,56" (com espaço comum, não o espaço fixo do Intl). */
export function reais(n: number): string {
  return moeda.format(n).replace(/ /g, " ");
}

export function dataBr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function porcento(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** 118 → "118 dias úteis". */
export function diasUteis(n: number): string {
  return `${n.toLocaleString("pt-BR")} dias úteis`;
}

/** Dias úteis em meses aproximados: 118 com 22 por mês → "≈ 5,4 meses". */
export function meses(diasUteisCount: number, diasUteisMes: number): string {
  return `≈ ${(diasUteisCount / diasUteisMes).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses`;
}
