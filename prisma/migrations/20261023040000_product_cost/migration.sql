-- M3.2 (D-COST): custo dos produtos (Shopify), produto de cada linha do pedido e frete dos envios.
-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "productShopifyId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "costCents" INTEGER,
ADD COLUMN     "costSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "freightCents" INTEGER;


-- Travas
ALTER TABLE "Product" ADD CONSTRAINT "Product_cost_not_negative" CHECK ("costCents" IS NULL OR "costCents" >= 0);
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_freight_not_negative" CHECK ("freightCents" IS NULL OR "freightCents" >= 0);
