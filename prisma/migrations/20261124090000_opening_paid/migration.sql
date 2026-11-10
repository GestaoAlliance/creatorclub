-- D-OPENINGPAID: quanto cada creator já recebeu por fora (comprovantes), preparado antes de aprovar o saldo de abertura.
CREATE TABLE "OpeningPaid" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "paidCents" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "preparedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpeningPaid_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpeningPaid_creatorId_key" ON "OpeningPaid"("creatorId");

ALTER TABLE "OpeningPaid" ADD CONSTRAINT "OpeningPaid_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpeningPaid" ADD CONSTRAINT "OpeningPaid_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OpeningPaid" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OpeningPaid" ADD CONSTRAINT "OpeningPaid_paid_cents" CHECK ("paidCents" >= 0);
ALTER TABLE "OpeningPaid" ADD CONSTRAINT "OpeningPaid_note" CHECK (length(btrim("note")) BETWEEN 1 AND 300);
