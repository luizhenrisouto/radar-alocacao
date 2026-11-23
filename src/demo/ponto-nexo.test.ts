import { expect, test } from "vitest";
import { planejarCobrancas } from "../../supabase/functions/_shared/ponto.ts";
import { gerarNexo } from "./nexo";
import { pontoNexo } from "./ponto-nexo";

const HOJE = "2026-11-24";
const p = pontoNexo(HOJE);
const matricula = (id: string) => String(1000 + Number(id.slice(1)));
const abertas = p.pendencias.filter((x) => x.resolvidaEm == null);

test("a Nexo tem 5 pessoas com 6 pendências abertas", () => {
  expect(abertas).toHaveLength(6);
  expect(new Set(abertas.map((x) => x.matricula))).toEqual(new Set(["c02", "c05", "c09", "c12", "c14"].map(matricula)));
});

test("uma pessoa já foi escalada ao gestor e duas acertaram", () => {
  const escaladas = p.pendencias.filter((x) => x.escalada);
  expect(escaladas.map((x) => x.matricula)).toEqual([matricula("c14")]);
  expect(escaladas[0].cobrancas).toBe(3);
  expect(p.pendencias.filter((x) => x.resolvidaEm != null)).toHaveLength(2);
});

test("férias não geram pendência, cooperado não bate ponto e uma pessoa não tem gestor", () => {
  expect(p.pendencias.some((x) => x.matricula === matricula("c31"))).toBe(false);
  expect(p.dias.filter((d) => d.matricula === matricula("c31")).every((d) => d.situacao === "Férias")).toBe(true);
  const nexo = gerarNexo(HOJE);
  const cooperados = nexo.consultores.filter((c) => c.regime !== "CLT").map((c) => matricula(c.id));
  expect(p.colaboradores.some((c) => cooperados.includes(c.matricula))).toBe(false);
  expect(p.colaboradores.find((c) => c.matricula === matricula("c40"))!.emailGestor).toBeNull();
});

test("hoje a cobrança pega as 5 pessoas e nenhum gestor novo", () => {
  const { cobrancas } = planejarCobrancas(p, HOJE);
  expect(cobrancas.filter((c) => c.nivel === "pessoa")).toHaveLength(5);
  expect(cobrancas.filter((c) => c.nivel === "gestor")).toHaveLength(0);
});

test("o histórico de envios é coerente com as cobranças", () => {
  const envios = p.envios.filter((e) => e.matricula === matricula("c14"));
  expect(envios).toHaveLength(3);
  expect(p.envios.filter((e) => e.nivel === "gestor")).toHaveLength(1);
  expect(p.envios.every((e) => e.ok && !e.simulado)).toBe(true);
});
