-- D-NFCHECK: conferência da nota fiscal no pedido de saque (chave de acesso única e resultado da conferência).

-- CreateEnum
CREATE TYPE "NfCheckStatus" AS ENUM ('OK', 'MANUAL');

-- AlterTable
ALTER TABLE "Withdrawal" ADD COLUMN     "nfAccessKey" TEXT,
ADD COLUMN     "nfCheck" "NfCheckStatus";



-- Travas
ALTER TABLE "Withdrawal"
  ADD CONSTRAINT "Withdrawal_nf_access_key_format" CHECK ("nfAccessKey" IS NULL OR "nfAccessKey" ~ '^[0-9]{50}$');

-- Uma nota vale para um saque só (pedido recusado ou cancelado libera a nota para um novo pedido).
CREATE UNIQUE INDEX "Withdrawal_nf_access_key_once" ON "Withdrawal" ("nfAccessKey")
  WHERE "nfAccessKey" IS NOT NULL AND "status" IN ('REQUESTED', 'PAID');
