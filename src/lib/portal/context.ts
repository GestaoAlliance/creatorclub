import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { isUgcOnly } from "@/domain";

/**
 * Acesso ao portal da creator (E7). A marca vem do endereço (`/portal/[marca]`); a creator só entra nas marcas em
 * que participa, e cada tela só lê dados do `creatorId` devolvido aqui. Toda situação entra (Ativa, Pausada,
 * Desligada: D-PORTALACCESS); a Desligada vê um aviso.
 *
 * Super admin pode ver o portal de uma creator (D-VIEWAS): só leitura (`viewAs` preenchido), começo registrado na
 * auditoria. Toda ação do portal (ex.: pedir saque, E8) precisa recusar quando `viewAs` estiver preenchido.
 */

export class PortalError extends Error {}

export type PortalBrand = { slug: string; name: string; primaryColor: string; secondaryColor: string | null };

export type PortalContext = {
  creatorId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "DEACTIVATED";
  brand: PortalBrand & { id: string };
  /** Todas as marcas da creator, para a troca de marca (só a atual quando é visualização). */
  brands: PortalBrand[];
  /** Preenchido quando é a equipe vendo o portal da creator: só leitura. */
  viewAs: { userId: string } | null;
  /** Só UGC (D-UGCPORTAL): portal só com vendas, cupom e envios; sem saldo, saque e termo. */
  ugcOnly: boolean;
};

const BRAND_SELECT = { id: true, slug: true, name: true, primaryColor: true, secondaryColor: true } as const;
const INCLUDE = { brand: { select: BRAND_SELECT }, account: { select: { name: true } } } as const;

async function participations(prisma: PrismaClient, actor: Actor) {
  const ids = Object.values(actor.creatorIds);
  if (ids.length === 0) return [];
  return prisma.creator.findMany({ where: { id: { in: ids } }, include: INCLUDE, orderBy: { brand: { name: "asc" } } });
}

const brandOf = (b: PortalBrand) => ({ slug: b.slug, name: b.name, primaryColor: b.primaryColor, secondaryColor: b.secondaryColor });

/** Marca em que a creator cai depois de entrar (a primeira em ordem alfabética), ou null se não é creator. */
export async function portalHome(prisma: PrismaClient, actor: Actor | null): Promise<string | null> {
  if (!actor) return null;
  const list = await participations(prisma, actor);
  return list[0]?.brand.slug ?? null;
}

/**
 * Contexto do portal. `viewAsCreatorId` (vindo do cookie de visualização) só vale para quem tem `portal.viewAs`
 * na marca da creator; para qualquer outra pessoa é ignorado e vale o acesso normal.
 */
export async function portalContext(
  prisma: PrismaClient,
  actor: Actor | null,
  brandSlug: string,
  viewAsCreatorId: string | null = null,
): Promise<PortalContext> {
  if (!actor) throw new PortalError("Sem acesso.");
  if (viewAsCreatorId) {
    const viewed = await prisma.creator.findUnique({ where: { id: viewAsCreatorId }, include: INCLUDE });
    if (viewed && viewed.brand.slug === brandSlug && can(actor.grants, "portal.viewAs", viewed.brandId)) {
      return {
        creatorId: viewed.id,
        name: viewed.account.name,
        status: viewed.status,
        brand: viewed.brand,
        brands: [brandOf(viewed.brand)],
        viewAs: { userId: actor.userId },
        ugcOnly: isUgcOnly(viewed.categories),
      };
    }
  }
  const list = await participations(prisma, actor);
  const current = list.find((c) => c.brand.slug === brandSlug);
  if (!current) throw new PortalError("Sem acesso a esta marca.");
  return {
    creatorId: current.id,
    name: current.account.name,
    status: current.status,
    brand: current.brand,
    brands: list.map((c) => brandOf(c.brand)),
    viewAs: null,
    ugcOnly: isUgcOnly(current.categories),
  };
}

/** Começa a visualização: confere a permissão, registra na auditoria e devolve a marca para abrir o portal. */
export async function startViewAs(prisma: PrismaClient, actor: Actor | null, creatorId: string): Promise<string> {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId }, include: { brand: { select: { slug: true } } } });
  if (!creator) throw new PortalError("Creator não encontrada.");
  if (!actor || !can(actor.grants, "portal.viewAs", creator.brandId)) throw new PortalError("Só super admin vê o portal de uma creator.");
  await prisma.auditLog.create({
    data: { brandId: creator.brandId, actorType: "USER", actorId: actor.userId, action: "portal.view_as", entity: "Creator", entityId: creatorId },
  });
  return creator.brand.slug;
}

/** Variáveis CSS da marca. As cores já são validadas no banco (Brand_colors_hex); a checagem aqui é a segunda trava. */
export function brandCssVars(brand: { primaryColor: string; secondaryColor: string | null }): Record<string, string> {
  const hex = /^#[0-9A-Fa-f]{6}$/;
  const primary = hex.test(brand.primaryColor) ? brand.primaryColor : "#18181B";
  const secondary = brand.secondaryColor && hex.test(brand.secondaryColor) ? brand.secondaryColor : primary;
  return { "--brand": primary, "--brand-2": secondary };
}
