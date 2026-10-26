-- D-D4SIGN (pedido do responsável em 2026-10-26): kit de boas-vindas é 1 produto em todas as marcas. Os kits de
-- boas-vindas ainda não escolhidos que nasceram com mais (regra antiga, ex.: conta de teste da Revita) passam a 1.
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), "brandId", 'SYSTEM', 'migration:welcome_kit_pending_one', 'kit.products', 'KitGrant', "id",
       jsonb_build_object('products', "products"), jsonb_build_object('products', 1), now()
FROM "KitGrant" WHERE "kind" = 'WELCOME' AND "status" = 'PENDING' AND "products" > 1;
UPDATE "KitGrant" SET "products" = 1 WHERE "kind" = 'WELCOME' AND "status" = 'PENDING' AND "products" > 1;
