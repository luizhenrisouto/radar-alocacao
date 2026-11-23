import { expect, test } from "vitest";
import { mapearColunas, type TipoImportacao } from "../src/importacao/colunas";
import { converterLinhas } from "../src/importacao/converter";
import { lerArquivo } from "../src/importacao/ler";
import { gerarNexo } from "../src/demo/nexo";
import { pontoNexo } from "../src/demo/ponto-nexo";
import { planilhasNexo } from "./exportar-nexo";

const HOJE = "2026-11-24";

test("a planilha da Nexo passa pela importação sem erros", async () => {
  const planilhas = planilhasNexo(HOJE);
  const emails = new Set(gerarNexo(HOJE).consultores.map((c) => c.email));
  const contagens: Record<string, number> = {};
  for (const tipo of ["consultores", "alocacoes", "vagas", "ponto_colaboradores", "ponto_marcacoes"] as TipoImportacao[]) {
    const grade = await lerArquivo(new File([planilhas[tipo]], `nexo-${tipo}.csv`));
    const mapa = mapearColunas(tipo, grade[0]);
    const r = converterLinhas(tipo, grade.slice(1), mapa, { emailsConhecidos: emails });
    expect(r.erros, tipo).toEqual([]);
    contagens[tipo] = r.validas.length;
  }
  const ponto = pontoNexo(HOJE);
  expect(contagens).toEqual({
    consultores: 40, alocacoes: 39, vagas: 10, ponto_colaboradores: ponto.colaboradores.length, ponto_marcacoes: ponto.dias.length,
  });
});

test("as marcações exportadas mantêm horários e situação", async () => {
  const grade = await lerArquivo(new File([planilhasNexo(HOJE).ponto_marcacoes], "m.csv"));
  const r = converterLinhas("ponto_marcacoes", grade.slice(1), mapearColunas("ponto_marcacoes", grade[0]), { emailsConhecidos: new Set() });
  const ponto = pontoNexo(HOJE);
  expect(r.validas.map(({ linha, ...resto }) => resto)).toEqual(ponto.dias);
});

test("a planilha exportada mantém skills, datas e valores da Nexo", async () => {
  const grade = await lerArquivo(new File([planilhasNexo(HOJE).consultores], "c.csv"));
  const r = converterLinhas("consultores", grade.slice(1), mapearColunas("consultores", grade[0]), { emailsConhecidos: new Set() });
  const ana = r.validas.find((x) => x.nome === "Ana Ribeiro");
  const original = gerarNexo(HOJE).consultores.find((c) => c.id === "c01")!;
  expect(ana).toMatchObject({ email: original.email, senioridade: "senior", skills: original.skills, custoMensal: 14500, admitidoEm: original.admitidoEm });
});
