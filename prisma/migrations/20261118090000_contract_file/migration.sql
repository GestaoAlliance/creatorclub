-- D-CONTRACTFILE: PDF do contrato assinado anexado na ficha (bucket privado `contratos`).
ALTER TABLE "Creator" ADD COLUMN "contractFileId" TEXT;
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_contractFileId_fkey" FOREIGN KEY ("contractFileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
