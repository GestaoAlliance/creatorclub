-- D-FIRSTKIT (pedido do responsável em 2026-10-29): creator ativa que nunca recebeu produto (nenhum envio, nem os
-- importados da planilha, e nenhum kit) ganha 1 produto de boas-vindas para pedir em Pedidos. Quem espera contrato
-- (D-CONTRACTFLOW) fica de fora: recebe o kit na assinatura.
WITH novas AS (
  INSERT INTO "KitGrant" ("id", "brandId", "creatorId", "kind", "month", "salesCents", "products", "createdAt")
  SELECT gen_random_uuid(), c."brandId", c."id", 'WELCOME', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'), 0, 1, now()
  FROM "Creator" c
  WHERE c."status" = 'ACTIVE' AND c."awaitingContractAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "Shipment" s WHERE s."creatorId" = c."id")
    AND NOT EXISTS (SELECT 1 FROM "KitGrant" k WHERE k."creatorId" = c."id")
  ON CONFLICT DO NOTHING
  RETURNING "brandId", "creatorId"
)
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "after", "createdAt")
SELECT gen_random_uuid(), "brandId", 'SYSTEM', 'migration:first_kit', 'kit.first', 'Creator', "creatorId", jsonb_build_object('products', 1, 'motivo', 'nunca recebeu produto'), now()
FROM novas;

-- D-KITPROGRESS: meta de R$ 1.000 (marcas sem a tabela mensal) começa hoje para quem não tinha início (vindas das planilhas).
WITH sem_inicio AS (
  UPDATE "Creator" c SET "goalStartAt" = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  FROM "Brand" b
  WHERE b."id" = c."brandId" AND b."monthlyKitFrom" IS NULL AND c."status" = 'ACTIVE' AND c."goalStartAt" IS NULL AND c."awaitingContractAt" IS NULL
  RETURNING c."brandId", c."id"
)
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "after", "createdAt")
SELECT gen_random_uuid(), "brandId", 'SYSTEM', 'migration:first_kit', 'creator.goal_start', 'Creator', "id", jsonb_build_object('motivo', 'meta começa hoje'), now()
FROM sem_inicio;
