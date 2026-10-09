import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testes contra um Postgres real. Exige TEST_DATABASE_URL.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["test/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["test/integration/global-setup.ts"],
    // Um arquivo por vez: a fila de tarefas é global no schema (jobs.test.ts esvazia e pega qualquer tarefa).
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
