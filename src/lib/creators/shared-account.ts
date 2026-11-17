import type { PrismaClient } from "@/generated/prisma/client";

/**
 * D-SHAREDACCOUNT (responsável, 2026-11-17): a conta da creator (nome, e-mail, telefone, redes, chave Pix, login e
 * endereço) é uma só para todas as marcas dela. Só muda quem pode nas marcas todas dela; senão, o super admin.
 */
export const OTHER_BRAND_MESSAGE = "Ela também é creator de outra marca que você não acessa. Peça a um super admin.";

/** Marcas em que a conta tem creator (ativas ou não). */
export async function accountBrandIds(prisma: Pick<PrismaClient, "creator">, accountId: string): Promise<string[]> {
  const rows = await prisma.creator.findMany({ where: { accountId }, select: { brandId: true } });
  return [...new Set(rows.map((r) => r.brandId))];
}

/** Pode em todas as marcas da conta? */
export async function allowedInAllBrands(prisma: Pick<PrismaClient, "creator">, accountId: string, allowed: (brandId: string) => boolean): Promise<boolean> {
  return (await accountBrandIds(prisma, accountId)).every(allowed);
}
