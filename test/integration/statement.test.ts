import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { creatorStatement } from "@/lib/commission/statement";
import { commissionEntry, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const T = (iso: string) => new Date(iso);

async function userWith(role: "GESTAO" | "PAGAMENTO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("saldo e extrato (banco real)", () => {
  it("separa a liberar, em saque e disponível; extrato por mês do pagamento; saldo pode ficar negativo", async () => {
    const { brand, creator, order } = await seedBrand(prisma); // pedido pago em 2026-09-01
    const ids = { brandId: brand.id, creatorId: creator.id, orderId: order.id };
    const october = await prisma.order.create({
      data: {
        brandId: brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: "#OUT", createdAtShop: T("2026-10-03T12:00:00Z"),
        paidAt: T("2026-10-03T12:00:00Z"), financialStatus: "PAID", subtotalCents: 13_334, totalCents: 15_000, discountCodes: [],
        shopifyUpdatedAt: T("2026-10-03T12:00:00Z"),
      },
    });
    await prisma.ledgerEntry.createMany({
      data: [
        commissionEntry(ids, { availableAt: T("2026-09-08T12:00:00Z"), createdAt: T("2026-09-01T12:05:00Z") }),
        // Estorno lançado em outubro de pedido pago em setembro: aparece em setembro (D-MONTH).
        commissionEntry(ids, { type: "REVERSAL", amountCents: -1_000, baseCents: 13_334, availableAt: T("2026-10-04T10:00:00Z"), createdAt: T("2026-10-04T10:00:00Z") }),
        commissionEntry({ ...ids, orderId: october.id }, { amountCents: 2_000, baseCents: 13_334, availableAt: T("2026-10-10T12:00:00Z"), createdAt: T("2026-10-03T12:05:00Z") }),
        {
          brandId: brand.id, creatorId: creator.id, type: "ADJUSTMENT", amountCents: 500, availableAt: T("2026-10-05T12:00:00Z"),
          createdAt: T("2026-10-05T12:00:00Z"), idempotencyKey: `adjust:${randomUUID()}`, note: "Bônus", createdById: "sa",
        },
      ],
    });
    await prisma.withdrawal.create({ data: { brandId: brand.id, creatorId: creator.id, amountCents: 1_000, idempotencyKey: randomUUID() } });
    // Setembro liberado no fechamento (D-CONTRACT); outubro fica a liberar.
    await prisma.commissionRelease.create({ data: { brandId: brand.id, creatorId: creator.id, month: "2026-09", salesCents: 60_000, minCents: 50_000 } });

    const gestao = await userWith("GESTAO", brand.id);
    const st = await creatorStatement(prisma, gestao, creator.id, { now: T("2026-10-06T12:00:00Z") });
    expect(st.balance).toEqual({ totalCents: 4_500, heldCents: 2_000, reservedCents: 1_000, availableCents: 1_500 });
    expect(st.releasedThrough).toBe("2026-09");
    expect(st.release).toMatchObject({ releasedThrough: "2026-09", minCents: 50_000, nextClosingAt: T("2026-11-01T03:00:00Z") });
    expect(st.months).toEqual([
      { month: "2026-10", totalCents: 2_500 },
      { month: "2026-09", totalCents: 2_000 },
    ]);
    expect(st.month).toBe("2026-10");
    expect(st.lines.map((l) => [l.type, l.amountCents, l.held])).toEqual([
      ["ADJUSTMENT", 500, false],
      ["COMMISSION", 2_000, true],
    ]);

    const sep = await creatorStatement(prisma, gestao, creator.id, { month: "2026-09", now: T("2026-10-06T12:00:00Z") });
    expect(sep.lines.map((l) => [l.type, l.amountCents, l.orderName])).toEqual([
      ["REVERSAL", -1_000, order.name],
      ["COMMISSION", 3_000, order.name],
    ]);

    // Estorno grande depois de tudo liberado: saldo negativo, nunca cortado em zero (D-NEG).
    await prisma.ledgerEntry.create({
      data: commissionEntry(ids, { type: "REVERSAL", amountCents: -6_000, availableAt: T("2026-10-07T00:00:00Z") }),
    });
    const neg = await creatorStatement(prisma, gestao, creator.id, { now: T("2026-10-20T12:00:00Z") });
    expect(neg.balance).toEqual({ totalCents: -1_500, heldCents: 2_000, reservedCents: 1_000, availableCents: -4_500 });
  });

  it("só quem vê valores da marca; mês inválido é recusado", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const other = await seedBrand(prisma);
    await expect(creatorStatement(prisma, null, creator.id)).rejects.toThrow(/Sem permissão/);
    await expect(creatorStatement(prisma, await userWith("GESTAO", other.brand.id), creator.id)).rejects.toThrow(/Sem permissão/);
    const pagamento = await userWith("PAGAMENTO", brand.id);
    await expect(creatorStatement(prisma, pagamento, creator.id, { month: "2026-13" })).rejects.toThrow(/Mês inválido/);
    const empty = await creatorStatement(prisma, pagamento, creator.id, { now: T("2026-10-06T12:00:00Z") });
    expect(empty).toMatchObject({ months: [], month: "2026-10", lines: [], balance: { totalCents: 0 } });
  });
});
