-- D-SHIPREVIEW: avaliação do envio pela creator depois do "Recebi" (nota de 1 a 5 e comentário curto). Uma por envio;
-- só inserção (nada é apagado nem editado).
CREATE TABLE "ShipmentReview" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShipmentReview_shipmentId_key" ON "ShipmentReview"("shipmentId");
CREATE UNIQUE INDEX "ShipmentReview_shipmentId_brandId_key" ON "ShipmentReview"("shipmentId", "brandId");
CREATE INDEX "ShipmentReview_brandId_createdAt_idx" ON "ShipmentReview"("brandId", "createdAt");
ALTER TABLE "ShipmentReview" ADD CONSTRAINT "ShipmentReview_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentReview" ADD CONSTRAINT "ShipmentReview_shipmentId_brandId_fkey" FOREIGN KEY ("shipmentId", "brandId") REFERENCES "Shipment"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentReview" ADD CONSTRAINT "ShipmentReview_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShipmentReview" ADD CONSTRAINT "ShipmentReview_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "ShipmentReview" ADD CONSTRAINT "ShipmentReview_comment_size" CHECK ("comment" IS NULL OR (char_length(btrim("comment")) BETWEEN 1 AND 280));
CREATE TRIGGER "ShipmentReview_insert_only" BEFORE UPDATE OR DELETE ON "ShipmentReview" FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
