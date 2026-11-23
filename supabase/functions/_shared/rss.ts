/** Lê o RSS de busca do Google Notícias. Sem APIs do Deno (o app e os testes também usam) e sem lançar erro. */

export interface Manchete { titulo: string; url: string; fonte: string; publicadoEm: string | null }

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };

function decodificar(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+|#39);/gi, (m, nome) => ENTIDADES[nome.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function campo(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodificar(m[1]) : "";
}

function dataIso(pubDate: string): string | null {
  if (!pubDate) return null;
  const d = new Date(pubDate);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function lerRss(xml: string): Manchete[] {
  try {
    const itens = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
    const lidas: Manchete[] = [];
    for (const item of itens) {
      const url = campo(item, "link");
      let titulo = campo(item, "title");
      if (!url || !titulo) continue;
      const fonte = campo(item, "source");
      // O Google põe a fonte no fim do título: "Manchete - Fonte".
      if (fonte && titulo.endsWith(` - ${fonte}`)) titulo = titulo.slice(0, -(fonte.length + 3)).trim();
      lidas.push({ titulo, url, fonte, publicadoEm: dataIso(campo(item, "pubDate")) });
    }
    return lidas;
  } catch {
    return [];
  }
}
