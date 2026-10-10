-- D-PFRECEIPT: creator pessoa física saca com recibo aceito no portal (no lugar da nota) e Pix.

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'RECEIPT_PIX';

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "legalName" TEXT;

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "receivesAsIndividual" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WithdrawalReceipt" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalReceipt_withdrawalId_key" ON "WithdrawalReceipt"("withdrawalId");

-- AddForeignKey
ALTER TABLE "WithdrawalReceipt" ADD CONSTRAINT "WithdrawalReceipt_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Travas
ALTER TABLE "WithdrawalReceipt"
  ADD CONSTRAINT "WithdrawalReceipt_values" CHECK ("cpf" ~ '^[0-9]{11}$' AND btrim("fullName") <> '' AND btrim("body") <> '');

-- O recibo é prova: só recebe inserções.
CREATE TRIGGER "WithdrawalReceipt_append_only"
  BEFORE UPDATE OR DELETE ON "WithdrawalReceipt"
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- D-RLS
ALTER TABLE "WithdrawalReceipt" ENABLE ROW LEVEL SECURITY;

-- Razão social da Botanika (como nas notas fiscais), usada no recibo.
UPDATE "Brand" SET "legalName" = 'BOTANIKA SAUDE NATURAL LTDA' WHERE "slug" = 'botanika';
