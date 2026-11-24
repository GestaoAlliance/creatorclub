-- D-DISTRATO (2026-11-24): encerramento da parceria agendado na ficha e o distrato pelo Autentique.
-- AlterEnum
ALTER TYPE "KitStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "KitGrant" ADD COLUMN     "expiredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CreatorTermination" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "endDate" DATE NOT NULL,
    "scheduledById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "processedAt" TIMESTAMP(3),
    "contractDocumentId" TEXT,
    "externalId" TEXT,
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "signerEmail" TEXT,
    "body" TEXT,
    "bodySha256" TEXT,
    "signLink" TEXT,
    "sentAt" TIMESTAMP(3),
    "linkSentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "CreatorTermination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorTermination_externalId_key" ON "CreatorTermination"("externalId");

-- CreateIndex
CREATE INDEX "CreatorTermination_brandId_processedAt_idx" ON "CreatorTermination"("brandId", "processedAt");

-- CreateIndex
CREATE INDEX "CreatorTermination_creatorId_idx" ON "CreatorTermination"("creatorId");

-- AddForeignKey
ALTER TABLE "CreatorTermination" ADD CONSTRAINT "CreatorTermination_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorTermination" ADD CONSTRAINT "CreatorTermination_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorTermination" ADD CONSTRAINT "CreatorTermination_contractDocumentId_fkey" FOREIGN KEY ("contractDocumentId") REFERENCES "ContractDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "CreatorTermination" ENABLE ROW LEVEL SECURITY;

-- Uma só em aberto (não cancelada) por creator.
CREATE UNIQUE INDEX "CreatorTermination_one_open" ON "CreatorTermination"("creatorId") WHERE "cancelledAt" IS NULL;

ALTER TABLE "CreatorTermination"
  -- Cancelada não é processada (e vice-versa); quem cancelou fica gravado.
  ADD CONSTRAINT "CreatorTermination_cancel_or_process" CHECK (NOT ("cancelledAt" IS NOT NULL AND "processedAt" IS NOT NULL)),
  ADD CONSTRAINT "CreatorTermination_cancelled_by" CHECK (("cancelledAt" IS NULL) = ("cancelledById" IS NULL)),
  -- Distrato só sai depois de processado, com o texto e o documento do Autentique; assinado só se enviado.
  ADD CONSTRAINT "CreatorTermination_sent" CHECK ("sentAt" IS NULL OR ("processedAt" IS NOT NULL AND "externalId" IS NOT NULL AND "body" IS NOT NULL AND "bodySha256" IS NOT NULL AND "contractDocumentId" IS NOT NULL)),
  ADD CONSTRAINT "CreatorTermination_signed" CHECK ("signedAt" IS NULL OR "sentAt" IS NOT NULL);

-- Produto expirado tem a data (e não tem envio, pela trava KitGrant_chosen).
ALTER TABLE "KitGrant" ADD CONSTRAINT "KitGrant_expired" CHECK (("status" = 'EXPIRED') = ("expiredAt" IS NOT NULL));

-- Textos do distrato publicados em Contratos (pessoa física, empresa, ou um só).
ALTER TABLE "ContractDocument" DROP CONSTRAINT "ContractDocument_valid";
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_valid" CHECK ("kind" IN ('INFLUENCER', 'PRESCRITOR', 'UGC', 'INFLUENCER_PF', 'INFLUENCER_PJ', 'INFLUENCER_PF_1', 'INFLUENCER_PF_2', 'INFLUENCER_PJ_1', 'INFLUENCER_PJ_2', 'DISTRATO_PF', 'DISTRATO_PJ', 'DISTRATO') AND "version" > 0 AND btrim("title") <> '' AND btrim("body") <> '');
