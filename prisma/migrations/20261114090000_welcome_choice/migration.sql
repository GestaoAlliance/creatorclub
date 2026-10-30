-- D-WELCOMECHOICE (Revita, 2026-10-30): produtos de cada opção do envio inicial (1 produto; 2 produtos + 3 vídeos),
-- escolhidos em Marcas. Com as duas opções, o cadastro do site pergunta qual ela quer e o 1º pedido já vem com eles.
ALTER TABLE "Brand" ADD COLUMN "welcomeOneIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "welcomeTwoIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "KitGrant" ADD COLUMN "presetProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_welcome_sizes" CHECK (cardinality("welcomeOneIds") <= 1 AND cardinality("welcomeTwoIds") <= 2);
