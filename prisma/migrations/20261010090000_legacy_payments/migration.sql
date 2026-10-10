-- D-LEGACYPAY: pagamentos feitos antes do Creator Club (planilha da equipe), só valores; evidência do saldo de abertura.

-- CreateTable
CREATE TABLE "LegacyPayment" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "salesCents" INTEGER NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT NOT NULL,

    CONSTRAINT "LegacyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegacyPayment_creatorId_idx" ON "LegacyPayment"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyPayment_brandId_source_sourceRef_key" ON "LegacyPayment"("brandId", "source", "sourceRef");

-- AddForeignKey
ALTER TABLE "LegacyPayment" ADD CONSTRAINT "LegacyPayment_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyPayment" ADD CONSTRAINT "LegacyPayment_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Travas
ALTER TABLE "LegacyPayment"
  ADD CONSTRAINT "LegacyPayment_month_format" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT "LegacyPayment_amounts" CHECK ("amountCents" > 0 AND "salesCents" >= 0 AND "rateBps" BETWEEN 0 AND 10000);

CREATE TRIGGER "LegacyPayment_append_only"
  BEFORE UPDATE OR DELETE ON "LegacyPayment"
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- D-RLS
ALTER TABLE "LegacyPayment" ENABLE ROW LEVEL SECURITY;
