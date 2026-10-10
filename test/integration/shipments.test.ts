import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext } from "@/lib/portal/context";
import {
  cancelShipment,
  confirmReceived,
  createShipment,
  markDeliveredByStaff,
  markShipped,
  myAddress,
  myShipments,
  shipmentFormData,
  staffShipments,
  updateMyAddress,
} from "@/lib/shipments/shipments";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const ADDRESS = { zip: "01310-100", street: "Av. Paulista", number: "1000", complement: "ap 12", district: "Bela Vista", city: "São Paulo", state: "SP" };

async function userWith(role: "ENVIO" | "GESTAO" | "PAGAMENTO" | "SUPER_ADMIN", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

async function setup() {
  const a = await seedBrand(prisma);
  const userId = randomUUID();
  await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId } });
  const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
  const [whey, creatina] = await Promise.all(
    ["Whey", "Creatina"].map((title) => prisma.product.create({ data: { brandId: a.brand.id, shopifyId: `gid://shopify/Product/${randomUUID()}`, title } })),
  );
  const envio = await userWith("ENVIO", a.brand.id);
  return { ...a, ctx, userId, whey: whey!, creatina: creatina!, envio };
}

describe("envios de produtos (banco real)", () => {
  it("creator cadastra o endereço; equipe registra, envia; creator confirma 'Recebi'; tudo auditado", async () => {
    const s = await setup();
    await expect(createShipment(prisma, s.envio, { creatorId: s.creator.id, items: [{ productId: s.whey.id, quantity: 1 }] })).rejects.toThrow(/endereço/);
    expect((await shipmentFormData(prisma, s.envio)).creators.find((c) => c.id === s.creator.id)?.hasAddress).toBe(false);

    await updateMyAddress(prisma, s.ctx, s.userId, ADDRESS);
    expect(await myAddress(prisma, s.ctx)).toMatchObject({ zip: "01310100", state: "SP" });

    const id = await createShipment(prisma, s.envio, {
      creatorId: s.creator.id,
      items: [{ productId: s.whey.id, quantity: 2 }, { productId: s.creatina.id, quantity: 1 }, { productId: s.creatina.id, quantity: 0 }],
      note: " Kit de outubro ",
    });
    // Mudar o endereço depois não muda a cópia do envio.
    await updateMyAddress(prisma, s.ctx, s.userId, { ...ADDRESS, number: "2000" });
    const created = await prisma.shipment.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect(created).toMatchObject({ status: "PREPARING", note: "Kit de outubro", address: { number: "1000", city: "São Paulo" } });
    expect(created.items.map((i) => [i.title, i.quantity]).sort()).toEqual([["Creatina", 1], ["Whey", 2]]);

    await expect(confirmReceived(prisma, s.ctx, s.userId, id)).rejects.toThrow(/mudou de situação/);
    await markShipped(prisma, s.envio, { shipmentId: id, carrier: "", trackingCode: " aa123456789br " });
    expect(await prisma.notification.findFirstOrThrow({ where: { dedupeKey: `shipped:${id}` } })).toMatchObject({ kind: "SHIPPED", body: expect.stringContaining("AA123456789BR") });
    await expect(markShipped(prisma, s.envio, { shipmentId: id, carrier: "Correios", trackingCode: "XX" })).rejects.toThrow(/mudou de situação/);
    await expect(confirmReceived(prisma, { ...s.ctx, viewAs: { userId: "sa" } }, s.userId, id)).rejects.toThrow(/Visualização da equipe/);
    await confirmReceived(prisma, s.ctx, s.userId, id);

    const [mine] = await myShipments(prisma, s.ctx);
    expect(mine).toMatchObject({ status: "DELIVERED", carrier: "Correios", trackingCode: "AA123456789BR", deliveredBy: "CREATOR" });
    const actions = await prisma.auditLog.findMany({ where: { entityId: id }, select: { action: true } });
    expect(actions.map((a) => a.action).sort()).toEqual(["shipment.create", "shipment.delivered", "shipment.shipped"]);
    expect(await prisma.auditLog.count({ where: { action: "creator.address", entityId: s.account.id } })).toBe(2);
  });

  it("equipe marca entregue ou cancela; entregue não cancela", async () => {
    const s = await setup();
    await updateMyAddress(prisma, s.ctx, s.userId, ADDRESS);
    const a = await createShipment(prisma, s.envio, { creatorId: s.creator.id, items: [{ productId: s.whey.id, quantity: 1 }] });
    await markShipped(prisma, s.envio, { shipmentId: a, carrier: "Jadlog", trackingCode: "123" });
    await markDeliveredByStaff(prisma, s.envio, a);
    await expect(cancelShipment(prisma, s.envio, a)).rejects.toThrow(/mudou de situação/);

    const b = await createShipment(prisma, s.envio, { creatorId: s.creator.id, items: [{ productId: s.whey.id, quantity: 1 }] });
    await cancelShipment(prisma, s.envio, b);
    expect((await staffShipments(prisma, s.envio, { status: "CANCELLED" })).map((x) => x.id)).toEqual([b]);
    expect((await staffShipments(prisma, s.envio)).map((x) => x.id).sort()).toEqual([a, b].sort());
  });

  it("dois cliques ao mesmo tempo em 'enviado': só um vale", async () => {
    const s = await setup();
    await updateMyAddress(prisma, s.ctx, s.userId, ADDRESS);
    const id = await createShipment(prisma, s.envio, { creatorId: s.creator.id, items: [{ productId: s.whey.id, quantity: 1 }] });
    const results = await Promise.allSettled(
      ["AA111111111BR", "AA222222222BR"].map((code) => markShipped(prisma, s.envio, { shipmentId: id, carrier: "Correios", trackingCode: code })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: "shipment.shipped", entityId: id } })).toBe(1);
  });

  it("recusa: sem permissão, outra marca, creator desligada, produto de outra marca, sem produto, recebi de envio alheio", async () => {
    const s = await setup();
    await updateMyAddress(prisma, s.ctx, s.userId, ADDRESS);
    const items = [{ productId: s.whey.id, quantity: 1 }];
    const pagamento = await userWith("PAGAMENTO", s.brand.id);
    await expect(createShipment(prisma, pagamento, { creatorId: s.creator.id, items })).rejects.toThrow(/permissão/);
    await expect(staffShipments(prisma, pagamento)).rejects.toThrow(/permissão/);
    const other = await setup();
    await expect(createShipment(prisma, other.envio, { creatorId: s.creator.id, items })).rejects.toThrow(/permissão/);
    await expect(createShipment(prisma, s.envio, { creatorId: s.creator.id, items: [{ productId: other.whey.id, quantity: 1 }] })).rejects.toThrow(/Produto/);
    await expect(createShipment(prisma, s.envio, { creatorId: s.creator.id, items: [{ productId: s.whey.id, quantity: 0 }] })).rejects.toThrow(/ao menos um/);
    await expect(createShipment(prisma, s.envio, { creatorId: s.creator.id, items: [{ productId: s.whey.id, quantity: 1.5 }] })).rejects.toThrow(/Quantidade/);

    const id = await createShipment(prisma, s.envio, { creatorId: s.creator.id, items });
    expect((await staffShipments(prisma, other.envio)).some((x) => x.id === id)).toBe(false);
    await markShipped(prisma, s.envio, { shipmentId: id, carrier: "Correios", trackingCode: "AA123456789BR" });
    await expect(confirmReceived(prisma, other.ctx, other.userId, id)).rejects.toThrow(/não encontrado/);

    await prisma.creator.update({ where: { id: s.creator.id }, data: { status: "DEACTIVATED" } });
    await expect(createShipment(prisma, s.envio, { creatorId: s.creator.id, items })).rejects.toThrow(/desligada/);
  });

  it("travas do banco: situação x datas, quantidade positiva, CEP e UF", async () => {
    const s = await setup();
    const base = { brandId: s.brand.id, creatorId: s.creator.id, address: {}, createdById: "x" };
    await expectDbError(prisma.shipment.create({ data: { ...base, status: "SHIPPED" } }), /Shipment_status_dates/);
    await expectDbError(prisma.shipment.create({ data: { ...base, status: "SHIPPED", shippedAt: new Date(), shippedById: "x", trackingCode: " " } }), /Shipment_status_dates/);
    await expectDbError(prisma.shipment.create({ data: { ...base, status: "CANCELLED" } }), /Shipment_status_dates/);
    await expectDbError(prisma.shipment.create({ data: { ...base, deliveredAt: new Date() } }), /Shipment_status_dates/);
    const ok = await prisma.shipment.create({ data: base });
    await expectDbError(prisma.shipmentItem.create({ data: { brandId: s.brand.id, shipmentId: ok.id, productId: s.whey.id, title: "Whey", quantity: 0 } }), /ShipmentItem_quantity_positive/);
    await expectDbError(prisma.creatorAccount.update({ where: { id: s.account.id }, data: { addrZip: "1234" } }), /CreatorAccount_addr_zip/);
    await expectDbError(prisma.creatorAccount.update({ where: { id: s.account.id }, data: { addrState: "sp" } }), /CreatorAccount_addr_state_uf/);
  });
});
