import { describe, expect, test } from "vitest";
import { explicacaoPorRegra as regraApp, normalizarSkill as normalizarApp } from "../../../src/regras/matching";
import { consultor, vaga } from "../../../src/regras/testes/fabrica";
import { explicarMatches, explicarParaEmpresa, type ClienteIa, type EntradaExplicar } from "./explicar";
import { explicacaoPorRegra, normalizarSkill } from "./matching";

const HOJE = "2026-11-24";
const V = vaga("v1", { titulo: "QA Sênior", senioridade: "senior", skillsObrigatorias: ["Playwright", "TypeScript", "Kafka"], skillsDesejaveis: ["JMeter"] });
const CANDS = ["c1", "c2", "c3", "c4", "c5"].map((id, i) => ({
  consultor: consultor(id, { nome: `Pessoa ${i + 1}`, skills: ["Playwright", "TypeScript"] }),
  nota: 80 - i, cobertas: ["Playwright", "TypeScript"], faltando: ["Kafka"], disponivelEm: HOJE,
}));
const ENTRADA: EntradaExplicar = { vaga: V, candidatos: CANDS, hoje: HOJE };

function iaQueResponde(itens: { consultor_id: string; explicacao: string; skills_citadas: string[] }[]): ClienteIa {
  return { messages: { create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ candidatos: itens }) }] }) } };
}
const boa = (id: string) => ({ consultor_id: id, explicacao: `Domina Playwright e TypeScript; falta Kafka (${id}).`, skills_citadas: ["Playwright", "TypeScript", "Kafka"] });

describe("explicarMatches", () => {
  test("resposta válida: 5 explicações da IA, na ordem da entrada", async () => {
    const r = await explicarMatches(ENTRADA, { ia: iaQueResponde(CANDS.map((c) => boa(c.consultor.id))), modelo: "m" });
    expect(r.map((x) => x.consultorId)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    expect(r.every((x) => x.origem === "ia")).toBe(true);
  });

  test("IA que devolve em outra ordem não muda a ordem", async () => {
    const r = await explicarMatches(ENTRADA, { ia: iaQueResponde(CANDS.map((c) => boa(c.consultor.id)).reverse()), modelo: "m" });
    expect(r.map((x) => x.consultorId)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    expect(r[0].explicacao).toContain("(c1)");
  });

  test("explicação que cita skill fora do cadastro cai para a regra", async () => {
    const itens = CANDS.map((c) => boa(c.consultor.id));
    itens[1] = { ...itens[1], explicacao: "Ótimo em Rust.", skills_citadas: ["Rust"] };
    const r = await explicarMatches(ENTRADA, { ia: iaQueResponde(itens), modelo: "m" });
    expect(r[1]).toEqual({ consultorId: "c2", origem: "regra", explicacao: explicacaoPorRegra(CANDS[1], V, HOJE) });
    expect(r[0].origem).toBe("ia");
  });

  test("explicação com mais de 140 caracteres cai para a regra", async () => {
    const itens = CANDS.map((c) => boa(c.consultor.id));
    itens[0] = { ...itens[0], explicacao: "x".repeat(200) };
    expect((await explicarMatches(ENTRADA, { ia: iaQueResponde(itens), modelo: "m" }))[0].origem).toBe("regra");
  });

  test("candidato que a IA esqueceu cai para a regra", async () => {
    const r = await explicarMatches(ENTRADA, { ia: iaQueResponde(CANDS.slice(1).map((c) => boa(c.consultor.id))), modelo: "m" });
    expect(r[0].origem).toBe("regra");
    expect(r).toHaveLength(5);
  });

  test("IA fora do ar: tudo pela regra", async () => {
    const ia: ClienteIa = { messages: { create: async () => { throw new Error("503"); } } };
    const r = await explicarMatches(ENTRADA, { ia, modelo: "m" });
    expect(r.every((x) => x.origem === "regra")).toBe(true);
  });
});

describe("explicarParaEmpresa (a função HTTP)", () => {
  const pedido = { vagaId: "v1", hoje: HOJE, candidatos: CANDS.map((c) => ({ consultorId: c.consultor.id, nota: c.nota, cobertas: c.cobertas, faltando: c.faltando, disponivelEm: c.disponivelEm })) };
  const carregar = async () => ({ empresaId: "e1", vaga: V, consultores: CANDS.map((c) => ({ ...c.consultor, empresaId: "e1" })) });

  test("quem não é membro de empresa recebe 403", async () => {
    const r = await explicarParaEmpresa(pedido, { empresaDoUsuario: null, carregar, salvar: async () => {}, ia: iaQueResponde([]), modelo: "m" });
    expect(r.status).toBe(403);
  });

  test("vaga de outra empresa recebe 403", async () => {
    const r = await explicarParaEmpresa(pedido, { empresaDoUsuario: "e2", carregar, salvar: async () => {}, ia: iaQueResponde([]), modelo: "m" });
    expect(r.status).toBe(403);
  });

  test("membro recebe as explicações e elas são salvas", async () => {
    let salvos: unknown[] = [];
    const r = await explicarParaEmpresa(pedido, {
      empresaDoUsuario: "e1", carregar, salvar: async (_v, itens) => { salvos = itens; }, ia: iaQueResponde(CANDS.map((c) => boa(c.consultor.id))), modelo: "m",
    });
    expect(r.status).toBe(200);
    expect((r.corpo as { matches: unknown[] }).matches).toHaveLength(5);
    expect(salvos).toHaveLength(5);
  });
});

describe("cópia das regras para o Deno", () => {
  test("normalizarSkill e explicacaoPorRegra dão o mesmo resultado que as do app", () => {
    for (const s of ["Node.js", "Automação", " Rest-Assured ", "C#"]) expect(normalizarSkill(s)).toBe(normalizarApp(s));
    for (const c of [CANDS[0], { ...CANDS[0], faltando: [], cobertas: V.skillsObrigatorias }, { ...CANDS[0], disponivelEm: "2026-12-05" }]) {
      expect(explicacaoPorRegra(c, V, HOJE)).toBe(regraApp(c, V, HOJE));
    }
  });
});
