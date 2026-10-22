-- M1.3 (D-NFDATA): dados para a creator emitir a nota, editáveis por marca. Vazio = serviço padrão (17.06.01).
ALTER TABLE "Brand" ADD COLUMN "nfServiceCode" TEXT, ADD COLUMN "nfServiceDescription" TEXT;

ALTER TABLE "Brand"
  ADD CONSTRAINT "Brand_nf_service_code_format" CHECK ("nfServiceCode" IS NULL OR "nfServiceCode" ~ '^[0-9]{2}\.[0-9]{2}(\.[0-9]{2})?$'),
  ADD CONSTRAINT "Brand_nf_service_description_filled" CHECK ("nfServiceDescription" IS NULL OR btrim("nfServiceDescription") <> '');
