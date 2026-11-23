import { expect, test } from "vitest";
import { skillNoTexto, skillsNoTexto, tokensDoTexto } from "./texto.ts";

test("tokensDoTexto tira acento, passa para minúsculas e separa por pontuação", () => {
  expect(tokensDoTexto("Sênior em Node.js, C# e PL/SQL")).toEqual(["senior", "em", "node", "js", "c#", "e", "pl", "sql"]);
});

test("skillNoTexto reconhece as grafias e não confunde JavaScript com Java", () => {
  const tokens = tokensDoTexto("Vaga: Type Script, Node.js, C# e .NET; JavaScript é diferencial");
  for (const s of ["TypeScript", "NodeJS", "C#", ".NET", "JavaScript"]) expect(skillNoTexto(s, tokens), s).toBe(true);
  expect(skillNoTexto("Java", tokens)).toBe(false);
  expect(skillNoTexto("Kafka", tokens)).toBe(false);
});

test("skill de várias palavras casa com as palavras seguidas", () => {
  const tokens = tokensDoTexto("Conhecimento em REST Assured e Saúde Suplementar");
  expect(skillNoTexto("Rest Assured", tokens)).toBe(true);
  expect(skillNoTexto("Saúde Suplementar", tokens)).toBe(true);
  expect(skillNoTexto("", tokens)).toBe(false);
});

test("skillsNoTexto: a skill mais longa ocupa as palavras, sem contar a mais curta junto", () => {
  expect(skillsNoTexto(["Rest Assured", "REST", "k6"], tokensDoTexto("REST Assured e k6"))).toEqual(["Rest Assured", "k6"]);
  expect(skillsNoTexto(["Java", "JavaScript"], tokensDoTexto("Java e JavaScript"))).toEqual(["Java", "JavaScript"]);
  expect(skillsNoTexto(["REST", "Rest Assured"], tokensDoTexto("APIs REST com REST Assured"))).toEqual(["REST", "Rest Assured"]);
});
