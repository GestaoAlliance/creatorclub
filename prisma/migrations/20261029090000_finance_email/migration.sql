-- D-NFMAIL (reunião de 2026-10-27): e-mail do financeiro de cada marca, que recebe cada nota fiscal enviada pelas
-- creators (com o PDF). Editável em Marcas. Botanika começa com o endereço da ata da reunião
-- (financeiro@botanicabrasil.com); o responsável vai confirmar a grafia.

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "financeEmail" TEXT;

INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), "id", 'SYSTEM', 'migration:finance_email', 'brand.finance_email', 'Brand', "id",
       jsonb_build_object('financeEmail', NULL), jsonb_build_object('financeEmail', 'financeiro@botanicabrasil.com'), now()
FROM "Brand" WHERE "slug" = 'botanika';
UPDATE "Brand" SET "financeEmail" = 'financeiro@botanicabrasil.com' WHERE "slug" = 'botanika';
