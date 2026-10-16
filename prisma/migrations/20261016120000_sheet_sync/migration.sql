-- D-SHEETSYNC: planilhas da equipe sincronizadas com o sistema nos dois sentidos; por campo, vale a alteração mais recente.

-- Hora da última alteração de cada campo sincronizado, de onde veio (SYSTEM ou SHEET).
CREATE TABLE "FieldStamp" (
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL,
  CONSTRAINT "FieldStamp_pkey" PRIMARY KEY ("entity", "entityId", "field"),
  CONSTRAINT "FieldStamp_source" CHECK ("source" IN ('SYSTEM', 'SHEET'))
);
ALTER TABLE "FieldStamp" ENABLE ROW LEVEL SECURITY;

-- Estado de cada planilha ligada (última entrada e última saída) e avisos do que não deu para aplicar.
CREATE TABLE "SheetSync" (
  "brandId" TEXT NOT NULL,
  "sheet" TEXT NOT NULL,
  "lastPushAt" TIMESTAMP(3),
  "lastPullAt" TIMESTAMP(3),
  CONSTRAINT "SheetSync_pkey" PRIMARY KEY ("brandId", "sheet"),
  CONSTRAINT "SheetSync_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SheetSync_sheet" CHECK ("sheet" IN ('central', 'envios', 'pagamentos'))
);
ALTER TABLE "SheetSync" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "SheetSyncIssue" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "sheet" TEXT NOT NULL,
  "tab" TEXT NOT NULL,
  "row" INTEGER NOT NULL,
  "message" TEXT NOT NULL,
  "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SheetSyncIssue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SheetSyncIssue_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SheetSyncIssue_brandId_sheet_tab_row_message_key" ON "SheetSyncIssue"("brandId", "sheet", "tab", "row", "message");
CREATE INDEX "SheetSyncIssue_brandId_seenAt_idx" ON "SheetSyncIssue"("brandId", "seenAt");
ALTER TABLE "SheetSyncIssue" ENABLE ROW LEVEL SECURITY;

-- Toda alteração nos campos sincronizados carimba o campo. A sincronização da planilha marca a transação com
-- app.sync_source = 'SHEET' e app.sync_at = hora da edição na planilha; qualquer outra escrita é do sistema, agora.
CREATE FUNCTION "stamp_synced_fields"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  col TEXT;
  src TEXT := COALESCE(NULLIF(current_setting('app.sync_source', true), ''), 'SYSTEM');
  at TIMESTAMP(3) := COALESCE(NULLIF(current_setting('app.sync_at', true), '')::timestamp, (now() AT TIME ZONE 'UTC'));
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF TG_OP = 'INSERT' OR (to_jsonb(OLD) -> col) IS DISTINCT FROM (to_jsonb(NEW) -> col) THEN
      INSERT INTO "FieldStamp" ("entity", "entityId", "field", "changedAt", "source")
      VALUES (TG_TABLE_NAME, NEW."id", col, at, src)
      ON CONFLICT ("entity", "entityId", "field") DO UPDATE SET "changedAt" = EXCLUDED."changedAt", "source" = EXCLUDED."source";
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER "CreatorAccount_stamp_synced" AFTER INSERT OR UPDATE ON "CreatorAccount"
  FOR EACH ROW EXECUTE FUNCTION "stamp_synced_fields"(
    'name', 'email', 'phone', 'cpf', 'cnpj', 'pixKey', 'instagram',
    'addrZip', 'addrStreet', 'addrNumber', 'addrComplement', 'addrDistrict', 'addrCity', 'addrState');
CREATE TRIGGER "Creator_stamp_synced" AFTER INSERT OR UPDATE ON "Creator"
  FOR EACH ROW EXECUTE FUNCTION "stamp_synced_fields"(
    'status', 'contractStart', 'contractEnd', 'contractSigned', 'couponRegistered', 'followsOnInstagram', 'inGroup', 'tagged',
    'checklistNote', 'ugcFolderUrl', 'ugcVideoStatus', 'ugcOrder', 'notes');
