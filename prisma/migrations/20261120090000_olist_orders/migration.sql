-- D-OLISTORDER (Olist parte 2, respostas do Álvaro em 2026-11-05): pedido da creator aprovado vira pedido no Olist ERP
-- (natureza "Remessa em bonificação, doação ou brinde", preço de custo, aprovado, frete por conta da empresa) e o rastreio
-- volta sozinho.
ALTER TABLE "Brand" ADD COLUMN "olistNatureId" TEXT;
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_olist_nature_format" CHECK ("olistNatureId" IS NULL OR "olistNatureId" ~ '^[0-9]{1,20}$');

ALTER TABLE "Shipment" ADD COLUMN "olistOrderId" TEXT,
  ADD COLUMN "olistOrderNumber" TEXT,
  ADD COLUMN "olistSentAt" TIMESTAMP(3),
  ADD COLUMN "olistError" TEXT;

UPDATE "Brand" SET "olistNatureId" = '337803880' WHERE "slug" = 'botanika';
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "after", "createdAt")
SELECT gen_random_uuid(), "id", 'SYSTEM', 'migration:olist_orders', 'brand.update', 'Brand', "id", jsonb_build_object('olistNatureId', '337803880'), now()
FROM "Brand" WHERE "slug" = 'botanika';
