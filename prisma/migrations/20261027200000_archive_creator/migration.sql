-- D-ARCHIVECREATOR: creator arquivada some das telas (nada é apagado).
-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT;


-- Arquivada sempre fica desligada e com quem arquivou.
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_archived" CHECK ("archivedAt" IS NULL OR ("status" = 'DEACTIVATED' AND "archivedById" IS NOT NULL));
