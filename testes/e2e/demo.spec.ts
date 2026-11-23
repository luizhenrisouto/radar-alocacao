import { expect, test } from "@playwright/test";

test("o painel abre contando a história da Cooperativa", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Demonstração: Nexo Consultoria (dados fictícios)")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText(/^Cooperativa Saúde Sul concentra \d+% dos alocados e 7 contratos vencem em até 60 dias\.$/);
  await expect(page.getByText("Acerto do matching: 10 de 10 vagas (gabarito no top 3)")).toBeVisible();
});

test("abrir uma vaga mostra os candidatos com explicação", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Vagas" }).click();
  await page.getByRole("button", { name: /Dev Java Pleno · Pagamentos/ }).click();
  const candidatos = page.getByTestId("candidato");
  await expect(candidatos.first()).toContainText("Bruno Carvalho");
  await expect(candidatos.first()).toContainText(/Cobre|Disponível|\w/);
  expect(await candidatos.count()).toBeGreaterThan(0);
});

test("nenhuma tela tem rolagem horizontal", async ({ page }) => {
  await page.goto("/");
  for (const aba of ["Painel", "Bench", "Vagas", "Simular corte", "Mercado", "Ponto", "Importar"]) {
    await page.getByRole("tab", { name: aba }).click();
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sobra, aba).toBeLessThanOrEqual(0);
  }
});

test("o bench mostra até quando manter e a conta de um cooperado", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Bench" }).click();
  const sergio = page.getByTestId("bench-linha").filter({ hasText: "Sérgio Antunes" });
  await expect(sergio).toContainText(/\d+ dias úteis/);
  await expect(sergio).toContainText("Cooperado");
  await sergio.getByRole("button", { name: "Ver a conta" }).click();
  await expect(page.getByTestId("conta")).toContainText("Lei 12.690/2012");
});

test("simular 100% da Cooperativa e registrar muda os vencimentos do painel", async ({ page }) => {
  await page.goto("/");
  const vencendo = page.getByText("Vencendo em até 60 dias").locator("xpath=following-sibling::*[1]");
  await expect(vencendo).toHaveText("7");
  await page.getByRole("tab", { name: "Simular corte" }).click();
  await page.getByLabel("Quanto o cliente corta").fill("100");
  await expect(page.getByText("Pessoas afetadas").locator("xpath=following-sibling::*[1]")).toHaveText("8");
  await page.getByRole("button", { name: "Registrar corte" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("status")).toHaveText("8 alocações encerradas.");
  await page.getByRole("tab", { name: "Painel" }).click();
  await expect(vencendo).toHaveText("13");
});

test("colar uma vaga mostra o lead com quem encaixa", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Mercado" }).click();
  await page.getByLabel("Texto da vaga").fill("Buscamos QA Sênior\nPlaywright, Type Script e REST Assured. Desejável k6.");
  await page.getByRole("button", { name: "Ler vaga" }).click();
  const form = page.getByRole("form", { name: "Vaga lida" });
  await form.getByLabel("Empresa").fill("Clínica Alfa");
  await form.getByRole("button", { name: "Salvar vaga" }).click();
  const lead = page.getByTestId("lead").filter({ hasText: "Clínica Alfa" });
  await expect(lead).toContainText("Ana Ribeiro");
  await lead.getByRole("button", { name: "Rascunho de e-mail" }).click();
  await expect(page.getByTestId("email").getByRole("button", { name: "Copiar" })).toBeVisible();
});

test("a aba Ponto simula a cobrança de hoje", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Ponto" }).click();
  await expect(page.getByTestId("ponto-pessoa").first()).toBeVisible();
  await page.getByRole("button", { name: "Simular cobrança de hoje" }).click();
  await expect(page.getByRole("status")).toHaveText("5 mensagens simuladas.");
  await expect(page.getByTestId("ponto-envio").first()).toContainText("Simulado");
});
