-- D-WDLOCK: saque de cada creator fica travado até o Pagamento aprovar o saldo de abertura (E6, D-OPEN).
ALTER TABLE "Creator" ADD COLUMN "withdrawalsUnlockedAt" TIMESTAMP(3);
ALTER TABLE "Creator" ADD COLUMN "withdrawalsUnlockedById" TEXT;
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_unlock_has_author" CHECK (("withdrawalsUnlockedAt" IS NULL) = ("withdrawalsUnlockedById" IS NULL));

-- D-NF: dados do tomador para a nota fiscal da creator (Botanika). Descrição e código de serviço ainda em aberto.
ALTER TABLE "Brand" ADD COLUMN "nfTakerDocument" TEXT;
UPDATE "Brand" SET "nfTakerDocument" = '65.100.830/0001-36' WHERE "slug" = 'botanika';

-- D-NF: sugestão de descrição para a NF da creator (a pessoa confirma o código com a prefeitura/contador).
UPDATE "Brand" SET "nfInstructions" = 'Sugestão: "Serviços de divulgação e publicidade em mídias digitais (marketing de influência), referentes às vendas com meu cupom." Código de serviço sugerido: subitem 17.06 da LC 116/2003 (propaganda e publicidade). Confirme o código usado na sua prefeitura ou com seu contador.' WHERE "slug" = 'botanika' AND "nfInstructions" IS NULL;
