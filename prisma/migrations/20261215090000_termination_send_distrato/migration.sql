-- D-NODISTRATO: a Gestão escolhe ao encerrar se o distrato sai pelo Autentique.
ALTER TABLE "CreatorTermination" ADD COLUMN "sendDistrato" BOOLEAN NOT NULL DEFAULT true;

-- Encerramentos já processados sem a tarefa do distrato (as 20 UGCs da Botanika de 26/11, encerradas sem distrato por
-- decisão do responsável): ficam marcados como "sem distrato".
UPDATE "CreatorTermination" t SET "sendDistrato" = false
WHERE t."processedAt" IS NOT NULL AND t."sentAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Job" j WHERE j."dedupeKey" = 'distrato:' || t.id);
