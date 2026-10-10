-- D-CONTRACTVER: cada creator segue a versão de contrato que assinou (mínimo de vendas, faixas de kit, prazo).

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "contractTemplateId" TEXT;

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "releaseMinCents" INTEGER,
    "kitTiers" JSONB NOT NULL DEFAULT '[]',
    "months" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplate_brandId_key_key" ON "ContractTemplate"("brandId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplate_id_brandId_key" ON "ContractTemplate"("id", "brandId");

-- AddForeignKey
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_contractTemplateId_brandId_fkey" FOREIGN KEY ("contractTemplateId", "brandId") REFERENCES "ContractTemplate"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Travas
ALTER TABLE "ContractTemplate"
  ADD CONSTRAINT "ContractTemplate_values" CHECK (
    ("releaseMinCents" IS NULL OR "releaseMinCents" > 0) AND "months" > 0 AND jsonb_typeof("kitTiers") = 'array'
  );

-- D-RLS
ALTER TABLE "ContractTemplate" ENABLE ROW LEVEL SECURITY;

-- Versões encontradas nos contratos da Botanika (Drive, lido em 2026-10-10).
INSERT INTO "ContractTemplate" ("id", "brandId", "key", "name", "releaseMinCents", "kitTiers", "months")
SELECT gen_random_uuid()::text, b."id", t.key, t.name, t.min, t.tiers::jsonb, t.months
FROM "Brand" b, (VALUES
  ('influencer-2026-09', 'Influencer — modelo set/2026 (mínimo R$ 1.000)', 100000,
   '[{"fromCents":400000,"products":3},{"fromCents":1000000,"products":4}]', 6),
  ('influencer-2026-09-faixas', 'Influencer — faixas próprias (mínimo R$ 1.000)', 100000,
   '[{"fromCents":200000,"products":2},{"fromCents":400000,"products":3},{"fromCents":1000000,"products":4}]', 6),
  ('influencer-2026-10', 'Influencer — modelo out/2026 (mínimo R$ 500)', 50000,
   '[{"fromCents":100000,"toCents":199999,"products":1},{"fromCents":200000,"toCents":400000,"products":2},{"fromCents":1000000,"products":3}]', 6),
  ('prescritor-2026', 'Prescritor (mínimo R$ 1.000)', 100000,
   '[{"fromCents":400000,"products":2},{"fromCents":1000000,"products":3}]', 6),
  ('ugc-permuta', 'UGC — permuta (sem comissão)', NULL, '[]', 3)
) AS t(key, name, min, tiers, months)
WHERE b."slug" = 'botanika';

-- Quem não tem o contrato no Drive segue o modelo de R$ 1.000 até a equipe trocar na ficha (decisão de 2026-10-10).
UPDATE "Brand" SET "releaseMinCents" = 100000 WHERE "slug" = 'botanika';
UPDATE "Creator" c SET "contractTemplateId" = t."id"
FROM "ContractTemplate" t, "Brand" b
WHERE b."slug" = 'botanika' AND t."brandId" = b."id" AND c."brandId" = b."id" AND c."contractTemplateId" IS NULL
  AND t."key" = CASE
    WHEN 'PRESCRITOR' = ANY(c."categories") THEN 'prescritor-2026'
    WHEN c."categories" = ARRAY['UGC']::"CreatorCategory"[] THEN 'ugc-permuta'
    ELSE 'influencer-2026-09'
  END;
