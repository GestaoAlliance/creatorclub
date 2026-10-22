-- D-SIGNUPACCOUNT: o cadastro do site já cria a conta com login; a inscrição fica ligada a ela. TikTok novo.
ALTER TABLE "CreatorAccount" ADD COLUMN "tiktok" TEXT;
ALTER TABLE "CreatorApplication" ADD COLUMN "tiktok" TEXT;
ALTER TABLE "CreatorApplication" ADD COLUMN "accountId" TEXT;
CREATE INDEX "CreatorApplication_accountId_idx" ON "CreatorApplication"("accountId");
ALTER TABLE "CreatorApplication" ADD CONSTRAINT "CreatorApplication_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreatorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
