-- M3.3 (D-RETURN): id da cliente do pedido (só o id da Shopify), para clientes novas × recorrentes.
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerShopifyId" TEXT;

-- CreateIndex
CREATE INDEX "Order_brandId_customerShopifyId_idx" ON "Order"("brandId", "customerShopifyId");

