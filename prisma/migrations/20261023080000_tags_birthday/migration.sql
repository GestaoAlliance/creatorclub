-- AlterTable
ALTER TABLE "CreatorAccount" ADD COLUMN     "birthDate" DATE;

-- AlterTable
ALTER TABLE "CreatorApplication" ADD COLUMN     "birthDate" DATE;

-- CreateTable
CREATE TABLE "CreatorTag" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "CreatorTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorTagLink" (
    "creatorId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "CreatorTagLink_pkey" PRIMARY KEY ("creatorId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorTag_brandId_key_key" ON "CreatorTag"("brandId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorTag_id_brandId_key" ON "CreatorTag"("id", "brandId");

-- CreateIndex
CREATE INDEX "CreatorTagLink_tagId_idx" ON "CreatorTagLink"("tagId");

-- AddForeignKey
ALTER TABLE "CreatorTag" ADD CONSTRAINT "CreatorTag_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorTagLink" ADD CONSTRAINT "CreatorTagLink_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorTagLink" ADD CONSTRAINT "CreatorTagLink_tagId_brandId_fkey" FOREIGN KEY ("tagId", "brandId") REFERENCES "CreatorTag"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- D-RLS
ALTER TABLE "CreatorTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreatorTagLink" ENABLE ROW LEVEL SECURITY;

-- D-TAGS: nome preenchido e curto; nascimento num intervalo plausível.
ALTER TABLE "CreatorTag" ADD CONSTRAINT "CreatorTag_name" CHECK (btrim("name") <> '' AND char_length("name") <= 30 AND "key" <> '');
ALTER TABLE "CreatorAccount" ADD CONSTRAINT "CreatorAccount_birthDate" CHECK ("birthDate" IS NULL OR "birthDate" >= DATE '1900-01-01');
ALTER TABLE "CreatorApplication" ADD CONSTRAINT "CreatorApplication_birthDate" CHECK ("birthDate" IS NULL OR "birthDate" >= DATE '1900-01-01');
