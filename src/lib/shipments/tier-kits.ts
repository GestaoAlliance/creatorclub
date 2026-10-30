import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey, isTierTrialMonth, monthKey, notices, previousMonthKey, tierProducts } from "@/domain";
import { salesByMonth } from "@/lib/commission/release";
import { notify } from "@/lib/notifications/notify";

/**
 * D-TIERKIT: produtos pela tabela mensal de vendas, nas marcas com `monthlyKitFrom` (Botanika desde 2026-11). Roda a
 * cada passada do worker (`/api/jobs/run`): olha o mês corrente e o anterior (pedido que chega atrasado), soma as
 * vendas do mês (subtotal dos pedidos pagos atribuídos, pelo mês do pagamento) e, se a faixa alcançada dá mais
 * produtos do que já foi liberado no mês, libera a diferença (um `KitGrant` MONTHLY por faixa; `window` = total do mês
 * até ali, e o índice único impede repetir). Os 3 primeiros meses contam da entrada da creator (contrato, ativação ou,
 * sem as duas, o início da meta).
 */
export async function grantTierKits(prisma: PrismaClient, now = new Date()): Promise<number> {
  const brands = await prisma.brand.findMany({ where: { archivedAt: null, monthlyKitFrom: { not: null } }, select: { id: true, slug: true, timezone: true, monthlyKitFrom: true } });
  let granted = 0;
  for (const brand of brands) {
    const current = monthKey(now, brand.timezone);
    const months = [previousMonthKey(current), current].filter((m) => m >= brand.monthlyKitFrom!);
    if (months.length === 0) continue;
    const creators = await prisma.creator.findMany({
      where: { brandId: brand.id, status: "ACTIVE" },
      select: { id: true, contractStart: true, activatedAt: true, goalStartAt: true, kitGrants: { where: { kind: "MONTHLY", month: { in: months } }, select: { month: true, window: true } } },
    });
    if (creators.length === 0) continue;
    const sales = await salesByMonth(prisma, creators.map((c) => c.id), brand.timezone);
    for (const c of creators) {
      const entry = c.contractStart ? c.contractStart.toISOString().slice(0, 10) : c.activatedAt ? dayKey(c.activatedAt, brand.timezone) : (c.goalStartAt?.toISOString().slice(0, 10) ?? null);
      for (const month of months) {
        const salesCents = sales.get(c.id)!.get(month) ?? 0;
        const target = tierProducts(salesCents, entry !== null && isTierTrialMonth(entry, month), brand.slug);
        const given = Math.max(0, ...c.kitGrants.filter((k) => k.month === month).map((k) => k.window));
        if (target <= given) continue;
        const ok = await prisma.$transaction(async (tx) => {
          const { count } = await tx.kitGrant.createMany({
            data: [{ brandId: brand.id, creatorId: c.id, kind: "MONTHLY", month, window: target, salesCents, products: target - given, createdAt: now }],
            skipDuplicates: true,
          });
          if (count === 0) return false; // outra passada do worker já liberou
          await notify(tx, [{ brandId: brand.id, creatorId: c.id, notice: notices.kitAvailable("MONTHLY", month, target - given, brand.slug, target) }]);
          await tx.auditLog.create({
            data: { brandId: brand.id, actorType: "JOB", action: "kit.tier", entity: "Creator", entityId: c.id, after: { month, salesCents, total: target, products: target - given } },
          });
          return true;
        });
        if (ok) granted++;
      }
    }
  }
  return granted;
}
