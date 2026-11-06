-- D-OLISTSHIP (resposta do Álvaro, 2026-11-06): forma de envio e forma de frete do pedido da creator no Olist.
ALTER TABLE "Brand" ADD COLUMN "olistShippingMethod" TEXT,
  ADD COLUMN "olistFreightForm" TEXT;
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_olist_shipping_len" CHECK (
  ("olistShippingMethod" IS NULL OR char_length("olistShippingMethod") BETWEEN 1 AND 30)
  AND ("olistFreightForm" IS NULL OR char_length("olistFreightForm") BETWEEN 1 AND 30)
);

UPDATE "Brand" SET "olistShippingMethod" = 'Correios Log+ Extrema', "olistFreightForm" = 'PAC CORREIOS LOG+' WHERE "slug" = 'botanika';
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "after", "createdAt")
SELECT gen_random_uuid(), "id", 'SYSTEM', 'migration:olist_shipping', 'brand.update', 'Brand', "id",
  jsonb_build_object('olistShippingMethod', 'Correios Log+ Extrema', 'olistFreightForm', 'PAC CORREIOS LOG+'), now()
FROM "Brand" WHERE "slug" = 'botanika';
