-- E8: decisão do saque (D-WDDECIDE). Sem mudança de colunas; só travas.

-- Saque decidido (pago, recusado ou cancelado) sempre tem autor; recusado sempre tem motivo.
ALTER TABLE "Withdrawal"
  ADD CONSTRAINT "Withdrawal_decided_has_author" CHECK ("status" = 'REQUESTED' OR "decidedById" IS NOT NULL),
  ADD CONSTRAINT "Withdrawal_rejected_has_note" CHECK ("status" <> 'REJECTED' OR btrim(coalesce("note", '')) <> '');

-- Um saque pago sai do extrato uma vez só.
CREATE UNIQUE INDEX "LedgerEntry_one_payment_per_withdrawal"
  ON "LedgerEntry" ("withdrawalId") WHERE "type" = 'WITHDRAWAL';
