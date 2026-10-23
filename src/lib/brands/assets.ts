import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { checkBrandImage, type BrandAssetKind } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith } from "@/lib/auth/permissions";
import { BrandError } from "./manage";

/** Logo da tela de entrar (M4.4a, D-BRANDLOGIN). Só super admin troca; todos veem (a imagem é pública). */

function superAdmin(actor: Actor | null): Actor {
  if (!actor || brandsWith(actor.grants, "staff.manage") !== "ALL") throw new BrandError("Só super admin.");
  return actor;
}

export async function setBrandAsset(prisma: PrismaClient, actor: Actor | null, brandId: string, kind: BrandAssetKind, bytes: Uint8Array) {
  const who = superAdmin(actor);
  const check = checkBrandImage(kind, bytes);
  if (!check.ok) throw new BrandError(check.error);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const data = { mime: check.mime, bytes: Buffer.from(bytes), sizeBytes: bytes.length, sha256, uploadedById: who.userId };
  await prisma.$transaction([
    prisma.brandAsset.upsert({ where: { brandId_kind: { brandId, kind } }, update: data, create: { brandId, kind, ...data } }),
    prisma.auditLog.create({ data: { brandId, actorType: "USER", actorId: who.userId, action: "brand.asset.set", entity: "Brand", entityId: brandId, after: { kind, sha256, sizeBytes: bytes.length } } }),
  ]);
}

export async function removeBrandAsset(prisma: PrismaClient, actor: Actor | null, brandId: string, kind: BrandAssetKind) {
  const who = superAdmin(actor);
  await prisma.$transaction([
    prisma.brandAsset.deleteMany({ where: { brandId, kind } }),
    prisma.auditLog.create({ data: { brandId, actorType: "USER", actorId: who.userId, action: "brand.asset.remove", entity: "Brand", entityId: brandId, after: { kind } } }),
  ]);
}

/** A imagem para servir (rota pública). */
export async function brandAssetBySlug(prisma: PrismaClient, slug: string, kind: BrandAssetKind) {
  return prisma.brandAsset.findFirst({ where: { kind, brand: { slug, archivedAt: null } }, select: { mime: true, bytes: true, sha256: true } });
}

/** O que a tela de entrar precisa da marca: cores e a versão (hash) do logo, para o endereço mudar ao trocar. */
export async function loginBrand(prisma: PrismaClient, slug: string) {
  const b = await prisma.brand.findFirst({
    where: { slug, archivedAt: null },
    select: { slug: true, name: true, primaryColor: true, secondaryColor: true, assets: { select: { kind: true, sha256: true } } },
  });
  if (!b) return null;
  const logo = b.assets.find((a) => a.kind === "LOGO")?.sha256.slice(0, 12) ?? null;
  return { slug: b.slug, name: b.name, primaryColor: b.primaryColor, secondaryColor: b.secondaryColor, logo };
}
