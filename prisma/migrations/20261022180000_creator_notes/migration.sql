-- M0.2: observações da equipe na ficha da creator (linha do tempo). Somente inserção, como o extrato.
CREATE TABLE "CreatorNote" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CreatorNote_creatorId_createdAt_idx" ON "CreatorNote"("creatorId", "createdAt");
ALTER TABLE "CreatorNote" ADD CONSTRAINT "CreatorNote_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreatorNote" ADD CONSTRAINT "CreatorNote_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreatorNote" ADD CONSTRAINT "CreatorNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreatorNote" ENABLE ROW LEVEL SECURITY;

-- Texto de 1 a 1000 caracteres, sem só espaços.
ALTER TABLE "CreatorNote" ADD CONSTRAINT "CreatorNote_body_length" CHECK (char_length(btrim("body")) BETWEEN 1 AND 1000);

CREATE TRIGGER "CreatorNote_append_only"
  BEFORE UPDATE OR DELETE ON "CreatorNote"
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
