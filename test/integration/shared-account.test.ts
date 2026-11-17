import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { setTemporaryPassword } from "@/lib/auth/access";
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
});
