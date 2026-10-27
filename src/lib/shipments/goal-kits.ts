import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, GOAL_PRODUCTS, GOAL_SALES_CENTS, goalWindowsUntil, notices, startOfLocalDay } from "@/domain";
import { notify } from "@/lib/notifications/notify";

/**
 * D-GOALKIT: libera 1 produto para a creator ativa que soma R$ 1.000 em vendas numa janela da meta (primeiros 45 dias,
 * depois 30 em 30). Roda a cada passada do worker (`/api/jobs/run`), então o produto aparece logo depois da venda que
 * fecha a meta. Vendas = subtotal atual dos pedidos atribuídos pagos (ou parcialmente reembolsados), não cancelados,
 * não teste, pela data do pagamento (o mesmo do fechamento, D-MONTH). Cada janela libera no máximo uma vez (índice
 * único); janela que já passou e só agora bateu a meta (pedido atrasado) também libera.
 */

const PAID = ["PAID", "PARTIALLY_REFUNDED"];

export async function grantGoalKits(prisma: PrismaClient, now = new Date()): Promise<number> {
  const brands = await prisma.brand.findMany({ where: { archivedAt: null }, select: { id: true, slug: true, timezone: true } });
  let granted = 0;
  for (const brand of brands) {
    const today = dayKey(now, brand.timezone);
    const creators = await prisma.creator.findMany({
      where: { brandId: brand.id, status: "ACTIVE", goalStartAt: { not: null, lte: new Date(`${today}T00:00:00Z`) } },
      select: { id: true, goalStartAt: true, kitGrants: { where: { kind: "GOAL" }, select: { window: true } } },
    });
    if (creators.length === 0) continue;
    const earliest = creators.reduce((m, c) => (c.goalStartAt! < m ? c.goalStartAt! : m), creators[0]!.goalStartAt!);
    const rows = await prisma.orderAttribution.findMany({
      where: {
        creatorId: { in: creators.map((c) => c.id) },
        order: { paidAt: { gte: startOfLocalDay(earliest.toISOString().slice(0, 10), brand.timezone) }, financialStatus: { in: PAID }, cancelledAt: null, test: false },
      },
      select: { creatorId: true, order: { select: { paidAt: true, subtotalCents: true } } },
    });
    const sales = new Map<string, { day: string; cents: number }[]>();
    for (const r of rows) {
      const list = sales.get(r.creatorId) ?? [];
      list.push({ day: dayKey(r.order.paidAt!, brand.timezone), cents: Math.max(0, r.order.subtotalCents) });
      sales.set(r.creatorId, list);
    }
    for (const c of creators) {
      const done = new Set(c.kitGrants.map((k) => k.window));
      for (const w of goalWindowsUntil(c.goalStartAt!.toISOString().slice(0, 10), today)) {
        if (done.has(w.index)) continue;
        const salesCents = (sales.get(c.id) ?? []).filter((s) => s.day >= w.from && s.day < w.to).reduce((t, s) => t + s.cents, 0);
        if (salesCents < GOAL_SALES_CENTS) continue;
        const month = w.from.slice(0, 7);
        const ok = await prisma.$transaction(async (tx) => {
          const { count } = await tx.kitGrant.createMany({
            data: [{ brandId: brand.id, creatorId: c.id, kind: "GOAL", month, window: w.index, salesCents, products: GOAL_PRODUCTS, createdAt: now }],
            skipDuplicates: true,
          });
          if (count === 0) return false; // outra passada do worker já liberou
          await notify(tx, [{ brandId: brand.id, creatorId: c.id, notice: notices.kitAvailable("GOAL", `${w.from}`, GOAL_PRODUCTS, brand.slug) }]);
          await tx.auditLog.create({
            data: { brandId: brand.id, actorType: "JOB", action: "kit.goal", entity: "Creator", entityId: c.id, after: { window: w.index, from: w.from, to: w.to, salesCents } },
          });
          return true;
        });
        if (ok) granted++;
      }
    }
  }
  return granted;
}
