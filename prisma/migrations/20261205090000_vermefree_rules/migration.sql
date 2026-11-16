-- D-VFRULES (resposta do responsável em 2026-11-16: "contrato novo para todas, como na Revita"): a VermeFree passa às
-- regras da Botanika e da Revita. Libera com R$ 100 de COMISSÃO acumulada (influencer e prescritor), saque pedido do
-- dia 5 ao 15 e pagamento do dia 20 ao 25. Vale no fechamento de 01/12 (comissão de novembro). Kits não mudam.
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), "id", 'SYSTEM', 'migration:vermefree_rules', 'brand.rules', 'Brand', "id",
       jsonb_build_object('releaseBasis', "releaseBasis", 'releaseMinCents', "releaseMinCents", 'releaseMinPrescriberCents', "releaseMinPrescriberCents", 'window', jsonb_build_array("withdrawalWindowStartDay", "withdrawalWindowEndDay"), 'pay', jsonb_build_array("withdrawalPayFromDay", "withdrawalPayByDay")),
       jsonb_build_object('releaseBasis', 'COMMISSION', 'releaseMinCents', 10000, 'releaseMinPrescriberCents', 10000, 'window', jsonb_build_array(5, 15), 'pay', jsonb_build_array(20, 25)), now()
FROM "Brand" WHERE "slug" = 'vermefree';
UPDATE "Brand" SET "releaseBasis" = 'COMMISSION', "releaseMinCents" = 10000, "releaseMinPrescriberCents" = 10000,
  "withdrawalWindowStartDay" = 5, "withdrawalWindowEndDay" = 15, "withdrawalPayFromDay" = 20, "withdrawalPayByDay" = 25
WHERE "slug" = 'vermefree';

-- Versões de contrato com comissão (mínimo preenchido) passam a R$ 100; sem mínimo (UGC permuta) seguem sem comissão.
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), t."brandId", 'SYSTEM', 'migration:vermefree_rules', 'contract_template.release_min', 'ContractTemplate', t."id",
       jsonb_build_object('releaseMinCents', t."releaseMinCents"), jsonb_build_object('releaseMinCents', 10000), now()
FROM "ContractTemplate" t JOIN "Brand" b ON b."id" = t."brandId"
WHERE b."slug" = 'vermefree' AND t."releaseMinCents" IS NOT NULL AND t."releaseMinCents" <> 10000;
UPDATE "ContractTemplate" t SET "releaseMinCents" = 10000
FROM "Brand" b WHERE b."id" = t."brandId" AND b."slug" = 'vermefree' AND t."releaseMinCents" IS NOT NULL;
