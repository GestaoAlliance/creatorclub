import type { PrismaClient } from "@/generated/prisma/client";
import { productPhoto } from "@/domain";

/**
 * D-PRODUCTTHUMB: foto de cada produto pelo nome (ou id da Shopify) para os rankings: a foto em destaque da Shopify da
 * própria marca (catálogo diário) e, sem ela, a foto local do catálogo; sem nenhuma, null (a miniatura mostra a inicial).
 */
export async function productImages(prisma: PrismaClient, brandId: string) {
  const [brand, products] = await Promise.all([
    prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { slug: true } }),
    prisma.product.findMany({ where: { brandId }, select: { shopifyId: true, title: true, imageUrl: true } }),
  ]);
  const norm = (s: string) => s.trim().toLowerCase();
  const byTitle = new Map(products.map((p) => [norm(p.title), p.imageUrl]));
  const byShopify = new Map(products.map((p) => [p.shopifyId, p.imageUrl]));
  return (title: string, shopifyId?: string | null): string | null =>
    (shopifyId ? byShopify.get(shopifyId) : null) ?? byTitle.get(norm(title)) ?? productPhoto(brand.slug, title);
}
