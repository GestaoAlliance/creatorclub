-- D-PIXREF: identificador do Pix (ID da transação, E2E) informado por quem pagou; opcional, só em saque pago.
ALTER TABLE "Withdrawal" ADD COLUMN "pixReference" TEXT;
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_pix_reference" CHECK ("pixReference" IS NULL OR ("pixReference" ~ '^[A-Za-z0-9-]{4,64}$' AND status = 'PAID'));
