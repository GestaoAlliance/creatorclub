import { afterAll, describe, expect, it } from "vitest";
import { creatorBalance, releasedThroughFor } from "@/lib/commission/release";
import { commissionEntry, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("encerrada libera tudo (D-ENDRELEASE, banco real)", () => {
  it("comissão abaixo do mínimo fica presa na ativa e fica disponível quando ela é encerrada", async () => {
    const a = await seedBrand(prisma); // pedido de R$ 200 pago em 01/09; mínimo da marca R$ 500
    await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: a.brand.id, creatorId: a.creator.id, orderId: a.order.id }) }); // R$ 30 de setembro
    const now = new Date("2026-11-17T15:00:00Z");
    const tz = "America/Sao_Paulo";

    expect((await releasedThroughFor(prisma, [a.creator.id], now)).get(a.creator.id)).toBeNull();
    expect((await creatorBalance(prisma, a.creator, tz, now)).availableCents).toBe(0);

    await prisma.creator.update({ where: { id: a.creator.id }, data: { status: "DEACTIVATED", deactivatedAt: now } });
    expect((await releasedThroughFor(prisma, [a.creator.id], now)).get(a.creator.id)).toBe("2026-10");
    expect((await creatorBalance(prisma, a.creator, tz, now)).availableCents).toBe(3_000);
    // O mês corrente (novembro) continua esperando o fechamento.
    expect((await releasedThroughFor(prisma, [a.creator.id], new Date("2026-12-01T03:00:00Z"))).get(a.creator.id)).toBe("2026-10");
  });
});
