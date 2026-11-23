import { describe, expect, test } from "vitest";
import { CAMPOS, mapearColunas } from "./colunas";
import { converterLinhas, lerData, lerDinheiro, lerLista } from "./converter";

const CABECALHO = ["Nome", "E-mail", "Cargo", "SENIORIDADE", "Skills", "Regime", "Custo Mensal", "Cidade", "Remoto", "Admissão"];

describe("mapeamento de colunas", () => {
  test("reconhece cabeçalhos com acento, hífen e maiúsculas", () => {
    expect(mapearColunas("consultores", CABECALHO)).toEqual({
      nome: 0, email: 1, cargo: 2, senioridade: 3, skills: 4, regime: 5, custoMensal: 6, salario: null, cidade: 7, aceitaRemoto: 8, admitidoEm: 9,
    });
  });

  test("campo sem coluna fica null", () => {
    expect(mapearColunas("alocacoes", ["E-mail", "Cliente", "Início"])).toMatchObject({ email: 0, cliente: 1, inicio: 2, fim: null, valorHora: null });
  });

  test("os modelos de planilha usam os rótulos dos campos", () => {
    for (const tipo of ["consultores", "alocacoes", "vagas"] as const) {
      const rotulos = CAMPOS[tipo].map((c) => c.rotulo);
      expect(Object.values(mapearColunas(tipo, rotulos)).every((i) => i !== null)).toBe(true);
    }
  });
});

describe("valores no formato brasileiro", () => {
  test("datas", () => {
    expect(lerData("15/03/2026")).toBe("2026-03-15");
    expect(lerData("2026-03-15")).toBe("2026-03-15");
    expect(lerData("5/3/2026")).toBe("2026-03-05");
    expect(lerData("31/02/2026")).toBeNull();
    expect(lerData("amanhã")).toBeNull();
  });

  test("dinheiro", () => {
    expect(lerDinheiro("R$ 12.500,00")).toBe(12500);
    expect(lerDinheiro("150,5")).toBe(150.5);
    expect(lerDinheiro("150.5")).toBe(150.5);
    expect(lerDinheiro("12.500")).toBe(12500);
    expect(lerDinheiro("")).toBeNull();
    expect(lerDinheiro("muito")).toBeNull();
  });

  test("listas separadas por ; ou ,", () => {
    expect(lerLista("Java; Spring, Kafka")).toEqual(["Java", "Spring", "Kafka"]);
    expect(lerLista("")).toEqual([]);
  });
});

describe("conversão das linhas", () => {
  const mapa = mapearColunas("consultores", CABECALHO);
  const linha = ["Ana Souza", "ana@x.com", "QA", "Sênior", "Playwright; TypeScript", "PJ", "R$ 14.000,00", "Porto Alegre", "sim", "10/01/2025"];

  test("converte uma linha válida", () => {
    const r = converterLinhas("consultores", [linha], mapa, { emailsConhecidos: new Set() });
    expect(r.erros).toEqual([]);
    expect(r.validas).toEqual([{
      linha: 2, nome: "Ana Souza", email: "ana@x.com", cargo: "QA", senioridade: "senior", skills: ["Playwright", "TypeScript"],
      regime: "PJ", custoMensal: 14000, salario: null, cidade: "Porto Alegre", aceitaRemoto: true, admitidoEm: "2025-01-10",
    }]);
  });

  test("linha sem e-mail vira erro com o número da linha na planilha", () => {
    const sem = [...linha];
    sem[1] = "";
    const r = converterLinhas("consultores", [linha, sem], mapa, { emailsConhecidos: new Set() });
    expect(r.validas).toHaveLength(1);
    expect(r.erros).toEqual([{ linha: 3, motivo: "e-mail obrigatório" }]);
  });

  test("senioridade desconhecida vira erro", () => {
    const outra = [...linha];
    outra[3] = "Mestre Jedi";
    expect(converterLinhas("consultores", [outra], mapa, { emailsConhecidos: new Set() }).erros).toEqual([{ linha: 2, motivo: "senioridade inválida: Mestre Jedi" }]);
  });

  test("linha toda vazia é ignorada", () => {
    expect(converterLinhas("consultores", [["", "", ""]], mapa, { emailsConhecidos: new Set() })).toEqual({ validas: [], erros: [] });
  });

  test("alocação de e-mail desconhecido vira erro", () => {
    const m = mapearColunas("alocacoes", ["E-mail", "Cliente", "Início", "Fim", "Valor/hora"]);
    const r = converterLinhas("alocacoes", [["X@Y.com", "Banco", "01/01/2026", "", "150"]], m, { emailsConhecidos: new Set(["ana@x.com"]) });
    expect(r.erros).toEqual([{ linha: 2, motivo: "consultor não encontrado: x@y.com" }]);
  });

  test("vaga com skills obrigatórias e início previsto", () => {
    const m = mapearColunas("vagas", ["Título", "Cliente", "Senioridade", "Skills obrigatórias", "Skills desejáveis", "Início previsto", "Valor/hora"]);
    const r = converterLinhas("vagas", [["Dev Java", "Banco", "pleno", "Java, Spring", "", "10/12/2026", "110"]], m, { emailsConhecidos: new Set() });
    expect(r.validas).toEqual([{
      linha: 2, titulo: "Dev Java", cliente: "Banco", senioridade: "pleno", skillsObrigatorias: ["Java", "Spring"], skillsDesejaveis: [],
      inicioPrevisto: "2026-12-10", valorHora: 110,
    }]);
  });
});

