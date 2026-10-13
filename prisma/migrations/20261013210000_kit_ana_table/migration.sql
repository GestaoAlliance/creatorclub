-- D-KITANA (responsável, 2026-10-13): a tabela da Ana vale para todos os contratos com comissão, nas três marcas:
-- mínimo de R$ 500 no mês; kit mensal de 1 suplemento a partir de R$ 1.000, 2 a partir de R$ 2.000 e 3 a partir de
-- R$ 10.000. Kit de boas-vindas de 3 produtos em todos os contratos (inclusive UGC permuta).
UPDATE "ContractTemplate"
SET "releaseMinCents" = 50000,
    "kitTiers" = '[{"fromCents": 100000, "products": 1}, {"fromCents": 200000, "products": 2}, {"fromCents": 1000000, "products": 3}]'::jsonb,
    "welcomeProducts" = 3
WHERE "releaseMinCents" IS NOT NULL;

UPDATE "ContractTemplate" SET "welcomeProducts" = 3 WHERE "releaseMinCents" IS NULL;

-- Creator sem versão de contrato segue o mínimo da marca: o mesmo R$ 500.
UPDATE "Brand" SET "releaseMinCents" = 50000, "releaseMinPrescriberCents" = 50000;

-- Texto do contrato de prescritor publicado dizia 2 produtos no início: nova versão com 3 (as assinaturas antigas
-- guardam o texto que foi assinado e não mudam).
INSERT INTO "ContractDocument" ("id", "brandId", "kind", "version", "title", "body", "createdById")
SELECT gen_random_uuid()::text, d."brandId", d."kind", d."version" + 1, d."title",
       replace(d."body", '2 (dois) produtos Botanika no início da parceria', '3 (três) produtos Botanika no início da parceria'),
       'migracao-kit-ana'
FROM "ContractDocument" d
WHERE d."body" LIKE '%2 (dois) produtos Botanika no início da parceria%'
  AND d."version" = (SELECT max(x."version") FROM "ContractDocument" x WHERE x."brandId" = d."brandId" AND x."kind" = d."kind");

-- Quem está ativa e nunca recebeu nada ganha agora o kit de boas-vindas de 3 produtos (escolhe no portal, em Envios).
INSERT INTO "KitGrant" ("id", "brandId", "creatorId", "kind", "month", "salesCents", "products")
SELECT gen_random_uuid()::text, c."brandId", c."id", 'WELCOME', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'), 0, 3
FROM "Creator" c
JOIN "Brand" b ON b."id" = c."brandId"
WHERE c."status" = 'ACTIVE'
  AND b."archivedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Shipment" s WHERE s."creatorId" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "KitGrant" k WHERE k."creatorId" = c."id")
ON CONFLICT DO NOTHING;
