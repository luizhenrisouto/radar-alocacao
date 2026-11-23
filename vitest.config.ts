import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "supabase/functions/_shared/**/*.test.ts", "testes/**/*.test.ts", "app/src/**/*.test.{ts,tsx}"],
    setupFiles: ["app/src/testes/preparar.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