describe("regimes e salário", () => {
  const cab = ["Nome", "E-mail", "Senioridade", "Regime"];
  const pessoa = (regime: string) => ["Ana", "ana@x.com", "Sênior", regime];
  const converter = (cabecalho: string[], linhas: string[][]) =>
    converterLinhas("consultores", linhas, mapearColunas("consultores", cabecalho), { emailsConhecidos: new Set() });

  test("regime aceita cooperado em várias grafias", () => {
    const r = converter(cab, [pessoa("Cooperado"), pessoa("COOP"), pessoa("cooperativa"), pessoa("pj"), pessoa("")]);
    expect(r.validas.map((v) => v.regime)).toEqual(["Cooperado", "Cooperado", "Cooperado", "PJ", "CLT"]);
    expect(converter(cab, [pessoa("autônomo")]).erros).toEqual([{ linha: 2, motivo: "regime inválido: autônomo" }]);
  });

  test("planilha com só Salário continua preenchendo o custo mensal", () => {
    const r = converter([...cab, "Salário"], [[...pessoa("CLT"), "R$ 8.000,00"]]);
    expect(r.validas[0]).toMatchObject({ custoMensal: 8000, salario: 8000 });
  });

  test("salário negativo vira erro", () => {
    expect(converter([...cab, "Salário"], [[...pessoa("CLT"), "-8.000"]]).erros).toEqual([{ linha: 2, motivo: "valor inválido em Salário: -8.000" }]);
  });

  test("planilha com Custo mensal e Salário grava os dois", () => {
    const r = converter([...cab, "Custo mensal", "Salário"], [[...pessoa("CLT"), "14.000", "8.000"]]);
    expect(r.validas[0]).toMatchObject({ custoMensal: 14000, salario: 8000 });
  });
});

describe("planilhas do ponto", () => {
  const converter = (tipo: "ponto_colaboradores" | "ponto_marcacoes", cabecalho: string[], linhas: string[][]) =>
    converterLinhas(tipo, linhas, mapearColunas(tipo, cabecalho), { emailsConhecidos: new Set() });

  test("colaboradores com matrícula com zeros à esquerda e gestor opcional", () => {
    const r = converter("ponto_colaboradores", ["Chapa", "Nome", "E-mail", "E-mail do gestor"], [
      ["000000226", "Luiza Prado", "Luiza@X.exemplo", "lider@x.exemplo"],
      ["42", "Caio Reis", "caio@x.exemplo", ""],
    ]);
    expect(r.erros).toEqual([]);
    expect(r.validas).toEqual([
      { linha: 2, matricula: "226", nome: "Luiza Prado", email: "luiza@x.exemplo", emailGestor: "lider@x.exemplo", ativo: true },
      { linha: 3, matricula: "42", nome: "Caio Reis", email: "caio@x.exemplo", emailGestor: null, ativo: true },
    ]);
  });

  test("matrícula com zeros à esquerda é a mesma nas marcações", () => {
    const r = converter("ponto_marcacoes", ["Matrícula", "Dia", "Batidas", "Ocorrência"], [["000000226", "17/11/2026", "", ""]]);
    expect(r.validas).toEqual([{ linha: 2, matricula: "226", data: "2026-11-17", marcacoes: [], situacao: null }]);
  });

  test("marcações em vários formatos", () => {
    const r = converter("ponto_marcacoes", ["Matrícula", "Data", "Marcações", "Situação"], [["7", "2026-11-17", "8:00 12:00;13:00,18:00", "Férias"]]);
    expect(r.validas[0]).toMatchObject({ marcacoes: ["08:00", "12:00", "13:00", "18:00"], situacao: "Férias" });
  });

  test("marcação inválida vira erro", () => {
    const r = converter("ponto_marcacoes", ["Matrícula", "Data", "Marcações"], [["7", "17/11/2026", "08:00 meio-dia"]]);
    expect(r.erros).toEqual([{ linha: 2, motivo: "marcação inválida: meio-dia" }]);
  });

  test("data é obrigatória nas marcações", () => {
    const r = converter("ponto_marcacoes", ["Matrícula", "Data", "Marcações"], [["7", "", "08:00"]]);
    expect(r.erros).toEqual([{ linha: 2, motivo: "data obrigatório" }]);
  });
});

test("coluna Ativo desliga a pessoa do ponto", () => {
  const cab = ["Matrícula", "Nome", "E-mail", "Ativo"];
  const r = converterLinhas("ponto_colaboradores", [["1", "Ana", "a@x.exemplo", "não"], ["2", "Beto", "b@x.exemplo", "desligado"], ["3", "Cida", "c@x.exemplo", ""]],
    mapearColunas("ponto_colaboradores", cab), { emailsConhecidos: new Set() });
  expect(r.erros).toEqual([]);
  expect(r.validas.map((v) => v.ativo)).toEqual([false, false, true]);
});
