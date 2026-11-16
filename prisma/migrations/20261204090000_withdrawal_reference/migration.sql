-- D-PAYFLOW: mês da comissão que a nota paga e a conta da nota no pedido.
ALTER TABLE "Withdrawal" ADD COLUMN "referenceMonth" TEXT;
ALTER TABLE "Withdrawal" ADD COLUMN "breakdown" JSONB;
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_reference_month" CHECK ("referenceMonth" IS NULL OR "referenceMonth" ~ '^\d{4}-(0[1-9]|1[0-2])$');
-- Pedidos de antes: a nota da janela paga a comissão do mês anterior ao pedido (Guia de Pagamentos), no fuso de São Paulo.
UPDATE "Withdrawal" SET "referenceMonth" = to_char(("requestedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') - interval '1 month', 'YYYY-MM') WHERE "referenceMonth" IS NULL;
CREATE INDEX "Withdrawal_brandId_referenceMonth_idx" ON "Withdrawal"("brandId", "referenceMonth");
