import { describe, expect, test, vi } from "vitest";
import type { ClienteIa } from "./explicar.ts";
import { atenderMercado } from "./mercado.ts";

const TEXTO = "Buscamos QA Sênior na Clínica Alfa\nPlaywright, TypeScript e REST Assured. Desejável k6. Remoto.";

function iaQueResponde(obj: unknown): ClienteIa {
  return { messages: { create: vi.fn(async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(obj) }] })) } };
}
const deps = (ia: ClienteIa, empresaDoUsuario: string | null = "e1") => ({ empresaDoUsuario, ia, modelo: "m" });

const vagaBoa = {
  empresa: "Clínica Alfa", titulo: "QA Sênior", senioridade: "senior", skills_obrigatorias: ["Playwright", "TypeScript", "REST Assured"],
  skills_desejaveis: ["k6"], cidade: "", remoto: true,
};
const consultor = { cargo: "QA Sênior", senioridade: "senior", skills: ["Playwright", "TypeScript"], setores: ["Saúde"], cidade: "Porto Alegre", aceitaRemoto: true };
const email = {
  tarefa: "email", empresa: "Clínica Alfa", remetente: "Nexo Consultoria",
  vagas: [{ titulo: "QA Sênior", skills: ["Playwright"] }], perfis: [{ titulo: "QA Sênior", resumo: "QA com Playwright.", skills: ["Playwright"] }],
};

describe("atenderMercado", () => {
  test("sem empresa responde 403 e não chama a IA", async () => {
    const ia = iaQueResponde(vagaBoa);
    expect(await atenderMercado({ tarefa: "extrair_vaga", texto: TEXTO }, deps(ia, null))).toEqual({ status: 403, corpo: { erro: "acesso" } });
    expect(ia.messages.create).not.toHaveBeenCalled();
  });

  test("texto vazio ou acima de 20.000 caracteres responde 422", async () => {
    const ia = iaQueResponde(vagaBoa);
    expect((await atenderMercado({ tarefa: "extrair_vaga", texto: "   " }, deps(ia))).status).toBe(422);
    expect((await atenderMercado({ tarefa: "extrair_vaga", texto: "a".repeat(20001) }, deps(ia))).status).toBe(422);
    expect((await atenderMercado({ tarefa: "outra" }, deps(ia))).status).toBe(422);
    expect((await atenderMercado(null, deps(ia))).status).toBe(422);
  });

  test("extrair_vaga devolve a vaga validada", async () => {
    const r = await atenderMercado({ tarefa: "extrair_vaga", texto: TEXTO }, deps(iaQueResponde(vagaBoa)));
    expect(r).toEqual({
      status: 200,
      corpo: { resultado: {
        empresaAlvo: "Clínica Alfa", titulo: "QA Sênior", senioridade: "senior", skillsObrigatorias: ["Playwright", "TypeScript", "REST Assured"],
        skillsDesejaveis: ["k6"], cidade: null, remoto: true,
      } },
    });
  });

  test("extrair_vaga recusa skill que não está no texto colado", async () => {
    const r = await atenderMercado({ tarefa: "extrair_vaga", texto: TEXTO }, deps(iaQueResponde({ ...vagaBoa, skills_obrigatorias: ["Playwright", "Kafka"] })));
    expect(r).toEqual({ status: 200, corpo: { resultado: null } });
  });

  test("extrair_vaga recusa senioridade fora da lista e título vazio", async () => {
    for (const ruim of [{ ...vagaBoa, senioridade: "master" }, { ...vagaBoa, titulo: "" }, { ...vagaBoa, skills_obrigatorias: Array(13).fill("Playwright") }]) {
      expect(await atenderMercado({ tarefa: "extrair_vaga", texto: TEXTO }, deps(iaQueResponde(ruim)))).toEqual({ status: 200, corpo: { resultado: null } });
    }
  });

  test("perfil devolve título, resumo e destaques validados", async () => {
    const ia = iaQueResponde({ titulo: "QA Sênior", resumo: "Automação com Playwright e TypeScript na saúde.", destaques: ["Playwright"], skills_citadas: ["Playwright", "TypeScript"] });
    expect(await atenderMercado({ tarefa: "perfil", consultor }, deps(ia))).toEqual({
      status: 200, corpo: { resultado: { titulo: "QA Sênior", resumo: "Automação com Playwright e TypeScript na saúde.", destaques: ["Playwright"] } },
    });
  });

  test("perfil recusa skill fora do cadastro e resumo acima de 400 caracteres", async () => {
    const base = { titulo: "QA Sênior", resumo: "Ok.", destaques: [], skills_citadas: ["Playwright"] };
    for (const ruim of [{ ...base, skills_citadas: ["Kafka"] }, { ...base, resumo: "x".repeat(401) }, { ...base, destaques: ["a", "b", "c", "d"] }]) {
      expect(await atenderMercado({ tarefa: "perfil", consultor }, deps(iaQueResponde(ruim)))).toEqual({ status: 200, corpo: { resultado: null } });
    }
  });

  test("email devolve assunto e corpo, e recusa corpo acima de 900 caracteres", async () => {
    const bom = { assunto: "Profissionais para a Clínica Alfa", corpo: "Olá! Temos QA com Playwright.", skills_citadas: ["Playwright"] };
    expect(await atenderMercado(email, deps(iaQueResponde(bom)))).toEqual({
      status: 200, corpo: { resultado: { assunto: bom.assunto, corpo: bom.corpo } },
    });
    expect(await atenderMercado(email, deps(iaQueResponde({ ...bom, corpo: "x".repeat(901) })))).toEqual({ status: 200, corpo: { resultado: null } });
  });

  test("IA fora do ar ou recusa devolve resultado null", async () => {
    const fora: ClienteIa = { messages: { create: async () => { throw new Error("fora"); } } };
    const recusa: ClienteIa = { messages: { create: async () => ({ stop_reason: "refusal", content: [] }) } };
    for (const ia of [fora, recusa]) {
      expect(await atenderMercado({ tarefa: "extrair_vaga", texto: TEXTO }, deps(ia))).toEqual({ status: 200, corpo: { resultado: null } });
    }
  });

  test("a IA recebe o texto colado e só o perfil anônimo do consultor", async () => {
    const ia = iaQueResponde({ titulo: "QA", resumo: "Ok.", destaques: [], skills_citadas: [] });
    await atenderMercado({ tarefa: "perfil", consultor: { ...consultor, nome: "Ana Ribeiro", email: "ana@x.com" } }, deps(ia));
    const enviado = JSON.stringify((ia.messages.create as any).mock.calls[0][0].messages);
    expect(enviado).not.toContain("Ana Ribeiro");
    expect(enviado).not.toContain("ana@x.com");
  });
});
