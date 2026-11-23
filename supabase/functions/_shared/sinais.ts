/**
 * Notícias dos clientes: tipos, a regra de palavras-chave (fallback e base do eval) e a URL de busca.
 * Sem APIs do Deno: o app, o eval e a função sinais usam.
 */
import type { ClienteIa, Resposta } from "./explicar.ts";
import { lerRss, type Manchete } from "./rss.ts";
import { tokensDoTexto } from "./texto.ts";

export const TIPOS_SINAL = ["corte", "resultado_ruim", "fusao", "troca_diretoria", "congelamento", "expansao", "irrelevante"] as const;
export type Tipo = (typeof TIPOS_SINAL)[number];

export const GRAVIDADE_POR_TIPO: Record<Tipo, number> = {
  corte: 3, resultado_ruim: 2, fusao: 2, troca_diretoria: 1, congelamento: 2, expansao: 1, irrelevante: 0,
};

// Sobre o texto sem acento e em minúsculas. A primeira lista que casa define o tipo, nesta ordem.
const PALAVRAS: [Tipo, RegExp][] = [
  ["corte", /\b(demit|demiss|desliga|layoff|lay off|corta (\d+ )?(vagas|empregos|funcionarios|postos)|corte de (vagas|custos|pessoal|funcionarios|empregos)|reducao de (quadro|custos|pessoal|equipe)|enxuga|reestrutura)/],
  ["resultado_ruim", /\b(prejuizo|recuperacao judicial|queda (no|do|de) (lucro|receita|faturamento)|lucro cai|receita cai|rombo|deficit|inadimpl|rebaix|direcao fiscal|liquidacao)/],
  ["fusao", /\b(fusao|aquisicao|adquire|compra (a|o|da|do) |incorpora|vendid[ao] para|venda (da|do) controle|joint venture)/],
  ["troca_diretoria", /\b(novo (ceo|presidente|diretor|cio|cto)|nova (ceo|presidente|diretora)|deixa o cargo|deixa a presidencia|renuncia|assume (a presidencia|o cargo|o comando|como ceo)|troca (no|de) comando)/],
  ["congelamento", /\b(congela|suspende (as )?contratac|pausa (nas |as )?contratac|adia (projetos|investimentos)|corta investimentos|revisa investimentos)/],
  ["expansao", /\b(expans|inaugura|amplia|contrat(a|ara|ando)\b|investe|investimento de|novas vagas|abre (\d+ )?vagas|cresce|lucro (sobe|recorde|cresce))/],
];

export function classificarPorRegra(titulo: string): { tipo: Tipo; gravidade: number } {
  const texto = tokensDoTexto(titulo).join(" ");
  const tipo = PALAVRAS.find(([, re]) => re.test(texto))?.[0] ?? "irrelevante";
  return { tipo, gravidade: GRAVIDADE_POR_TIPO[tipo] };
}

/** Busca do Google Notícias em português, últimos 30 dias, pelo termo exato. */
export function urlBusca(termo: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`"${termo}" when:30d`)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
}

// ——— Classificação com IA ———

export interface Classificacao { tipo: Tipo; gravidade: number; resumo: string; origem: "ia" | "regra" }

const MAX_RESUMO = 160;
const ESQUEMA = {
  type: "object", additionalProperties: false, required: ["itens"],
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["indice", "tipo", "gravidade", "resumo"],
        properties: { indice: { type: "integer" }, tipo: { type: "string", enum: [...TIPOS_SINAL] }, gravidade: { type: "integer" }, resumo: { type: "string" } },
      },
    },
  },
};
const PROMPT = `Você ajuda uma consultoria de TI a perceber cedo quando um cliente pode cortar contratos.
Para cada manchete (pelo "indice"), diga:
- "tipo": corte (demissões, redução de quadro ou de custos com pessoal), resultado_ruim (prejuízo, queda de receita, recuperação judicial, intervenção), fusao (fusão, aquisição, venda), troca_diretoria (novo CEO, presidente ou diretor), congelamento (congela ou suspende contratações, adia projetos), expansao (cresce, contrata, investe, inaugura) ou irrelevante.
- "gravidade": 0 a 3, o quanto isso ameaça contratos de terceiros de TI (irrelevante = 0).
- "resumo": até ${MAX_RESUMO} caracteres, em português do Brasil, só com o que está na manchete.
Desmentidos ("nega demissões") são irrelevante.`;

function porRegra(m: Manchete): Classificacao {
  return { ...classificarPorRegra(m.titulo), resumo: m.titulo.slice(0, MAX_RESUMO), origem: "regra" };
}

