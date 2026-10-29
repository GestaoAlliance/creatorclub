-- D-CONTRACTFLOW (ajuste do responsável em 2026-10-29): sem a escolha de 1 ou 2 produtos no cadastro, a Influencer tem
-- 2 modelos de contrato: pessoa física (CPF) e empresa (CNPJ). Os 4 tipos anteriores seguem aceitos só para não
-- quebrar algum texto já publicado (nada é apagado); o sistema não usa mais.
ALTER TABLE "ContractDocument" DROP CONSTRAINT "ContractDocument_valid";
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_valid" CHECK ("kind" IN ('INFLUENCER', 'PRESCRITOR', 'UGC', 'INFLUENCER_PF', 'INFLUENCER_PJ', 'INFLUENCER_PF_1', 'INFLUENCER_PF_2', 'INFLUENCER_PJ_1', 'INFLUENCER_PJ_2') AND "version" > 0 AND btrim("title") <> '' AND btrim("body") <> '');
