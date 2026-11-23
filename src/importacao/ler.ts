/** Lê um arquivo CSV ou XLSX enviado pelo navegador como uma grade de textos (a primeira linha é o cabeçalho). */
import Papa from "papaparse";
import readXlsxFile from "read-excel-file";

function celula(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** Tira só as linhas vazias do fim: as do meio ficam, para a numeração bater com a planilha (converterLinhas as ignora). */
function semVaziasNoFim(linhas: string[][]): string[][] {
  let fim = linhas.length;
  while (fim > 0 && linhas[fim - 1].every((x) => x === "")) fim--;
  return linhas.slice(0, fim);
}

/** O separador mais frequente no cabeçalho (o Excel em português usa ";"). */
function separador(texto: string): string {
  const cabecalho = texto.split(/\r?\n/, 1)[0] ?? "";
  const contar = (s: string) => cabecalho.split(s).length - 1;
  return [";", ",", "\t"].reduce((melhor, s) => (contar(s) > contar(melhor) ? s : melhor), ";");
}

/** UTF-8 quando o arquivo é UTF-8; senão windows-1252, que é como o Excel em português salva CSV. */
function decodificar(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export async function lerArquivo(arquivo: File): Promise<string[][]> {
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith(".xlsx")) {
    const linhas = await readXlsxFile(arquivo);
    return semVaziasNoFim(linhas.map((l) => l.map(celula)));
  }
  if (nome.endsWith(".csv") || nome.endsWith(".txt")) {
    const texto = decodificar(new Uint8Array(await arquivo.arrayBuffer())).replace(/^﻿/, "");
    const r = Papa.parse<string[]>(texto, { skipEmptyLines: false, delimiter: separador(texto) });
    return semVaziasNoFim(r.data.map((l) => l.map(celula)));
  }
  throw new Error("Use um arquivo .csv ou .xlsx.");
}
