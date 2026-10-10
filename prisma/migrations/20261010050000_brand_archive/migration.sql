-- D-ARCHIVE: marca arquivada some das telas; nada é apagado (a auditoria guarda a criação dela).
ALTER TABLE "Brand" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- A "Loja de teste" (criada em 09/10 para testar a conexão, sem dados) fica arquivada.
UPDATE "Brand" SET "archivedAt" = now() WHERE "slug" = 'teste' AND "archivedAt" IS NULL;
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "after")
SELECT gen_random_uuid()::text, b."id", 'SYSTEM', 'migration', 'brand.archive', 'Brand', b."id", '{"reason":"loja de teste sem dados, pedido do responsável"}'::jsonb
FROM "Brand" b WHERE b."slug" = 'teste';
