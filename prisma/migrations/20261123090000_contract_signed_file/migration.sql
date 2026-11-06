-- D-AUTOCONTRACTFILE: o PDF assinado no Autentique é baixado e anexado sozinho na ficha.
ALTER TABLE "ContractRequest" ADD COLUMN "signedFileId" TEXT,
ADD COLUMN "signedFileAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "signedFileError" TEXT;
ALTER TABLE "ContractRequest" ADD CONSTRAINT "ContractRequest_signedFileId_fkey" FOREIGN KEY ("signedFileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContractRequest" ADD CONSTRAINT "ContractRequest_signed_file_attempts" CHECK ("signedFileAttempts" BETWEEN 0 AND 20);
