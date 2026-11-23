/** Vender o bench: vagas do mercado, quem encaixa nelas e o material para o comercial (perfil anônimo e e-mail). */
import { skillsNoTexto, tokensDoTexto } from "../../supabase/functions/_shared/texto.ts";
import { estaNoBench } from "./bench";
import { vencimentos } from "./contratos";
import { disponibilidade, normalizarSkill, rankearParaVaga } from "./matching";
import type { Consultor, DadosEmpresa, Senioridade, Vaga, VagaExterna } from "./tipos";

export function comoVaga(e: VagaExterna): Vaga {
  return {
    id: e.id, clienteId: `externa:${e.id}`, titulo: e.titulo, senioridade: e.senioridade, skillsObrigatorias: e.skillsObrigatorias,
    skillsDesejaveis: e.skillsDesejaveis, inicioPrevisto: e.inicioPrevisto, valorHora: null, status: "aberta",
  };
}

/** Todas as skills que a empresa conhece (consultores, vagas e vagas do mercado), na primeira grafia vista. */
export function skillsConhecidas(d: DadosEmpresa): string[] {
  const vistas = new Map<string, string>();
  const todas = [
    ...d.consultores.flatMap((c) => c.skills),
    ...d.vagas.flatMap((v) => [...v.skillsObrigatorias, ...v.skillsDesejaveis]),
    ...d.vagasExternas.flatMap((v) => [...v.skillsObrigatorias, ...v.skillsDesejaveis]),
  ];
  for (const s of todas) {
    const chave = normalizarSkill(s);
    if (chave && !vistas.has(chave)) vistas.set(chave, s.trim());
  }
  return [...vistas.values()];
}

export interface RascunhoVaga {
  empresaAlvo: string; titulo: string; senioridade: Senioridade; skillsObrigatorias: string[]; skillsDesejaveis: string[];
  cidade: string | null; remoto: boolean;
}

const SENIORIDADE_POR_PALAVRA: [Senioridade, string[]][] = [
  ["especialista", ["especialista"]],
  ["senior", ["senior", "sr"]],
  ["pleno", ["pleno"]],
  ["junior", ["junior", "jr"]],
];

/** Sem IA: skills do dicionário que aparecem no texto, senioridade por palavra-chave e a primeira linha como título. */
export function extrairVagaPorRegra(texto: string, conhecidas: string[]): RascunhoVaga {
  const tokens = tokensDoTexto(texto);
  const senioridade = SENIORIDADE_POR_PALAVRA.find(([, palavras]) => palavras.some((p) => tokens.includes(p)))?.[0] ?? "pleno";
  const titulo = (texto.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "").slice(0, 120);
  return {
    empresaAlvo: "", titulo, senioridade, skillsObrigatorias: skillsNoTexto(conhecidas, tokens), skillsDesejaveis: [],
    cidade: null, remoto: /remot|home office/.test(tokens.join(" ")),
  };
}

export interface Lead { empresa: string; vagas: VagaExterna[]; pessoas: Consultor[]; custoMensalParado: number }

const topTres = (d: DadosEmpresa, e: VagaExterna, hoje: string) => rankearParaVaga(d, comoVaga(e), hoje, 3).map((c) => c.consultor);

/** Empresas do mercado com pelo menos uma vaga em que alguém do time aparece no top 3. */
export function leadsDeMercado(d: DadosEmpresa, hoje: string): Lead[] {
  const porEmpresa = new Map<string, Lead>();
  for (const e of d.vagasExternas) {
    const nome = e.empresaAlvo.trim() || "Empresa não informada";
    const chave = nome.toLowerCase();
    const lead = porEmpresa.get(chave) ?? { empresa: nome, vagas: [], pessoas: [], custoMensalParado: 0 };
    lead.vagas.push(e);
    for (const p of topTres(d, e, hoje)) if (!lead.pessoas.some((x) => x.id === p.id)) lead.pessoas.push(p);
    porEmpresa.set(chave, lead);
  }
  return [...porEmpresa.values()]
    .filter((l) => l.pessoas.length > 0)
    .map((l) => ({ ...l, custoMensalParado: l.pessoas.reduce((s, p) => s + p.custoMensal, 0) }))
    .sort((a, b) => b.pessoas.length - a.pessoas.length || b.vagas.length - a.vagas.length || a.empresa.localeCompare(b.empresa, "pt-BR"));
}

export interface EncaixePessoa { consultor: Consultor; disponivelEm: string; vagas: VagaExterna[] }

