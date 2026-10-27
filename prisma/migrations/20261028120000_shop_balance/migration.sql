-- M5.1 (D-SHOPBALANCE): loja com o saldo — preço do produto, desconto da creator por marca, compra que reserva o saldo.
-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'PURCHASE';

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "shopDiscountBps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "priceCents" INTEGER;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "balanceCents" INTEGER;


-- Travas: desconto entre 0% e 90%; preço e valor da compra positivos.
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_shopDiscount" CHECK ("shopDiscountBps" BETWEEN 0 AND 9000);
ALTER TABLE "Product" ADD CONSTRAINT "Product_price" CHECK ("priceCents" IS NULL OR "priceCents" >= 0);
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_balance" CHECK ("balanceCents" IS NULL OR "balanceCents" > 0);

-- Compra com o saldo é débito, com o que foi comprado na nota. (Comparação como texto: o valor novo do enum não pode
-- ser usado na mesma transação em que foi criado.)
ALTER TABLE "LedgerEntry" DROP CONSTRAINT "LedgerEntry_sign_by_type";
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_sign_by_type" CHECK (
  ("type" = 'COMMISSION' AND "amountCents" > 0)
  OR ("type" = 'REVERSAL' AND "amountCents" < 0)
  OR ("type" = 'WITHDRAWAL' AND "amountCents" < 0)
  OR ("type" IN ('ADJUSTMENT', 'OPENING_BALANCE'))
  OR ("type"::text = 'PRIZE' AND "amountCents" > 0 AND "note" IS NOT NULL AND btrim("note") <> '' AND "createdById" IS NOT NULL)
  OR ("type"::text = 'PURCHASE' AND "amountCents" < 0 AND "note" IS NOT NULL AND btrim("note") <> '' AND "createdById" IS NOT NULL));
