-- D-REMESSA (reunião de 2026-10-27; respostas do responsável em 2026-10-28): arquivo de remessa CNAB 240 (Pix,
-- forma de lançamento 45) para o SICOOB com os saques aprovados. A conta da marca vem de Marcas (nada no código);
-- cada remessa guarda número sequencial, data de pagamento, quantidade, total e o hash do arquivo; os saques ficam
-- marcados como enviados ao banco. O Pagamento marca como pagos depois que o banco processa.

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "bankAccountDv" TEXT,
ADD COLUMN     "bankAgency" TEXT,
ADD COLUMN     "bankAgencyDv" TEXT,
ADD COLUMN     "bankConvenio" TEXT,
ADD COLUMN     "remittanceSeq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Withdrawal" ADD COLUMN     "remittanceId" TEXT;

-- CreateTable
CREATE TABLE "PaymentRemittance" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "nsa" INTEGER NOT NULL,
    "payDay" DATE NOT NULL,
    "count" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRemittance_brandId_nsa_key" ON "PaymentRemittance"("brandId", "nsa");

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "PaymentRemittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRemittance" ADD CONSTRAINT "PaymentRemittance_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "PaymentRemittance" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "PaymentRemittance"
  ADD CONSTRAINT "PaymentRemittance_values" CHECK ("nsa" > 0 AND "count" > 0 AND "totalCents" > 0 AND "sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "Brand"
  ADD CONSTRAINT "Brand_remittanceSeq" CHECK ("remittanceSeq" >= 0);

-- Remessa gerada não muda nem some.
CREATE TRIGGER "PaymentRemittance_insert_only"
  BEFORE UPDATE OR DELETE ON "PaymentRemittance"
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
