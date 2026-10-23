import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { emailPasswordReset, passwordResetLink, touchLastSeen } from "@/lib/auth/access";
import { loadActor } from "@/lib/auth/actor";
import type { EmailMessage } from "@/lib/email/sender";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function staff(role: "SUPER_ADMIN" | "GESTAO" | "PAGAMENTO", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: `Pessoa ${role}`, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}
const token = async (email: string) => `tok-${email}`;

describe("acesso: último acesso e nova senha (M4.4b, D-ACCESS, banco real)", () => {
  it("último acesso: grava na primeira vez e no máximo uma vez por hora", async () => {
    const a = await staff("GESTAO", (await seedBrand(prisma)).brand.id);
    const t0 = new Date("2026-10-23T12:00:00Z");
    await touchLastSeen(prisma, a.userId, t0);
    await touchLastSeen(prisma, a.userId, new Date("2026-10-23T12:30:00Z"));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.userId } })).lastSeenAt).toEqual(t0);
    await touchLastSeen(prisma, a.userId, new Date("2026-10-23T13:01:00Z"));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.userId } })).lastSeenAt).toEqual(new Date("2026-10-23T13:01:00Z"));
  });

  it("creator: Gestão da marca dela e super admin; outra marca e Pagamento não; equipe só super admin; e-mail", async () => {
    const { brand, account } = await seedBrand(prisma);
    const other = await seedBrand(prisma);
    const uid = randomUUID();
    await prisma.user.create({ data: { id: uid, email: account.email, name: account.name } });
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { userId: uid } });
    const gestao = await staff("GESTAO", brand.id);
    const link = await passwordResetLink(prisma, gestao, uid, "https://app.test", token);
    expect(link).toBe(`https://app.test/auth/confirm?token_hash=${encodeURIComponent(`tok-${account.email}`)}&type=recovery&next=/entrar/nova-senha`);
    await expect(passwordResetLink(prisma, await staff("GESTAO", other.brand.id), uid, "x", token)).rejects.toThrow(/permissão/);
    await expect(passwordResetLink(prisma, await staff("PAGAMENTO", brand.id), uid, "x", token)).rejects.toThrow(/permissão/);
    await expect(passwordResetLink(prisma, gestao, gestao.userId, "x", token)).rejects.toThrow(/sua própria senha/);

    const colleague = await staff("GESTAO", brand.id);
    await expect(passwordResetLink(prisma, gestao, colleague.userId, "x", token)).rejects.toThrow(/permissão/);
    const admin = await staff("SUPER_ADMIN", null);
    await expect(passwordResetLink(prisma, admin, colleague.userId, "x", token)).resolves.toContain("/auth/confirm?");

    const sent: EmailMessage[] = [];
    await expect(emailPasswordReset(prisma, gestao, uid, "https://app.test", token, null)).rejects.toThrow(/não está configurado/);
    expect(await emailPasswordReset(prisma, gestao, uid, "https://app.test", token, async (m) => (sent.push(m), { id: "1" }))).toBe(account.email);
    expect(sent[0]).toMatchObject({ to: account.email, subject: `Nova senha do Creator Club ${brand.name}` });
    expect(sent[0]!.text).toContain("/auth/confirm?token_hash=");
    expect(await prisma.auditLog.count({ where: { entityId: uid, action: { in: ["password.reset_link", "password.reset_email"] } } })).toBe(2);
  });
});
