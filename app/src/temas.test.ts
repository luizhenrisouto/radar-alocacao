import { describe, expect, test } from "vitest";
import { TEMAS, contraste, cssDoTema, escolherTema, type Cores } from "./temas";

const CHAVES: (keyof Cores)[] = [
  "fundo", "superficie", "tinta", "tinta-suave", "linha", "marca", "marca-clara", "sobre-marca",
  "alerta", "alerta-fundo", "critico", "bom", "barra",
];

describe("escolherTema", () => {
  test("vazio ou desconhecido cai na Datum", () => {
    expect(escolherTema(undefined).id).toBe("datum");
    expect(escolherTema("").id).toBe("datum");
    expect(escolherTema("nada").id).toBe("datum");
  });

  test("ignora espaços e maiúsculas", () => {
    expect(escolherTema(" Radar ").id).toBe("radar");
    expect(escolherTema("DATUM").id).toBe("datum");
  });
});

describe("cssDoTema", () => {
  test("gera as cores da Datum nos modos claro e escuro, com Rockwell nos títulos", () => {
    const css = cssDoTema(TEMAS.datum);
    const escuro = css.indexOf("@media (prefers-color-scheme: dark)");
    expect(css).toContain("--marca: #633ca1;");
    expect(escuro).toBeGreaterThan(0);
    expect(css.indexOf("--marca: #b59cf0;")).toBeGreaterThan(escuro);
    expect(css).toContain('--fonte-titulos: "Rockwell"');
  });

  test.each(Object.keys(TEMAS))("tema %s define todas as cores nos dois modos", (id) => {
    const css = cssDoTema(TEMAS[id]);
    for (const chave of CHAVES) expect(css.split(`--${chave}:`).length - 1, chave).toBe(2);
  });
});

test("o tema radar reproduz as cores de antes", () => {
  expect(TEMAS.radar.claro).toEqual({
    fundo: "#f3f0e8", superficie: "#fffdf8", tinta: "#15211f", "tinta-suave": "#5b6663", linha: "#ddd6c8",
    marca: "#123f3a", "marca-clara": "#d6e6e2", "sobre-marca": "#f3f0e8", alerta: "#c9781a", "alerta-fundo": "#fbecd5",
    critico: "#b4442c", bom: "#2f7d5b", barra: "#9fbdb6",
  });
  expect(TEMAS.radar.escuro).toEqual({
    fundo: "#101716", superficie: "#17211f", tinta: "#e9ede9", "tinta-suave": "#9aa8a4", linha: "#2a3835",
    marca: "#7fc4b6", "marca-clara": "#1d3330", "sobre-marca": "#101716", alerta: "#f0b25a", "alerta-fundo": "#3a2b14",
    critico: "#ef8a72", bom: "#7fcfa6", barra: "#3f6b63",
  });
});

test("o tema da Datum não tem logo (site público só com as cores)", () => {
  expect(TEMAS.datum.logo).toBeUndefined();
});

test("contraste segue a fórmula da WCAG", () => {
  expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 0);
  expect(contraste("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
});

describe.each(Object.keys(TEMAS))("tema %s é legível", (id) => {
  test.each(["claro", "escuro"] as const)("modo %s", (modo) => {
    const c = TEMAS[id][modo];
    expect(contraste(c.tinta, c.fundo), "tinta/fundo").toBeGreaterThanOrEqual(4.5);
    expect(contraste(c.tinta, c.superficie), "tinta/superficie").toBeGreaterThanOrEqual(4.5);
    expect(contraste(c["sobre-marca"], c.marca), "sobre-marca/marca").toBeGreaterThanOrEqual(4.5);
    // Cores que também aparecem como texto (selos, valores e links).
    for (const cor of ["bom", "marca", "critico"] as const) {
      expect(contraste(c[cor], c.superficie), `${cor}/superficie`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
