-- D-KITOPTIONS (pedido do responsável em 2026-10-27): produtos que a creator pode escolher na aba Pedidos.
-- Revita Derma: só o Sérum Pepti Code. Botanika: Hair Botanika, Tri Magnésio e TetraVit. VermeFree: o protocolo adulto.
-- Kits e combos ficam de fora. Marca sem nenhum produto encontrado segue mostrando todos (regra do sistema).
-- Depois, a equipe confere e ajusta em Configurações → Marcas → "Produtos que a creator pode escolher".
WITH picked AS (
  SELECT p."id", p."brandId", p."title"
  FROM "Product" p JOIN "Brand" b ON b."id" = p."brandId"
  WHERE p."active" AND p."kitOption" = false
    AND p."title" NOT ILIKE 'kit%' AND p."title" NOT ILIKE '%combo%'
    AND (
      (b."slug" = 'revita-derma' AND p."title" ILIKE 'sérum pepti code%')
      OR (b."slug" = 'botanika' AND (p."title" ILIKE '%hair botanika%' OR p."title" ILIKE '%tri magn%' OR p."title" ILIKE '%tetravit%' OR p."title" ILIKE '%tetra vit%'))
      OR (b."slug" = 'vermefree' AND p."title" ILIKE '%protocolo%adulto%')
    )
), audit AS (
  INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "after", "createdAt")
  SELECT gen_random_uuid(), "brandId", 'SYSTEM', 'migration:kit_options_brands', 'product.kit_option', 'Product', "id",
         jsonb_build_object('kitOption', true, 'title', "title"), now()
  FROM picked
)
UPDATE "Product" SET "kitOption" = true WHERE "id" IN (SELECT "id" FROM picked);
