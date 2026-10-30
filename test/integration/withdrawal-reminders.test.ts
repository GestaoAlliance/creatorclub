import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { runWithdrawalReminders } from "@/lib/notifications/withdrawals";
import type { WhatsAppMessage } from "@/lib/notifications/whatsapp";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

// 9h05 em São Paulo de cada dia de novembro.
const at = (day: number) => new Date(`2026-11-${String(day).padStart(2, "0")}T12:05:00Z`);

async function user(role: "PAGAMENTO" | "GESTAO" | "ENVIO", brandId: string, phone: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, phone, roleGrants: { create: { role, brandId } } } });
}

describe("lembretes dos saques (D-WDREMIND, banco real)", () => {
  it("Pagamento: dias 13 e 15 e atrasados todo dia; Gestão: dia 11 com os pedidos; uma vez por dia; nada pendente, nada", async () => {
    const s = await seedBrand(prisma);
    await prisma.brand.update({ where: { id: s.brand.id }, data: { whatsappInstance: "botanika" } });
    await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { name: "Ana Exemplo" } });
    const acc2 = await prisma.creatorAccount.create({ data: { name: "Bia Exemplo", email: `${randomUUID()}@x.com` } });
    const c2 = await prisma.creator.create({ data: { brandId: s.brand.id, accountId: acc2.id, categories: ["INFLUENCER"] } });
    await user("PAGAMENTO", s.brand.id, "5531911112222");
    await user("GESTAO", s.brand.id, "5531933334444");
    await user("ENVIO", s.brand.id, "5531955556666");
    const sent: WhatsAppMessage[] = [];
    const sender = async (m: WhatsAppMessage) => void sent.push(m);
    const mine = () => sent.filter((m) => m.brand === s.brand.name);

    // Nada pendente: nada sai.
    await runWithdrawalReminders(prisma, sender, "https://x.test", at(13));
    expect(mine()).toHaveLength(0);

    await prisma.withdrawal.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, amountCents: 12_345, idempotencyKey: randomUUID() } });
    await prisma.withdrawal.create({ data: { brandId: s.brand.id, creatorId: c2.id, amountCents: 50_000, idempotencyKey: randomUUID(), status: "APPROVED", approvedAt: at(5), approvedById: "x" } });

    await runWithdrawalReminders(prisma, sender, "https://x.test", at(11));
    expect(mine()).toHaveLength(1);
    expect(mine()[0]).toMatchObject({ phone: "5531933334444", kind: "WITHDRAWAL_APPROVE_REMINDER" });
    expect(mine()[0]!.text).toContain("1 saque pedido esperando a sua aprovação");
    expect(mine()[0]!.text).toContain("• Ana Exemplo: R$ 123,45");

    await runWithdrawalReminders(prisma, sender, "https://x.test", at(12)); // dia 12: nada
    expect(mine()).toHaveLength(1);

    await runWithdrawalReminders(prisma, sender, "https://x.test", at(13));
    await runWithdrawalReminders(prisma, sender, "https://x.test", new Date(at(13).getTime() + 3_600_000)); // mesma data: não repete
    const pay = mine().filter((m) => m.kind === "WITHDRAWAL_PAY_REMINDER");
    expect(pay).toHaveLength(1);
    expect(pay[0]).toMatchObject({ phone: "5531911112222" });
    expect(pay[0]!.text).toContain("faltam 2 dias");
    expect(pay[0]!.text).toContain("• Bia Exemplo: R$ 500,00");
    expect(pay[0]!.text).toContain("https://x.test/admin/saques");

    await runWithdrawalReminders(prisma, sender, "https://x.test", at(14)); // dia 14: nada
    await runWithdrawalReminders(prisma, sender, "https://x.test", at(15));
    await runWithdrawalReminders(prisma, sender, "https://x.test", at(17));
    const texts = mine().filter((m) => m.kind === "WITHDRAWAL_PAY_REMINDER").map((m) => m.text);
    expect(texts).toHaveLength(3);
    expect(texts[1]).toContain("vence hoje");
    expect(texts[2]).toContain("1 saque atrasado");

    // Fora do horário, nada.
    await runWithdrawalReminders(prisma, sender, "https://x.test", new Date("2026-11-18T02:00:00Z"));
    expect(mine().filter((m) => m.kind === "WITHDRAWAL_PAY_REMINDER")).toHaveLength(3);
  });

  it("D-REVITARULES: marca com pedido do dia 5 ao 15 e Pix até o 25 avisa a Gestão no dia 16 e o Pagamento nos dias 23 e 25", async () => {
    const s = await seedBrand(prisma);
    await prisma.brand.update({ where: { id: s.brand.id }, data: { whatsappInstance: "revita", withdrawalWindowStartDay: 5, withdrawalWindowEndDay: 15, withdrawalPayFromDay: 20, withdrawalPayByDay: 25 } });
    await user("PAGAMENTO", s.brand.id, "5531911117777");
    await user("GESTAO", s.brand.id, "5531933338888");
    await prisma.withdrawal.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, amountCents: 20_000, idempotencyKey: randomUUID() } });
    const sent: WhatsAppMessage[] = [];
    const sender = async (m: WhatsAppMessage) => void sent.push(m);
    const mine = () => sent.filter((m) => m.brand === s.brand.name);
    for (const d of [11, 13, 15]) await runWithdrawalReminders(prisma, sender, null, at(d));
    expect(mine()).toHaveLength(0);
    await runWithdrawalReminders(prisma, sender, null, at(16));
    expect(mine().map((m) => m.kind)).toEqual(["WITHDRAWAL_APPROVE_REMINDER"]);
    expect(mine()[0]!.text).toContain("pagar até o dia 25");
    await prisma.withdrawal.updateMany({ where: { brandId: s.brand.id }, data: { status: "APPROVED", approvedAt: at(16), approvedById: "x" } });
    await runWithdrawalReminders(prisma, sender, null, at(23));
    await runWithdrawalReminders(prisma, sender, null, at(24));
    await runWithdrawalReminders(prisma, sender, null, at(25));
    expect(mine().filter((m) => m.kind === "WITHDRAWAL_PAY_REMINDER").map((m) => m.text.split("\n")[0])).toEqual([
      `*${s.brand.name}: 1 saque aprovado sem pagar. O prazo do Pix é o dia 25 (faltam 2 dias).*`,
      `*${s.brand.name}: 1 saque aprovado sem pagar. O prazo do Pix vence hoje.*`,
    ]);
  });
});
