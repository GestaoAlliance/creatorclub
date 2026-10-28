-- D-INSTAGRAM (M5.3; respostas do responsável em 2026-10-28): leitura diária do Instagram das creators ativas pela
-- API oficial da Meta, usando a conta profissional da marca (business_discovery), e dos posts que marcam a marca.
-- Só a equipe vê. Token do usuário do sistema fica na Vercel (META_SYSTEM_TOKEN), nunca aqui.

-- CreateEnum
CREATE TYPE "InstagramStatus" AS ENUM ('OK', 'UNREADABLE');

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "instagramUserId" TEXT;

-- CreateTable
CREATE TABLE "InstagramSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "handle" TEXT NOT NULL,
    "status" "InstagramStatus" NOT NULL,
    "followers" INTEGER,
    "mediaCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramPost" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "mediaType" TEXT NOT NULL,
    "productType" TEXT,
    "likes" INTEGER,
    "comments" INTEGER,
    "caption" TEXT,
    "permalink" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramTag" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "permalink" TEXT NOT NULL,
    "likes" INTEGER,
    "comments" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramSnapshot_accountId_day_key" ON "InstagramSnapshot"("accountId", "day");

-- CreateIndex
CREATE INDEX "InstagramPost_accountId_postedAt_idx" ON "InstagramPost"("accountId", "postedAt");

-- CreateIndex
CREATE INDEX "InstagramTag_brandId_postedAt_idx" ON "InstagramTag"("brandId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramTag_brandId_mediaId_key" ON "InstagramTag"("brandId", "mediaId");

-- AddForeignKey
ALTER TABLE "InstagramSnapshot" ADD CONSTRAINT "InstagramSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreatorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramPost" ADD CONSTRAINT "InstagramPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreatorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramTag" ADD CONSTRAINT "InstagramTag_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



ALTER TABLE "InstagramSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstagramPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstagramTag" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "InstagramSnapshot"
  ADD CONSTRAINT "InstagramSnapshot_values" CHECK (
    "handle" ~ '^[a-z0-9._]{1,30}$'
    AND ("status" <> 'OK' OR ("followers" IS NOT NULL AND "followers" >= 0 AND "mediaCount" IS NOT NULL AND "mediaCount" >= 0))
  );
ALTER TABLE "InstagramPost"
  ADD CONSTRAINT "InstagramPost_values" CHECK (("likes" IS NULL OR "likes" >= 0) AND ("comments" IS NULL OR "comments" >= 0));
ALTER TABLE "InstagramTag"
  ADD CONSTRAINT "InstagramTag_values" CHECK (("likes" IS NULL OR "likes" >= 0) AND ("comments" IS NULL OR "comments" >= 0));
ALTER TABLE "Brand"
  ADD CONSTRAINT "Brand_instagramUserId" CHECK ("instagramUserId" IS NULL OR "instagramUserId" ~ '^[0-9]{5,30}$');

-- Leitura gravada não muda nem some (histórico de seguidores).
CREATE TRIGGER "InstagramSnapshot_insert_only"
  BEFORE UPDATE OR DELETE ON "InstagramSnapshot"
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- Botanika: @botanikabrasil (conta profissional ligada ao app "Creator Club", conferida em 2026-10-28).
UPDATE "Brand" SET "instagramUserId" = '17841477932297256' WHERE "slug" = 'botanika';
