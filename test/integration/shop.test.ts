import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { formatBRL } from "@/domain";
import { loadActor } from "@/lib/auth/actor";
import { creatorBalance } from "@/lib/commission/release";
import { portalContext } from "@/lib/portal/context";
import { approveShipment, rejectShipment } from "@/lib/shipments/kits";
import { updateMyAddress } from "@/lib/shipments/shipments";
import { buyWithBalance, myShop } from "@/lib/shipments/shop";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const ADDRESS = { zip: "01310-100", street: "Av. Paulista", number: "1000", district: "Bela Vista", city: "São Paulo", state: "SP" };

async function setup(balanceCents: number) {
  const s = await seedBrand(prisma);
  await prisma.brand.update({ where: { id: s.brand.id }, data: { shopDiscountBps: 2000 } });
  await prisma.creator.update({ where: { id: s.creator.id }, data: { status: "ACTIVE", contractSigned: true } });
  const userId = randomUUID();
  await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { userId } });
  const gid = randomUUID();
  await prisma.user.create({ data: { id: gid, email: `${gid}@x.com`, name: "Gestão", roleGrants: { create: { role: "GESTAO", brandId: s.brand.id } } } });
  await prisma.ledgerEntry.create({
    data: { brandId: s.brand.id, creatorId: s.creator.id, type: "ADJUSTMENT", amountCents: balanceCents, availableAt: new Date("2026-01-01"), idempotencyKey: randomUUID(), note: "saldo de teste", createdById: gid },
  });
  const [serum, kit, semPreco] = await Promise.all(
    [["Sérum", 10_000], ["Kit", 25_000], ["Novo", null]].map(([title, priceCents]) =>
      prisma.product.create({ data: { brandId: s.brand.id, shopifyId: `gid://shopify/Product/${randomUUID()}`, title: title as string, priceCents: priceCents as number | null } }),
    ),
  );
  const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, s.brand.slug);
  const gestao = (await loadActor(prisma, gid))!;
  const balance = async () => (await creatorBalance(prisma, s.creator, "America/Sao_Paulo", new Date())).availableCents;
  return { ...s, ctx, userId, gestao, serum: serum!, kit: kit!, semPreco: semPreco!, balance };
}

describe("loja com o saldo (M5.1, D-SHOPBALANCE, banco real)", () => {
  it("preço com o desconto da marca; reserva o saldo; aprovar lança no extrato; recusar devolve", async () => {
    const s = await setup(30_000);
    const shop = await myShop(prisma, s.ctx);
    expect(shop).toMatchObject({ allowed: true, availableCents: 30_000, discountBps: 2000 });
    expect(shop.allowed && shop.products.map((p) => [p.title, p.creatorPriceCents])).toEqual([["Kit", 20_000], ["Sérum", 8_000]]); // sem preço não aparece

    await expect(buyWithBalance(prisma, s.ctx, s.userId, [{ productId: s.serum.id, quantity: 1 }])).rejects.toThrow(/endereço/);
    await updateMyAddress(prisma, s.ctx, s.userId, ADDRESS);
    await expect(buyWithBalance(prisma, s.ctx, s.userId, [{ productId: s.kit.id, quantity: 2 }])).rejects.toThrow(/insuficiente/);
    await expect(buyWithBalance(prisma, s.ctx, s.userId, [{ productId: s.semPreco.id, quantity: 1 }])).rejects.toThrow(/indisponível/);

    const first = await buyWithBalance(prisma, s.ctx, s.userId, [{ productId: s.serum.id, quantity: 2 }]); // R$ 160
    expect(await prisma.shipment.findUniqueOrThrow({ where: { id: first } })).toMatchObject({ status: "AWAITING_APPROVAL", balanceCents: 16_000, note: `Compra com o saldo (${formatBRL(16_000)})` });
    expect(await s.balance()).toBe(14_000); // reservado
    await expect(buyWithBalance(prisma, s.ctx, s.userId, [{ productId: s.kit.id, quantity: 1 }])).rejects.toThrow(/insuficiente/);

    await rejectShipment(prisma, s.gestao, first, "Sem estoque");
    expect(await s.balance()).toBe(30_000); // recusado: a reserva some

    const second = await buyWithBalance(prisma, s.ctx, s.userId, [{ productId: s.kit.id, quantity: 1 }]);
    await approveShipment(prisma, s.gestao, second);
    expect(await s.balance()).toBe(10_000);
    expect(await prisma.ledgerEntry.findUniqueOrThrow({ where: { idempotencyKey: `purchase:${second}` } })).toMatchObject({ type: "PURCHASE", amountCents: -20_000, note: "Compra com o saldo: 1× Kit" });
    expect(await prisma.shipment.findUniqueOrThrow({ where: { id: second } })).toMatchObject({ status: "PREPARING" });
  });

  it("pausada ou sem contrato não compra; travas do banco", async () => {
    const s = await setup(10_000);
    await prisma.creator.update({ where: { id: s.creator.id }, data: { status: "INACTIVE" } });
    expect(await myShop(prisma, s.ctx)).toMatchObject({ allowed: false });
    await expectDbError(prisma.brand.update({ where: { id: s.brand.id }, data: { shopDiscountBps: 9500 } }), /Brand_shopDiscount/);
    await expectDbError(prisma.shipment.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, address: {}, createdById: "x", balanceCents: 0 } }), /Shipment_balance/);
    await expectDbError(
      prisma.ledgerEntry.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, type: "PURCHASE", amountCents: 100, availableAt: new Date(), idempotencyKey: randomUUID(), note: "x", createdById: "x" } }),
      /LedgerEntry_sign_by_type/,
    );
  });
});
