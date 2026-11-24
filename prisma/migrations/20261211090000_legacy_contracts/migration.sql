-- D-LEGACYCONTRACT (2026-11-24): contratos assinados no Autentique antes do Creator Club, ligados às creators.
-- CreateTable
CREATE TABLE "AutentiqueLegacyContract" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "signerNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signerEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "creatorId" TEXT,
    "matchedBy" TEXT,
    "candidateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fileId" TEXT,
    "fileError" TEXT,
    "fileAttempts" INTEGER NOT NULL DEFAULT 0,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutentiqueLegacyContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutentiqueLegacyContract_externalId_key" ON "AutentiqueLegacyContract"("externalId");

-- CreateIndex
CREATE INDEX "AutentiqueLegacyContract_brandId_status_idx" ON "AutentiqueLegacyContract"("brandId", "status");

-- CreateIndex
CREATE INDEX "AutentiqueLegacyContract_creatorId_idx" ON "AutentiqueLegacyContract"("creatorId");

-- AddForeignKey
ALTER TABLE "AutentiqueLegacyContract" ADD CONSTRAINT "AutentiqueLegacyContract_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutentiqueLegacyContract" ADD CONSTRAINT "AutentiqueLegacyContract_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutentiqueLegacyContract" ADD CONSTRAINT "AutentiqueLegacyContract_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "AutentiqueLegacyContract" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "AutentiqueLegacyContract"
  ADD CONSTRAINT "AutentiqueLegacyContract_status" CHECK ("status" IN ('MATCHED', 'AMBIGUOUS', 'UNMATCHED', 'IGNORED')),
  -- Ligado tem a creator e o jeito como foi ligado; os outros não têm creator.
  ADD CONSTRAINT "AutentiqueLegacyContract_matched" CHECK ((("status" = 'MATCHED') = ("creatorId" IS NOT NULL)) AND (("creatorId" IS NULL) = ("matchedBy" IS NULL))),
  ADD CONSTRAINT "AutentiqueLegacyContract_matched_by" CHECK ("matchedBy" IS NULL OR "matchedBy" IN ('EMAIL', 'NAME', 'TEAM')),
  ADD CONSTRAINT "AutentiqueLegacyContract_file" CHECK ("fileId" IS NULL OR "status" = 'MATCHED');
