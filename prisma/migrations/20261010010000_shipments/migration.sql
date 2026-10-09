-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "CreatorAccount" ADD COLUMN     "addrCity" TEXT,
ADD COLUMN     "addrComplement" TEXT,
ADD COLUMN     "addrDistrict" TEXT,
ADD COLUMN     "addrNumber" TEXT,
ADD COLUMN     "addrState" TEXT,
ADD COLUMN     "addrStreet" TEXT,
ADD COLUMN     "addrZip" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PREPARING',
    "note" TEXT,
    "address" JSONB NOT NULL,
    "carrier" TEXT,
    "trackingCode" TEXT,
    "createdById" TEXT NOT NULL,
    "shippedAt" TIMESTAMP(3),
    "shippedById" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "deliveredBy" TEXT,
    "deliveredById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_brandId_shopifyId_key" ON "Product"("brandId", "shopifyId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_brandId_key" ON "Product"("id", "brandId");

-- CreateIndex
CREATE INDEX "Shipment_brandId_status_createdAt_idx" ON "Shipment"("brandId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_creatorId_createdAt_idx" ON "Shipment"("creatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_id_brandId_key" ON "Shipment"("id", "brandId");

-- CreateIndex
CREATE INDEX "ShipmentItem_shipmentId_idx" ON "ShipmentItem"("shipmentId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_brandId_fkey" FOREIGN KEY ("shipmentId", "brandId") REFERENCES "Shipment"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_productId_brandId_fkey" FOREIGN KEY ("productId", "brandId") REFERENCES "Product"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- D-RLS
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Shipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShipmentItem" ENABLE ROW LEVEL SECURITY;

-- Travas (D-SHIPMENTS)
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_status_dates" CHECK (
  ("status" IN ('SHIPPED', 'DELIVERED') OR "shippedAt" IS NULL OR "status" = 'CANCELLED')
  AND ("status" NOT IN ('SHIPPED', 'DELIVERED') OR ("shippedAt" IS NOT NULL AND "shippedById" IS NOT NULL AND "trackingCode" IS NOT NULL AND btrim("trackingCode") <> ''))
  AND (("status" = 'DELIVERED') = ("deliveredAt" IS NOT NULL))
  AND ("deliveredAt" IS NULL OR "deliveredBy" IN ('STAFF', 'CREATOR'))
  AND (("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL AND "cancelledById" IS NOT NULL))
);
ALTER TABLE "CreatorAccount" ADD CONSTRAINT "CreatorAccount_addr_state_uf" CHECK ("addrState" IS NULL OR "addrState" ~ '^[A-Z]{2}$');
ALTER TABLE "CreatorAccount" ADD CONSTRAINT "CreatorAccount_addr_zip" CHECK ("addrZip" IS NULL OR "addrZip" ~ '^[0-9]{8}$');
