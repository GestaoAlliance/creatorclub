import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { listCreators } from "@/lib/creators/profile";
import { commissionEntry, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "GESTAO" | "PAGAMENTO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("lista de creators no modelo da referência (M0.0.2, banco real)", () => {
  it("contatos, redes, cupom atual e vendas de cada creator (Gestão e Pagamento)", async () => {
    const { brand, creator, coupon, order, account } = await seedBrand(prisma);
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { phone: "(11) 91234-5678", instagram: "maria.ex", tiktok: "maria.tt", cpf: "52998224725" } });
    await prisma.couponAssignment.create({ data: { brandId: brand.id, couponId: coupon.id, creatorId: creator.id, validFrom: new Date("2026-08-01"), createdById: "seed" } });
    await prisma.orderAttribution.create({ data: { brandId: brand.id, orderId: order.id, creatorId: creator.id, couponId: coupon.id, rateBps: 1500, rule: "first", evidenceCodes: [coupon.code] } });

    const gestao = await userWith("GESTAO", brand.id);
    const [row] = await listCreators(prisma, gestao, brand.id);
    expect(row).toMatchObject({ phone: "(11) 91234-5678", instagram: "maria.ex", tiktok: "maria.tt", coupon: coupon.code, cpf: "52998224725", stats: { salesCents: 20_000, orders: 1, sales30Cents: 0 } });

    // D-PERIODPICK: setembro (o pedido de 01/09) com a comissão; agosto é o período anterior (vazio).
    await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: brand.id, creatorId: creator.id, orderId: order.id }) });
    const [sep] = await listCreators(prisma, gestao, brand.id, false, { from: "2026-09-01", to: "2026-09-30" });
    expect(sep!.stats).toMatchObject({ sales30Cents: 20_000, prev30Cents: 0, commissionCents: 3_000 });
    const [oct] = await listCreators(prisma, gestao, brand.id, false, { from: "2026-10-01", to: "2026-10-30" });
    expect(oct!.stats).toMatchObject({ sales30Cents: 0, prev30Cents: 20_000, commissionCents: 0 });

    // Pagamento também vê as vendas (money.view).
    const pagamento = await userWith("PAGAMENTO", brand.id);
    expect((await listCreators(prisma, pagamento, brand.id))[0]!.stats).toMatchObject({ orders: 1 });
  });
});
