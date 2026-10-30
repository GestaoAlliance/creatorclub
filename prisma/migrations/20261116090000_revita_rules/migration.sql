-- D-REVITARULES (contrato da Influencer da Revita de 2026-10-30; respostas do responsável): todas as creators da Revita
-- seguem o contrato novo. Libera com R$ 100 de COMISSÃO acumulada (influencer e prescritor, como a Botanika em D-MIN100);
-- saque pedido do dia 5 ao 15, pagamento do dia 20 ao 25; produtos pelas vendas do mês a partir de novembro de 2026
-- (R$ 1.000 → 1, R$ 2.000 → 2, tabela no código). 2 meses sem venda: aviso em Ações (o contrato se encerra).

-- Dia do pagamento por marca (texto do portal e da inscrição): null = "até o dia N".
ALTER TABLE "Brand" ADD COLUMN "withdrawalPayFromDay" INTEGER,
ADD COLUMN "withdrawalPayByDay" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_withdrawalPay_valid" CHECK (
  "withdrawalPayByDay" BETWEEN 1 AND 31
  AND ("withdrawalPayFromDay" IS NULL OR "withdrawalPayFromDay" BETWEEN 1 AND "withdrawalPayByDay"));

INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), "id", 'SYSTEM', 'migration:revita_rules', 'brand.rules', 'Brand', "id",
       jsonb_build_object('releaseBasis', "releaseBasis", 'releaseMinCents', "releaseMinCents", 'releaseMinPrescriberCents', "releaseMinPrescriberCents", 'window', jsonb_build_array("withdrawalWindowStartDay", "withdrawalWindowEndDay"), 'monthlyKitFrom', "monthlyKitFrom"),
       jsonb_build_object('releaseBasis', 'COMMISSION', 'releaseMinCents', 10000, 'releaseMinPrescriberCents', 10000, 'window', jsonb_build_array(5, 15), 'pay', jsonb_build_array(20, 25), 'monthlyKitFrom', '2026-11'), now()
FROM "Brand" WHERE "slug" = 'revita-derma';
UPDATE "Brand" SET "releaseBasis" = 'COMMISSION', "releaseMinCents" = 10000, "releaseMinPrescriberCents" = 10000,
  "withdrawalWindowStartDay" = 5, "withdrawalWindowEndDay" = 15, "withdrawalPayFromDay" = 20, "withdrawalPayByDay" = 25,
  "monthlyKitFrom" = '2026-11'
WHERE "slug" = 'revita-derma';

-- Versões de contrato com comissão (mínimo preenchido) passam a R$ 100; sem mínimo (UGC permuta) seguem sem comissão.
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), t."brandId", 'SYSTEM', 'migration:revita_rules', 'contract_template.release_min', 'ContractTemplate', t."id",
       jsonb_build_object('releaseMinCents', t."releaseMinCents"), jsonb_build_object('releaseMinCents', 10000), now()
FROM "ContractTemplate" t JOIN "Brand" b ON b."id" = t."brandId"
WHERE b."slug" = 'revita-derma' AND t."releaseMinCents" IS NOT NULL AND t."releaseMinCents" <> 10000;
UPDATE "ContractTemplate" t SET "releaseMinCents" = 10000
FROM "Brand" b WHERE b."id" = t."brandId" AND b."slug" = 'revita-derma' AND t."releaseMinCents" IS NOT NULL;
