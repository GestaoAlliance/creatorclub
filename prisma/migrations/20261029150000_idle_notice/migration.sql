-- D-IDLE45 (reunião de 2026-10-27; respostas do responsável em 2026-10-28): a creator recebe um aviso (portal e
-- WhatsApp da marca, ou e-mail) quando completa N dias sem venda com o cupom. Só na Botanika por enquanto (45 dias).
-- O encerramento automático em 60 dias espera o parecer jurídico.

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "idleNoticeDays" INTEGER;

ALTER TABLE "Brand" ADD CONSTRAINT "Brand_idleNoticeDays" CHECK ("idleNoticeDays" IS NULL OR "idleNoticeDays" BETWEEN 7 AND 365);

INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), "id", 'SYSTEM', 'migration:idle_notice', 'brand.idle_notice', 'Brand', "id",
       jsonb_build_object('idleNoticeDays', NULL), jsonb_build_object('idleNoticeDays', 45), now()
FROM "Brand" WHERE "slug" = 'botanika';
UPDATE "Brand" SET "idleNoticeDays" = 45 WHERE "slug" = 'botanika';

-- Tipo de aviso IDLE.
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_valid";
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_valid" CHECK (
    "kind" IN ('COMMISSION_RELEASED', 'KIT_AVAILABLE', 'SHIPPED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'FIRST_SALE',
               'WITHDRAWAL_WINDOW', 'NEAR_MINIMUM', 'CONTRACT_ENDING', 'IDLE')
    AND btrim("title") <> '' AND btrim("body") <> '' AND btrim("dedupeKey") <> ''
    AND ("href" IS NULL OR "href" ~ '^/portal/')
  );
