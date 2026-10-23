-- CreateTable
CREATE TABLE "CreatorPost" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "postedDay" TEXT NOT NULL,
    "campaignId" TEXT,
    "createdById" TEXT NOT NULL,
    "byStaff" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,

    CONSTRAINT "CreatorPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreatorPost_brandId_postedDay_idx" ON "CreatorPost"("brandId", "postedDay");

-- CreateIndex
CREATE INDEX "CreatorPost_creatorId_postedDay_idx" ON "CreatorPost"("creatorId", "postedDay");

-- AddForeignKey
ALTER TABLE "CreatorPost" ADD CONSTRAINT "CreatorPost_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorPost" ADD CONSTRAINT "CreatorPost_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorPost" ADD CONSTRAINT "CreatorPost_campaignId_brandId_fkey" FOREIGN KEY ("campaignId", "brandId") REFERENCES "Campaign"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- D-RLS
ALTER TABLE "CreatorPost" ENABLE ROW LEVEL SECURITY;

-- D-POSTS: link https, plataforma conhecida, dia válido, retirada com quem tirou.
ALTER TABLE "CreatorPost" ADD CONSTRAINT "CreatorPost_valid" CHECK (
  "url" ~ '^https://' AND char_length("url") <= 500
  AND "platform" IN ('INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'KWAI', 'OUTRO')
  AND "postedDay" ~ '^\d{4}-\d{2}-\d{2}$'
  AND (("removedAt" IS NULL) = ("removedById" IS NULL))
);
