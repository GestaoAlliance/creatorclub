-- D-MIN300 (pedido da Vanessa, decidido pelo responsável em 2026-10-27): a comissão é liberada no fechamento do mês
-- (dia 1) quando as vendas acumuladas chegam a R$ 300, para influencer e prescritor, nas 3 marcas. Vale já no
-- fechamento de 1º de novembro. Contrato sem comissão (UGC permuta, mínimo vazio) segue sem comissão.
ALTER TABLE "Brand" ALTER COLUMN "releaseMinCents" SET DEFAULT 30000,
  ALTER COLUMN "releaseMinPrescriberCents" SET DEFAULT 30000;

INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), "brandId", 'SYSTEM', 'migration:release_min_300', 'contract_template.release_min', 'ContractTemplate', "id",
       jsonb_build_object('releaseMinCents', "releaseMinCents"), jsonb_build_object('releaseMinCents', 30000), now()
FROM "ContractTemplate" WHERE "releaseMinCents" IS NOT NULL AND "releaseMinCents" <> 30000;
UPDATE "ContractTemplate" SET "releaseMinCents" = 30000 WHERE "releaseMinCents" IS NOT NULL;

INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), "id", 'SYSTEM', 'migration:release_min_300', 'brand.release_min', 'Brand', "id",
       jsonb_build_object('releaseMinCents', "releaseMinCents", 'releaseMinPrescriberCents', "releaseMinPrescriberCents"),
       jsonb_build_object('releaseMinCents', 30000, 'releaseMinPrescriberCents', 30000), now()
FROM "Brand";
UPDATE "Brand" SET "releaseMinCents" = 30000, "releaseMinPrescriberCents" = 30000;
