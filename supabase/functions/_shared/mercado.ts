/**
 * IA do "vender o bench": extrai a vaga colada, escreve o perfil anônimo e o rascunho de e-mail.
 * Não grava nada. Devolve o resultado validado ou { resultado: null }, e aí o app usa a regra.
 * A checagem de anonimato (nome, e-mail, clientes) fica no app, que é quem conhece os nomes: eles não vêm para cá.
 */
import type { ClienteIa, Resposta } from "./explicar.ts";
import { normalizarSkill } from "./matching.ts";
import { skillNoTexto, tokensDoTexto } from "./texto.ts";

export type PedidoMercado =
  | { tarefa: "extrair_vaga"; texto: string }
  | { tarefa: "perfil"; consultor: { cargo: string; senioridade: string; skills: string[]; setores: string[]; cidade: string | null; aceitaRemoto: boolean } }
  | { tarefa: "email"; empresa: string; remetente: string; vagas: { titulo: string; skills: string[] }[]; perfis: { titulo: string; resumo: string; skills: string[] }[] };

export interface DependenciasMercado { empresaDoUsuario: string | null; ia: ClienteIa; modelo: string }

const NIVEIS = ["junior", "pleno", "senior", "especialista"];
const MAX_TEXTO = 20000;

const texto = (v: unknown, max: number, min = 1) => typeof v === "string" && v.trim().length >= min && v.length <= max;
const listaDeTextos = (v: unknown, max = Infinity) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string");

async function perguntar(deps: DependenciasMercado, system: string, schema: object, conteudo: unknown): Promise<any | null> {
  try {
    const r = await deps.ia.messages.create({
      model: deps.modelo,
      max_tokens: 2000,
      system,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: JSON.stringify(conteudo) }],
    });
    if (r?.stop_reason === "refusal") return null;
    const t = (r?.content ?? []).find((b: any) => b.type === "text")?.text;
    const obj = JSON.parse(t);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

const SEM_NOMES = "Nunca escreva nomes de pessoas nem nomes de empresas clientes. Escreva em português do Brasil.";

const ESQUEMA_VAGA = {
  type: "object", additionalProperties: false,
  required: ["empresa", "titulo", "senioridade", "skills_obrigatorias", "skills_desejaveis", "cidade", "remoto"],
  properties: {
    empresa: { type: "string" }, titulo: { type: "string" }, senioridade: { type: "string", enum: NIVEIS },
    skills_obrigatorias: { type: "array", items: { type: "string" } }, skills_desejaveis: { type: "array", items: { type: "string" } },
    cidade: { type: "string" }, remoto: { type: "boolean" },
  },
};
const PROMPT_VAGA = `Você lê o texto de uma vaga de TI e extrai os dados para a equipe comercial de uma consultoria.
- "empresa": a empresa que contrata, se o texto disser; senão "".
- "titulo": o cargo, curto (até 120 caracteres).
- "senioridade": junior, pleno, senior ou especialista (sem indicação, pleno).
- "skills_obrigatorias" e "skills_desejaveis": tecnologias e conhecimentos, até 12 em cada, escritos como aparecem no texto. Só o que está no texto.
- "cidade": a cidade, se houver; senão "". "remoto": true se aceita remoto.`;

function validarVaga(o: any, tokens: string[]) {
  const skills = (v: unknown) => listaDeTextos(v, 12) && (v as string[]).every((s) => skillNoTexto(s, tokens));
  const ok = o && texto(o.titulo, 120) && NIVEIS.includes(o.senioridade) && skills(o.skills_obrigatorias) && skills(o.skills_desejaveis)
    && typeof o.empresa === "string" && o.empresa.length <= 120 && typeof o.cidade === "string" && o.cidade.length <= 80 && typeof o.remoto === "boolean";
  if (!ok) return null;
  return {
    empresaAlvo: o.empresa.trim(), titulo: o.titulo.trim(), senioridade: o.senioridade, skillsObrigatorias: o.skills_obrigatorias,
    skillsDesejaveis: o.skills_desejaveis, cidade: o.cidade.trim() || null, remoto: o.remoto,
  };
}

