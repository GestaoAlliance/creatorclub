-- D-PRODUCTPAUSE: pausa dos pedidos de produtos por marca (null = abertos).
ALTER TABLE "Brand" ADD COLUMN "productRequestsPausedAt" TIMESTAMP(3);
