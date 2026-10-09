-- D-BRANDCOLOR: cor secundária da marca; cores só em hexadecimal (#RRGGBB), porque viram variável CSS no portal.
ALTER TABLE "Brand" ADD COLUMN "secondaryColor" TEXT;
ALTER TABLE "Brand" ALTER COLUMN "primaryColor" SET DEFAULT '#18181B';

UPDATE "Brand" SET "primaryColor" = '#323C91', "secondaryColor" = '#C4D78A' WHERE "slug" = 'botanika';
UPDATE "Brand" SET "primaryColor" = '#18181B' WHERE "primaryColor" !~ '^#[0-9A-Fa-f]{6}$';

ALTER TABLE "Brand" ADD CONSTRAINT "Brand_colors_hex" CHECK (
  "primaryColor" ~ '^#[0-9A-Fa-f]{6}$' AND ("secondaryColor" IS NULL OR "secondaryColor" ~ '^#[0-9A-Fa-f]{6}$')
);