const ESQUEMA_PERFIL = {
  type: "object", additionalProperties: false, required: ["titulo", "resumo", "destaques", "skills_citadas"],
  properties: {
    titulo: { type: "string" }, resumo: { type: "string" }, destaques: { type: "array", items: { type: "string" } },
    skills_citadas: { type: "array", items: { type: "string" } },
  },
};
const PROMPT_PERFIL = `Você escreve o perfil anônimo de um profissional de TI para uma consultoria oferecer a empresas.
- "titulo": cargo e senioridade, até 80 caracteres.
- "resumo": até 400 caracteres, direto, sobre o que a pessoa faz e em que setores já atuou.
- "destaques": até 3 frases de até 100 caracteres.
- Cite apenas skills que estão na lista do profissional e liste-as em "skills_citadas". Não invente experiência, tempo de carreira nem certificações.
${SEM_NOMES}`;

const ESQUEMA_EMAIL = {
  type: "object", additionalProperties: false, required: ["assunto", "corpo", "skills_citadas"],
  properties: { assunto: { type: "string" }, corpo: { type: "string" }, skills_citadas: { type: "array", items: { type: "string" } } },
};
const PROMPT_EMAIL = `Você escreve o rascunho de um e-mail curto de uma consultoria de TI para uma empresa que abriu vagas, oferecendo profissionais.
- "assunto": até 90 caracteres. "corpo": até 900 caracteres, cordial e objetivo, assinado pela consultoria ("remetente").
- Mencione as vagas e os perfis recebidos, sem prometer nada que não está neles. Liste em "skills_citadas" as skills que o texto menciona.
${SEM_NOMES}`;

const dentro = (citadas: unknown, permitidas: string[]) => {
  const ok = new Set(permitidas.map(normalizarSkill));
  return listaDeTextos(citadas) && (citadas as string[]).every((s) => ok.has(normalizarSkill(s)));
};

export async function atenderMercado(p: unknown, deps: DependenciasMercado): Promise<Resposta> {
  if (!deps.empresaDoUsuario) return { status: 403, corpo: { erro: "acesso" } };
  const pedido = p as PedidoMercado | null;
  const invalido: Resposta = { status: 422, corpo: { erro: "pedido" } };

  if (pedido?.tarefa === "extrair_vaga") {
    if (!texto(pedido.texto, MAX_TEXTO)) return invalido;
    const o = await perguntar(deps, PROMPT_VAGA, ESQUEMA_VAGA, { texto: pedido.texto });
    return { status: 200, corpo: { resultado: o ? validarVaga(o, tokensDoTexto(pedido.texto)) : null } };
  }

  if (pedido?.tarefa === "perfil") {
    const c = pedido.consultor;
    if (!c || !listaDeTextos(c.skills) || !listaDeTextos(c.setores) || typeof c.cargo !== "string") return invalido;
    const anonimo = { cargo: c.cargo, senioridade: c.senioridade, skills: c.skills, setores: c.setores, cidade: c.cidade ?? null, aceita_remoto: Boolean(c.aceitaRemoto) };
    const o = await perguntar(deps, PROMPT_PERFIL, ESQUEMA_PERFIL, anonimo);
    const ok = o && texto(o.titulo, 80) && texto(o.resumo, 400) && listaDeTextos(o.destaques, 3) && o.destaques.every((x: string) => texto(x, 100))
      && dentro(o.skills_citadas, c.skills);
    return { status: 200, corpo: { resultado: ok ? { titulo: o.titulo.trim(), resumo: o.resumo.trim(), destaques: o.destaques.map((x: string) => x.trim()) } : null } };
  }

  if (pedido?.tarefa === "email") {
    if (typeof pedido.empresa !== "string" || typeof pedido.remetente !== "string" || !Array.isArray(pedido.vagas) || !Array.isArray(pedido.perfis)) return invalido;
    const vagas = pedido.vagas.map((v) => ({ titulo: String(v?.titulo ?? ""), skills: listaDeTextos(v?.skills) ? v.skills : [] }));
    const perfis = pedido.perfis.map((x) => ({ titulo: String(x?.titulo ?? ""), resumo: String(x?.resumo ?? ""), skills: listaDeTextos(x?.skills) ? x.skills : [] }));
    const o = await perguntar(deps, PROMPT_EMAIL, ESQUEMA_EMAIL, { empresa: pedido.empresa, remetente: pedido.remetente, vagas, perfis });
    const permitidas = [...vagas.flatMap((v) => v.skills), ...perfis.flatMap((x) => x.skills)];
    const ok = o && texto(o.assunto, 90) && texto(o.corpo, 900) && dentro(o.skills_citadas, permitidas);
    return { status: 200, corpo: { resultado: ok ? { assunto: o.assunto.trim(), corpo: o.corpo.trim() } : null } };
  }

  return invalido;
}
