import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor, type Actor } from "@/lib/auth/actor";
import { acceptCreatorInvite, createCreatorInvite, creatorInviteByToken } from "@/lib/team/creator-invites";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function staff(role: "SUPER_ADMIN" | "GESTAO" | "PAGAMENTO", brandId: string | null): Promise<Actor> {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `s-${id}@example.com`, name: "S", roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("convite da creator", () => {
  it("Gestão da marca convida; a creator aceita uma vez e o login fica ligado à conta", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const account = await prisma.creatorAccount.findUniqueOrThrow({ where: { id: creator.accountId } });
    const gestao = await staff("GESTAO", brand.id);
    const { token } = await createCreatorInvite(prisma, gestao, account.id);
    expect((await creatorInviteByToken(prisma, token)).state).toBe("valid");

    const userId = randomUUID();
    await acceptCreatorInvite(prisma, token, { userId, email: account.email.toUpperCase() });
    const actor = await loadActor(prisma, userId);
    expect(actor?.creatorIds).toEqual({ [brand.id]: creator.id });
    expect(actor?.grants).toEqual([]);
    expect((await creatorInviteByToken(prisma, token)).state).toBe("used");
    await expect(acceptCreatorInvite(prisma, token, { userId, email: account.email })).rejects.toThrow(/já usado/);
    await expect(createCreatorInvite(prisma, gestao, account.id)).rejects.toThrow(/já tem acesso/);
  });

  it("quem não edita creators daquela marca não convida", async () => {
    const { creator } = await seedBrand(prisma);
    const other = await seedBrand(prisma);
    await expect(createCreatorInvite(prisma, await staff("GESTAO", other.brand.id), creator.accountId)).rejects.toThrow(/Sem permissão/);
    await expect(createCreatorInvite(prisma, await staff("PAGAMENTO", creator.brandId), creator.accountId)).rejects.toThrow(/Sem permissão/);
    await expect(createCreatorInvite(prisma, null, creator.accountId)).rejects.toThrow(/Sem permissão/);
    const admin = await staff("SUPER_ADMIN", null);
    expect((await createCreatorInvite(prisma, admin, creator.accountId)).token).toBeTruthy();
  });

  it("não liga conta por e-mail diferente, nem com convite vencido", async () => {
    const { creator } = await seedBrand(prisma);
    const account = await prisma.creatorAccount.findUniqueOrThrow({ where: { id: creator.accountId } });
    const admin = await staff("SUPER_ADMIN", null);
    const { token } = await createCreatorInvite(prisma, admin, account.id);
    await expect(acceptCreatorInvite(prisma, token, { userId: randomUUID(), email: "outra@example.com" })).rejects.toThrow(/outro e-mail/);
    const { token: old } = await createCreatorInvite(prisma, admin, account.id, new Date("2020-01-01T00:00:00Z"));
    expect((await creatorInviteByToken(prisma, old)).state).toBe("expired");
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: account.id } })).userId).toBeNull();
  });

  it("o banco recusa convite aceito sem usuário", async () => {
    const { creator } = await seedBrand(prisma);
    await expectDbError(
      prisma.creatorInvite.create({
        data: { accountId: creator.accountId, tokenHash: randomUUID(), expiresAt: new Date(), createdById: "x", acceptedAt: new Date() },
      }),
      /CreatorInvite_accepted_has_user/,
    );
  });
});
