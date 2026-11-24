// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import App from "./App";
import { apiDemo } from "./api-demo";

test("no modo demonstração mostra a faixa da Nexo e as 4 abas", async () => {
  render(<App demo={apiDemo()} real={null} hoje="2026-11-24" />);
  expect(await screen.findByText("Demonstração: Nexo Consultoria (dados fictícios)")).toBeInTheDocument();
  for (const aba of ["Painel", "Bench", "Vagas", "Importar"]) expect(screen.getByRole("tab", { name: aba })).toBeInTheDocument();
});

test("entrar troca da demonstração para os dados da empresa, e sair volta", async () => {
  const { default: userEvent } = await import("@testing-library/user-event");
  const { dados } = await import("../../src/regras/testes/fabrica");
  let logado = false;
  const real = {
    ...apiDemo("2026-11-24"),
    modo: "real" as const,
    sessao: async () => (logado ? { email: "luiz@datum.exemplo" } : null),
    entrar: async () => { logado = true; },
    sair: async () => { logado = false; },
    dados: async () => dados({ empresa: { id: "d1", nome: "Datum", limiteConcentracao: 0.3, diasUteisMes: 22 } }),
  };
  render(<App demo={apiDemo("2026-11-24")} real={real} hoje="2026-11-24" />);
  await userEvent.click(await screen.findByRole("button", { name: "Entrar" }));
  await userEvent.type(screen.getByLabelText("E-mail"), "luiz@datum.exemplo");
  await userEvent.type(screen.getByLabelText("Senha"), "segredo-de-teste");
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
  expect(await screen.findByText(/Datum · luiz@datum.exemplo/)).toBeInTheDocument();
  expect(screen.queryByText("Demonstração: Nexo Consultoria (dados fictícios)")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Sair" }));
  expect(await screen.findByText("Demonstração: Nexo Consultoria (dados fictícios)")).toBeInTheDocument();
});

test("depois de importar, a confirmação e os erros do servidor continuam na tela", async () => {
  const { default: userEvent } = await import("@testing-library/user-event");
  const { waitFor } = await import("@testing-library/react");
  const { dados } = await import("../../src/regras/testes/fabrica");
  let cargas = 0;
  const real = {
    ...apiDemo("2026-11-24"),
    modo: "real" as const,
    sessao: async () => ({ email: "luiz@datum.exemplo" }),
    dados: async () => {
      cargas++;
      if (cargas > 1) await new Promise((r) => setTimeout(r, 50)); // o recarregamento real passa pela rede
      return dados({ empresa: { id: "d1", nome: "Datum", limiteConcentracao: 0.3, diasUteisMes: 22 } });
    },
    importar: async () => ({ gravadas: 2, erros: [{ linha: 3, motivo: "consultor não encontrado: x@y.com" }] }),
  };
  render(<App demo={apiDemo("2026-11-24")} real={real} hoje="2026-11-24" />);
  await screen.findByText(/Datum · luiz@datum.exemplo/);
  await userEvent.click(screen.getByRole("tab", { name: "Importar" }));
  const csv = "Nome;E-mail;Senioridade\nAna;ana@x.com;Sênior\nBeto;beto@x.com;Pleno\n";
  await userEvent.upload(await screen.findByLabelText("Arquivo da planilha"), new File([csv], "c.csv", { type: "text/csv" }));
  const antes = cargas;
  await userEvent.click(await screen.findByRole("button", { name: "Importar 2 linhas" }));
  await waitFor(() => expect(cargas).toBe(antes + 1));
  expect(await screen.findByText("2 linhas gravadas.")).toBeInTheDocument();
  expect(screen.getByText("Linha 3: consultor não encontrado: x@y.com")).toBeInTheDocument();
});

test("com logo no tema, o topo mostra a imagem; sem logo, não", async () => {
  const { unmount } = render(<App demo={apiDemo()} real={null} hoje="2026-11-24" logo="/logo.png" />);
  expect(await screen.findByRole("img", { name: "Logo" })).toBeInTheDocument();
  unmount();
  render(<App demo={apiDemo()} real={null} hoje="2026-11-24" />);
  await screen.findByText("Demonstração: Nexo Consultoria (dados fictícios)");
  expect(screen.queryByRole("img", { name: "Logo" })).toBeNull();
});
