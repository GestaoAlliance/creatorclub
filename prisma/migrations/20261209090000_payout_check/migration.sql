-- D-PAYCHECK: conferência do valor a receber antes de liberar o saque. Só inserção; o último registro vale.
CREATE TYPE "PayoutCheckStatus" AS ENUM ('CHECKED', 'REVIEW');

CREATE TABLE "PayoutCheck" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "PayoutCheckStatus" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "expectedCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayoutCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PayoutCheck_creatorId_month_createdAt_idx" ON "PayoutCheck"("creatorId", "month", "createdAt");
CREATE INDEX "PayoutCheck_brandId_month_idx" ON "PayoutCheck"("brandId", "month");
ALTER TABLE "PayoutCheck" ADD CONSTRAINT "PayoutCheck_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutCheck" ADD CONSTRAINT "PayoutCheck_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayoutCheck" ADD CONSTRAINT "PayoutCheck_valid" CHECK ("month" ~ '^\d{4}-(0[1-9]|1[0-2])$' AND "amountCents" >= 0 AND "expectedCents" >= 0 AND ("note" IS NULL OR char_length("note") <= 2000));
CREATE TRIGGER "PayoutCheck_insert_only" BEFORE UPDATE OR DELETE ON "PayoutCheck" FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
