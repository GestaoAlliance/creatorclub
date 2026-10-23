-- CreateTable
CREATE TABLE "BrandAsset" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandAsset_brandId_kind_key" ON "BrandAsset"("brandId", "kind");

-- AddForeignKey
ALTER TABLE "BrandAsset" ADD CONSTRAINT "BrandAsset_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- D-RLS
ALTER TABLE "BrandAsset" ENABLE ROW LEVEL SECURITY;

-- D-BRANDLOGIN: só logo e fundo, só imagens PNG/JPG/WebP, tamanho coerente e no limite de cada tipo.
ALTER TABLE "BrandAsset" ADD CONSTRAINT "BrandAsset_valid" CHECK (
  "kind" IN ('LOGO', 'BACKGROUND')
  AND "mime" IN ('image/png', 'image/jpeg', 'image/webp')
  AND "sizeBytes" = octet_length("bytes")
  AND "sizeBytes" <= CASE WHEN "kind" = 'LOGO' THEN 307200 ELSE 1048576 END
);
