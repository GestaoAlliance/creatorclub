-- D-CONTRACT: regras do contrato. Comissão liberada no fechamento do mês quando as vendas acumuladas atingem o mínimo
-- (R$ 500 influencer/UGC, R$ 1.000 prescritor); saque com NF do dia 1 ao 10, valor total disponível, sem mínimo por pedido.

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "releaseMinCents" INTEGER NOT NULL DEFAULT 50000,
ADD COLUMN     "releaseMinPrescriberCents" INTEGER NOT NULL DEFAULT 100000,
ALTER COLUMN "withdrawalMinCents" SET DEFAULT 1,
ALTER COLUMN "withdrawalWindowStartDay" SET DEFAULT 1,
ALTER COLUMN "withdrawalWindowEndDay" SET DEFAULT 10;

-- CreateTable
CREATE TABLE "CommissionRelease" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "salesCents" INTEGER NOT NULL,
    "minCents" INTEGER NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthClosing" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "releases" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionRelease_brandId_month_idx" ON "CommissionRelease"("brandId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRelease_creatorId_month_key" ON "CommissionRelease"("creatorId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthClosing_brandId_month_key" ON "MonthClosing"("brandId", "month");

-- AddForeignKey
ALTER TABLE "CommissionRelease" ADD CONSTRAINT "CommissionRelease_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRelease" ADD CONSTRAINT "CommissionRelease_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthClosing" ADD CONSTRAINT "MonthClosing_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Travas
ALTER TABLE "Brand"
  ADD CONSTRAINT "Brand_releaseMin_positive" CHECK ("releaseMinCents" > 0 AND "releaseMinPrescriberCents" > 0);
ALTER TABLE "CommissionRelease"
  ADD CONSTRAINT "CommissionRelease_month_format" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT "CommissionRelease_reached_min" CHECK ("minCents" > 0 AND "salesCents" >= "minCents");
ALTER TABLE "MonthClosing"
  ADD CONSTRAINT "MonthClosing_month_format" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT "MonthClosing_releases_nonneg" CHECK ("releases" >= 0);

CREATE TRIGGER "CommissionRelease_append_only"
  BEFORE UPDATE OR DELETE ON "CommissionRelease"
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
CREATE TRIGGER "MonthClosing_append_only"
  BEFORE UPDATE OR DELETE ON "MonthClosing"
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- D-RLS
ALTER TABLE "CommissionRelease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MonthClosing" ENABLE ROW LEVEL SECURITY;

-- Marcas já cadastradas passam para as regras do contrato.
UPDATE "Brand" SET "withdrawalMinCents" = 1, "withdrawalWindowStartDay" = 1, "withdrawalWindowEndDay" = 10;
