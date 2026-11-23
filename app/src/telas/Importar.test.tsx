// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { dados } from "../../../src/regras/testes/fabrica";
import type { Api } from "../api";
import { apiDemo } from "../api-demo";
import Importar from "./Importar";

const HOJE = "2026-11-24";
const CSV = "Nome;E-mail;Senioridade;Skills\nAna;ana@x.com;Sênior;Playwright, Java\nBeto;beto@x.com;Pleno;React\nCida;;Pleno;SQL\n";

test("importa consultores: mapeia colunas, mostra erros, grava e confirma", async () => {
  let enviado: unknown[] = [];
  let recarregou = false;
  const api: Api = { ...apiDemo(HOJE), modo: "real", importar: async (_t, linhas) => { enviado = linhas; return { gravadas: linhas.length, erros: [] }; } };
  render(<Importar dados={dados({})} hoje={HOJE} api={api} recarregar={() => { recarregou = true; }} />);

  await userEvent.upload(screen.getByLabelText("Arquivo da planilha"), new File([CSV], "consultores.csv", { type: "text/csv" }));

  expect(await screen.findByLabelText("E-mail (obrigatório)")).toHaveValue("1");
  expect(screen.getByLabelText("Cargo")).toHaveValue("");
  expect(screen.getByText("Linha 4: e-mail obrigatório")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Importar 2 linhas" }));
  expect(await screen.findByText("2 linhas gravadas.")).toBeInTheDocument();
  expect(enviado).toHaveLength(2);
  expect(recarregou).toBe(true);
});

test("campo obrigatório sem coluna bloqueia a importação", async () => {
  const api: Api = { ...apiDemo(HOJE), modo: "real" };
  render(<Importar dados={dados({})} hoje={HOJE} api={api} recarregar={() => {}} />);
  await userEvent.upload(screen.getByLabelText("Arquivo da planilha"), new File(["Nome;Cargo\nAna;QA\n"], "c.csv", { type: "text/csv" }));
  expect(await screen.findByText("Escolha a coluna de: E-mail, Senioridade")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Importar \d+ linha/ })).not.toBeInTheDocument();
});

test("no modo demonstração pede para entrar", () => {
  render(<Importar dados={dados({})} hoje={HOJE} api={apiDemo(HOJE)} recarregar={() => {}} />);
  expect(screen.getByText("Para importar suas planilhas, entre com sua conta.")).toBeInTheDocument();
});

test("importa as marcações do ponto pela matrícula, com a nota de ordem", async () => {
  let tipo = "";
  let enviado: unknown[] = [];
  const api: Api = { ...apiDemo(HOJE), modo: "real", importar: async (t, linhas) => { tipo = t; enviado = linhas; return { gravadas: linhas.length, erros: [] }; } };
  render(<Importar dados={dados({})} hoje={HOJE} api={api} recarregar={() => {}} />);
  await userEvent.selectOptions(screen.getByLabelText("Tipo de planilha"), "Marcações do ponto");
  expect(screen.getByText(/Importe os colaboradores do ponto antes/)).toBeInTheDocument();
  await userEvent.upload(screen.getByLabelText("Arquivo da planilha"),
    new File(["Matrícula;Data;Marcações\n000226;17/11/2026;\n000226;18/11/2026;08:00 12:00 13:00 17:00\n"], "m.csv", { type: "text/csv" }));
  await userEvent.click(await screen.findByRole("button", { name: "Importar 2 linhas" }));
  expect(tipo).toBe("ponto_marcacoes");
  expect(enviado[0]).toMatchObject({ matricula: "226", data: "2026-11-17", marcacoes: [] });
});
