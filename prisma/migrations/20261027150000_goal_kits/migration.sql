-- D-GOALKIT: 1 produto a cada meta de R$ 1.000 (45 dias, depois janelas de 30); substitui o kit mensal por faixa.
-- DropIndex
DROP INDEX "KitGrant_creatorId_kind_month_key";

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "goalStartAt" DATE;

-- AlterTable
ALTER TABLE "KitGrant" ADD COLUMN     "window" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "KitGrant_creatorId_kind_month_window_key" ON "KitGrant"("creatorId", "kind", "month", "window");


-- Tipo GOAL; só a meta usa o número da janela; boas-vindas sem vendas.
ALTER TABLE "KitGrant" DROP CONSTRAINT "KitGrant_kind";
ALTER TABLE "KitGrant"
  ADD CONSTRAINT "KitGrant_kind" CHECK (
    "kind" IN ('MONTHLY', 'WELCOME', 'GOAL') AND ("kind" <> 'WELCOME' OR "salesCents" = 0) AND ("window" >= 0) AND ("kind" = 'GOAL' OR "window" = 0)
  );

-- Quem já é creator conta a partir de hoje (decisão do responsável, 2026-10-27).
UPDATE "Creator" SET "goalStartAt" = DATE '2026-10-27' WHERE "goalStartAt" IS NULL;
