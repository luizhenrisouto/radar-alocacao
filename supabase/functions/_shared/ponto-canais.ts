/**
 * Canais de envio do ponto: Resend (e-mail) e fluxo do Workflows no Teams. Código puro: recebe o fetch.
 * Os erros nunca levam a URL do fluxo do Teams (ela dá acesso a postar) nem dados da pessoa.
 */
import type { Mensagem } from "./ponto.ts";

type Busca = (url: string, init: RequestInit) => Promise<Response>;

/** Nome do remetente seguro para o cabeçalho From: sem aspas, sinais de menor/maior e barras; entre aspas. */
const nomeRemetente = (nome: string) => `"${nome.replace(/["<>\\]/g, "").replace(/\s+/g, " ").trim() || "RH"}"`;

export async function enviarResend(
  busca: Busca, cfg: { chave: string | undefined; de: string | undefined }, destino: string, m: Mensagem, remetenteNome: string,
): Promise<void> {
  if (!cfg.chave || !cfg.de) throw new Error("e-mail não configurado (RESEND_API_KEY e PONTO_REMETENTE)");
  let r: Response;
  try {
    r = await busca("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${nomeRemetente(remetenteNome)} <${cfg.de}>`, to: [destino], subject: m.assunto, text: m.texto }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("resend: falha de rede");
  }
  if (!r.ok) throw new Error(`resend ${r.status}`);
}

export async function postarTeams(busca: Busca, url: string, destino: string, m: Mensagem): Promise<void> {
  let r: Response;
  try {
    r = await busca(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinatario: destino, assunto: m.assunto, texto: m.texto }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("teams: falha de rede");
  }
  if (!r.ok) throw new Error(`teams ${r.status}`);
}

/**
 * Espaça as chamadas (o Resend limita as requisições por segundo) e tenta de novo uma vez quando a resposta é 429.
 * A primeira chamada não espera.
 */
export function comLimite<A extends unknown[]>(
  fn: (...a: A) => Promise<void>, op: { intervaloMs: number; esperar: (ms: number) => Promise<void> },
): (...a: A) => Promise<void> {
  let primeira = true;
  return async (...a: A) => {
    if (!primeira) await op.esperar(op.intervaloMs);
    primeira = false;
    try {
      await fn(...a);
    } catch (e) {
      if (!/ 429$/.test(String((e as Error)?.message))) throw e;
      await op.esperar(1500);
      await fn(...a);
    }
  };
}
