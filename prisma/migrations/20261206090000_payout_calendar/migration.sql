-- D-CALENDAR: estender a janela de pedido de saque só no mês corrente; no dia 1 seguinte o worker volta ao normal.
ALTER TABLE "Brand" ADD COLUMN "windowExtensionMonth" TEXT, ADD COLUMN "windowNormalEndDay" INTEGER;
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_window_extension_valid" CHECK (
  ("windowExtensionMonth" IS NULL AND "windowNormalEndDay" IS NULL)
  OR ("windowExtensionMonth" ~ '^\d{4}-(0[1-9]|1[0-2])$' AND "windowNormalEndDay" BETWEEN "withdrawalWindowStartDay" AND "withdrawalWindowEndDay" - 1));

-- A Botanika está com a janela reaberta até o dia 22 só em novembro de 2026 (pedido do responsável em 2026-11-14):
-- vira extensão do mês, para voltar sozinha ao dia 15 em dezembro.
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), "id", 'SYSTEM', 'migration:payout_calendar', 'brand.window_extended', 'Brand', "id",
       jsonb_build_object('end', 22), jsonb_build_object('month', '2026-11', 'end', 22, 'normalEnd', 15), now()
FROM "Brand" WHERE "slug" = 'botanika' AND "withdrawalWindowEndDay" = 22 AND "windowExtensionMonth" IS NULL;
UPDATE "Brand" SET "windowExtensionMonth" = '2026-11', "windowNormalEndDay" = 15
WHERE "slug" = 'botanika' AND "withdrawalWindowEndDay" = 22 AND "windowExtensionMonth" IS NULL;
