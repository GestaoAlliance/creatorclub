import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor, type Actor } from "@/lib/auth/actor";
import {
  acceptStaffInvite,
  createStaffInvite,
  disableStaffUser,
  inviteByToken,
  revokeRoleGrant,
  revokeStaffInvite,
} from "@/lib/team/invites";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function superAdmin(): Promise<Actor> {
  const id = randomUUID();
  await prisma.user.create({
    data: { id, email: `sa-${id}@example.com`, name: "SA", roleGrants: { create: { role: "SUPER_ADMIN", brandId: null } } },
  });
  return (await loadActor(prisma, id))!;
}

const email = () => `pessoa-${randomUUID()}@example.com`;

describe("convite da equipe", () => {
  it("super admin convida; a pessoa aceita uma vez e ganha o papel na marca", async () => {
    const admin = await superAdmin();
    const { brand } = await seedBrand(prisma);
    const to = email();
    const { token } = await createStaffInvite(prisma, admin, { email: to.toUpperCase(), name: "Juci", role: "PAGAMENTO", brandId: brand.id });

    expect((await inviteByToken(prisma, token)).state).toBe("valid");
    const userId = randomUUID();
    await acceptStaffInvite(prisma, token, { userId, email: to });
    const actor = await loadActor(prisma, userId);
    expect(actor?.grants).toEqual([{ role: "PAGAMENTO", brandId: brand.id }]);
    expect((await inviteByToken(prisma, token)).state).toBe("used");

    await expect(acceptStaffInvite(prisma, token, { userId, email: to })).rejects.toThrow(/já usado/);
    expect(await prisma.auditLog.count({ where: { action: { in: ["invite.create", "invite.accept"] }, actorId: { in: [admin.userId, userId] } } })).toBe(2);
  });

  it("recusa outro e-mail, convite expirado e convite cancelado", async () => {
    const admin = await superAdmin();
    const to = email();
    const past = new Date("2020-01-01T00:00:00Z");
    const { token: oldToken } = await createStaffInvite(prisma, admin, { email: to, name: "X", role: "SUPER_ADMIN", brandId: "" }, past);
    expect((await inviteByToken(prisma, oldToken)).state).toBe("expired");
    await expect(acceptStaffInvite(prisma, oldToken, { userId: randomUUID(), email: to })).rejects.toThrow(/expirado/);

    const { token, invite } = await createStaffInvite(prisma, admin, { email: to, name: "X", role: "SUPER_ADMIN", brandId: "" });
    await expect(acceptStaffInvite(prisma, token, { userId: randomUUID(), email: email() })).rejects.toThrow(/outro e-mail/);
    await revokeStaffInvite(prisma, admin, invite.id);
    expect((await inviteByToken(prisma, token)).state).toBe("revoked");
    expect((await inviteByToken(prisma, "token-que-nao-existe")).state).toBe("invalid");
  });

  it("só super admin convida; papel de marca exige marca", async () => {
    const admin = await superAdmin();
    const { brand } = await seedBrand(prisma);
    const gestorId = randomUUID();
    await prisma.user.create({ data: { id: gestorId, email: email(), name: "G", roleGrants: { create: { role: "GESTAO", brandId: brand.id } } } });
    const gestor = await loadActor(prisma, gestorId);
    await expect(createStaffInvite(prisma, gestor, { email: email(), name: "X", role: "ENVIO", brandId: brand.id })).rejects.toThrow(/Sem permissão/);
    await expect(createStaffInvite(prisma, null, { email: email(), name: "X", role: "ENVIO", brandId: brand.id })).rejects.toThrow(/Sem permissão/);
    await expect(createStaffInvite(prisma, admin, { email: email(), name: "X", role: "ENVIO", brandId: "" })).rejects.toThrow(/Escolha a marca/);
  });

  it("o banco recusa convite global para papel que não é super admin", async () => {
    await expectDbError(
      prisma.staffInvite.create({
        data: { email: email(), name: "X", role: "GESTAO", brandId: null, tokenHash: randomUUID(), expiresAt: new Date(), createdById: "x" },
      }),
      /StaffInvite_global_only_super_admin/,
    );
  });
});

describe("remover da equipe", () => {
  it("tira papel e desativa pessoa, com auditoria; ninguém tira o próprio super admin", async () => {
    const admin = await superAdmin();
    const other = await superAdmin();
    const { brand } = await seedBrand(prisma);
    const personId = randomUUID();
    await prisma.user.create({ data: { id: personId, email: email(), name: "P", roleGrants: { create: { role: "ENVIO", brandId: brand.id } } } });
    const grant = await prisma.roleGrant.findFirstOrThrow({ where: { userId: personId } });

    await revokeRoleGrant(prisma, admin, grant.id);
    expect((await loadActor(prisma, personId))?.grants).toEqual([]);

    const ownSuper = await prisma.roleGrant.findFirstOrThrow({ where: { userId: admin.userId } });
    await expect(revokeRoleGrant(prisma, admin, ownSuper.id)).rejects.toThrow(/próprio super admin/);
    await expect(disableStaffUser(prisma, admin, admin.userId)).rejects.toThrow(/a si mesmo/);

    await disableStaffUser(prisma, admin, other.userId);
    expect(await loadActor(prisma, other.userId)).toBeNull();
    expect(await prisma.auditLog.count({ where: { actorId: admin.userId, action: { in: ["role.revoke", "user.disable"] } } })).toBe(2);
  });
});
