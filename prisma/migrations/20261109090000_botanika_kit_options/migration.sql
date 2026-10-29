-- D-KITOPTIONS (pedido do responsável em 2026-10-29): na Botanika, a creator também pode escolher o Tri[Mg] Complex e o
-- Whey Balance 455 g (pote menor) em um dos 3 sabores: Chocolate, Sem Sabor ou Cappuccino. Os já marcados continuam.
WITH marcados AS (
  UPDATE "Product" p SET "kitOption" = true
  FROM "Brand" b
  WHERE b."id" = p."brandId" AND b."slug" = 'botanika' AND p."kitOption" = false
    AND p."shopifyId" IN (
      'gid://shopify/Product/9347154968808',  -- Tri[Mg] Complex
      'gid://shopify/Product/9347155165416',  -- Whey Balance 455g Chocolate
      'gid://shopify/Product/9600936902888',  -- Whey Balance 455g Sem Sabor
      'gid://shopify/Product/10316038602984'  -- Whey Balance 455g Cappuccino
    )
  RETURNING p."brandId", p."id", p."title"
)
INSERT INTO "AuditLog" ("id", "brandId", "actorType", "actorId", "action", "entity", "entityId", "after", "createdAt")
SELECT gen_random_uuid(), "brandId", 'SYSTEM', 'migration:botanika_kit_options', 'product.kit_option', 'Product', "id", jsonb_build_object('kitOption', true, 'title', "title"), now()
FROM marcados;
