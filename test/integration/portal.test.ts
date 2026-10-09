import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext, portalHome } from "@/lib/portal/context";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

/** Liga um login à conta da creator (como o convite faz). */
async function loginFor(accountId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: accountId }, data: { userId: id } });
  return (await loadActor(prisma, id))!;
}

describe("acesso ao portal (banco real)", () => {
  it("creator entra só nas marcas em que participa, com a cor de cada uma", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    await prisma.brand.update({ where: { id: a.brand.id }, data: { name: "AAA", primaryColor: "#323C91", secondaryColor: "#C4D78A" } });
    await prisma.brand.update({ where: { id: b.brand.id }, data: { name: "BBB" } });
    // A mesma conta participa também da marca B.
    await prisma.creator.create({ data: { brandId: b.brand.id, accountId: a.account.id, categories: [], status: "DEACTIVATED" } });
    const actor = await loginFor(a.account.id);

    expect(await portalHome(prisma, actor)).toBe(a.brand.slug);
    const ctx = await portalContext(prisma, actor, a.brand.slug);
    expect(ctx).toMatchObject({ creatorId: a.creator.id, brand: { slug: a.brand.slug, primaryColor: "#323C91", secondaryColor: "#C4D78A" } });
    expect(ctx.brands.map((x) => x.slug)).toEqual([a.brand.slug, b.brand.slug]);
    // Desligada também entra (D-PORTALACCESS).
    expect((await portalContext(prisma, actor, b.brand.slug)).status).toBe("DEACTIVATED");

    const stranger = await seedBrand(prisma);
    await expect(portalContext(prisma, actor, stranger.brand.slug)).rejects.toThrow(/Sem acesso/);
    await expect(portalContext(prisma, null, a.brand.slug)).rejects.toThrow(/Sem acesso/);
  });

  it("pessoa da equipe sem participação de creator não tem portal", async () => {
    const { brand } = await seedBrand(prisma);
    const id = randomUUID();
    await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "Ana", roleGrants: { create: { role: "GESTAO", brandId: brand.id } } } });
    const actor = (await loadActor(prisma, id))!;
    expect(await portalHome(prisma, actor)).toBeNull();
    await expect(portalContext(prisma, actor, brand.slug)).rejects.toThrow(/Sem acesso/);
  });

  it("o banco só aceita cor em #RRGGBB", async () => {
    const { brand } = await seedBrand(prisma);
    await expectDbError(prisma.brand.update({ where: { id: brand.id }, data: { primaryColor: "blue" } }), /Brand_colors_hex/);
    await expectDbError(prisma.brand.update({ where: { id: brand.id }, data: { secondaryColor: "#12345" } }), /Brand_colors_hex/);
  });
});
