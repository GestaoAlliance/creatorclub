-- D-UGCVIDEOS: meta de vídeos da UGC no ciclo (período do contrato) e um registro por vídeo entregue.

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "ugcVideoGoal" INTEGER;

-- CreateTable
CREATE TABLE "UgcVideo" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "deliveredOn" DATE NOT NULL,
    "url" TEXT NOT NULL,
    "product" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,

    CONSTRAINT "UgcVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UgcVideo_creatorId_deliveredOn_idx" ON "UgcVideo"("creatorId", "deliveredOn");

-- AddForeignKey
ALTER TABLE "UgcVideo" ADD CONSTRAINT "UgcVideo_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UgcVideo" ADD CONSTRAINT "UgcVideo_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Travas
ALTER TABLE "Creator"
  ADD CONSTRAINT "Creator_ugc_video_goal" CHECK ("ugcVideoGoal" IS NULL OR "ugcVideoGoal" BETWEEN 1 AND 100);
ALTER TABLE "UgcVideo"
  ADD CONSTRAINT "UgcVideo_values" CHECK (
    "url" ~ '^https?://\S+$' AND length("url") <= 500
    AND ("product" IS NULL OR length("product") BETWEEN 1 AND 100)
    AND (("removedAt" IS NULL) = ("removedById" IS NULL))
  );

-- O mesmo link conta uma vez por creator (registros retirados não contam).
CREATE UNIQUE INDEX "UgcVideo_url_once" ON "UgcVideo"("creatorId", "url") WHERE "removedAt" IS NULL;

-- Nada é apagado: o registro só pode ser retirado uma vez (removedAt/removedById); o resto não muda.
CREATE FUNCTION ugc_video_only_remove() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'UgcVideo_only_remove: vídeo não é apagado, só retirado';
  END IF;
  IF OLD."removedAt" IS NOT NULL
     OR NEW."removedAt" IS NULL
     OR (NEW."id", NEW."brandId", NEW."creatorId", NEW."deliveredOn", NEW."url", NEW."product", NEW."createdById", NEW."createdAt")
        IS DISTINCT FROM (OLD."id", OLD."brandId", OLD."creatorId", OLD."deliveredOn", OLD."url", OLD."product", OLD."createdById", OLD."createdAt") THEN
    RAISE EXCEPTION 'UgcVideo_only_remove: só é possível retirar o vídeo, uma vez';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "UgcVideo_only_remove"
  BEFORE UPDATE OR DELETE ON "UgcVideo"
  FOR EACH ROW EXECUTE FUNCTION ugc_video_only_remove();

-- D-RLS
ALTER TABLE "UgcVideo" ENABLE ROW LEVEL SECURITY;
