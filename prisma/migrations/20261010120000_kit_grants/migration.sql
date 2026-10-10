-- D-KIT: kit mensal do contrato, concedido no fechamento e escolhido pela creator no portal.

-- CreateEnum
CREATE TYPE "KitStatus" AS ENUM ('PENDING', 'CHOSEN');

-- CreateTable
CREATE TABLE "KitGrant" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "salesCents" INTEGER NOT NULL,
    "products" INTEGER NOT NULL,
    "status" "KitStatus" NOT NULL DEFAULT 'PENDING',
    "shipmentId" TEXT,
    "chosenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KitGrant_shipmentId_key" ON "KitGrant"("shipmentId");

-- CreateIndex
CREATE INDEX "KitGrant_brandId_status_idx" ON "KitGrant"("brandId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "KitGrant_creatorId_month_key" ON "KitGrant"("creatorId", "month");

-- AddForeignKey
ALTER TABLE "KitGrant" ADD CONSTRAINT "KitGrant_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitGrant" ADD CONSTRAINT "KitGrant_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitGrant" ADD CONSTRAINT "KitGrant_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Travas
ALTER TABLE "KitGrant"
  ADD CONSTRAINT "KitGrant_month_format" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT "KitGrant_values" CHECK ("products" BETWEEN 1 AND 20 AND "salesCents" >= 0),
  ADD CONSTRAINT "KitGrant_chosen" CHECK (("status" = 'CHOSEN') = ("shipmentId" IS NOT NULL AND "chosenAt" IS NOT NULL));

-- D-RLS
ALTER TABLE "KitGrant" ENABLE ROW LEVEL SECURITY;
