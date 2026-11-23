import { expect, test } from "vitest";
import { lerArquivo } from "./ler";

test("CSV do Excel em português (windows-1252) mantém os acentos", async () => {
  // "Nome;Senioridade\nJoão;Sênior\n" em windows-1252: ã = 0xE3, ê = 0xEA
  const texto = "Nome;Senioridade\nJoão;Sênior\n";
  const bytes = Uint8Array.from([...texto].map((c) => c.charCodeAt(0)));
  expect(await lerArquivo(new File([bytes], "c.csv"))).toEqual([["Nome", "Senioridade"], ["João", "Sênior"]]);
});

test("CSV em UTF-8 com BOM continua funcionando", async () => {
  expect(await lerArquivo(new File(["﻿Nome;Cargo\nAna;QA\n"], "c.csv"))).toEqual([["Nome", "Cargo"], ["Ana", "QA"]]);
});

test("linha em branco no meio não desloca a numeração da planilha", async () => {
  const g = await lerArquivo(new File(["Nome;Cargo\n\nAna;QA\n"], "c.csv"));
  expect(g[2]).toEqual(["Ana", "QA"]); // linha 3 da planilha
});
