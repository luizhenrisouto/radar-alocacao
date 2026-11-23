/** Premissas da conta "manter ou desligar", guardadas no navegador de quem usa. */
import { PREMISSAS_PADRAO, normalizarPremissas, type Origem, type Premissas } from "../../src/regras/desligamento";

const CHAVE = "radar.premissas";

export function lerPremissas(): Premissas {
  try {
    const texto = localStorage.getItem(CHAVE);
    return texto ? normalizarPremissas(JSON.parse(texto)) : { ...PREMISSAS_PADRAO };
  } catch {
    return { ...PREMISSAS_PADRAO };
  }
}

export function gravarPremissas(p: Premissas): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {
    // Sem armazenamento (aba anônima, bloqueio): a conta segue com o que está na tela.
  }
}

type CampoNumerico = Exclude<keyof Premissas, "contarReceitaParada">;

/** Campos numéricos, na ordem do painel, com o rótulo da tela e a origem do padrão. */
export const CAMPOS_PREMISSAS: { campo: CampoNumerico; rotulo: string; origem: Origem }[] = [
  { campo: "fatorEncargosClt", rotulo: "Fator de encargos CLT", origem: "estimativa" },
  { campo: "diasAvisoPj", rotulo: "Aviso PJ (dias)", origem: "estimativa" },
  { campo: "diasAvisoCooperado", rotulo: "Aviso cooperado (dias)", origem: "estimativa" },
  { campo: "diasParaContratar", rotulo: "Dias para contratar (corridos)", origem: "mercado" },
  { campo: "recrutamentoMeses", rotulo: "Recrutamento (em custos mensais)", origem: "estimativa" },
  { campo: "rampaPercentual", rotulo: "Rampa (% do primeiro mês)", origem: "estimativa" },
];

export const ROTULO_ORIGEM: Record<Origem, string> = { lei: "Lei", mercado: "Mercado", estimativa: "Estimativa" };

export const FONTES_PREMISSAS: { titulo: string; url: string }[] = [
  { titulo: "GeekHunter via IT Forum: prazos de contratação em tecnologia", url: "https://itforum.com.br/?p=9532660" },
  { titulo: "Contábeis: crise de talentos sêniores em TI", url: "https://www.contabeis.com.br/noticias/75237/crise-de-talentos-senior-80-dos-lideres-de-tecnologia-nao-conseguem-contratar-ou-reter-profissionais-de-ti/" },
  { titulo: "Lei 12.506/2011: aviso prévio proporcional", url: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12506.htm" },
  { titulo: "Lei 12.690/2012: cooperativas de trabalho", url: "https://planalto.gov.br/ccivil_03/_Ato2011-2014/2012/Lei/L12690.htm" },
  { titulo: "Extra Classe: direitos dos cooperados", url: "https://www.extraclasse.org.br/?p=3455" },
];

/** "1,7" ou "1.7" → 1.7; vazio ou texto → NaN (a normalização devolve o padrão). */
export function lerNumero(texto: string): number {
  const t = texto.trim().replace(",", ".");
  return t === "" ? NaN : Number(t);
}

/** Número para o campo do painel: 1.7 → "1,7". */
export function textoDoNumero(n: number): string {
  return String(n).replace(".", ",");
}
