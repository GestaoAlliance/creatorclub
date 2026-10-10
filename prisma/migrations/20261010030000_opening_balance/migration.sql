-- E6: saldo de abertura (D-OPEN). Um lançamento de abertura por creator, no máximo.
CREATE UNIQUE INDEX "LedgerEntry_one_opening_per_creator"
  ON "LedgerEntry" ("creatorId") WHERE "type" = 'OPENING_BALANCE';

-- Conferência da Ana por creator (D-ANAREVIEW): marcada com autor.
ALTER TABLE "Creator" ADD COLUMN "reviewedAt" TIMESTAMP(3), ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "Creator"
  ADD CONSTRAINT "Creator_review_has_author" CHECK (("reviewedAt" IS NULL) = ("reviewedById" IS NULL));
