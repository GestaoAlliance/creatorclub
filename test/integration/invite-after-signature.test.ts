import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { EmailSender } from "@/lib/email/sender";
import type { WhatsAppMessage, WhatsAppSender } from "@/lib/notifications/whatsapp";
import { inviteAfterSignature, signedInviteText } from "@/lib/team/invite-after-signature";
import { letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

// Datas longe das outras suítes (o worker olha os contratos de todas as marcas assinados nos últimos 30 dias).
const NOON = new Date("2030-03-10T15:00:00Z"); // 12h em São Paulo
const NIGHT = new Date("2030-03-10T02:00:00Z"); // 23h em São Paulo

async function signed(opts: { userId?: string; email?: string; phone?: string; whatsappInstance?: string; pendingCoupon?: boolean } = {}) {
  const { brand, account, creator } = await seedBrand(prisma);
  if (opts.whatsappInstance) await prisma.brand.update({ where: { id: brand.id }, data: { whatsappInstance: opts.whatsappInstance } });
  if (opts.userId) await prisma.user.create({ data: { id: opts.userId, email: `${opts.userId}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: account.id }, data: { userId: opts.userId ?? null, phone: opts.phone ?? null, ...(opts.email ? { email: opts.email } : {}) } });
  const doc = await prisma.contractDocument.create({ data: { brandId: brand.id, kind: "INFLUENCER", version: 1, title: "Contrato", body: "x", createdById: "seed" } });
  const tpl = await prisma.contractTemplate.create({ data: { brandId: brand.id, key: `t-${letters(4)}`, name: "T", months: 6 } });
  const body = "Contrato assinado.";
  const req = await prisma.contractRequest.create({
    data: {
      brandId: brand.id, creatorId: creator.id, contractDocumentId: doc.id, contractTemplateId: tpl.id, externalId: randomUUID(),
      signerName: account.name, signerEmail: account.email, body, bodySha256: createHash("sha256").update(body).digest("hex"), createdById: "seed",
      status: "SIGNED", signedAt: new Date(NOON.getTime() - 3_600_000), ...(opts.pendingCoupon ? { pendingCouponCode: `P${letters(5)}`, pendingDiscountBps: 1000 } : {}),
    },
  });
  return { brand, account, req };
}

function fakeEmail() {
  const sent: string[] = [];
  const sender: EmailSender = async (m) => (sent.push(m.to), { id: randomUUID() });
  return { sent, sender };
}
function fakeWhatsApp() {
  const sent: WhatsAppMessage[] = [];
  const sender: WhatsAppSender = async (m) => void sent.push(m);
  return { sent, sender };
}
const reqOf = (id: string) => prisma.contractRequest.findUniqueOrThrow({ where: { id } });
const invitesOf = (accountId: string) => prisma.creatorInvite.findMany({ where: { accountId } });

describe("convite do portal sozinho depois da assinatura (D-INVITEAUTO, banco real)", () => {
  it("assinado com e-mail: cria o convite, manda uma vez e marca o contrato", async () => {
    const s = await signed();
    const mail = fakeEmail();
    await inviteAfterSignature(prisma, { origin: "https://cc.test", email: mail.sender, whatsapp: null, now: NOON });
    expect(mail.sent).toEqual([s.account.email]);
    expect((await reqOf(s.req.id)).inviteSentAt).toEqual(NOON);
    const inv = await invitesOf(s.account.id);
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({ createdById: "system:contract", revokedAt: null, emailedAt: NOON });
    expect(await prisma.auditLog.count({ where: { action: "creator_invite.auto", entityId: s.account.id } })).toBe(1);
    // Rodada seguinte: nada de novo.
    await inviteAfterSignature(prisma, { origin: "https://cc.test", email: mail.sender, whatsapp: null, now: NOON });
    expect(mail.sent).toHaveLength(1);
    expect(await invitesOf(s.account.id)).toHaveLength(1);
  });

  it("quem já tem login (cadastro pelo site) não recebe convite; só marca", async () => {
    const s = await signed({ userId: randomUUID() });
    const mail = fakeEmail();
    await inviteAfterSignature(prisma, { origin: "https://cc.test", email: mail.sender, whatsapp: null, now: NOON });
    expect(mail.sent).not.toContain(s.account.email);
    expect((await reqOf(s.req.id)).inviteSentAt).toEqual(NOON);
    expect(await invitesOf(s.account.id)).toHaveLength(0);
  });

  it("sem canal (e-mail provisório e sem WhatsApp): não cria convite; a Ana gera pela ficha", async () => {
    const s = await signed({ email: `x${letters(6)}@import.creatorclub` });
    await inviteAfterSignature(prisma, { origin: "https://cc.test", email: null, whatsapp: null, now: NOON });
    expect((await reqOf(s.req.id)).inviteSentAt).toBeNull();
    expect(await invitesOf(s.account.id)).toHaveLength(0);
  });

  it("cupom ainda não criado na Shopify: espera", async () => {
    const s = await signed({ pendingCoupon: true });
    const mail = fakeEmail();
    await inviteAfterSignature(prisma, { origin: "https://cc.test", email: mail.sender, whatsapp: null, now: NOON });
    expect(mail.sent).not.toContain(s.account.email);
    expect((await reqOf(s.req.id)).inviteSentAt).toBeNull();
    await prisma.contractRequest.update({ where: { id: s.req.id }, data: { couponCreatedAt: NOON } });
    await inviteAfterSignature(prisma, { origin: "https://cc.test", email: mail.sender, whatsapp: null, now: NOON });
    expect(mail.sent).toContain(s.account.email);
  });

  it("WhatsApp da marca: fora do horário espera; no horário manda o link pelo WhatsApp", async () => {
    const s = await signed({ phone: "(31) 99876-5432", whatsappInstance: `inst-${letters(4)}` });
    const wa = fakeWhatsApp();
    await inviteAfterSignature(prisma, { origin: "https://cc.test", email: null, whatsapp: wa.sender, now: NIGHT });
    expect(wa.sent.filter((m) => m.phone === "5531998765432")).toHaveLength(0);
    expect(await invitesOf(s.account.id)).toHaveLength(0);
    await inviteAfterSignature(prisma, { origin: "https://cc.test", email: null, whatsapp: wa.sender, now: NOON });
    const mine = wa.sent.filter((m) => m.phone === "5531998765432");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: "INVITE", brand: s.brand.name });
    expect(mine[0]!.text).toMatch(/https:\/\/cc\.test\/convite\/\S+/);
    expect((await reqOf(s.req.id)).inviteSentAt).toEqual(NOON);
  });

  it("nada entregue: o convite é cancelado e tenta de novo depois", async () => {
    const s = await signed();
    const failing: EmailSender = async () => {
      const { EmailError } = await import("@/lib/email/sender");
      throw new EmailError("recusado");
    };
    await inviteAfterSignature(prisma, { origin: "https://cc.test", email: failing, whatsapp: null, now: NOON });
    expect((await reqOf(s.req.id)).inviteSentAt).toBeNull();
    const inv = await invitesOf(s.account.id);
    expect(inv.length).toBeGreaterThanOrEqual(1);
    expect(inv.every((i) => i.revokedAt !== null)).toBe(true);
  });

  it("texto do WhatsApp", () => {
    const t = signedInviteText({ name: "Maria da Silva", brand: "Botanika", link: "https://x/convite/abc", until: new Date("2030-03-17T15:00:00Z") });
    expect(t).toContain("Oi, Maria!");
    expect(t).toContain("https://x/convite/abc");
    expect(t).toContain("17/03");
  });
});
