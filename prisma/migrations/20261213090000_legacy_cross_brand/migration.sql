-- D-LEGACYCROSS (2026-11-24): a busca de cada marca lê também as contas do Autentique das outras (o mesmo documento pode ser
-- lido por duas marcas: único por marca) e guarda de qual conta veio.
-- DropIndex
DROP INDEX "AutentiqueLegacyContract_externalId_key";

-- AlterTable
ALTER TABLE "AutentiqueLegacyContract" ADD COLUMN     "sourceBrandId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AutentiqueLegacyContract_brandId_externalId_key" ON "AutentiqueLegacyContract"("brandId", "externalId");

