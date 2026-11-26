-- D-KITCOMBO: vários prêmios pendentes (boas-vindas, meta, meses) podem sair num pedido só.
-- O envio deixa de ter no máximo um kit; a ligação continua com Restrict.
DROP INDEX "KitGrant_shipmentId_key";
CREATE INDEX "KitGrant_shipmentId_idx" ON "KitGrant"("shipmentId");
