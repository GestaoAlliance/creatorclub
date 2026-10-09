// Build na Vercel (script "vercel-build" do package.json).
// Só o deploy de produção da Vercel (a `main`, hoje o staging) aplica as migrações, antes do build.
// Prévias de PR nunca tocam o banco: lá não há variáveis de banco.
// Migração usa DIRECT_URL (session pooler, porta 5432); o app usa DATABASE_URL (transaction pooler, 6543).
import { execFileSync } from "node:child_process";

const run = (cmd, args, env = process.env) => execFileSync(cmd, args, { stdio: "inherit", env });

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DIRECT_URL || !process.env.DATABASE_URL) {
    console.error("DIRECT_URL e DATABASE_URL são obrigatórios no ambiente Production da Vercel.");
    process.exit(1);
  }
  run("npx", ["prisma", "migrate", "deploy"], { ...process.env, DATABASE_URL: process.env.DIRECT_URL });
}

run("npx", ["next", "build"]);
