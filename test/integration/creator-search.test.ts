import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { searchCreators } from "@/lib/creators/search";
import { letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(grants: { role: "SUPER_ADMIN" | "GESTAO" | "ENVIO" | "PAGAMENTO"; brandId: string | null }[]) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "X", roleGrants: { create: grants } } });
  return (await loadActor(prisma, id))!;
}

describe("busca de creator no painel inteiro (M0.5, banco real)", () => {
  it("acha por nome, cupom e @ nas marcas do acesso; CPF só para quem vê dado fiscal", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    const tag = letters(6).toLowerCase();
    await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { name: `Mariana ${tag}`, instagram: `mari.${tag}`, cpf: "52998224725" } });
    await prisma.creatorAccount.update({ where: { id: b.account.id }, data: { name: `Bruna ${tag}`, tiktok: `bru_${tag}` } });
    const uid = randomUUID();
    await prisma.user.create({ data: { id: uid, email: `${uid}@x.com`, name: "seed" } });
    await prisma.couponAssignment.create({ data: { brandId: a.brand.id, couponId: a.coupon.id, creatorId: a.creator.id, validFrom: new Date("2026-01-01"), createdById: uid } });

    const admin = await userWith([{ role: "SUPER_ADMIN", brandId: null }]);
    expect((await searchCreators(prisma, admin, tag)).map((h) => h.brand.slug).sort()).toEqual([a.brand.slug, b.brand.slug].sort());
    expect((await searchCreators(prisma, admin, `@mari.${tag}`))[0]).toMatchObject({ id: a.creator.id, coupon: a.coupon.code, instagram: `mari.${tag}` });
    expect((await searchCreators(prisma, admin, a.coupon.code.toLowerCase())).map((h) => h.id)).toContain(a.creator.id);
    expect((await searchCreators(prisma, admin, `bru_${tag}`)).map((h) => h.id)).toEqual([b.creator.id]);
    expect((await searchCreators(prisma, admin, "529.982.247-25")).map((h) => h.id)).toContain(a.creator.id);

    // Gestão só da marca B: não acha a da marca A, nem pelo nome.
    const gestaoB = await userWith([{ role: "GESTAO", brandId: b.brand.id }]);
    expect((await searchCreators(prisma, gestaoB, tag)).map((h) => h.id)).toEqual([b.creator.id]);
    // Envio vê creators, mas não CPF: buscar pelo CPF não acha.
    const envio = await userWith([{ role: "ENVIO", brandId: a.brand.id }]);
    expect(await searchCreators(prisma, envio, "52998224725")).toEqual([]);
    expect(await searchCreators(prisma, envio, "a")).toEqual([]); // curto demais
  });
});
