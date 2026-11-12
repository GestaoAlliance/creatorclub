import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { photoFor, removePhoto, uploadPhoto, type PhotoStore } from "@/lib/photos/photos";
import type { PortalContext } from "@/lib/portal/context";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function staff(role: "GESTAO" | "PAGAMENTO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("foto de perfil (D-PHOTO, banco real)", () => {
  it("creator sobe e volta para a do Instagram; Gestão sobe e tira; quem pode ver; travas", async () => {
    const { brand, creator, account } = await seedBrand(prisma);
    const other = await seedBrand(prisma);
    const saved: string[] = [];
    const store: PhotoStore = { put: async (p) => void saved.push(p), signedUrl: async (p) => `https://storage.test/${p}` };
    const ctx = { creatorId: creator.id, brand: { id: brand.id }, viewAs: null } as unknown as PortalContext;
    const me = { kind: "creator" as const, ctx, userId: "u-creator" };

    await expect(uploadPhoto(prisma, me, creator.id, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), store)).rejects.toThrow(/Escolha uma foto/);
    await expect(uploadPhoto(prisma, { ...me, ctx: { ...ctx, viewAs: { userId: "x" } } as PortalContext }, creator.id, JPEG, store)).rejects.toThrow(/Visualização/);
    await expect(uploadPhoto(prisma, me, other.creator.id, JPEG, store)).rejects.toThrow(/permissão/);
    await uploadPhoto(prisma, me, creator.id, JPEG, store);
    let a = await prisma.creatorAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(a.photoPath).toBe(saved[0]);
    expect(saved[0]).toMatch(new RegExp(`^${account.id}/[0-9a-f-]{36}\\.jpg$`));

    // Quem vê: equipe da marca, creator da mesma marca; outra marca não.
    const gestao = await staff("GESTAO", brand.id);
    expect(await photoFor(prisma, gestao, creator.id, store)).toBe(`https://storage.test/${saved[0]}`);
    expect(await photoFor(prisma, { userId: "x", grants: [], creatorIds: { [brand.id]: "outra" } }, creator.id, store)).toContain("storage.test");
    expect(await photoFor(prisma, { userId: "x", grants: [], creatorIds: { [other.brand.id]: other.creator.id } }, creator.id, store)).toBeNull();
    expect(await photoFor(prisma, null, creator.id, store)).toBeNull();

    // Creator "usar a do Instagram": volta para a do Instagram.
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { igPhotoUrl: "https://cdn.instagram.test/p.jpg" } });
    await removePhoto(prisma, me, creator.id);
    expect(await photoFor(prisma, gestao, creator.id, store)).toBe("https://cdn.instagram.test/p.jpg");
    await expect(removePhoto(prisma, me, creator.id)).rejects.toThrow(/Não há foto/); // creator não esconde a do Instagram

    // Gestão: Pagamento não mexe; Gestão sobe, tira (volta ao Instagram) e tira de novo (esconde o Instagram).
    await expect(removePhoto(prisma, { kind: "staff", actor: await staff("PAGAMENTO", brand.id) }, creator.id)).rejects.toThrow(/permissão/);
    await uploadPhoto(prisma, { kind: "staff", actor: gestao }, creator.id, JPEG, store);
    await removePhoto(prisma, { kind: "staff", actor: gestao }, creator.id);
    await removePhoto(prisma, { kind: "staff", actor: gestao }, creator.id);
    a = await prisma.creatorAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(a).toMatchObject({ photoPath: null, photoHidden: true });
    expect(await photoFor(prisma, gestao, creator.id, store)).toBeNull();
    // Subir de novo mostra de novo.
    await uploadPhoto(prisma, me, creator.id, JPEG, store);
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: account.id } })).photoHidden).toBe(false);
    expect(await prisma.auditLog.count({ where: { entityId: account.id, action: { startsWith: "creator.photo." } } })).toBe(6);

    await expectDbError(prisma.creatorAccount.update({ where: { id: account.id }, data: { photoPath: "../x.png" } }), /CreatorAccount_photo_path/);
    await expectDbError(prisma.creatorAccount.update({ where: { id: account.id }, data: { igPhotoUrl: "http://x" } }), /CreatorAccount_ig_photo_url/);
  });
});
