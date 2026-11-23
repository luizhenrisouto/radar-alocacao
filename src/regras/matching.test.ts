import { describe, expect, test } from "vitest";
import { explicacaoPorRegra, normalizarSkill, notaMatch, rankearCandidatos } from "./matching";
import { alocacao, consultor, dados, vaga } from "./testes/fabrica";

const HOJE = "2026-11-17";

describe("normalizarSkill", () => {
  test("ignora maiúsculas, espaços, acentos e pontuação", () => {
    expect(normalizarSkill("Java ")).toBe("java");
    expect(normalizarSkill("Node.js")).toBe("nodejs");
    expect(normalizarSkill("NodeJS")).toBe("nodejs");
    expect(normalizarSkill("Automação")).toBe("automacao");
    expect(normalizarSkill("Rest-Assured")).toBe(normalizarSkill("rest assured"));
  });
});

describe("nota", () => {
  const v = vaga("v1", { skillsObrigatorias: ["Java", "Spring", "SQL", "Docker", "Kafka"], senioridade: "pleno" });

  test("4 de 5 obrigatórias, sem desejáveis, mesma senioridade = 86", () => {
    const c = consultor("c1", { skills: ["java", "Spring", "SQL ", "docker", "Git"] });
    expect(notaMatch(c, v)).toEqual({ nota: 86, cobertas: ["Java", "Spring", "SQL", "Docker"], faltando: ["Kafka"] });
  });

  test("senioridade a um nível vale 5; a dois níveis vale 0", () => {
    const skills = ["Java", "Spring", "SQL", "Docker", "Kafka"];
    expect(notaMatch(consultor("c1", { skills, senioridade: "senior" }), v)!.nota).toBe(95);
    expect(notaMatch(consultor("c1", { skills, senioridade: "especialista" }), v)!.nota).toBe(90);
  });

  test("desejáveis valem 20 proporcionais", () => {
    const v2 = vaga("v2", { skillsObrigatorias: ["Java"], skillsDesejaveis: ["Kafka", "AWS"] });
    expect(notaMatch(consultor("c1", { skills: ["Java", "AWS"] }), v2)!.nota).toBe(90);
  });

  test("sem nenhuma obrigatória coberta, fica de fora", () => {
    expect(notaMatch(consultor("c1", { skills: ["Python"] }), v)).toBeNull();
  });
});

describe("ranking", () => {
  const v = vaga("v1", { skillsObrigatorias: ["Java"], inicioPrevisto: "2026-12-01" });

  test("vaga que ninguém cobre devolve lista vazia", () => {
    expect(rankearCandidatos(dados({ consultores: [consultor("c1", { skills: ["Python"] })], vagas: [v] }), "v1", HOJE)).toEqual([]);
  });

  test("quem só fica livre depois do início previsto fica de fora", () => {
    const d = dados({
      consultores: [consultor("c1", { skills: ["Java"] })],
      alocacoes: [alocacao("a1", "c1", "cli9", "2026-01-01", "2026-12-15")],
      vagas: [v],
    });
    expect(rankearCandidatos(d, "v1", HOJE)).toEqual([]);
  });

  test("devolve no máximo 5, por nota, depois disponibilidade, depois nome", () => {
    const cs = [
      consultor("c1", { nome: "Bruna", skills: ["Java"] }),
      consultor("c2", { nome: "Ana", skills: ["Java"] }),
      consultor("c3", { nome: "Carlos", skills: ["Java"] }),
      consultor("c4", { nome: "Dora", skills: ["Java"], senioridade: "senior" }),
      consultor("c5", { nome: "Edu", skills: ["Java"] }),
      consultor("c6", { nome: "Fábio", skills: ["Python"] }),
    ];
    const als = [alocacao("a3", "c3", "cli9", "2026-01-01", "2026-11-20")];
    const r = rankearCandidatos(dados({ consultores: cs, alocacoes: als, vagas: [v] }), "v1", HOJE);
    expect(r.map((x) => x.consultor.nome)).toEqual(["Ana", "Bruna", "Edu", "Carlos", "Dora"]);
    expect(r.map((x) => x.nota)).toEqual([100, 100, 100, 100, 95]);
    expect(rankearCandidatos(dados({ consultores: cs, alocacoes: als, vagas: [v] }), "v1", HOJE, 3)).toHaveLength(3);
    expect(r[3].disponivelEm).toBe("2026-11-21");
    expect(r[0].disponivelEm).toBe(HOJE);
  });
});

describe("explicação da regra", () => {
  const v = vaga("v1", { skillsObrigatorias: ["Java", "Spring", "SQL", "Docker", "Kafka"] });
  const base = { consultor: consultor("c1"), nota: 86, cobertas: ["Java", "Spring", "SQL", "Docker"], faltando: ["Kafka"], disponivelEm: HOJE };

  test("diz o que cobre, o que falta e quando está disponível", () => {
    expect(explicacaoPorRegra(base, v, HOJE)).toBe("Cobre 4 de 5 skills obrigatórias; falta Kafka. Disponível agora.");
  });

  test("quando cobre tudo", () => {
    expect(explicacaoPorRegra({ ...base, cobertas: v.skillsObrigatorias, faltando: [] }, v, HOJE)).toBe("Cobre todas as skills obrigatórias. Disponível agora.");
  });

  test("quando ainda está alocado", () => {
    expect(explicacaoPorRegra({ ...base, faltando: ["Kafka", "SQL"], disponivelEm: "2026-12-05" }, v, HOJE))
      .toBe("Cobre 4 de 5 skills obrigatórias; falta Kafka, SQL. Disponível a partir de 05/12/2026.");
  });
});
