-- D-SHIPALERT: aviso de envio novo no WhatsApp de quem é Envio (resumo de hora em hora).
-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "staffNotifiedAt" TIMESTAMP(3);


-- Envios que já existiam não entram no primeiro resumo.
UPDATE "Shipment" SET "staffNotifiedAt" = now();
