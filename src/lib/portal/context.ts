import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";

/**
 * Acesso ao portal da creator (E7). A marca vem do endereço (`/portal/[marca]`); a creator só entra nas marcas em
 * que participa, e cada tela só lê dados do `creatorId` devolvido aqui. Toda situação entra (Ativa, Pausada,
 * Desligada: D-PORTALACCESS); a Desligada vê um aviso.
 */

export class PortalError extends Error {}

export type PortalBrand = { slug: string; name: string; primaryColor: string; secondaryColor: string | null };

export type PortalContext = {
  creatorId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "DEACTIVATED";
  brand: PortalBrand & { id: string };
  /** Todas as marcas da creator, para a troca de marca. */
  brands: PortalBrand[];
};

const BRAND_SELECT = { id: true, slug: true, name: true, primaryColor: true, secondaryColor: true } as const;

async function participations(prisma: PrismaClient, actor: Actor) {
  const ids = Object.values(actor.creatorIds);
  if (ids.length === 0) return [];
  return prisma.creator.findMany({
    where: { id: { in: ids } },
    include: { brand: { select: BRAND_SELECT }, account: { select: { name: true } } },
    orderBy: { brand: { name: "asc" } },
  });
}

/** Marca em que a creator cai depois de entrar (a primeira em ordem alfabética), ou null se não é creator. */
export async function portalHome(prisma: PrismaClient, actor: Actor | null): Promise<string | null> {
  if (!actor) return null;
  const list = await participations(prisma, actor);
  return list[0]?.brand.slug ?? null;
}

export async function portalContext(prisma: PrismaClient, actor: Actor | null, brandSlug: string): Promise<PortalContext> {
  if (!actor) throw new PortalError("Sem acesso.");
  const list = await participations(prisma, actor);
  const current = list.find((c) => c.brand.slug === brandSlug);
  if (!current) throw new PortalError("Sem acesso a esta marca.");
  return {
    creatorId: current.id,
    name: current.account.name,
    status: current.status,
    brand: current.brand,
    brands: list.map((c) => ({ slug: c.brand.slug, name: c.brand.name, primaryColor: c.brand.primaryColor, secondaryColor: c.brand.secondaryColor })),
  };
}

/** Variáveis CSS da marca. As cores já são validadas no banco (Brand_colors_hex); a checagem aqui é a segunda trava. */
export function brandCssVars(brand: { primaryColor: string; secondaryColor: string | null }): Record<string, string> {
  const hex = /^#[0-9A-Fa-f]{6}$/;
  const primary = hex.test(brand.primaryColor) ? brand.primaryColor : "#18181B";
  const secondary = brand.secondaryColor && hex.test(brand.secondaryColor) ? brand.secondaryColor : primary;
  return { "--brand": primary, "--brand-2": secondary };
}
