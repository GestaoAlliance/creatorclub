-- D-CHECKLIST: contrato (vigência) e checklist da Central na ficha; Instagram na conta; campos de UGC até o módulo UGC.

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "checklistNote" TEXT,
ADD COLUMN     "contractEnd" DATE,
ADD COLUMN     "contractSigned" BOOLEAN,
ADD COLUMN     "contractStart" DATE,
ADD COLUMN     "couponRegistered" BOOLEAN,
ADD COLUMN     "followsOnInstagram" BOOLEAN,
ADD COLUMN     "inGroup" BOOLEAN,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "tagged" BOOLEAN,
ADD COLUMN     "ugcFolderUrl" TEXT,
ADD COLUMN     "ugcOrder" TEXT,
ADD COLUMN     "ugcVideoStatus" TEXT;

-- AlterTable
ALTER TABLE "CreatorAccount" ADD COLUMN     "instagram" TEXT;


-- Travas
ALTER TABLE "Creator"
  ADD CONSTRAINT "Creator_contract_period" CHECK ("contractStart" IS NULL OR "contractEnd" IS NULL OR "contractEnd" > "contractStart");
