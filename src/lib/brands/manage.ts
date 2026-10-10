import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith } from "@/lib/auth/permissions";

/**
 * Marcas da Alliance (A1b, D-ALLIANCE): o super admin cadastra e edita nome, endereço (slug), cor, razão social e CNPJ
 * (tomador da nota fiscal das creators, D-NF). As regras de comissão e saque nascem com o padrão das outras marcas.
 * Nada é apagado (D-ARCHIVE).
 */

export class BrandError extends Error {}

function requireSuperAdmin(actor: Actor | null): Actor {
  if (!actor || brandsWith(actor.grants, "staff.manage") !== "ALL") throw new BrandError("Só super admin.");
  return actor;
}

export type BrandInput = { name: string; slug?: string; primaryColor: string; legalName: string; cnpj: string };

/** "VermeFree Saúde" → "vermefree-saude". */
export function slugFrom(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function clean(input: BrandInput) {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (name.length < 2) throw new BrandError("Informe o nome da marca.");
  const color = input.primaryColor.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(color)) throw new BrandError("Cor no formato #RRGGBB (ex.: #0F766E).");
  const cnpj = input.cnpj.replace(/\D/g, "") || null;
  if (cnpj && cnpj.length !== 14) throw new BrandError("CNPJ precisa ter 14 números (ou deixe em branco por enquanto).");
  const legalName = input.legalName.trim().replace(/\s+/g, " ").slice(0, 160) || null;
  return { name, primaryColor: color, nfTakerDocument: cnpj, legalName };
}

export async function createBrand(prisma: PrismaClient, actor: Actor | null, input: BrandInput) {
  const manager = requireSuperAdmin(actor);
  const data = clean(input);
  const slug = slugFrom(input.slug?.trim() || data.name);
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) throw new BrandError("Endereço inválido: só letras minúsculas, números e hífen.");
  if (await prisma.brand.findUnique({ where: { slug }, select: { id: true } })) throw new BrandError(`Já existe uma marca com o endereço "${slug}".`);
  return prisma.$transaction(async (tx) => {
    const brand = await tx.brand.create({ data: { ...data, slug } });
    await tx.auditLog.create({
      data: { brandId: brand.id, actorType: "USER", actorId: manager.userId, action: "brand.create", entity: "Brand", entityId: brand.id, after: { ...data, slug } },
    });
    return brand;
  });
}

export async function updateBrand(prisma: PrismaClient, actor: Actor | null, brandId: string, input: BrandInput) {
  const manager = requireSuperAdmin(actor);
  const before = await prisma.brand.findUnique({ where: { id: brandId }, select: { name: true, primaryColor: true, nfTakerDocument: true, legalName: true } });
  if (!before) throw new BrandError("Marca não encontrada.");
  const data = clean(input);
  await prisma.$transaction(async (tx) => {
    await tx.brand.update({ where: { id: brandId }, data });
    await tx.auditLog.create({ data: { brandId, actorType: "USER", actorId: manager.userId, action: "brand.update", entity: "Brand", entityId: brandId, before, after: data } });
  });
}

/** Marcas com o que importa para começar: loja conectada, creators ativas, equipe e textos publicados. */
export async function brandList(prisma: PrismaClient, actor: Actor | null) {
  requireSuperAdmin(actor);
  const brands = await prisma.brand.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      primaryColor: true,
      secondaryColor: true,
      legalName: true,
      nfTakerDocument: true,
      createdAt: true,
      integrations: { where: { kind: "SHOPIFY" }, select: { status: true, externalId: true } },
      _count: { select: { roleGrants: true, termsVersions: true, contractDocuments: true, contractTemplates: true } },
    },
  });
  const active = await prisma.creator.groupBy({ by: ["brandId"], where: { status: "ACTIVE" }, _count: true });
  const activeBy = new Map(active.map((a) => [a.brandId, a._count]));
  return brands.map((b) => ({ ...b, store: b.integrations[0] ?? null, activeCreators: activeBy.get(b.id) ?? 0 }));
}
