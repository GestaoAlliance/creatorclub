-- M2.2 (D-WHATSAPP): avisos à creator pelo WhatsApp da marca (n8n + Evolution).
-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "whatsappInstance" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "whatsappAt" TIMESTAMP(3);


-- Travas
ALTER TABLE "Brand"
  ADD CONSTRAINT "Brand_whatsapp_instance_format" CHECK ("whatsappInstance" IS NULL OR "whatsappInstance" ~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{0,59}$');
