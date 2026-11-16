import type { PrismaClient } from "@/generated/prisma/client";
import { CREATOR_CATEGORY_LABEL, DATA_FIX_LABEL, dayKey, parseBirthDate, profileCompleteness, socialHandle, type DataFixField } from "@/domain";
import { releaseProgress } from "@/lib/commission/release";
import { maskPix } from "@/lib/portal/withdrawal-extras";
import { addressOf, type Address } from "@/lib/shipments/address";
import { informedAddressFor } from "@/lib/shipments/shipments";
import type { PortalContext } from "./context";
import { SocialError } from "./social";

/**
 * D-PORTALPROFILE: aba "Meu cadastro" do portal. A creator vê os próprios dados (CPF/CNPJ mascarados), muda o que é
 * dela (foto, Pix, endereço, Instagram, TikTok, aniversário) e pede à equipe a correção do resto (D-DATAFIX).
 */

export const maskCpfDigits = (d: string) => (d.length === 11 ? `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••` : "•••");
export const maskCnpjDigits = (d: string) => (d.length === 14 ? `••.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-••` : "•••");

export type PortalProfile = Awaited<ReturnType<typeof portalProfile>>;

export async function portalProfile(prisma: PrismaClient, ctx: PortalContext, now = new Date()) {
  const c = await prisma.creator.findUniqueOrThrow({
    where: { id: ctx.creatorId },
    select: {
      categories: true,
      activatedAt: true,
      createdAt: true,
      contractStart: true,
      contractEnd: true,
      contractFileId: true,
      receivesAsIndividual: true,
      account: {
        select: {
          name: true, email: true, phone: true, cpf: true, cnpj: true, pixKey: true, pixKeyChangedAt: true, instagram: true, tiktok: true, birthDate: true,
          photoPath: true, igPhotoUrl: true, photoHidden: true,
          addrZip: true, addrStreet: true, addrNumber: true, addrComplement: true, addrDistrict: true, addrCity: true, addrState: true,
        },
      },
      commissionPolicies: { where: { confirmedAt: { not: null }, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] }, orderBy: { validFrom: "desc" }, take: 1, select: { rateBps: true } },
      couponAssignments: {
        where: { validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }], coupon: { kind: "CREATOR" } },
        orderBy: { validFrom: "asc" },
        select: { coupon: { select: { code: true, discountBps: true } } },
      },
    },
  });
  const a = c.account;
  const address: Address | null = addressOf(a);
  const [informed, release, fixes] = await Promise.all([
    address ? Promise.resolve(null) : informedAddressFor(prisma, ctx.creatorId),
    ctx.ugcOnly ? Promise.resolve(null) : releaseProgress(prisma, ctx.creatorId, now),
    prisma.dataFixRequest.findMany({ where: { creatorId: ctx.creatorId, brandId: ctx.brand.id, createdAt: { gte: new Date(now.getTime() - 90 * 86_400_000) } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, field: true, message: true, createdAt: true } }),
  ]);
  const done = fixes.length
    ? new Set((await prisma.actionDone.findMany({ where: { brandId: ctx.brand.id, key: { in: fixes.map((f) => `FIX_DATA:${f.id}`) } }, select: { key: true } })).map((d) => d.key))
    : new Set<string>();
  const photo = Boolean(a.photoPath) || (Boolean(a.igPhotoUrl) && !a.photoHidden);
  const completeness = profileCompleteness({ pix: Boolean(a.pixKey), address: address !== null, instagram: Boolean(a.instagram), tiktok: Boolean(a.tiktok), birthDate: Boolean(a.birthDate), photo });
  return {
    name: a.name,
    email: a.email,
    phone: a.phone,
    cpf: a.cpf ? maskCpfDigits(a.cpf) : null,
    cnpj: a.cnpj ? maskCnpjDigits(a.cnpj) : null,
    pix: a.pixKey ? maskPix(a.pixKey) : null,
    instagram: a.instagram,
    tiktok: a.tiktok,
    birthDate: a.birthDate ? a.birthDate.toISOString().slice(0, 10) : null,
    address,
    informed,
    completeness,
    partnership: {
      types: c.categories.map((k) => CREATOR_CATEGORY_LABEL[k]),
      receivesAs: c.receivesAsIndividual ? "Pessoa física (recibo)" : "Nota fiscal",
      rateBps: c.commissionPolicies[0]?.rateBps ?? null,
      coupons: c.couponAssignments.map((x) => ({ code: x.coupon.code, discountBps: x.coupon.discountBps })),
      since: (c.activatedAt ?? c.createdAt).toISOString().slice(0, 10),
      contractStart: c.contractStart ? c.contractStart.toISOString().slice(0, 10) : null,
      contractEnd: c.contractEnd ? c.contractEnd.toISOString().slice(0, 10) : null,
      contractFile: Boolean(c.contractFileId),
      minCents: release?.minCents ?? null,
      minBasis: release?.basis ?? null,
    },
    fixes: fixes.map((f) => ({ id: f.id, label: DATA_FIX_LABEL[f.field as DataFixField] ?? "o cadastro", message: f.message, day: f.createdAt.toISOString().slice(0, 10), done: done.has(`FIX_DATA:${f.id}`) })),
  };
}

