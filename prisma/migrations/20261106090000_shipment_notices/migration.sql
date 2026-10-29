-- D-TRACKING: avisos "seus produtos chegaram" (equipe marcou entregue) e "seus produtos chegaram?" (10 dias sem Recebi).
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_valid";
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_valid" CHECK (
    "kind" IN ('COMMISSION_RELEASED', 'KIT_AVAILABLE', 'SHIPPED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'FIRST_SALE',
               'WITHDRAWAL_WINDOW', 'NEAR_MINIMUM', 'CONTRACT_ENDING', 'IDLE', 'WITHDRAWAL_BANK_REJECTED', 'PARTNERSHIP_ACTIVE',
               'SHIPMENT_DELIVERED', 'RECEIPT_CHECK')
    AND btrim("title") <> '' AND btrim("body") <> '' AND btrim("dedupeKey") <> ''
    AND ("href" IS NULL OR "href" ~ '^/portal/')
  );
