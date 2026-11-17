-- D-REVITATAX (resposta do responsável em 2026-11-16): a loja da Revita usa preço com imposto incluso; a comissão é
-- sobre o valor dos produtos como vem da loja (sem descontar imposto). Liberado só para a Revita; as outras seguem D-TAX.
ALTER TABLE "Brand" ADD COLUMN "commissionOnTaxIncluded" BOOLEAN NOT NULL DEFAULT false;
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), "id", 'SYSTEM', 'migration:revita_tax', 'brand.rules', 'Brand', "id",
       jsonb_build_object('commissionOnTaxIncluded', false), jsonb_build_object('commissionOnTaxIncluded', true), now()
FROM "Brand" WHERE "slug" = 'revita-derma';
UPDATE "Brand" SET "commissionOnTaxIncluded" = true WHERE "slug" = 'revita-derma';
