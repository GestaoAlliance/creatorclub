-- D-PIXCHANGE: troca da chave Pix pela creator (portal) ou pela equipe (ficha), com aviso à creator.
ALTER TABLE "CreatorAccount" ADD COLUMN "pixKeyChangedAt" TIMESTAMP(3);

-- (Sem trava de formato da chave: há chaves antigas fora do padrão; a validação fica no código.)

ALTER TABLE "Notification" DROP CONSTRAINT "Notification_valid";
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_valid" CHECK (
    "kind" IN ('COMMISSION_RELEASED', 'KIT_AVAILABLE', 'SHIPPED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'FIRST_SALE',
               'WITHDRAWAL_WINDOW', 'NEAR_MINIMUM', 'CONTRACT_ENDING', 'IDLE', 'WITHDRAWAL_BANK_REJECTED', 'PARTNERSHIP_ACTIVE',
               'SHIPMENT_DELIVERED', 'RECEIPT_CHECK', 'TEAM_MESSAGE', 'CAMPAIGN_NEW', 'PIX_CHANGED')
    AND btrim("title") <> '' AND btrim("body") <> '' AND btrim("dedupeKey") <> ''
    AND ("href" IS NULL OR "href" ~ '^/portal/')
  );
