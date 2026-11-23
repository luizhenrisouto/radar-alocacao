/**
 * Eval da classificação de notícias contra o gabarito de 30 manchetes fictícias.
 * Uso: npm run eval:sinais (regra). Com ANTHROPIC_API_KEY, mede também a IA e grava src/demo/eval-sinais-ia.json,
 * que o card "Como medimos" do painel mostra.
 */
import fs from "node:fs";
import path from "node:path";
import { GABARITO_SINAIS } from "../src/demo/gabarito-sinais";
import { avaliarClassificacao } from "../src/regras/avaliacao";
import { MODELO_PADRAO } from "../supabase/functions/_shared/explicar";
import { classificarManchetes, classificarPorRegra } from "../supabase/functions/_shared/sinais";

const regra = avaliarClassificacao(GABARITO_SINAIS, (t) => classificarPorRegra(t).tipo);
console.log(`Regra: ${regra.acertos} de ${regra.total}`);
for (const g of GABARITO_SINAIS) {
  const tipo = classificarPorRegra(g.titulo).tipo;
  if (tipo !== g.tipo) console.log(`  errou: "${g.titulo}" → ${tipo} (esperado ${g.tipo})`);
}

if (process.env.ANTHROPIC_API_KEY) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const ia = new Anthropic();
  const modelo = process.env.MODELO_IA ?? MODELO_PADRAO;
  const tipos = new Map<string, string>();
  let daIa = 0;
  for (let i = 0; i < GABARITO_SINAIS.length; i += 10) {
    const lote = GABARITO_SINAIS.slice(i, i + 10).map((g, j) => ({ titulo: g.titulo, url: `gabarito-${i + j}`, fonte: "", publicadoEm: null }));
    const r = await classificarManchetes(lote, { ia, modelo });
    r.forEach((c, j) => { tipos.set(lote[j].titulo, c.tipo); if (c.origem === "ia") daIa++; });
  }
  const resultado = avaliarClassificacao(GABARITO_SINAIS, (t) => tipos.get(t) as any);
  console.log(`IA: ${resultado.acertos} de ${resultado.total} (${daIa} respostas válidas da IA; as demais caíram para a regra)`);
  for (const g of GABARITO_SINAIS) if (tipos.get(g.titulo) !== g.tipo) console.log(`  errou: "${g.titulo}" → ${tipos.get(g.titulo)} (esperado ${g.tipo})`);
  const arquivo = path.resolve(import.meta.dirname, "../src/demo/eval-sinais-ia.json");
  fs.writeFileSync(arquivo, JSON.stringify({ ...resultado, modelo, geradoEm: new Date().toISOString().slice(0, 10) }, null, 2) + "\n");
  console.log(`Gravado em ${path.relative(process.cwd(), arquivo)}`);
} else {
  console.log("Defina ANTHROPIC_API_KEY para medir também a IA.");
}
