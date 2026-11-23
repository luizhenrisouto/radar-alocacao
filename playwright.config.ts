import { defineConfig, devices } from "@playwright/test";

// E2E da demonstração (modo demo, sem Supabase), no computador e no celular.
export default defineConfig({
  testDir: "testes/e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:5190", locale: "pt-BR", timezoneId: "America/Sao_Paulo", reducedMotion: "reduce" },
  webServer: { command: "npm run dev -- --port 5190 --strictPort", url: "http://localhost:5190", reuseExistingServer: true },
  projects: [
    { name: "computador", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "celular", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
});
