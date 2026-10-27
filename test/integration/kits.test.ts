import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { closeDueMonths } from "@/lib/commission/release";
import { portalContext } from "@/lib/portal/context";
import { approveShipment, chooseKit, myPendingKits, rejectShipment } from "@/lib/shipments/kits";
import { grantGoalKits } from "@/lib/shipments/goal-kits";
import { markShipped } from "@/lib/shipments/shipments";
import { updateMyAddress } from "@/lib/shipments/shipments";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const T = (iso: string) => new Date(iso);
const ADDRESS = { zip: "01310-100", street: "Av. Paulista", number: "1000", district: "Bela Vista", city: "São Paulo", state: "SP" };

async function setup(tiers: object[], running = true) {
  const a = await seedBrand(prisma);
  const template = await prisma.contractTemplate.create({
    data: { brandId: a.brand.id, key: `t-${randomUUID()}`, name: "Teste", releaseMinCents: 100_000, kitTiers: tiers, months: 6 },
  });
  await prisma.creator.update({ where: { id: a.creator.id }, data: { contractTemplateId: template.id } });
  const userId = randomUUID();
  await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId } });
  const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
  // D-KITANA: o kit mensal é só para quem já está rodando (já recebeu algum envio, como o de boas-vindas).
  if (running) await prisma.shipment.create({ data: { brandId: a.brand.id, creatorId: a.creator.id, address: {}, createdById: "x", createdAt: T("2026-09-01T12:00:00Z") } });
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

