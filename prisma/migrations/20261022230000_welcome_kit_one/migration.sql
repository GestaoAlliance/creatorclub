-- D-WELCOMEKIT1 (responsável, 2026-10-22; muda D-KITANA): o kit de boas-vindas passa a ser de 1 produto em todas as
-- marcas e contratos (Botanika: 1 suplemento; Revita Derma e VermeFree: 1 produto da marca). O kit mensal segue a
-- tabela da Ana (1, 2 ou 3 pela faixa de vendas).
UPDATE "ContractTemplate" SET "welcomeProducts" = 1 WHERE "welcomeProducts" > 1;

-- Kits de boas-vindas ainda não escolhidos viram 1. Quem já pediu (pedido aguardando ou enviado) fica como está.
UPDATE "KitGrant" SET "products" = 1 WHERE "kind" = 'WELCOME' AND "status" = 'PENDING' AND "products" > 1;

-- Textos de contrato publicados que citam a quantidade do início: nova versão com 1 (as assinaturas antigas guardam
-- o texto que foi assinado e não mudam).
INSERT INTO "ContractDocument" ("id", "brandId", "kind", "version", "title", "body", "createdById")
SELECT gen_random_uuid()::text, d."brandId", d."kind", d."version" + 1, d."title",
       replace(replace(d."body",
         '3 (três) produtos Botanika no início da parceria', '1 (um) produto Botanika no início da parceria'),
         '03 (três) suplementos, conforme disponibilidade', '01 (um) suplemento, conforme disponibilidade'),
       'migracao-kit-boas-vindas-1'
FROM "ContractDocument" d
WHERE (d."body" LIKE '%3 (três) produtos Botanika no início da parceria%' OR d."body" LIKE '%03 (três) suplementos, conforme disponibilidade%')
  AND d."version" = (SELECT max(x."version") FROM "ContractDocument" x WHERE x."brandId" = d."brandId" AND x."kind" = d."kind");
