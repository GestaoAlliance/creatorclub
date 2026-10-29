-- D-CONTRACTFLOW: aprova primeiro, contrato pelo Autentique depois; cupom e kit só na assinatura.
-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "awaitingContractAt" TIMESTAMP(3),
ADD COLUMN     "pendingCouponCode" TEXT,
ADD COLUMN     "pendingDiscountBps" INTEGER;

-- AlterTable
ALTER TABLE "CreatorApplication" ADD COLUMN     "payoutAnswer" TEXT,
ADD COLUMN     "welcomeAnswer" TEXT;


-- Travas: cupom reservado vem com o desconto e não repete na marca.
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_pending_coupon" CHECK ((("pendingCouponCode" IS NULL) = ("pendingDiscountBps" IS NULL)) AND ("pendingCouponCode" IS NULL OR "pendingCouponCode" = upper(btrim("pendingCouponCode"))) AND ("pendingDiscountBps" IS NULL OR "pendingDiscountBps" BETWEEN 1 AND 5000));
CREATE UNIQUE INDEX "Creator_pending_coupon_once" ON "Creator"("brandId", "pendingCouponCode") WHERE "pendingCouponCode" IS NOT NULL;

-- Os 4 modelos da Influencer (pessoa física ou empresa × 1 produto ou 2 produtos + 3 vídeos).
ALTER TABLE "ContractDocument" DROP CONSTRAINT "ContractDocument_valid";
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_valid" CHECK ("kind" IN ('INFLUENCER', 'PRESCRITOR', 'UGC', 'INFLUENCER_PF_1', 'INFLUENCER_PF_2', 'INFLUENCER_PJ_1', 'INFLUENCER_PJ_2') AND "version" > 0 AND btrim("title") <> '' AND btrim("body") <> '');

-- Aviso "parceria ativa" (contrato assinado e cupom criado).
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_valid";
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_valid" CHECK (
    "kind" IN ('COMMISSION_RELEASED', 'KIT_AVAILABLE', 'SHIPPED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'FIRST_SALE',
               'WITHDRAWAL_WINDOW', 'NEAR_MINIMUM', 'CONTRACT_ENDING', 'IDLE', 'WITHDRAWAL_BANK_REJECTED', 'PARTNERSHIP_ACTIVE')
    AND btrim("title") <> '' AND btrim("body") <> '' AND btrim("dedupeKey") <> ''
    AND ("href" IS NULL OR "href" ~ '^/portal/')
  );
