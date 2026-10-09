// Build na Vercel (script "vercel-build" do package.json).
// Só o deploy de produção da Vercel (a `main`, hoje o staging) aplica as migrações, antes do build.
// Prévias de PR nunca tocam o banco: lá não há variáveis de banco.
// Migração usa DIRECT_URL (session pooler, porta 5432); o app usa DATABASE_URL (transaction pooler, 6543).
import { execFileSync } from "node:child_process";

const MIGRATE_TIMEOUT_MS = 180_000;

const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", env: process.env, ...options });

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DIRECT_URL || !process.env.DATABASE_URL) {
    console.error("DIRECT_URL e DATABASE_URL são obrigatórios no ambiente Production da Vercel.");
    process.exit(1);
  }
  // O transaction pooler (6543) trava o `migrate deploy`; migração só pelo session pooler (5432).
  if (new URL(process.env.DIRECT_URL).port === "6543") {
    console.error("DIRECT_URL aponta para a porta 6543 (transaction pooler). Use o session pooler, porta 5432.");
    process.exit(1);
  }
  console.log("Aplicando migrações (prisma migrate deploy)...");
  try {
    run("npx", ["prisma", "migrate", "deploy"], {
      // DEBUG: o CLI mostra cada passo do schema engine, para diagnosticar travas.
      env: { ...process.env, DATABASE_URL: process.env.DIRECT_URL, DEBUG: "prisma:schemaEngine*" },
      timeout: MIGRATE_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
  } catch (error) {
    const timedOut = error?.signal === "SIGKILL";
    console.error(
      timedOut
        ? `Migração passou de ${MIGRATE_TIMEOUT_MS / 1000}s e foi interrompida.`
        : "Migração falhou.",
    );
    process.exit(1);
  }
}

run("npx", ["next", "build"]);
