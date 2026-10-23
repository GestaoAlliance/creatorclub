-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('FIRST_MESSAGE', 'FOLLOW_UP', 'FORM_SENT', 'SIGNED_UP', 'DECLINED');

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "prospectFirstMessage" TEXT,
ADD COLUMN     "prospectProposalMessage" TEXT;

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "approachedOn" DATE NOT NULL,
    "status" "ProspectStatus" NOT NULL DEFAULT 'FIRST_MESSAGE',
    "statusAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "applicationId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prospect_brandId_ownerId_idx" ON "Prospect"("brandId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_brandId_handle_key" ON "Prospect"("brandId", "handle");

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CreatorApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- U6 (D-PROSPECT): travas e RLS (D-RLS).
ALTER TABLE "Prospect" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_handle_format" CHECK ("handle" ~ '^[a-z0-9._]{2,30}$');
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_note_length" CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 500);
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_source" CHECK ("source" IN ('manual', 'sheet_import'));
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_application_signed_up" CHECK ("applicationId" IS NULL OR "status"::text = 'SIGNED_UP');
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_prospect_messages" CHECK (
  ("prospectFirstMessage" IS NULL OR char_length("prospectFirstMessage") BETWEEN 1 AND 2000)
  AND ("prospectProposalMessage" IS NULL OR char_length("prospectProposalMessage") BETWEEN 1 AND 2000)
);
