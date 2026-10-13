-- D-AUTENTIQUE: contrato enviado para assinatura no Autentique.
CREATE TYPE "ContractRequestStatus" AS ENUM ('SENT', 'SIGNED', 'REJECTED', 'CANCELLED');

CREATE TABLE "ContractRequest" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "contractDocumentId" TEXT NOT NULL,
    "contractTemplateId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'AUTENTIQUE',
    "externalId" TEXT NOT NULL,
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodySha256" TEXT NOT NULL,
    "pendingCouponCode" TEXT,
    "pendingDiscountBps" INTEGER,
    "couponCreatedAt" TIMESTAMP(3),
    "status" "ContractRequestStatus" NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "ContractRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractRequest_externalId_key" ON "ContractRequest"("externalId");
CREATE INDEX "ContractRequest_brandId_status_idx" ON "ContractRequest"("brandId", "status");
CREATE INDEX "ContractRequest_creatorId_idx" ON "ContractRequest"("creatorId");

ALTER TABLE "ContractRequest" ADD CONSTRAINT "ContractRequest_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractRequest" ADD CONSTRAINT "ContractRequest_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractRequest" ADD CONSTRAINT "ContractRequest_contractDocumentId_brandId_fkey" FOREIGN KEY ("contractDocumentId", "brandId") REFERENCES "ContractDocument"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractRequest" ADD CONSTRAINT "ContractRequest_contractTemplateId_brandId_fkey" FOREIGN KEY ("contractTemplateId", "brandId") REFERENCES "ContractTemplate"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContractRequest" ENABLE ROW LEVEL SECURITY;

-- Travas: assinado tem data; recusado tem data; cupom pendente vem com desconto; um contrato em aberto por creator.
ALTER TABLE "ContractRequest" ADD CONSTRAINT "ContractRequest_signed_has_date" CHECK (("status" = 'SIGNED') = ("signedAt" IS NOT NULL));
ALTER TABLE "ContractRequest" ADD CONSTRAINT "ContractRequest_rejected_has_date" CHECK (("status" = 'REJECTED') = ("rejectedAt" IS NOT NULL));
ALTER TABLE "ContractRequest" ADD CONSTRAINT "ContractRequest_pending_coupon_discount" CHECK (("pendingCouponCode" IS NULL) = ("pendingDiscountBps" IS NULL));
CREATE UNIQUE INDEX "ContractRequest_one_open_per_creator" ON "ContractRequest"("creatorId") WHERE "status" = 'SENT';
