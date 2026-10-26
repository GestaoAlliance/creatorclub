-- D-KITOPTIONS: produtos que a creator pode escolher no portal, marcados por marca em Configurações → Marcas.
ALTER TABLE "Product" ADD COLUMN "kitOption" BOOLEAN NOT NULL DEFAULT false;
