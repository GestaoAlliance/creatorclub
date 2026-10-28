-- D-PJADDR (reunião de 2026-10-27; respostas do responsável em 2026-10-28): regime tributário de quem tem CNPJ.
-- Fora do MEI, os produtos vão para o endereço do CNPJ (conferido com os dados públicos da Receita).

-- AlterTable
ALTER TABLE "CreatorAccount" ADD COLUMN     "taxRegime" TEXT;

ALTER TABLE "CreatorAccount" ADD CONSTRAINT "CreatorAccount_taxRegime" CHECK ("taxRegime" IS NULL OR "taxRegime" IN ('MEI', 'SIMPLES', 'OUTRO'));