/** Uma chamada para todas as manchetes; item inválido ou falha da IA vira regra. Mantém a ordem. Só as manchetes vão para a IA. */
export async function classificarManchetes(manchetes: Manchete[], deps: { ia: ClienteIa; modelo: string }): Promise<Classificacao[]> {
  if (manchetes.length === 0) return [];
  let itens: any[] = [];
  try {
    const r = await deps.ia.messages.create({
      model: deps.modelo,
      max_tokens: 2000,
      system: PROMPT,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      messages: [{ role: "user", content: JSON.stringify(manchetes.map((m, indice) => ({ indice, manchete: m.titulo }))) }],
    });
    if (r?.stop_reason !== "refusal") {
      const lidos = JSON.parse((r?.content ?? []).find((b: any) => b.type === "text")?.text).itens;
      if (Array.isArray(lidos)) itens = lidos;
    }
  } catch {
    itens = [];
  }
  return manchetes.map((m, i) => {
    const x = itens.find((it) => it?.indice === i);
    const valido = x && (TIPOS_SINAL as readonly string[]).includes(x.tipo) && Number.isInteger(x.gravidade) && x.gravidade >= 0 && x.gravidade <= 3
      && typeof x.resumo === "string" && x.resumo.trim().length > 0 && x.resumo.length <= MAX_RESUMO;
    return valido ? { tipo: x.tipo, gravidade: x.gravidade, resumo: x.resumo.trim(), origem: "ia" } : porRegra(m);
  });
}

// ——— Busca por empresa ———

export interface NovoSinal {
  clienteId: string; titulo: string; url: string; fonte: string; publicadoEm: string; tipo: Tipo; gravidade: number; resumo: string; origem: "ia" | "regra";
}
export interface DependenciasSinais {
  ia: ClienteIa; modelo: string; hoje: string;
  buscarRss(url: string): Promise<string>;
  clientes(empresaId: string): Promise<{ id: string; nome: string; termoBusca: string | null }[]>;
  /** Notícias já salvas da empresa publicadas desde `desde` (a busca cobre 30 dias; olhar 35 basta). */
  salvasRecentes(empresaId: string, desde: string): Promise<{ url: string; titulo: string }[]>;
  gravar(empresaId: string, sinais: NovoSinal[]): Promise<void>;
}

const POR_CLIENTE = 10;
const PARALELOS = 4;
const JANELA_DEDUP = 35;

const diasAntes = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
/** O Google repete a mesma matéria por vários veículos, com links diferentes: o título normalizado identifica o fato. */
const chaveTitulo = (t: string) => tokensDoTexto(t).join(" ");

async function emParalelo<T>(itens: T[], limite: number, fn: (x: T) => Promise<void>): Promise<void> {
  let proximo = 0;
  const trabalhador = async () => { while (proximo < itens.length) await fn(itens[proximo++]); };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
}

/** Busca, classifica e grava as notícias novas de cada cliente da empresa. Grava por cliente: um erro não perde o resto. */
export async function buscarSinais(empresaId: string, deps: DependenciasSinais): Promise<{ novos: number }> {
  const salvas = await deps.salvasRecentes(empresaId, diasAntes(deps.hoje, JANELA_DEDUP));
  const urls = new Set(salvas.map((s) => s.url));
  const titulos = new Set(salvas.map((s) => chaveTitulo(s.titulo)));
  let novos = 0;

  await emParalelo(await deps.clientes(empresaId), PARALELOS, async (c) => {
    let xml: string;
    try {
      xml = await deps.buscarRss(urlBusca(c.termoBusca?.trim() || c.nome));
    } catch {
      return;
    }
    const manchetes: Manchete[] = [];
    for (const m of lerRss(xml)) {
      if (manchetes.length >= POR_CLIENTE) break;
      const chave = chaveTitulo(m.titulo);
      if (urls.has(m.url) || titulos.has(chave)) continue;
      urls.add(m.url);
      titulos.add(chave);
      manchetes.push(m);
    }
    if (manchetes.length === 0) return;
    const classes = await classificarManchetes(manchetes, deps);
    const sinais = manchetes.map((m, i) => ({
      clienteId: c.id, titulo: m.titulo, url: m.url, fonte: m.fonte, publicadoEm: m.publicadoEm ?? deps.hoje, ...classes[i],
    }));
    try {
      await deps.gravar(empresaId, sinais);
      novos += sinais.length;
    } catch {
      // Fica para a próxima busca: o link não foi salvo, então volta como novo.
    }
  });
  return { novos };
}

/**
 * Logado: busca para a própria empresa. Agendamento (chave certa): busca para a empresa pedida no corpo,
 * uma chamada por empresa (o pg_cron dispara uma por empresa, para nenhuma estourar o tempo da função). Senão, 403.
 */
export async function atenderSinais(
  a: { empresaDoUsuario: string | null; chaveRecebida: string | null; chaveEsperada: string | null; empresaPedida: string | null },
  deps: DependenciasSinais,
): Promise<Resposta> {
  if (a.empresaDoUsuario) return { status: 200, corpo: await buscarSinais(a.empresaDoUsuario, deps) };
  const agendado = Boolean(a.chaveEsperada) && a.chaveRecebida === a.chaveEsperada;
  if (!agendado) return { status: 403, corpo: { erro: "acesso" } };
  if (!a.empresaPedida) return { status: 422, corpo: { erro: "pedido" } };
  return { status: 200, corpo: await buscarSinais(a.empresaPedida, deps) };
}