describe("produto pela meta de vendas (D-GOALKIT, banco real)", () => {
  it("R$ 1.000 nos 45 dias libera 1 produto na hora; depois janelas de 30; uma vez por janela; fechamento não dá kit", async () => {
    const s = await setup(TIERS);
    await prisma.creator.update({ where: { id: s.creator.id }, data: { goalStartAt: new Date("2026-10-27T00:00:00Z") } });
    await sale(s, "2026-10-28T12:00:00Z", 60_000);
    expect(await grantGoalKits(prisma, T("2026-10-29T12:00:00Z"))).toBe(0); // R$ 600: ainda não
    await sale(s, "2026-11-20T12:00:00Z", 40_000); // R$ 1.000 no dia 25 da janela
    expect(await grantGoalKits(prisma, T("2026-11-20T13:00:00Z"))).toBe(1);
    expect(await grantGoalKits(prisma, T("2026-11-20T14:00:00Z"))).toBe(0); // não repete
    const { kits } = await myPendingKits(prisma, s.ctx);
    expect(kits).toMatchObject([{ kind: "GOAL", products: 1, salesCents: 100_000, month: "2026-10" }]);
    expect(await prisma.notification.count({ where: { creatorId: s.creator.id, kind: "KIT_AVAILABLE", dedupeKey: "kit:GOAL:2026-10-27" } })).toBe(1);

    // Janela 2 (dia 46 = 11/12 até 09/01): vendas de antes não contam; R$ 1.000 dentro dela libera outro.
    await sale(s, "2026-12-11T12:00:00Z", 100_000);
    expect(await grantGoalKits(prisma, T("2026-12-11T13:00:00Z"))).toBe(1);
    expect(await prisma.kitGrant.findMany({ where: { creatorId: s.creator.id }, orderBy: { window: "asc" }, select: { window: true, month: true } })).toEqual([
      { window: 0, month: "2026-10" },
      { window: 1, month: "2026-12" },
    ]);
    // D-GOALKIT substitui o kit mensal: o fechamento do mês não dá kit por faixa.
    await close(s.brand.id, T("2026-12-01T08:00:00Z"));
    expect(await prisma.kitGrant.count({ where: { creatorId: s.creator.id, kind: "MONTHLY" } })).toBe(0);

    await updateMyAddress(prisma, s.ctx, s.userId, ADDRESS);
    const id = await chooseKit(prisma, s.ctx, s.userId, kits[0]!.id, [{ productId: s.whey.id, quantity: 1 }]);
    expect(await prisma.shipment.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "AWAITING_APPROVAL", note: "Meta de vendas (R$ 1.000) (1 produto)" });
  });

  it("inativa ou sem início da meta não ganha; pedido cancelado não conta; outra creator não escolhe", async () => {
    const s = await setup(TIERS);
    const inactive = await setup(TIERS);
    const noStart = await setup(TIERS);
    for (const x of [s, inactive]) await prisma.creator.update({ where: { id: x.creator.id }, data: { goalStartAt: new Date("2026-10-27T00:00:00Z") } });
    await prisma.creator.update({ where: { id: inactive.creator.id }, data: { status: "INACTIVE" } });
    await prisma.creator.update({ where: { id: noStart.creator.id }, data: { goalStartAt: null } });
    for (const x of [s, inactive, noStart]) await sale(x, "2026-10-30T12:00:00Z", 150_000);
    await grantGoalKits(prisma, T("2026-10-30T13:00:00Z"));
    const [kit] = (await myPendingKits(prisma, s.ctx)).kits;
    expect(kit).toMatchObject({ kind: "GOAL", products: 1 });
    expect(await prisma.kitGrant.count({ where: { creatorId: { in: [inactive.creator.id, noStart.creator.id] } } })).toBe(0);
    await expect(chooseKit(prisma, inactive.ctx, inactive.userId, kit!.id, [])).rejects.toThrow(/Kit não encontrado/);
  });

  it("pedido da creator espera a Gestão: Envio não envia antes; recusar devolve o kit; aprovar vai para Preparando", async () => {
    const s = await setup(TIERS);
    await prisma.kitGrant.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, month: "2026-10", salesCents: 450_000, products: 3 } });
    await updateMyAddress(prisma, s.ctx, s.userId, ADDRESS);
    const user = async (role: "GESTAO" | "ENVIO") => {
      const id = randomUUID();
      await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId: s.brand.id } } } });
      return (await loadActor(prisma, id))!;
    };
    const gestao = await user("GESTAO");
    const envio = await user("ENVIO");
    const kitId = (await myPendingKits(prisma, s.ctx)).kits[0]!.id;
    const first = await chooseKit(prisma, s.ctx, s.userId, kitId, [{ productId: s.whey.id, quantity: 3 }]);

    await expect(markShipped(prisma, envio, { shipmentId: first, carrier: "Correios", trackingCode: "AA123456789BR" })).rejects.toThrow(/mudou de situação/);
    await expect(approveShipment(prisma, envio, first)).rejects.toThrow(/Só a Gestão/);
    await expect(rejectShipment(prisma, gestao, first, "  ")).rejects.toThrow(/motivo/);

    await rejectShipment(prisma, gestao, first, "Whey em falta; escolha outro");
    expect(await prisma.shipment.findUniqueOrThrow({ where: { id: first } })).toMatchObject({ status: "CANCELLED", rejectReason: "Whey em falta; escolha outro" });
    expect((await myPendingKits(prisma, s.ctx)).kits).toMatchObject([{ id: kitId }]); // volta para ela escolher

    const second = await chooseKit(prisma, s.ctx, s.userId, kitId, [{ productId: s.creatina.id, quantity: 3 }]);
    await approveShipment(prisma, gestao, second);
    await expect(approveShipment(prisma, gestao, second)).rejects.toThrow(/já foi decidido/);
    expect(await prisma.shipment.findUniqueOrThrow({ where: { id: second } })).toMatchObject({ status: "PREPARING", approvedById: gestao.userId });
    await markShipped(prisma, envio, { shipmentId: second, carrier: "Correios", trackingCode: "AA123456789BR" });
    expect(await prisma.auditLog.count({ where: { action: { in: ["shipment.approved", "shipment.rejected"] }, entityId: { in: [first, second] } } })).toBe(2);
  });

  it("travas do banco", async () => {
    const s = await setup(TIERS);
    const base = { brandId: s.brand.id, creatorId: s.creator.id, salesCents: 0, products: 1 };
    await expectDbError(prisma.kitGrant.create({ data: { ...base, month: "2026-13" } }), /KitGrant_month_format/);
    await expectDbError(prisma.kitGrant.create({ data: { ...base, month: "2026-10", products: 0 } }), /KitGrant_values/);
    await expectDbError(prisma.kitGrant.create({ data: { ...base, month: "2026-10", status: "CHOSEN" } }), /KitGrant_chosen/);
    await expectDbError(prisma.kitGrant.create({ data: { ...base, month: "2026-10", window: 2 } }), /KitGrant_kind/); // janela só na meta
    await expectDbError(prisma.kitGrant.create({ data: { ...base, month: "2026-10", kind: "OUTRO" } }), /KitGrant_kind/);
    const ship = { brandId: s.brand.id, creatorId: s.creator.id, address: {}, createdById: "x" };
    await expectDbError(prisma.shipment.create({ data: { ...ship, approvedAt: new Date() } }), /Shipment_approval/);
    await expectDbError(prisma.shipment.create({ data: { ...ship, status: "AWAITING_APPROVAL", rejectReason: "x" } }), /Shipment_approval/);
  });
});

describe("produtos que a creator pode escolher (D-KITOPTIONS, banco real)", () => {
  it("marca com produtos marcados: só eles aparecem e só eles passam; sem marcados, todos os ativos", async () => {
    const s = await setup(TIERS);
    await updateMyAddress(prisma, s.ctx, s.userId, ADDRESS);
    const kit = await prisma.kitGrant.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, kind: "WELCOME", month: "2026-10", salesCents: 0, products: 1 } });
    expect((await myPendingKits(prisma, s.ctx)).products.map((p) => p.title)).toEqual(["Creatina", "Whey"]);

    await prisma.product.update({ where: { id: s.whey.id }, data: { kitOption: true } });
    expect((await myPendingKits(prisma, s.ctx)).products.map((p) => p.title)).toEqual(["Whey"]);
    await expect(chooseKit(prisma, s.ctx, s.userId, kit.id, [{ productId: s.creatina.id, quantity: 1 }])).rejects.toThrow(/indisponível/);
    const shipmentId = await chooseKit(prisma, s.ctx, s.userId, kit.id, [{ productId: s.whey.id, quantity: 1 }]);
    expect(await prisma.shipmentItem.findMany({ where: { shipmentId }, select: { title: true, quantity: true } })).toEqual([{ title: "Whey", quantity: 1 }]);
  });
});
