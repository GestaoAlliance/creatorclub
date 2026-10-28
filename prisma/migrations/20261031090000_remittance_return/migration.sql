-- D-RETORNO (respostas do responsável em 2026-10-28): o Pagamento sobe o arquivo de retorno do SICOOB, confere a
-- prévia e confirma. "00" marca como pago; "BD" mostra agendado; recusa tira o saque da remessa (vai na próxima),
-- guarda o motivo e avisa a creator no portal.

-- CreateEnum
CREATE TYPE "BankResult" AS ENUM ('SCHEDULED', 'PENDING', 'REJECTED');

-- AlterTable
ALTER TABLE "Withdrawal" ADD COLUMN     "bankAt" TIMESTAMP(3),
ADD COLUMN     "bankNote" TEXT,
ADD COLUMN     "bankResult" "BankResult";


ALTER TABLE "Withdrawal"
  ADD CONSTRAINT "Withdrawal_bank_result" CHECK (
    "bankResult" IS NULL OR ("bankAt" IS NOT NULL AND ("bankResult" <> 'REJECTED' OR btrim(coalesce("bankNote", '')) <> ''))
  );

ALTER TABLE "Notification" DROP CONSTRAINT "Notification_valid";
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_valid" CHECK (
    "kind" IN ('COMMISSION_RELEASED', 'KIT_AVAILABLE', 'SHIPPED', 'WITHDRAWAL_PAID', 'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'FIRST_SALE',
               'WITHDRAWAL_WINDOW', 'NEAR_MINIMUM', 'CONTRACT_ENDING', 'IDLE', 'WITHDRAWAL_BANK_REJECTED')
    AND btrim("title") <> '' AND btrim("body") <> '' AND btrim("dedupeKey") <> ''
    AND ("href" IS NULL OR "href" ~ '^/portal/')
  );
