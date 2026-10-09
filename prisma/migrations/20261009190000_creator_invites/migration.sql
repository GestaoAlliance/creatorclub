-- CreateTable
CREATE TABLE "CreatorInvite" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorInvite_tokenHash_key" ON "CreatorInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "CreatorInvite_accountId_idx" ON "CreatorInvite"("accountId");

-- AddForeignKey
ALTER TABLE "CreatorInvite" ADD CONSTRAINT "CreatorInvite_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreatorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Travas (E2.5)
ALTER TABLE "CreatorInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreatorInvite"
  ADD CONSTRAINT "CreatorInvite_accepted_has_user" CHECK (("acceptedAt" IS NULL) = ("acceptedUserId" IS NULL));
