-- D-SHEETREADONLY: última leitura da planilha (por creator, o texto de cada coluna), para achar o que mudou.
ALTER TABLE "SheetSync" ADD COLUMN "snapshot" JSONB;
