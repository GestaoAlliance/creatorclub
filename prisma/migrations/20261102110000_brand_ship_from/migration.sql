-- D-LABEL (respostas do responsável em 2026-10-29): endereço de onde saem os envios de cada marca, remetente da
-- etiqueta e da declaração de conteúdo (Envios → Imprimir).

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "shipFrom" JSONB;


ALTER TABLE "Brand"
  ADD CONSTRAINT "Brand_shipFrom" CHECK ("shipFrom" IS NULL OR (jsonb_typeof("shipFrom") = 'object' AND "shipFrom"->>'zip' ~ '^[0-9]{8}$'));
