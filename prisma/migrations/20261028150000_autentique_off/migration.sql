-- D-D4SIGN (decisão do responsável em 2026-10-26): o Autentique saiu do sistema. Desconecta a conta de cada marca
-- (a chave guardada é descartada) e cancela os pedidos de assinatura que ainda esperavam; o histórico fica.
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), "brandId", 'SYSTEM', 'migration:autentique_off', 'integration.disconnect', 'BrandIntegration', "id",
       jsonb_build_object('status', "status"), jsonb_build_object('status', 'DISCONNECTED', 'motivo', 'Autentique saiu (D-D4SIGN)'), now()
FROM "BrandIntegration" WHERE "kind" = 'AUTENTIQUE' AND "status" <> 'DISCONNECTED';
UPDATE "BrandIntegration" SET "status" = 'DISCONNECTED', "secretEncrypted" = NULL, "updatedAt" = now() WHERE "kind" = 'AUTENTIQUE';

INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "before", "after", "createdAt")
SELECT gen_random_uuid(), "brandId", 'SYSTEM', 'migration:autentique_off', 'contract_request.cancel', 'ContractRequest', "id",
       jsonb_build_object('status', "status"), jsonb_build_object('status', 'CANCELLED', 'motivo', 'Autentique saiu; contrato agora pelo D4Sign (D-D4SIGN)'), now()
FROM "ContractRequest" WHERE "status" = 'SENT';
UPDATE "ContractRequest" SET "status" = 'CANCELLED', "lastError" = 'Cancelado: o Autentique saiu do sistema (contrato agora pelo D4Sign).' WHERE "status" = 'SENT';
