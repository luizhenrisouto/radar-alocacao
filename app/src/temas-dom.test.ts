// @vitest-environment jsdom
import { expect, test } from "vitest";
import { TEMAS, aplicarTema } from "./temas";

test("aplicar o tema duas vezes não duplica estilo, fontes nem ícone", () => {
  aplicarTema(TEMAS.datum, document);
  aplicarTema(TEMAS.datum, document);
  expect(document.querySelectorAll("style#tema")).toHaveLength(1);
  expect(document.querySelectorAll("link#tema-fontes")).toHaveLength(1);
  expect(document.querySelectorAll("link#tema-icone")).toHaveLength(1);
  expect(document.getElementById("tema")!.textContent).toContain("--marca: #633ca1");
  expect(document.querySelector<HTMLLinkElement>("link#tema-fontes")!.href).toContain("Quicksand");
  expect(document.querySelector<HTMLLinkElement>("link#tema-icone")!.href).toMatch(/^data:image\/svg\+xml/);
});

test("trocar de tema atualiza as cores e as fontes", () => {
  aplicarTema(TEMAS.datum, document);
  aplicarTema(TEMAS.radar, document);
  expect(document.getElementById("tema")!.textContent).toContain("--marca: #123f3a");
  expect(document.querySelector<HTMLLinkElement>("link#tema-fontes")!.href).toContain("IBM+Plex+Sans");
});

test("tema sem fontes remove o link das fontes", () => {
  aplicarTema(TEMAS.datum, document);
  aplicarTema({ ...TEMAS.datum, fontesUrl: undefined }, document);
  expect(document.querySelector("link#tema-fontes")).toBeNull();
});
