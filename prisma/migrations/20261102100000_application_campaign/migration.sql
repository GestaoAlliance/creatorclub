-- D-ORIGIN parte 2 (respostas do responsável em 2026-10-29): etiqueta de campanha do link do cadastro (?origem=) e
-- a resposta opcional "Como conheceu a marca?".

-- AlterTable
ALTER TABLE "CreatorApplication" ADD COLUMN     "campaignTag" TEXT,
ADD COLUMN     "heardFrom" TEXT;


ALTER TABLE "CreatorApplication"
  ADD CONSTRAINT "CreatorApplication_campaign" CHECK (
    ("campaignTag" IS NULL OR "campaignTag" ~ '^[a-z0-9_-]{1,40}$')
    AND ("heardFrom" IS NULL OR length(btrim("heardFrom")) BETWEEN 1 AND 100)
  );
