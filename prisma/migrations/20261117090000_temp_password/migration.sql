-- D-ACCESSFIX (2026-11-03): senha provisória criada pela equipe; no primeiro acesso a pessoa cria a própria senha.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
