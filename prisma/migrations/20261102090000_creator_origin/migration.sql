-- D-ORIGIN (respostas do responsável em 2026-10-29): de onde cada creator veio. Com candidatura, vale a dela
-- (formulário, hunter); sem candidatura (importadas), a Gestão marca na ficha.

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "originHunterId" TEXT,
ADD COLUMN     "originKind" TEXT,
ADD COLUMN     "originNote" TEXT;

-- AddForeignKey
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_originHunterId_fkey" FOREIGN KEY ("originHunterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Creator"
  ADD CONSTRAINT "Creator_origin" CHECK (
    ("originKind" IS NULL AND "originHunterId" IS NULL AND "originNote" IS NULL)
    OR ("originKind" IS NOT NULL AND "originKind" IN ('HUNTER', 'CAPTACAO', 'SITE', 'INDICACAO', 'PROSPECCAO', 'OUTRO')
        AND ("originHunterId" IS NULL OR "originKind" = 'HUNTER')
        AND ("originNote" IS NULL OR length(btrim("originNote")) BETWEEN 1 AND 200))
  );
