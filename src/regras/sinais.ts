/** Nota de risco de cada cliente a partir das notícias classificadas. */
import { diasEntre } from "./datas";
import type { Sinal, TipoSinal } from "./tipos";

export const ROTULO_SINAL: Record<TipoSinal, string> = {
  corte: "Corte", resultado_ruim: "Resultado ruim", fusao: "Fusão ou aquisição", troca_diretoria: "Troca de diretoria",
  congelamento: "Congelamento", expansao: "Expansão", irrelevante: "Irrelevante",
};

/** Tipos que pesam no risco. Expansão é oportunidade; irrelevante não conta. */
export const TIPOS_DE_RISCO: TipoSinal[] = ["corte", "resultado_ruim", "fusao", "troca_diretoria", "congelamento"];

const PESO: Record<number, number> = { 1: 10, 2: 25, 3: 45 };
const JANELA = 90;

/** Soma dos sinais de risco dos últimos 90 dias, cada um valendo menos conforme envelhece. Teto 100. */
export function notaRisco(sinais: Sinal[], clienteId: string, hoje: string): number {
  let nota = 0;
  for (const s of sinais) {
    if (s.clienteId !== clienteId || !TIPOS_DE_RISCO.includes(s.tipo)) continue;
    const idade = Math.max(0, diasEntre(s.publicadoEm, hoje));
    if (idade >= JANELA) continue;
    nota += (PESO[s.gravidade] ?? 0) * (1 - idade / JANELA);
  }
  return Math.min(100, Math.round(nota * 10) / 10);
}

export function nivelRisco(nota: number): "alto" | "atencao" | "baixo" {
  return nota >= 50 ? "alto" : nota >= 20 ? "atencao" : "baixo";
}
