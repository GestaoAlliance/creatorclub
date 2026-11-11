-- D-BULKMSG: mensagem da equipe para várias creators de uma vez (portal, WhatsApp da marca ou e-mail).
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_valid";
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_valid" CHECK (
    "kind" IN ('COMMISSION_RELEASED', 'KIT_AVAILABLE', 'SHIPPED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'FIRST_SALE',
               'WITHDRAWAL_WINDOW', 'NEAR_MINIMUM', 'CONTRACT_ENDING', 'IDLE', 'WITHDRAWAL_BANK_REJECTED', 'PARTNERSHIP_ACTIVE',
               'SHIPMENT_DELIVERED', 'RECEIPT_CHECK', 'TEAM_MESSAGE')
    AND btrim("title") <> '' AND btrim("body") <> '' AND btrim("dedupeKey") <> ''
    AND ("href" IS NULL OR "href" ~ '^/portal/')
  );

-- Texto da mensagem da equipe com limite (título 80, texto 1000).
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_team_message_size" CHECK (
    "kind" <> 'TEAM_MESSAGE' OR (char_length("title") <= 80 AND char_length("body") <= 1000)
  );
