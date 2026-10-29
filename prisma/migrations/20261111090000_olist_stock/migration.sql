-- D-OLIST: SKU do produto (Shopify) e estoque lido do Olist ERP.
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sku" TEXT,
ADD COLUMN     "stockError" TEXT,
ADD COLUMN     "stockQty" INTEGER,
ADD COLUMN     "stockSyncedAt" TIMESTAMP(3);

