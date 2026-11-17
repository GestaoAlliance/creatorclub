import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { createCreatorLogin, setTemporaryPassword } from "@/lib/auth/access";
import { changePixKey } from "@/lib/creators/pix";
import { updateContact } from "@/lib/creators/profile";
import { staffUpdateAddress } from "@/lib/shipments/shipments";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function gestao(brandIds: string[]) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "Gestão", roleGrants: { create: brandIds.map((brandId) => ({ role: "GESTAO" as const, brandId })) } } });
  return (await loadActor(prisma, id))!;
}

const ADDRESS = { zip: "01310-100", street: "Av. Paulista", number: "1000", district: "Bela Vista", city: "São Paulo", state: "SP" };
const admin = { setPassword: async () => {}, setEmail: async () => {} };

describe("conta de creator em duas marcas (D-SHAREDACCOUNT, banco real)", () => {
  it("só quem edita nas duas marcas muda Pix, contato, endereço e senha", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
    await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId, cpf: "52998224725" } });
    await prisma.creator.create({ data: { brandId: b.brand.id, accountId: a.account.id, categories: ["INFLUENCER"] } });
    const onlyA = await gestao([a.brand.id]);
    const both = await gestao([a.brand.id, b.brand.id]);
    const contact = { name: "Nome Novo", email: a.account.email, phone: "11999990000" };

    await expect(changePixKey(prisma, { kind: "staff", actor: onlyA, reason: "pediu" }, a.creator.id, "nova@exemplo.com")).rejects.toThrow(/outra marca/);
    await expect(updateContact(prisma, onlyA, a.creator.id, contact)).rejects.toThrow(/outra marca/);
    await expect(staffUpdateAddress(prisma, onlyA, a.creator.id, ADDRESS, true)).rejects.toThrow(/outra marca/);
    await expect(setTemporaryPassword(prisma, onlyA, userId, admin)).rejects.toThrow(/outra marca/);

    await changePixKey(prisma, { kind: "staff", actor: both, reason: "pediu" }, a.creator.id, "nova@exemplo.com");
    await updateContact(prisma, both, a.creator.id, contact);
    await staffUpdateAddress(prisma, both, a.creator.id, ADDRESS, true);
    expect((await setTemporaryPassword(prisma, both, userId, admin)).password).toHaveLength(10);
    expect(await prisma.creatorAccount.findUniqueOrThrow({ where: { id: a.account.id } })).toMatchObject({ pixKey: "nova@exemplo.com", name: "Nome Novo", addrCity: "São Paulo" });
  });

  it("D-ACCESSDIRECT: cria o acesso de quem nunca entrou, com senha provisória; só quem edita em todas as marcas", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    const onlyA = await gestao([a.brand.id]);
    const created: string[] = [];
    const login = async (email: string) => {
      created.push(email);
      return { userId: randomUUID() };
    };
    // Sem login, só na marca A.
    const r = await createCreatorLogin(prisma, onlyA, a.account.id, login, () => "senha12345");
    expect(r).toEqual({ password: "senha12345", email: a.account.email.toLowerCase() });
    const acc = await prisma.creatorAccount.findUniqueOrThrow({ where: { id: a.account.id }, include: { user: true } });
    expect(acc.user).toMatchObject({ email: a.account.email.toLowerCase(), mustChangePassword: true });
    await expect(createCreatorLogin(prisma, onlyA, a.account.id, login)).rejects.toThrow(/já tem acesso/);

    // Conta também da marca B: quem só edita A não cria.
    const shared = await prisma.creatorAccount.create({ data: { name: "Nas Duas", email: `${randomUUID()}@x.com` } });
    await prisma.creator.create({ data: { brandId: a.brand.id, accountId: shared.id, categories: ["INFLUENCER"] } });
    await prisma.creator.create({ data: { brandId: b.brand.id, accountId: shared.id, categories: ["INFLUENCER"] } });
    await expect(createCreatorLogin(prisma, onlyA, shared.id, login)).rejects.toThrow(/outra marca/);
    // E-mail fictício da importação: pede o real.
    const fake = await prisma.creatorAccount.create({ data: { name: "Sem Email", email: `x-${randomUUID()}@import.creatorclub` } });
    await prisma.creator.create({ data: { brandId: a.brand.id, accountId: fake.id, categories: ["INFLUENCER"] } });
    await expect(createCreatorLogin(prisma, onlyA, fake.id, login)).rejects.toThrow(/e-mail real/);
    expect(created).toHaveLength(1);
  });
});
