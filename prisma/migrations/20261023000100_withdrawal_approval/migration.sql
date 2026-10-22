-- M1.1 (D-WDAPPROVE): em análise → a Gestão (Ana) aprova → o Pagamento (Juci) paga. Aprovado continua em aberto:
-- reserva o valor do saldo, segura a nota e conta como o único pedido aberto da creator.
ALTER TABLE "Withdrawal" ADD COLUMN "approvedAt" TIMESTAMP(3), ADD COLUMN "approvedById" TEXT;

ALTER TABLE "Withdrawal"
  DROP CONSTRAINT "Withdrawal_decided_consistent",
  DROP CONSTRAINT "Withdrawal_decided_has_author";
ALTER TABLE "Withdrawal"
  ADD CONSTRAINT "Withdrawal_decided_consistent" CHECK (("status" IN ('REQUESTED', 'APPROVED')) = ("decidedAt" IS NULL)),
  ADD CONSTRAINT "Withdrawal_decided_has_author" CHECK ("status" IN ('REQUESTED', 'APPROVED') OR "decidedById" IS NOT NULL),
  -- Aprovado sempre tem quem e quando aprovou (pago depois da regra nova também; os pagos antigos não têm).
  ADD CONSTRAINT "Withdrawal_approved_has_author" CHECK ("status" <> 'APPROVED' OR ("approvedAt" IS NOT NULL AND "approvedById" IS NOT NULL)),
  ADD CONSTRAINT "Withdrawal_approval_pair" CHECK (("approvedAt" IS NULL) = ("approvedById" IS NULL));

DROP INDEX "Withdrawal_one_open_per_creator";
CREATE UNIQUE INDEX "Withdrawal_one_open_per_creator" ON "Withdrawal" ("creatorId") WHERE "status" IN ('REQUESTED', 'APPROVED');

DROP INDEX "Withdrawal_nf_access_key_once";
CREATE UNIQUE INDEX "Withdrawal_nf_access_key_once" ON "Withdrawal" ("nfAccessKey")
  WHERE "nfAccessKey" IS NOT NULL AND "status" IN ('REQUESTED', 'APPROVED', 'PAID');

-- Aviso novo para a creator: "Saque aprovado".
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_valid";
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_valid" CHECK (
    "kind" IN ('COMMISSION_RELEASED', 'KIT_AVAILABLE', 'SHIPPED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'FIRST_SALE',
               'WITHDRAWAL_WINDOW', 'NEAR_MINIMUM', 'CONTRACT_ENDING')
    AND btrim("title") <> '' AND btrim("body") <> '' AND btrim("dedupeKey") <> ''
    AND ("href" IS NULL OR "href" ~ '^/portal/')
  );
