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
import { updateBrand } from "@/lib/brands/manage";
import { shipmentsToPrint } from "@/lib/shipments/print";
import { shipmentsForCsv } from "@/lib/shipments/csv";
import { remindReceipts } from "@/lib/shipments/reminders";
import { shipmentsCsv } from "@/domain";
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
  it("D-PJADDR: empresa fora do MEI só troca para o endereço do CNPJ; MEI e sem regime trocam livre", async () => {
    const s = await setup();
    const info = { legalName: "MARIA LTDA", mei: false, active: true, address: { zip: "01310100", street: "AV PAULISTA", number: "1000", complement: null, district: "BELA VISTA", city: "SAO PAULO", state: "SP" } };
    const look = async () => info;
    await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { cnpj: "11222333000181", taxRegime: "SIMPLES" } });
    await expect(updateMyAddress(prisma, s.ctx, s.userId, { ...ADDRESS, number: "2000" }, look)).rejects.toThrow(/endereço da empresa: AV PAULISTA, 1000/);
    await expect(updateMyAddress(prisma, s.ctx, s.userId, ADDRESS, look)).resolves.toMatchObject({ number: "1000" });
    await expect(updateMyAddress(prisma, s.ctx, s.userId, { ...ADDRESS, number: "2000" }, async () => "unavailable")).resolves.toMatchObject({ number: "2000" });
    await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { taxRegime: "MEI" } });
    await expect(updateMyAddress(prisma, s.ctx, s.userId, { ...ADDRESS, number: "3000" }, look)).resolves.toMatchObject({ number: "3000" });
    await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { taxRegime: null } });
    await expect(updateMyAddress(prisma, s.ctx, s.userId, { ...ADDRESS, number: "4000" }, look)).resolves.toMatchObject({ number: "4000" });
  });

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

  it("D-SHIPANYONE: creator sem endereço recebe envio com o endereço digitado, que fica salvo na conta", async () => {
    const s = await setup();
    const items = [{ productId: s.whey.id, quantity: 1 }];
    await expect(createShipment(prisma, s.envio, { creatorId: s.creator.id, items, address: { ...ADDRESS, zip: "123" } })).rejects.toThrow(/CEP/);
    const id = await createShipment(prisma, s.envio, { creatorId: s.creator.id, items, address: ADDRESS });
    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id } });
    expect(shipment.address).toMatchObject({ zip: "01310100", state: "SP" });
    expect(await myAddress(prisma, s.ctx)).toMatchObject({ zip: "01310100", state: "SP" });
    expect((await shipmentFormData(prisma, s.envio)).creators.find((c) => c.id === s.creator.id)?.hasAddress).toBe(true);
    // Com endereço salvo, o do portal vale e o digitado é ignorado.
    const again = await createShipment(prisma, s.envio, { creatorId: s.creator.id, items, address: { ...ADDRESS, number: "9" } });
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: again } })).address).toMatchObject({ number: ADDRESS.number });
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
    // D-SHIPRECIPIENT: a fila traz CPF, CNPJ, telefone e e-mail para o Envio montar o pedido.
    expect(Object.keys((await staffShipments(prisma, s.envio))[0]!.creator.account).sort()).toEqual(["allergies", "cnpj", "cpf", "email", "name", "phone"]);
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

  it("D-LABEL: remetente em Marcas; etiqueta e declaração com o custo; só quem vê o endereço", async () => {
    const s = await setup();
    await updateMyAddress(prisma, s.ctx, s.userId, ADDRESS);
    await prisma.product.update({ where: { id: s.whey.id }, data: { costCents: 4_500 } });
    const shipmentId = await createShipment(prisma, s.envio, { creatorId: s.creator.id, items: [{ productId: s.whey.id, quantity: 2 }] });
    const admin = randomUUID();
    await prisma.user.create({ data: { id: admin, email: `${admin}@x.com`, name: "Admin", roleGrants: { create: { role: "SUPER_ADMIN" } } } });
    const sa = (await loadActor(prisma, admin))!;
    const base = { name: s.brand.name, primaryColor: "#18181B", cnpj: "", legalName: "", storeUrl: "", nfServiceCode: "", nfServiceDescription: "", nfInstructions: "", whatsappInstance: "", defaultRate: "15", defaultDiscount: "5" };
    await expect(updateBrand(prisma, sa, s.brand.id, { ...base, shipFrom: { zip: "123", street: "x", number: "1", complement: "", district: "y", city: "z", state: "MG", phone: "" } })).rejects.toThrow(/Endereço de envio: CEP/);
    await updateBrand(prisma, sa, s.brand.id, { ...base, shipFrom: { zip: "34006-053", street: "Rua Ministro Orozimbo Nonato", number: "215", complement: "Loja 37", district: "Vila da Serra", city: "Nova Lima", state: "mg", phone: "(31) 3333-4444" } });

    const r = await shipmentsToPrint(prisma, s.envio, s.brand.id, { preparing: true });
    expect(r.sender).toMatchObject({ name: s.brand.name, address: { zip: "34006053", state: "MG", phone: "3133334444" } });
    expect(r.shipments).toEqual([expect.objectContaining({ id: shipmentId, items: [{ title: "Whey", quantity: 2, unitCostCents: 4_500 }], totalCents: 9_000 })]);
    expect((await shipmentsToPrint(prisma, s.envio, s.brand.id, { ids: [shipmentId] })).shipments).toHaveLength(1);
    const pagamento = await userWith("PAGAMENTO", s.brand.id);
    await expect(shipmentsToPrint(prisma, pagamento, s.brand.id, { preparing: true })).rejects.toThrow(/permissão/);
    await updateBrand(prisma, sa, s.brand.id, { ...base, shipFrom: { zip: "", street: "", number: "", complement: "", district: "", city: "", state: "", phone: "" } });
    expect((await shipmentsToPrint(prisma, s.envio, s.brand.id, { preparing: true })).sender?.address).toBeNull();
    await expectDbError(prisma.brand.update({ where: { id: s.brand.id }, data: { shipFrom: { zip: "1" } } }), /Brand_shipFrom/);
  });

  it("D-SHIPCSV: planilha com a situação e o período da tela; só quem vê o endereço", async () => {
    const s = await setup();
    await updateMyAddress(prisma, s.ctx, s.userId, ADDRESS);
    await prisma.product.update({ where: { id: s.whey.id }, data: { costCents: 4_500 } });
    await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { cpf: "52998224725", phone: "11988887777", instagram: "maria.fit" } });
    const a = await createShipment(prisma, s.envio, { creatorId: s.creator.id, items: [{ productId: s.whey.id, quantity: 2 }] });
    const b = await createShipment(prisma, s.envio, { creatorId: s.creator.id, items: [{ productId: s.creatina.id, quantity: 1 }] });
    await prisma.shipment.update({ where: { id: b }, data: { createdAt: new Date("2026-09-10T15:00:00Z") } });
    await markShipped(prisma, s.envio, { shipmentId: a, carrier: "Correios", trackingCode: "AB123456789BR" });

    const all = await shipmentsForCsv(prisma, s.envio, s.brand.id);
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ status: "SHIPPED", kind: "Avulso (equipe)", doc: "52998224725", trackingCode: "AB123456789BR", items: [{ title: "Whey", quantity: 2, unitCostCents: 4_500 }] });
    expect(await shipmentsForCsv(prisma, s.envio, s.brand.id, { status: "PREPARING" })).toHaveLength(1);
    expect(await shipmentsForCsv(prisma, s.envio, s.brand.id, { from: "2026-09-10", to: "2026-09-10" })).toHaveLength(1);
    expect(await shipmentsForCsv(prisma, s.envio, s.brand.id, { from: "2026-09-11", to: "2026-09-30" })).toHaveLength(0);

    const csv = shipmentsCsv(all);
    expect(csv.startsWith("\uFEFFData do pedido;Situação;Tipo;Creator;Instagram")).toBe(true);
    expect(csv).toContain(";@maria.fit;52998224725;11988887777;");
    expect(csv).toContain(";Av. Paulista;1000;ap 12;Bela Vista;São Paulo;SP;2x Whey;2;90,00;");
    expect(csv).toContain(";Correios;AB123456789BR;");

    const pagamento = await userWith("PAGAMENTO", s.brand.id);
    await expect(shipmentsForCsv(prisma, pagamento, s.brand.id)).rejects.toThrow(/permissão/);
  });

  it("D-TRACKING: aviso de enviado com produtos e link; entregue pela equipe avisa com o cupom; 10 dias sem Recebi pergunta uma vez; lista de parados", async () => {
    const s = await setup();
    await updateMyAddress(prisma, s.ctx, s.userId, ADDRESS);
    await prisma.couponAssignment.create({ data: { brandId: s.brand.id, couponId: s.coupon.id, creatorId: s.creator.id, validFrom: new Date(), createdById: "t", confirmedAt: new Date(), confirmedById: "t" } });
    const a = await createShipment(prisma, s.envio, { creatorId: s.creator.id, items: [{ productId: s.whey.id, quantity: 2 }] });
    await markShipped(prisma, s.envio, { shipmentId: a, carrier: "Jadlog", trackingCode: "12345678901234" });
    const shipped = await prisma.notification.findFirstOrThrow({ where: { creatorId: s.creator.id, kind: "SHIPPED" } });
    expect(shipped.body).toBe('Enviamos: 2x Whey. Envio pela Jadlog, código de rastreio 12345678901234. Acompanhe a entrega: https://www.melhorrastreio.com.br/rastreio/12345678901234 Quando chegar, toque em "Recebi" em Pedidos.');

    // 10 dias depois sem "Recebi": pergunta uma vez; aparece na lista de parados da equipe.
    const later = new Date(Date.now() + 11 * 86_400_000);
    expect(await remindReceipts(prisma, later)).toBeGreaterThanOrEqual(1);
    await remindReceipts(prisma, later);
    expect(await prisma.notification.count({ where: { creatorId: s.creator.id, kind: "RECEIPT_CHECK" } })).toBe(1);
    expect((await staffShipments(prisma, s.envio, { staleBefore: new Date(Date.now() + 86_400_000) })).map((x) => x.id)).toContain(a);
    expect((await staffShipments(prisma, s.envio, { staleBefore: new Date(Date.now() - 86_400_000) })).map((x) => x.id)).not.toContain(a);

    await markDeliveredByStaff(prisma, s.envio, a);
    const delivered = await prisma.notification.findFirstOrThrow({ where: { creatorId: s.creator.id, kind: "SHIPMENT_DELIVERED" } });
    expect(delivered.body).toContain(`seu cupom ${s.coupon.code}`);
  });
});
