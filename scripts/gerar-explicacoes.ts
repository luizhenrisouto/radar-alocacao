/**
 * Gera com o Claude as explicações das vagas da Nexo (src/demo/explicacoes-nexo.json) e os perfis anônimos (src/demo/perfis-nexo.json),
 * para a demonstração mostrar texto da IA sem depender de rede.
 * Uso: ANTHROPIC_API_KEY=... npx tsx scripts/gerar-explicacoes.ts
 */
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { gerarNexo } from "../src/demo/nexo";
import { hojeSaoPaulo } from "../src/regras/datas";
import { rankearCandidatos } from "../src/regras/matching";
import { anonimo, citaSoSkills, encaixesPorPessoa, proibidosDe, setoresDe, skillsConhecidas } from "../src/regras/mercado";
import { explicarMatches, MODELO_PADRAO } from "../supabase/functions/_shared/explicar";
import { atenderMercado } from "../supabase/functions/_shared/mercado";

if (!process.env.ANTHROPIC_API_KEY) {
  console.log("Defina ANTHROPIC_API_KEY para gerar as explicações.");
  process.exit(1);
}

const hoje = hojeSaoPaulo();
const nexo = gerarNexo(hoje);
const ia = new Anthropic();
const saida: Record<string, string> = {};
let daIa = 0, total = 0;

for (const vaga of nexo.vagas) {
  const candidatos = rankearCandidatos(nexo, vaga.id, hoje);
  const r = await explicarMatches({ vaga, candidatos, hoje }, { ia, modelo: process.env.MODELO_IA ?? MODELO_PADRAO });
  for (const x of r) {
    total++;
    if (x.origem === "ia") { saida[`${vaga.id}:${x.consultorId}`] = x.explicacao; daIa++; }
  }
  console.log(`${vaga.id} ${vaga.titulo}: ${r.filter((x) => x.origem === "ia").length}/${r.length} da IA`);
}

const arquivo = path.resolve(import.meta.dirname, "../src/demo/explicacoes-nexo.json");
fs.writeFileSync(arquivo, JSON.stringify(saida, null, 2) + "\n");
console.log(`${daIa} de ${total} explicações da IA gravadas em ${path.relative(process.cwd(), arquivo)}`);

// Perfis anônimos de quem está no bench ou sai em até 60 dias (aba Mercado da demonstração).
// Só fica o perfil que passa na checagem de anonimato (sem nome, e-mail ou cliente).
const perfis: Record<string, { titulo: string; resumo: string; destaques: string[] }> = {};
const pessoas = encaixesPorPessoa(nexo, hoje).map((e) => e.consultor);
for (const c of pessoas) {
  const r = await atenderMercado(
    { tarefa: "perfil", consultor: { cargo: c.cargo, senioridade: c.senioridade, skills: c.skills, setores: setoresDe(nexo, c.id), cidade: c.cidade, aceitaRemoto: c.aceitaRemoto } },
    { empresaDoUsuario: "nexo", ia, modelo: process.env.MODELO_IA ?? MODELO_PADRAO },
  );
  const p = (r.corpo as { resultado: { titulo: string; resumo: string; destaques: string[] } | null }).resultado;
  const textos = p ? [p.titulo, p.resumo, ...p.destaques] : [];
  if (p && anonimo(textos, proibidosDe(nexo, c)) && citaSoSkills(textos, skillsConhecidas(nexo), c.skills)) perfis[c.id] = p;
  console.log(`perfil ${c.id}: ${perfis[c.id] ? "IA" : "regra"}`);
}
const arquivoPerfis = path.resolve(import.meta.dirname, "../src/demo/perfis-nexo.json");
fs.writeFileSync(arquivoPerfis, JSON.stringify(perfis, null, 2) + "\n");
console.log(`${Object.keys(perfis).length} de ${pessoas.length} perfis da IA gravados em ${path.relative(process.cwd(), arquivoPerfis)}`);
