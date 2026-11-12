-- D-PRODUCTTHUMB: foto do produto (imagem em destaque da Shopify, lida no catálogo diário) para os rankings.
ALTER TABLE "Product" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Product" ADD CONSTRAINT "Product_image_url" CHECK ("imageUrl" IS NULL OR ("imageUrl" ~ '^https://' AND char_length("imageUrl") <= 1000));
