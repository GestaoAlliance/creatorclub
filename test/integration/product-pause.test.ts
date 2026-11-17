import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext } from "@/lib/portal/context";
import { approveShipment, chooseKit, kitProgress, myPendingKits, rejectShipment } from "@/lib/shipments/kits";
import { grantGoalKits } from "@/lib/shipments/goal-kits";
import { grantTierKits } from "@/lib/shipments/tier-kits";
import { myShop } from "@/lib/shipments/shop";
import { setProductPause } from "@/lib/shipments/pause";
import { updateMyAddress } from "@/lib/shipments/shipments";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function staff(role: "GESTAO" | "ENVIO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("pausa dos pedidos de produtos (D-PRODUCTPAUSE, banco real)", () => {
  it("pausada: não escolhe kit, não compra, não aprova (recusa sim), não concede kit; volta e tudo funciona", async () => {
    const a = await seedBrand(prisma);
    await prisma.brand.update({ where: { id: a.brand.id }, data: { monthlyKitFrom: "2026-11" } });
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
    await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId } });
    await prisma.creator.update({ where: { id: a.creator.id }, data: { status: "ACTIVE", contractSigned: true, withdrawalsUnlockedAt: new Date(), withdrawalsUnlockedById: "x", activatedAt: new Date("2026-06-01T12:00:00Z") } });
    const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
    await updateMyAddress(prisma, ctx, userId, { zip: "01310-100", street: "Av. Paulista", number: "1000", district: "Bela Vista", city: "São Paulo", state: "SP" });
    const product = await prisma.product.create({ data: { brandId: a.brand.id, shopifyId: `gid://shopify/Product/${randomUUID()}`, title: "Whey", active: true, priceCents: 10_000 } });
    const kit = await prisma.kitGrant.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, kind: "MONTHLY", month: "2026-10", salesCents: 0, products: 1 } });
    const waiting = await prisma.shipment.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, status: "AWAITING_APPROVAL", address: {}, createdById: "x" } });
    const other = await prisma.shipment.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, status: "AWAITING_APPROVAL", address: {}, createdById: "x" } });
    const gestao = await staff("GESTAO", a.brand.id);

    await expect(setProductPause(prisma, await staff("ENVIO", a.brand.id), a.brand.id, true)).rejects.toThrow(/Sem permissão/);
    await setProductPause(prisma, gestao, a.brand.id, true);
    expect(await prisma.auditLog.count({ where: { entityId: a.brand.id, action: "brand.product_pause" } })).toBe(1);

    expect((await myPendingKits(prisma, ctx)).paused).toBe(true);
    await expect(chooseKit(prisma, ctx, userId, kit.id, [{ productId: product.id, quantity: 1 }])).rejects.toThrow(/pausados pela equipe/);
    expect(await myShop(prisma, ctx)).toEqual({ allowed: false, reason: expect.stringMatching(/pausados pela equipe/) });
    expect(await kitProgress(prisma, ctx)).toBeNull();
    await expect(approveShipment(prisma, gestao, waiting.id)).rejects.toThrow(/pausados nesta marca/);
    await rejectShipment(prisma, gestao, other.id, "conferência");

    // Kits automáticos: nada é concedido na marca pausada (R$ 20.000 em novembro daria produtos pela faixa).
    const order = await prisma.order.create({ data: { brandId: a.brand.id, shopifyId: `gid://x/${randomUUID()}`, name: "#p1", createdAtShop: new Date("2026-11-10T12:00:00Z"), paidAt: new Date("2026-11-10T12:00:00Z"), financialStatus: "PAID", subtotalCents: 2_000_000, totalCents: 2_000_000, discountCodes: [a.coupon.code], shopifyUpdatedAt: new Date() } });
    await prisma.orderAttribution.create({ data: { brandId: a.brand.id, orderId: order.id, creatorId: a.creator.id, couponId: a.coupon.id, rateBps: 1500, rule: "first_creator_code", evidenceCodes: [a.coupon.code] } });
    const now = new Date("2026-11-17T12:00:00Z");
    await grantTierKits(prisma, now);
    await grantGoalKits(prisma, now);
    expect(await prisma.kitGrant.count({ where: { creatorId: a.creator.id } })).toBe(1);

    // Volta: escolhe e a equipe aprova.
    await setProductPause(prisma, gestao, a.brand.id, false);
    expect((await myPendingKits(prisma, ctx)).paused).toBe(false);
    expect(await grantTierKits(prisma, now)).toBe(1); // sem a pausa, a mesma venda dá o kit da faixa
    await approveShipment(prisma, gestao, waiting.id);
    expect(await chooseKit(prisma, ctx, userId, kit.id, [{ productId: product.id, quantity: 1 }])).toEqual(expect.any(String));
  });
});