/** Quem está no bench ou sai em até `horizonte` dias (mais quem vier em `incluir`), com as vagas do mercado em que aparece no top 3. */
export function encaixesPorPessoa(d: DadosEmpresa, hoje: string, horizonte = 60, incluir: string[] = []): EncaixePessoa[] {
  const saindo = new Set(vencimentos(d, hoje).filter((v) => v.diasRestantes <= horizonte).map((v) => v.consultor.id));
  const tops = d.vagasExternas.map((e) => ({ e, ids: topTres(d, e, hoje).map((c) => c.id) }));
  return d.consultores
    .filter((c) => saindo.has(c.id) || incluir.includes(c.id) || estaNoBench(c, d.alocacoes, hoje))
    .map((c) => ({ consultor: c, disponivelEm: disponibilidade(c, d.alocacoes, hoje), vagas: tops.filter((t) => t.ids.includes(c.id)).map((t) => t.e) }))
    .sort((a, b) => a.disponivelEm.localeCompare(b.disponivelEm) || a.consultor.nome.localeCompare(b.consultor.nome, "pt-BR"));
}

/** Setores dos clientes onde a pessoa já trabalhou (o setor, nunca o nome do cliente). */
export function setoresDe(d: DadosEmpresa, consultorId: string): string[] {
  const setores: string[] = [];
  for (const a of d.alocacoes) {
    if (a.consultorId !== consultorId) continue;
    const setor = d.clientes.find((c) => c.id === a.clienteId)?.setor;
    if (setor && !setores.includes(setor)) setores.push(setor);
  }
  return setores;
}

export interface Perfil { titulo: string; resumo: string; destaques: string[]; origem: "ia" | "regra" }

const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs.at(-1)}`);

export function perfilPorRegra(c: Consultor, setores: string[]): Perfil {
  const local = c.cidade ? (c.aceitaRemoto ? `${c.cidade} ou remoto` : c.cidade) : c.aceitaRemoto ? "Remoto" : "Presencial";
  const partes = [`${c.cargo} · ${local}.`];
  if (setores.length) partes.push(`Experiência nos setores de ${lista(setores)}.`);
  if (c.skills.length) partes.push(`Skills: ${c.skills.join(", ")}.`);
  let resumo = partes.join(" ");
  if (resumo.length > 400) resumo = `${resumo.slice(0, 399)}…`;
  return { titulo: c.cargo, resumo, destaques: [], origem: "regra" };
}

export interface RascunhoEmail { assunto: string; corpo: string; origem: "ia" | "regra" }

export function emailPorRegra(lead: Lead, perfis: Perfil[], remetente: string): RascunhoEmail {
  const titulos = lead.vagas.map((v) => v.titulo);
  const vagas = titulos.length === 1 ? `a vaga de ${titulos[0]}` : `as vagas de ${lista(titulos)}`;
  const corpo = [
    `Olá, equipe da ${lead.empresa}.`,
    "",
    `Vimos que vocês estão com ${vagas}. A ${remetente} tem profissionais com esse perfil disponíveis em breve:`,
    "",
    ...perfis.map((p) => `- ${p.titulo}`),
    "",
    "Podemos enviar os perfis completos e conversar sobre a disponibilidade?",
    "",
    "Atenciosamente,",
    remetente,
  ].join("\n");
  return { assunto: `Profissionais para ${lead.empresa}`.slice(0, 90), corpo, origem: "regra" };
}

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** O que um texto anônimo não pode citar: o nome (e cada parte dele), o e-mail e o nome de cada cliente da empresa. */
export function proibidosDe(d: DadosEmpresa, c: Consultor): string[] {
  const partes = tokensDoTexto(c.nome).filter((p) => p.length >= 3 && !PARTICULAS.has(p));
  return [c.nome, ...partes, c.email, ...d.clientes.map((x) => x.nome)];
}

function contemSequencia(tokens: string[], seq: string[]): boolean {
  if (seq.length === 0) return false;
  for (let i = 0; i + seq.length <= tokens.length; i++) if (seq.every((s, j) => tokens[i + j] === s)) return true;
  return false;
}

/** true se nenhum texto cita algo proibido. Compara palavras inteiras, sem acento: "análise" não é "Ana". */
export function anonimo(textos: string[], proibidos: string[]): boolean {
  const junto = textos.join("\n");
  const tokens = tokensDoTexto(junto);
  const minusculo = junto.toLowerCase();
  return !proibidos.some((p) => (p.includes("@") ? minusculo.includes(p.toLowerCase()) : contemSequencia(tokens, tokensDoTexto(p))));
}

/**
 * true se as skills que o texto cita (procuradas no dicionário da empresa) estão todas entre as permitidas.
 * Não confia na lista "skills_citadas" que a própria IA devolve.
 */
export function citaSoSkills(textos: string[], conhecidas: string[], permitidas: string[]): boolean {
  const ok = new Set(permitidas.map(normalizarSkill));
  return skillsNoTexto(conhecidas, tokensDoTexto(textos.join("\n"))).every((s) => ok.has(normalizarSkill(s)));
}
