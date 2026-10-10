import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { closeDueMonths } from "@/lib/commission/release";
import { portalContext } from "@/lib/portal/context";
import { chooseKit, myPendingKits } from "@/lib/shipments/kits";
import { updateMyAddress } from "@/lib/shipments/shipments";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const T = (iso: string) => new Date(iso);
const ADDRESS = { zip: "01310-100", street: "Av. Paulista", number: "1000", district: "Bela Vista", city: "São Paulo", state: "SP" };

async function setup(tiers: object[]) {
  const a = await seedBrand(prisma);
  const template = await prisma.contractTemplate.create({
    data: { brandId: a.brand.id, key: `t-${randomUUID()}`, name: "Teste", releaseMinCents: 100_000, kitTiers: tiers, months: 6 },
  });
  await prisma.creator.update({ where: { id: a.creator.id }, data: { contractTemplateId: template.id } });
  const userId = randomUUID();
  await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId } });
  const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
  const [whey, creatina, inativo] = await Promise.all(
    ["Whey", "Creatina", "Antigo"].map((title, i) =>
      prisma.product.create({ data: { brandId: a.brand.id, shopifyId: `gid://shopify/Product/${randomUUID()}`, title, active: i < 2 } }),
    ),
  );
  return { ...a, ctx, userId, whey: whey!, creatina: creatina!, inativo: inativo! };
}

async function sale(a: Awaited<ReturnType<typeof setup>>, paidAt: string, subtotalCents: number) {
  const order = await prisma.order.create({
    data: {
      brandId: a.brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: `#${randomUUID().slice(0, 5)}`, createdAtShop: T(paidAt), paidAt: T(paidAt),
      financialStatus: "PAID", subtotalCents, totalCents: subtotalCents, discountCodes: [a.coupon.code], shopifyUpdatedAt: T(paidAt),
    },
  });
  await prisma.orderAttribution.create({
    data: { brandId: a.brand.id, orderId: order.id, creatorId: a.creator.id, couponId: a.coupon.id, rateBps: 1500, rule: "first_creator_code", evidenceCodes: [a.coupon.code] },
  });
}

const close = (brandId: string, now: Date) => closeDueMonths(prisma, now, { brandId });
const TIERS = [{ fromCents: 400_000, products: 3 }, { fromCents: 1_000_000, products: 4 }];

describe("kit mensal (D-KIT, banco real)", () => {
  it("fechamento concede o kit pela faixa do mês; creator escolhe; envio nasce Preparando; não escolhe duas vezes", async () => {
    const s = await setup(TIERS);
    await sale(s, "2026-09-05T12:00:00Z", 300_000); // setembro: R$ 3.000 → sem kit
    await sale(s, "2026-10-05T12:00:00Z", 250_000);
    await sale(s, "2026-10-20T12:00:00Z", 200_000); // outubro: R$ 4.500 → 3 suplementos

    await close(s.brand.id, T("2026-10-01T08:00:00Z"));
    expect(await prisma.kitGrant.count({ where: { creatorId: s.creator.id } })).toBe(0);
    await close(s.brand.id, T("2026-11-01T08:00:00Z"));
    await close(s.brand.id, T("2026-11-01T09:00:00Z")); // não refaz
    const { kits, products } = await myPendingKits(prisma, s.ctx);
    expect(kits).toMatchObject([{ month: "2026-10", products: 3, salesCents: 450_000 }]);
    expect(products.map((p) => p.title)).toEqual(["Creatina", "Whey"]); // só ativos
    const kitId = kits[0]!.id;

    await expect(chooseKit(prisma, s.ctx, s.userId, kitId, [{ productId: s.whey.id, quantity: 3 }])).rejects.toThrow(/endereço/);
    await updateMyAddress(prisma, s.ctx, s.userId, ADDRESS);
    await expect(chooseKit(prisma, s.ctx, s.userId, kitId, [{ productId: s.whey.id, quantity: 2 }])).rejects.toThrow("Escolha 3 suplementos (você escolheu 2).");
    await expect(chooseKit(prisma, s.ctx, s.userId, kitId, [{ productId: s.inativo.id, quantity: 3 }])).rejects.toThrow(/indisponível/);
    await expect(chooseKit(prisma, { ...s.ctx, viewAs: { userId: "sa" } }, s.userId, kitId, [{ productId: s.whey.id, quantity: 3 }])).rejects.toThrow(
      /Visualização da equipe/,
    );

    const id = await chooseKit(prisma, s.ctx, s.userId, kitId, [{ productId: s.whey.id, quantity: 2 }, { productId: s.creatina.id, quantity: 1 }]);
    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id }, include: { items: true, kit: true } });
    expect(shipment).toMatchObject({ status: "PREPARING", createdById: s.userId, note: "Kit mensal — vendas de outubro de 2026 (3 suplementos)", address: { city: "São Paulo" } });
    expect(shipment.items.map((i) => [i.title, i.quantity]).sort()).toEqual([["Creatina", 1], ["Whey", 2]]);
    expect(shipment.kit).toMatchObject({ id: kitId, status: "CHOSEN" });
    expect((await myPendingKits(prisma, s.ctx)).kits).toEqual([]);
    await expect(chooseKit(prisma, s.ctx, s.userId, kitId, [{ productId: s.whey.id, quantity: 3 }])).rejects.toThrow(/já foi escolhido/);
    expect(await prisma.auditLog.count({ where: { action: "kit.choose", entityId: kitId } })).toBe(1);
  });

  it("faixa mais alta; creator inativa ou contrato sem faixas não ganha kit; outra creator não escolhe", async () => {
    const s = await setup(TIERS);
    await sale(s, "2026-10-05T12:00:00Z", 1_200_000);
    const other = await setup([]);
    await sale(other, "2026-10-05T12:00:00Z", 1_200_000);
    const inactive = await setup(TIERS);
    await sale(inactive, "2026-10-05T12:00:00Z", 1_200_000);
    await prisma.creator.update({ where: { id: inactive.creator.id }, data: { status: "INACTIVE" } });

    for (const x of [s, other, inactive]) await close(x.brand.id, T("2026-11-01T08:00:00Z"));
    const [kit] = (await myPendingKits(prisma, s.ctx)).kits;
    expect(kit).toMatchObject({ products: 4 });
    expect(await prisma.kitGrant.count({ where: { creatorId: { in: [other.creator.id, inactive.creator.id] } } })).toBe(0);
    await expect(chooseKit(prisma, other.ctx, other.userId, kit!.id, [])).rejects.toThrow(/Kit não encontrado/);
  });

  it("travas do banco", async () => {
    const s = await setup(TIERS);
    const base = { brandId: s.brand.id, creatorId: s.creator.id, salesCents: 0, products: 1 };
    await expectDbError(prisma.kitGrant.create({ data: { ...base, month: "2026-13" } }), /KitGrant_month_format/);
    await expectDbError(prisma.kitGrant.create({ data: { ...base, month: "2026-10", products: 0 } }), /KitGrant_values/);
    await expectDbError(prisma.kitGrant.create({ data: { ...base, month: "2026-10", status: "CHOSEN" } }), /KitGrant_chosen/);
  });
});
