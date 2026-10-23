-- AlterTable
ALTER TABLE "CreatorAccount" ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "kwai" TEXT,
ADD COLUMN     "mediaKitUrl" TEXT,
ADD COLUMN     "niches" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "professionalId" TEXT,
ADD COLUMN     "youtube" TEXT;


-- D-PROFILEFIELDS: tamanhos e mídia kit só com endereço https.
ALTER TABLE "CreatorAccount" ADD CONSTRAINT "CreatorAccount_profile" CHECK (
  char_length(coalesce("professionalId", '')) <= 40 AND char_length(coalesce("allergies", '')) <= 300
  AND ("mediaKitUrl" IS NULL OR "mediaKitUrl" ~ '^https://') AND cardinality("niches") <= 10
);
