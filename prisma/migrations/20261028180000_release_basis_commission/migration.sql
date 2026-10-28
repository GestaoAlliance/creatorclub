-- D-MIN100 (regras da Botanika da reunião de 2026-10-27; respostas do responsável em 2026-10-28): na Botanika a
-- comissão é liberada no fechamento do mês (dia 1) quando a COMISSÃO acumulada desde a última liberação chega a
-- R$ 100 (influencer e prescritor); abaixo disso acumula para o mês seguinte. As outras marcas seguem pelas vendas
-- (D-MIN300). Contrato sem comissão (UGC permuta, mínimo vazio) segue sem comissão.

-- CreateEnum
CREATE TYPE "ReleaseBasis" AS ENUM ('SALES', 'COMMISSION');

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "releaseBasis" "ReleaseBasis" NOT NULL DEFAULT 'SALES';

-- AlterTable
ALTER TABLE "CommissionRelease" ADD COLUMN     "basis" "ReleaseBasis" NOT NULL DEFAULT 'SALES';

INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), "id", 'SYSTEM', 'migration:release_basis_commission', 'brand.release_min', 'Brand', "id",
       jsonb_build_object('releaseBasis', "releaseBasis", 'releaseMinCents', "releaseMinCents", 'releaseMinPrescriberCents', "releaseMinPrescriberCents"),
       jsonb_build_object('releaseBasis', 'COMMISSION', 'releaseMinCents', 10000, 'releaseMinPrescriberCents', 10000), now()
FROM "Brand" WHERE "slug" = 'botanika';
UPDATE "Brand" SET "releaseBasis" = 'COMMISSION', "releaseMinCents" = 10000, "releaseMinPrescriberCents" = 10000 WHERE "slug" = 'botanika';

INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), t."brandId", 'SYSTEM', 'migration:release_basis_commission', 'contract_template.release_min', 'ContractTemplate', t."id",
       jsonb_build_object('releaseMinCents', t."releaseMinCents"), jsonb_build_object('releaseMinCents', 10000), now()
FROM "ContractTemplate" t JOIN "Brand" b ON b."id" = t."brandId"
WHERE b."slug" = 'botanika' AND t."releaseMinCents" IS NOT NULL AND t."releaseMinCents" <> 10000;
UPDATE "ContractTemplate" t SET "releaseMinCents" = 10000
FROM "Brand" b WHERE b."id" = t."brandId" AND b."slug" = 'botanika' AND t."releaseMinCents" IS NOT NULL;
