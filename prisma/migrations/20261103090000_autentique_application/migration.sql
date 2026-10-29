-- D-AUTENTIQUE2: contrato pelo Autentique já na candidatura (antes da aprovação).
-- AlterTable
ALTER TABLE "ContractRequest" ADD COLUMN     "applicationId" TEXT,
ADD COLUMN     "linkSentAt" TIMESTAMP(3),
ADD COLUMN     "rateBps" INTEGER,
ADD COLUMN     "signLink" TEXT,
ALTER COLUMN "creatorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CreatorApplication" ADD COLUMN     "contractError" TEXT;

-- CreateIndex
CREATE INDEX "ContractRequest_applicationId_idx" ON "ContractRequest"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorApplication_id_brandId_key" ON "CreatorApplication"("id", "brandId");

-- AddForeignKey
ALTER TABLE "ContractRequest" ADD CONSTRAINT "ContractRequest_applicationId_brandId_fkey" FOREIGN KEY ("applicationId", "brandId") REFERENCES "CreatorApplication"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Travas: o contrato é de uma candidata ou de uma creator; um contrato em aberto (esperando ou assinado) por
-- candidata; comissão do contrato em pontos-base válidos.
ALTER TABLE "ContractRequest" ADD CONSTRAINT "ContractRequest_target" CHECK ("creatorId" IS NOT NULL OR "applicationId" IS NOT NULL);
ALTER TABLE "ContractRequest" ADD CONSTRAINT "ContractRequest_rate_bps" CHECK ("rateBps" IS NULL OR ("rateBps" >= 0 AND "rateBps" <= 10000));
CREATE UNIQUE INDEX "ContractRequest_one_open_per_application" ON "ContractRequest"("applicationId") WHERE "status" IN ('SENT', 'SIGNED');
