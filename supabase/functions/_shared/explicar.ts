/**
 * Explica, com o Claude, por que cada candidato encaixa numa vaga. A regra já escolheu e ordenou os candidatos:
 * a IA só escreve uma frase por pessoa. Frase que cita skill fora do cadastro, passa de 140 caracteres ou falta
 * vira a explicação da regra. Os dados das pessoas não vão para log.
 */
import { explicacaoPorRegra, normalizarSkill, type CandidatoBase } from "./matching.ts";

/** O suficiente do SDK da Anthropic (client.messages.create) para injetar um dublê nos testes. */
export type ClienteIa = { messages: { create(params: any): Promise<any> } };

export interface ConsultorIa { id: string; nome: string; cargo: string; senioridade: string; skills: string[] }
export interface VagaIa { id: string; titulo: string; senioridade: string; skillsObrigatorias: string[]; skillsDesejaveis: string[] }
export interface CandidatoIa extends CandidatoBase { consultor: ConsultorIa; nota: number }
export interface EntradaExplicar { vaga: VagaIa; candidatos: CandidatoIa[]; hoje: string }
export interface Explicacao { consultorId: string; explicacao: string; origem: "ia" | "regra" }

export const MODELO_PADRAO = "claude-haiku-5-5";
const MAXIMO = 140;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidatos"],
  properties: {
    candidatos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["consultor_id", "explicacao", "skills_citadas"],
        properties: {
          consultor_id: { type: "string" },
          explicacao: { type: "string" },
          skills_citadas: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const PROMPT = `Você ajuda a equipe de alocação de uma consultoria de TI a decidir quem indicar para uma vaga.
Para cada candidato, escreva UMA frase em português do Brasil, com no máximo ${MAXIMO} caracteres, dizendo por que a pessoa encaixa na vaga ou o que falta.
Regras:
- Cite apenas skills que aparecem nas skills do candidato ou nas skills da vaga. Nunca invente experiência.
- Não repita a nota e não mude a ordem dos candidatos.
- Em "skills_citadas", liste exatamente as skills que a frase menciona.
- Tom direto, como um colega experiente explicando a indicação.`;

function porRegra(e: EntradaExplicar): Explicacao[] {
  return e.candidatos.map((c) => ({ consultorId: c.consultor.id, explicacao: explicacaoPorRegra(c, e.vaga, e.hoje), origem: "regra" }));
}

export async function explicarMatches(e: EntradaExplicar, deps: { ia: ClienteIa; modelo: string }): Promise<Explicacao[]> {
  const pedido = {
    vaga: { titulo: e.vaga.titulo, senioridade: e.vaga.senioridade, obrigatorias: e.vaga.skillsObrigatorias, desejaveis: e.vaga.skillsDesejaveis },
    candidatos: e.candidatos.map((c) => ({
      consultor_id: c.consultor.id, cargo: c.consultor.cargo, senioridade: c.consultor.senioridade, skills: c.consultor.skills,
      cobre: c.cobertas, falta: c.faltando, disponivel_agora: c.disponivelEm <= e.hoje,
    })),
  };
  let itens: { consultor_id: string; explicacao: string; skills_citadas: string[] }[];
  try {
    const resposta = await deps.ia.messages.create({
      model: deps.modelo,
      max_tokens: 1500,
      system: PROMPT,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      messages: [{ role: "user", content: JSON.stringify(pedido) }],
    });
    if (resposta?.stop_reason === "refusal") return porRegra(e);
    const texto = (resposta?.content ?? []).find((b: any) => b.type === "text")?.text;
    itens = JSON.parse(texto).candidatos;
    if (!Array.isArray(itens)) return porRegra(e);
  } catch {
    return porRegra(e);
  }

  const regra = porRegra(e);
  return e.candidatos.map((c, i) => {
    const item = itens.find((x) => x?.consultor_id === c.consultor.id);
    const permitidas = new Set([...c.consultor.skills, ...e.vaga.skillsObrigatorias, ...e.vaga.skillsDesejaveis].map(normalizarSkill));
    const valida = item
      && typeof item.explicacao === "string"
      && item.explicacao.trim().length > 0
      && item.explicacao.length <= MAXIMO
      && Array.isArray(item.skills_citadas)
      && item.skills_citadas.every((s) => permitidas.has(normalizarSkill(String(s))));
    return valida ? { consultorId: c.consultor.id, explicacao: item.explicacao.trim(), origem: "ia" } : regra[i];
  });
}

export interface Resposta { status: number; corpo: unknown }
export interface PedidoExplicar {
  vagaId: string;
  hoje: string;
  candidatos: { consultorId: string; nota: number; cobertas: string[]; faltando: string[]; disponivelEm: string }[];
}
export interface DependenciasExplicar {
  /** A empresa do usuário logado (null se não for membro). */
  empresaDoUsuario: string | null;
  /** Carrega a vaga e os consultores pedidos, com a empresa dona. */
  carregar(vagaId: string, consultorIds: string[]): Promise<{ empresaId: string; vaga: VagaIa; consultores: (ConsultorIa & { empresaId: string })[] } | null>;
  salvar(vagaId: string, itens: { consultorId: string; nota: number; explicacao: string; origem: "ia" | "regra" }[]): Promise<void>;
  ia: ClienteIa;
  modelo: string;
}

/** O corpo da função HTTP: confere a empresa, chama a IA, salva e devolve os matches. */
export async function explicarParaEmpresa(p: PedidoExplicar, deps: DependenciasExplicar): Promise<Resposta> {
  if (!deps.empresaDoUsuario) return { status: 403, corpo: { erro: "acesso" } };
  const lista = Array.isArray(p?.candidatos) ? p.candidatos.slice(0, 5) : [];
  if (!p?.vagaId || lista.length === 0) return { status: 422, corpo: { erro: "pedido" } };
  const dados = await deps.carregar(p.vagaId, lista.map((c) => c.consultorId));
  if (!dados || dados.empresaId !== deps.empresaDoUsuario || dados.consultores.some((c) => c.empresaId !== deps.empresaDoUsuario)) {
    return { status: 403, corpo: { erro: "acesso" } };
  }
  const candidatos: CandidatoIa[] = [];
  for (const c of lista) {
    const consultor = dados.consultores.find((x) => x.id === c.consultorId);
    if (consultor) candidatos.push({ consultor, nota: c.nota, cobertas: c.cobertas ?? [], faltando: c.faltando ?? [], disponivelEm: c.disponivelEm });
  }
  const explicacoes = await explicarMatches({ vaga: dados.vaga, candidatos, hoje: p.hoje }, deps);
  const itens = explicacoes.map((x, i) => ({ ...x, nota: candidatos[i].nota }));
  await deps.salvar(p.vagaId, itens);
  const geradoEm = new Date().toISOString();
  return { status: 200, corpo: { matches: itens.map((x) => ({ vagaId: p.vagaId, consultorId: x.consultorId, nota: x.nota, explicacao: x.explicacao, origem: x.origem, geradoEm })) } };
}
