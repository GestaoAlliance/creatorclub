-- DropIndex
DROP INDEX "KitGrant_creatorId_month_key";

-- AlterTable
ALTER TABLE "ContractTemplate" ADD COLUMN     "welcomeProducts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "KitGrant" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'MONTHLY';

-- CreateIndex
CREATE UNIQUE INDEX "KitGrant_creatorId_kind_month_key" ON "KitGrant"("creatorId", "kind", "month");


-- Travas (D-WELCOMEKIT): tipos conhecidos; boas-vindas não vem de vendas; quantidade de 0 a 20.
ALTER TABLE "KitGrant"
  ADD CONSTRAINT "KitGrant_kind" CHECK ("kind" IN ('MONTHLY', 'WELCOME') AND ("kind" = 'MONTHLY' OR "salesCents" = 0));
ALTER TABLE "ContractTemplate"
  ADD CONSTRAINT "ContractTemplate_welcomeProducts" CHECK ("welcomeProducts" BETWEEN 0 AND 20);

-- Quantidade do início da parceria, como nos textos do contrato: influencer 1, prescritor 2, UGC 3.
UPDATE "ContractTemplate" SET "welcomeProducts" = CASE "documentKind" WHEN 'PRESCRITOR' THEN 2 WHEN 'UGC' THEN 3 ELSE 1 END;
