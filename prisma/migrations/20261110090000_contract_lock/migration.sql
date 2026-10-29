-- D-CONTRACTLOCK (decisão do responsável em 2026-10-29): quem foi aprovada no Creator Club desde 26/10 (D4Sign) e não
-- tem contrato assinado no Autentique volta a esperar o contrato: portal e pedido travados até assinar (o cupom dela
-- continua). O contrato sai pela fila (Autentique); quem já assinou fora, a Gestão libera com "Contrato assinado".
WITH alvo AS (
  UPDATE "Creator" c SET "awaitingContractAt" = now(), "contractSigned" = false
  FROM "CreatorApplication" a
  WHERE a."creatorId" = c."id" AND a."status" = 'APPROVED' AND a."decidedAt" >= '2026-10-26T03:00:00Z'
    AND c."status" = 'ACTIVE' AND c."awaitingContractAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "ContractRequest" r WHERE r."creatorId" = c."id" AND r."status" = 'SIGNED')
  RETURNING c."brandId", c."id"
), tarefas AS (
  INSERT INTO "Job" ("id", "brandId", "type", "payload", "dedupeKey", "runAt", "maxAttempts")
  SELECT gen_random_uuid(), "brandId", 'autentique.creator_contract', jsonb_build_object('creatorId', "id"), 'contract-creator:' || "id", now(), 3
  FROM alvo
  ON CONFLICT DO NOTHING
  RETURNING 1
)
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "after", "createdAt")
SELECT gen_random_uuid(), "brandId", 'SYSTEM', 'migration:contract_lock', 'creator.contract_lock', 'Creator', "id", jsonb_build_object('motivo', 'aprovada desde 26/10 sem contrato assinado no Autentique'), now()
FROM alvo;
