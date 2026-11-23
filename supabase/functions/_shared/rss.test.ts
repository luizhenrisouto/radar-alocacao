import { expect, test } from "vitest";
import { lerRss } from "./rss.ts";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Busca</title>
<item>
  <title>Banco Norte &amp; Pampa anunciam fusão - Jornal do Sul</title>
  <link>https://news.google.com/rss/articles/abc?oc=5</link>
  <pubDate>Mon, 16 Nov 2026 13:00:00 GMT</pubDate>
  <source url="https://jornaldosul.exemplo">Jornal do Sul</source>
</item>
<item>
  <title><![CDATA[Operadora "Vale Verde" registra prejuízo &#8211; parcial]]></title>
  <link>https://exemplo.com/2</link>
  <pubDate>Sun, 15 Nov 2026 02:30:00 GMT</pubDate>
  <source url="https://economia.exemplo">Economia &amp; Negócios</source>
</item>
<item>
  <title>Sem data nem fonte</title>
  <link>https://exemplo.com/3</link>
</item>
<item><title>Sem link</title></item>
</channel></rss>`;

test("lerRss lê título, link, fonte e data, com CDATA e entidades", () => {
  const [a, b] = lerRss(XML);
  expect(a).toEqual({ titulo: "Banco Norte & Pampa anunciam fusão", url: "https://news.google.com/rss/articles/abc?oc=5", fonte: "Jornal do Sul", publicadoEm: "2026-11-16" });
  expect(b).toEqual({ titulo: 'Operadora "Vale Verde" registra prejuízo – parcial', url: "https://exemplo.com/2", fonte: "Economia & Negócios", publicadoEm: "2026-11-15" });
});

test("item sem data fica com publicadoEm null; item sem link é ignorado", () => {
  const itens = lerRss(XML);
  expect(itens).toHaveLength(3);
  expect(itens[2]).toEqual({ titulo: "Sem data nem fonte", url: "https://exemplo.com/3", fonte: "", publicadoEm: null });
});

test("XML quebrado devolve lista vazia", () => {
  expect(lerRss("<html>erro 503</html>")).toEqual([]);
  expect(lerRss("")).toEqual([]);
});
