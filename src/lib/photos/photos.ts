import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { isJpeg, MAX_PHOTO_BYTES, photoSource } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import type { PortalContext } from "@/lib/portal/context";

/**
 * Foto de perfil (D-PHOTO, pedido do responsável em 2026-11-12). A creator sobe pelo portal e a Gestão (quem edita
 * creators) sobe ou tira na ficha. A foto fica no bucket privado `fotos` (a foto antiga continua guardada: nada é
 * apagado); sem foto subida, vale a do Instagram. Quem vê: a equipe com acesso à marca e as creators da mesma marca
 * (placar das campanhas). Tudo vai para a auditoria.
 */

export class PhotoError extends Error {}
export const PHOTO_BUCKET = "fotos";

export type PhotoWho = { kind: "creator"; ctx: PortalContext; userId: string } | { kind: "staff"; actor: Actor | null };
export type PhotoStore = { put: (path: string, bytes: Uint8Array) => Promise<void>; signedUrl: (path: string) => Promise<string | null> };

/** Storage real (bucket privado criado na primeira vez). */
export function supabasePhotoStore(): PhotoStore {
  const admin = async () => (await import("@/lib/supabase/admin")).supabaseAdmin();
  return {
    put: async (path, bytes) => {
      const sb = await admin();
      let { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: false });
      if (error && /bucket not found/i.test(error.message)) {
        await sb.storage.createBucket(PHOTO_BUCKET, { public: false, fileSizeLimit: MAX_PHOTO_BYTES, allowedMimeTypes: ["image/jpeg"] });
        ({ error } = await sb.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: false }));
      }
      if (error) throw new PhotoError("Não deu para guardar a foto agora. Tente de novo.");
    },
    signedUrl: async (path) => {
      const { data } = await (await admin()).storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    },
  };
}

async function target(prisma: PrismaClient, who: PhotoWho, creatorId: string) {
  const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { brandId: true, accountId: true, account: { select: { photoPath: true, igPhotoUrl: true, photoHidden: true } } } });
  if (!c) throw new PhotoError("Creator não encontrada.");
  if (who.kind === "creator") {
    if (who.ctx.viewAs) throw new PhotoError("Visualização da equipe: nada é alterado em nome da creator.");
    if (who.ctx.creatorId !== creatorId) throw new PhotoError("Sem permissão.");
    return { ...c, actorId: who.userId, actorType: "USER" as const };
  }
  if (!who.actor || !can(who.actor.grants, "creators.edit", c.brandId)) throw new PhotoError("Sem permissão.");
  return { ...c, actorId: who.actor.userId, actorType: "USER" as const };
}

/** Sobe a foto (JPEG já reduzido no navegador). */
export async function uploadPhoto(prisma: PrismaClient, who: PhotoWho, creatorId: string, bytes: Uint8Array, store: PhotoStore, now = new Date()) {
  const t = await target(prisma, who, creatorId);
  if (!isJpeg(bytes)) throw new PhotoError("Escolha uma foto (JPG, PNG ou HEIC).");
  if (bytes.length > MAX_PHOTO_BYTES) throw new PhotoError("Foto grande demais. Escolha outra.");
  const path = `${t.accountId}/${randomUUID()}.jpg`;
  await store.put(path, bytes);
  await prisma.$transaction([
    prisma.creatorAccount.update({ where: { id: t.accountId }, data: { photoPath: path, photoUpdatedAt: now, photoHidden: false } }),
    prisma.auditLog.create({ data: { brandId: t.brandId, actorType: t.actorType, actorId: t.actorId, action: "creator.photo.upload", entity: "CreatorAccount", entityId: t.accountId, before: { photoPath: t.account.photoPath }, after: { photoPath: path } } }),
  ]);
  return { path };
}

/**
 * Tirar a foto. Com foto subida: volta para a do Instagram. Sem foto subida, a equipe pode esconder a do Instagram
 * (a creator não: para ela o botão é "usar a do Instagram").
 */
export async function removePhoto(prisma: PrismaClient, who: PhotoWho, creatorId: string, now = new Date()) {
  const t = await target(prisma, who, creatorId);
  const data = t.account.photoPath ? { photoPath: null } : who.kind === "staff" && t.account.igPhotoUrl && !t.account.photoHidden ? { photoHidden: true } : null;
  if (!data) throw new PhotoError("Não há foto para tirar.");
  await prisma.$transaction([
    prisma.creatorAccount.update({ where: { id: t.accountId }, data: { ...data, photoUpdatedAt: now } }),
    prisma.auditLog.create({ data: { brandId: t.brandId, actorType: t.actorType, actorId: t.actorId, action: "creator.photo.remove", entity: "CreatorAccount", entityId: t.accountId, before: { photoPath: t.account.photoPath, photoHidden: t.account.photoHidden }, after: data } }),
  ]);
}

/** Endereço para mostrar a foto a quem pediu (null = iniciais). Equipe da marca ou creator da mesma marca. */
export async function photoFor(prisma: PrismaClient, actor: Actor | null, creatorId: string, store: Pick<PhotoStore, "signedUrl">): Promise<string | null> {
  if (!actor) return null;
  const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { brandId: true, account: { select: { photoPath: true, igPhotoUrl: true, photoHidden: true } } } });
  if (!c) return null;
  if (!can(actor.grants, "creators.view", c.brandId) && !actor.creatorIds[c.brandId]) return null;
  const src = photoSource(c.account);
  if (src === "UPLOAD") return store.signedUrl(c.account.photoPath!);
  if (src === "INSTAGRAM") return c.account.igPhotoUrl;
  return null;
}
