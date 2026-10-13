-- D-KITAPPROVAL: o pedido da creator (kit de boas-vindas ou mensal) espera a aprovação da Gestão antes de ir ao Envio.
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'AWAITING_APPROVAL' BEFORE 'PREPARING';

ALTER TABLE "Shipment" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "rejectReason" TEXT;

-- Aprovação tem autor; motivo de recusa só em envio cancelado.
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_approval" CHECK (
  ("approvedAt" IS NULL) = ("approvedById" IS NULL)
  AND ("rejectReason" IS NULL OR ("cancelledAt" IS NOT NULL AND "approvedAt" IS NULL))
);
