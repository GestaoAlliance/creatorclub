-- D-PAIDLIST: pagamentos feitos antes do Creator Club (um por Pix), para o histórico "Pagos". Só inserção.
CREATE TABLE "LegacyPayout" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidOn" DATE NOT NULL,
    "note" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegacyPayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LegacyPayout_brandId_paidOn_idx" ON "LegacyPayout"("brandId", "paidOn");
ALTER TABLE "LegacyPayout" ADD CONSTRAINT "LegacyPayout_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegacyPayout" ADD CONSTRAINT "LegacyPayout_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegacyPayout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LegacyPayout" ADD CONSTRAINT "LegacyPayout_valid" CHECK ("amountCents" > 0 AND char_length(btrim("note")) BETWEEN 3 AND 500);
CREATE TRIGGER "LegacyPayout_insert_only" BEFORE UPDATE OR DELETE ON "LegacyPayout" FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
