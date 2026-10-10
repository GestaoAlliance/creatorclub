import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor, type Actor } from "@/lib/auth/actor";
import { EmailError, type EmailMessage, type EmailSender } from "@/lib/email/sender";
import { createCreatorInvite } from "@/lib/team/creator-invites";
import { emailCreatorInvite, emailStaffInvite } from "@/lib/team/invite-email";
import { createStaffInvite } from "@/lib/team/invites";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function staff(role: "SUPER_ADMIN" | "GESTAO", brandId: string | null): Promise<Actor> {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `s-${id}@example.com`, name: "S", roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

/** Remetente falso: guarda as mensagens; nenhum e-mail sai de verdade. */
function fakeSender(fail?: string) {
  const sent: EmailMessage[] = [];
  const sender: EmailSender = async (m) => {
    if (fail) throw new EmailError(fail);
    sent.push(m);
    return { id: `email-${sent.length}` };
  };
  return { sender, sent };
}

describe("convite por e-mail (D-EMAIL, banco real)", () => {
  it("creator: manda o link para o e-mail da conta, marca o envio e registra na auditoria", async () => {
    const { brand, creator } = await seedBrand(prisma);
    await prisma.brand.update({ where: { id: brand.id }, data: { name: "Botanika Teste" } });
    const account = await prisma.creatorAccount.findUniqueOrThrow({ where: { id: creator.accountId } });
    const g = await staff("GESTAO", brand.id);
    const { invite } = await createCreatorInvite(prisma, g, account.id);
    const fake = fakeSender();
    const r = await emailCreatorInvite(prisma, fake.sender, { inviteId: invite.id, actorId: g.userId, link: "https://app/convite/tok" });
    expect(r).toEqual({ sent: true, to: account.email });
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]).toMatchObject({ to: account.email, subject: "Seu acesso ao Creator Club Botanika Teste", idempotencyKey: `invite-${invite.id}` });
    expect(fake.sent[0]!.text).toContain("https://app/convite/tok");
    expect((await prisma.creatorInvite.findUniqueOrThrow({ where: { id: invite.id } })).emailedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "invite.emailed", entityId: invite.id, brandId: brand.id } })).toBe(1);
  });

  it("falha no envio não desfaz o convite: fica na auditoria e volta o motivo", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const g = await staff("GESTAO", brand.id);
    const { invite } = await createCreatorInvite(prisma, g, creator.accountId);
    const r = await emailCreatorInvite(prisma, fakeSender("O provedor de e-mail recusou (422).").sender, { inviteId: invite.id, actorId: g.userId, link: "https://x" });
    expect(r).toMatchObject({ sent: false, reason: "O provedor de e-mail recusou (422)." });
    const saved = await prisma.creatorInvite.findUniqueOrThrow({ where: { id: invite.id } });
    expect(saved.emailedAt).toBeNull();
    expect(saved.revokedAt).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "invite.email_failed", entityId: invite.id } })).toBe(1);
  });

  it("sem remetente configurado não faz nada; convite da equipe vai com papel e marca", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const sa = await staff("SUPER_ADMIN", null);
    const { invite: ci } = await createCreatorInvite(prisma, sa, creator.accountId);
    expect(await emailCreatorInvite(prisma, null, { inviteId: ci.id, actorId: sa.userId, link: "https://x" })).toBeNull();
    expect((await prisma.creatorInvite.findUniqueOrThrow({ where: { id: ci.id } })).emailedAt).toBeNull();

    await prisma.brand.update({ where: { id: brand.id }, data: { name: "Botanika Equipe" } });
    const email = `novo-${randomUUID()}@example.com`;
    const { invite } = await createStaffInvite(prisma, sa, { email, name: "Joana Exemplo", role: "GESTAO", brandId: brand.id });
    const fake = fakeSender();
    expect(await emailStaffInvite(prisma, fake.sender, { inviteId: invite.id, actorId: sa.userId, link: "https://app/convite/t2" })).toEqual({ sent: true, to: email });
    expect(fake.sent[0]!.text).toContain("como Gestão da Botanika Equipe.");
    expect((await prisma.staffInvite.findUniqueOrThrow({ where: { id: invite.id } })).emailedAt).not.toBeNull();
  });
});