export const DATA_FIX_FIELDS = ["NAME", "CPF", "CNPJ", "PHONE", "EMAIL", "OTHER"] as const satisfies readonly DataFixField[];

/** D-DATAFIX: a creator pede à equipe a correção de um dado que só a equipe muda (vira tarefa "Pediu correção"). */
export async function requestDataFix(prisma: PrismaClient, ctx: PortalContext, actorUserId: string, field: string, rawMessage: string): Promise<void> {
  if (ctx.viewAs) throw new SocialError("Visualização da equipe: nada é alterado em nome da creator.");
  if (!(DATA_FIX_FIELDS as readonly string[]).includes(field)) throw new SocialError("Escolha o que precisa corrigir.");
  const message = rawMessage.replace(/\s+/g, " ").trim().slice(0, 500);
  if (message.length < 3) throw new SocialError("Conte o que está errado e qual é o certo.");
  const since = new Date(Date.now() - 86_400_000);
  const recent = await prisma.dataFixRequest.count({ where: { creatorId: ctx.creatorId, createdAt: { gte: since } } });
  if (recent >= 5) throw new SocialError("Você já mandou vários pedidos hoje. A equipe vai olhar e te responder.");
  await prisma.$transaction(async (tx) => {
    const r = await tx.dataFixRequest.create({ data: { brandId: ctx.brand.id, creatorId: ctx.creatorId, field, message, createdById: actorUserId }, select: { id: true } });
    await tx.auditLog.create({ data: { brandId: ctx.brand.id, actorType: "USER", actorId: actorUserId, action: "creator.data_fix_requested", entity: "Creator", entityId: ctx.creatorId, after: { requestId: r.id, field } } });
  });
}

/** D-PORTALPROFILE: a creator troca o próprio Instagram (sem @, como no cadastro); a equipe vê na ficha e na auditoria. */
export async function updateMyInstagram(prisma: PrismaClient, ctx: PortalContext, actorUserId: string, raw: string): Promise<string> {
  if (ctx.viewAs) throw new SocialError("Visualização da equipe: nada é alterado em nome da creator.");
  const instagram = socialHandle(raw);
  if (!/^[A-Za-z0-9._]{1,30}$/.test(instagram)) throw new SocialError("Informe o seu @ do Instagram (letras, números, ponto ou _).");
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { accountId: true, brandId: true, account: { select: { instagram: true } } } });
  if (creator.account.instagram === instagram) return instagram;
  await prisma.$transaction([
    prisma.creatorAccount.update({ where: { id: creator.accountId }, data: { instagram } }),
    prisma.auditLog.create({
      data: { brandId: creator.brandId, actorType: "USER", actorId: actorUserId, action: "creator.instagram", entity: "CreatorAccount", entityId: creator.accountId, before: { instagram: creator.account.instagram }, after: { instagram } },
    }),
  ]);
  return instagram;
}

/** D-PORTALPROFILE: a creator corrige o próprio aniversário no "Meu cadastro" (o Início só pergunta enquanto não há data). */
export async function updateMyBirthDate(prisma: PrismaClient, ctx: PortalContext, actorUserId: string, raw: string, now = new Date()): Promise<void> {
  if (ctx.viewAs) throw new SocialError("Visualização da equipe: nada é alterado em nome da creator.");
  const b = parseBirthDate(raw, dayKey(now, "America/Sao_Paulo"));
  if (!b.ok) throw new SocialError(b.error);
  if (!b.day) throw new SocialError("Informe a data.");
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: ctx.creatorId }, select: { accountId: true, brandId: true, account: { select: { birthDate: true } } } });
  const before = creator.account.birthDate ? creator.account.birthDate.toISOString().slice(0, 10) : null;
  if (before === b.day) return;
  await prisma.$transaction([
    prisma.creatorAccount.update({ where: { id: creator.accountId }, data: { birthDate: new Date(`${b.day}T00:00:00Z`) } }),
    prisma.auditLog.create({ data: { brandId: creator.brandId, actorType: "USER", actorId: actorUserId, action: "creator.birthdate", entity: "CreatorAccount", entityId: creator.accountId, before: { birthDate: before }, after: { birthDate: b.day } } }),
  ]);
}
