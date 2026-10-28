-- D-TIERKIT (regras da Botanika da reunião de 2026-10-27; respostas do responsável em 2026-10-28): na Botanika, a
-- partir das vendas de novembro de 2026, os produtos vêm pela tabela mensal (R$ 500 → 1 nos 3 primeiros meses da
-- creator; depois R$ 1.000 → 1, R$ 4.000 → 2, R$ 6.000 → 3, R$ 10.000 → 4), liberados na hora, por faixa. As outras
-- marcas seguem com a meta de R$ 1.000 em janelas de 45/30 dias (D-GOALKIT).

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "monthlyKitFrom" TEXT;

ALTER TABLE "Brand" ADD CONSTRAINT "Brand_monthlyKitFrom_format" CHECK ("monthlyKitFrom" IS NULL OR "monthlyKitFrom" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- O mês por faixa (MONTHLY) também usa `window` (total de produtos do mês até aquela liberação).
ALTER TABLE "KitGrant" DROP CONSTRAINT "KitGrant_kind";
ALTER TABLE "KitGrant"
  ADD CONSTRAINT "KitGrant_kind" CHECK (
    "kind" IN ('MONTHLY', 'WELCOME', 'GOAL') AND ("kind" <> 'WELCOME' OR "salesCents" = 0) AND ("window" >= 0) AND ("kind" IN ('GOAL', 'MONTHLY') OR "window" = 0)
  );

INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), "id", 'SYSTEM', 'migration:monthly_tier_kits', 'brand.kit_rule', 'Brand', "id",
       jsonb_build_object('monthlyKitFrom', NULL), jsonb_build_object('monthlyKitFrom', '2026-11'), now()
FROM "Brand" WHERE "slug" = 'botanika';
UPDATE "Brand" SET "monthlyKitFrom" = '2026-11' WHERE "slug" = 'botanika';
