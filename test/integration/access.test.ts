import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor, staffBrandFilter } from "@/lib/auth/actor";
import type { StaffRole } from "@/lib/auth/permissions";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(grants: { role: StaffRole; brandId: string | null }[], disabled = false) {
  const id = randomUUID();
  await prisma.user.create({
    data: {
      id,
      email: `u-${id}@example.com`,
      name: "Teste",
      disabledAt: disabled ? new Date() : null,
      roleGrants: { create: grants },
    },
  });
  return id;
}

/** Creators que o usuário enxerga com a permissão, entre as marcas dadas (isola de outros testes). */
async function visibleCreators(userId: string, brandIds: string[]) {
  const actor = await loadActor(prisma, userId);
  if (!actor) return null;
  const filter = staffBrandFilter(actor, "creators.view");
  if (!filter) return [];
  const rows = await prisma.creator.findMany({
    where: { AND: [filter, { brandId: { in: brandIds } }] },
    select: { brandId: true },
  });
  return [...new Set(rows.map((r) => r.brandId))].sort();
}

describe("acesso por papel e marca (banco real)", () => {
  it("cada papel só enxerga as creators das marcas em que tem permissão", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    const both = [a.brand.id, b.brand.id].sort();

    expect(await visibleCreators(await userWith([{ role: "SUPER_ADMIN", brandId: null }]), both)).toEqual(both);
    expect(await visibleCreators(await userWith([{ role: "GESTAO", brandId: a.brand.id }]), both)).toEqual([a.brand.id]);
    expect(await visibleCreators(await userWith([{ role: "PAGAMENTO", brandId: b.brand.id }]), both)).toEqual([b.brand.id]);
    expect(await visibleCreators(await userWith([{ role: "ENVIO", brandId: a.brand.id }]), both)).toEqual([]);
    expect(await visibleCreators(await userWith([{ role: "HUNTER", brandId: a.brand.id }]), both)).toEqual([]);
    expect(await visibleCreators(await userWith([]), both)).toEqual([]);
  });

  it("usuário desativado ou inexistente não tem acesso", async () => {
    const { brand } = await seedBrand(prisma);
    const disabled = await userWith([{ role: "SUPER_ADMIN", brandId: null }], true);
    expect(await visibleCreators(disabled, [brand.id])).toBeNull();
    expect(await loadActor(prisma, randomUUID())).toBeNull();
  });

  it("creator logada recebe as próprias participações por marca", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email: `c-${userId}@example.com`, name: "Creator" } });
    await prisma.creatorAccount.update({ where: { id: creator.accountId }, data: { userId } });
    const actor = await loadActor(prisma, userId);
    expect(actor?.creatorIds).toEqual({ [brand.id]: creator.id });
    expect(actor?.grants).toEqual([]);
  });
});
