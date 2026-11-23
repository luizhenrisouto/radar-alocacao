/** Datas como texto "YYYY-MM-DD"; as contas são feitas em UTC para não depender do fuso da máquina. */
const DIA_MS = 86_400_000;

const emMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const deMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A data de hoje em São Paulo. */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

export function somarDias(iso: string, n: number): string {
  return deMs(emMs(iso) + n * DIA_MS);
}

/** Dias corridos: ate − de. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((emMs(ate) - emMs(de)) / DIA_MS);
}

/** Dias de segunda a sexta com de < d <= ate (sem feriados); 0 se ate <= de. */
export function diasUteisEntre(de: string, ate: string): number {
  const total = diasEntre(de, ate);
  if (total <= 0) return 0;
  const semanas = Math.floor(total / 7);
  let uteis = semanas * 5;
  const inicio = new Date(emMs(de)).getUTCDay();
  for (let i = 1; i <= total % 7; i++) {
    const dia = (inicio + i) % 7;
    if (dia !== 0 && dia !== 6) uteis++;
  }
  return uteis;
}
