-- D-DATAFIX: pedido de correção de dados feito pela creator no portal (vira tarefa da Gestão). Só inserção.
CREATE TABLE "DataFixRequest" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataFixRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DataFixRequest_brandId_createdAt_idx" ON "DataFixRequest"("brandId", "createdAt");
ALTER TABLE "DataFixRequest" ADD CONSTRAINT "DataFixRequest_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DataFixRequest" ADD CONSTRAINT "DataFixRequest_creatorId_brandId_fkey" FOREIGN KEY ("creatorId", "brandId") REFERENCES "Creator"("id", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DataFixRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataFixRequest" ADD CONSTRAINT "DataFixRequest_valid" CHECK (
  "field" IN ('NAME', 'CPF', 'CNPJ', 'PHONE', 'EMAIL', 'OTHER') AND char_length(btrim("message")) BETWEEN 3 AND 500
);
CREATE TRIGGER "DataFixRequest_insert_only" BEFORE UPDATE OR DELETE ON "DataFixRequest" FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- "Feito" da fila (D-ACTIONSBOARD): a trava só aceitava 5 tipos; Aniversário, Sem post, Pediu acesso e Contrato sem
-- assinar davam erro ao marcar. Agora aceita todos, mais o pedido de correção (FIX_DATA).
ALTER TABLE "ActionDone" DROP CONSTRAINT "ActionDone_key_format";
ALTER TABLE "ActionDone" ADD CONSTRAINT "ActionDone_key_format"
  CHECK ("key" ~ '^(IDLE|CONTRACT|NEAR_MIN|KIT_PENDING|SHIP_STUCK|BIRTHDAY|NO_POST|ACCESS|UNSIGNED|FIX_DATA):.+$');
