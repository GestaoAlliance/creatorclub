-- D-ADJUST: ajuste manual de saldo sempre com motivo e com quem lançou.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_adjustment_has_reason" CHECK (
  "type" <> 'ADJUSTMENT' OR ("note" IS NOT NULL AND btrim("note") <> '' AND "createdById" IS NOT NULL));
