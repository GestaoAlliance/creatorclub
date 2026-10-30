import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, withdrawalApproveText, withdrawalPayText, type WithdrawalAlertItem } from "@/domain";
import { deliver } from "./shipping";
import { inWhatsAppHours, type WhatsAppSender } from "./whatsapp";

/**
 * Lembretes dos saques no WhatsApp da equipe (D-WDREMIND), a partir das 9h de São Paulo, pela instância da marca e o
 * WhatsApp cadastrado em Equipe: (1) Pagamento, saques aprovados ainda sem pagar, nos dias 13 e 15 e, depois do 15,
 * todo dia até pagar; (2) Gestão, no dia 11, saques pedidos esperando a aprovação. Sem nada pendente, nada é enviado.
 * `SummaryRun` garante uma mensagem por marca, dia e pessoa.
 */
const TZ = "America/Sao_Paulo";

export async function runWithdrawalReminders(prisma: PrismaClient, sender: WhatsAppSender | null, origin: string | null, now = new Date()): Promise<number> {
  if (!sender || !inWhatsAppHours(now)) return 0;
  const today = dayKey(now, TZ);
  const day = Number(today.slice(8, 10));
  const link = origin ? `${origin}/admin/saques` : null;
  const brands = await prisma.brand.findMany({
    where: { archivedAt: null, whatsappInstance: { not: null } },
    select: { id: true, name: true, slug: true, whatsappInstance: true, withdrawalWindowEndDay: true, withdrawalPayByDay: true },
  });
  let total = 0;
  for (const b of brands) {
    // D-REVITARULES: dias de cada marca. Gestão no dia seguinte ao fim do pedido (Botanika 11, Revita 16); Pagamento 2
    // dias antes do prazo do Pix, no dia do prazo e depois dele todo dia (Botanika 13 e 15; Revita 23 e 25).
    const payBy = b.withdrawalPayByDay;
    const payDay = day === payBy - 2 || day >= payBy;
    const approveDay = day === b.withdrawalWindowEndDay + 1;
    if (!payDay && !approveDay) continue;
    const brand = { ...b, whatsappInstance: b.whatsappInstance! };
    const list = async (status: "APPROVED" | "REQUESTED"): Promise<WithdrawalAlertItem[]> =>
      (await prisma.withdrawal.findMany({ where: { brandId: b.id, status }, orderBy: { requestedAt: "asc" }, select: { amountCents: true, creator: { select: { account: { select: { name: true } } } } } })).map((w) => ({
        creator: w.creator.account.name,
        amountCents: w.amountCents,
      }));
    const people = (role: "PAGAMENTO" | "GESTAO") =>
      prisma.user.findMany({ where: { disabledAt: null, phone: { not: null }, roleGrants: { some: { role, brandId: b.id } } }, select: { id: true, phone: true } });
    if (payDay) {
      const approved = await list("APPROVED");
      if (approved.length) {
        total += (await deliver(prisma, sender, brand, await people("PAGAMENTO"), (u) => `wd-pay:${b.slug}:${today}:${u}`, "WITHDRAWAL_PAY_REMINDER", withdrawalPayText(b.name, approved, day, link, payBy))).sent;
      }
    }
    if (approveDay) {
      const requested = await list("REQUESTED");
      if (requested.length) {
        total += (await deliver(prisma, sender, brand, await people("GESTAO"), (u) => `wd-approve:${b.slug}:${today}:${u}`, "WITHDRAWAL_APPROVE_REMINDER", withdrawalApproveText(b.name, requested, link, payBy))).sent;
      }
    }
  }
  return total;
}
