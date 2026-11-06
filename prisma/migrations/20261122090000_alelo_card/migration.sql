-- D-ALELOCARD (respostas do Sr. Guilherme e do responsável, 2026-11-06): pessoa física recebe no cartão Alelo; a Alelo
-- pede o nome da mãe para emitir o cartão. O Pagamento baixa a planilha de pedido de cartão e quem entrou fica marcado.
ALTER TABLE "CreatorAccount" ADD COLUMN "motherName" TEXT;
ALTER TABLE "CreatorAccount" ADD CONSTRAINT "CreatorAccount_mother_name" CHECK ("motherName" IS NULL OR char_length("motherName") BETWEEN 5 AND 120);
ALTER TABLE "Creator" ADD COLUMN "aleloCardRequestedAt" TIMESTAMP(3);
