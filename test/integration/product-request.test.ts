import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext } from "@/lib/portal/context";
import { approveShipment, productRequestState, rejectShipment, requestProducts } from "@/lib/shipments/kits";
import { ShipmentError, updateMyAddress } from "@/lib/shipments/shipments";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const ADDRESS = { zip: "01310-100", street: "Av. Paulista", number: "1000", district: "Bela Vista", city: "São Paulo", state: "SP" };

async function setup() {
  const a = await seedBrand(prisma);
  const userId = randomUUID();
  await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { userId } });
  const ctx = await portalContext(prisma, (await loadActor(prisma, userId))!, a.brand.slug);
  const gestaoId = randomUUID();
  await prisma.user.create({ data: { id: gestaoId, email: `${gestaoId}@x.com`, name: "Gestão", roleGrants: { create: { role: "GESTAO", brandId: a.brand.id } } } });
  const gestao = (await loadActor(prisma, gestaoId))!;
  const [serum, creme] = await Promise.all(
    ["Sérum", "Creme"].map((title) => prisma.product.create({ data: { brandId: a.brand.id, shopifyId: `gid://shopify/Product/${randomUUID()}`, title, active: true } })),
  );
  return { ...a, ctx, userId, gestao, serum: serum!, creme: creme! };
}

describe("pedir produtos no portal (D-PRODUCTREQ, banco real)", () => {
  it("só ativa com contrato assinado; até 3; um pedido esperando por vez; aprovado vai para o Envio, recusado libera outro", async () => {
    const a = await setup();
    expect(await productRequestState(prisma, a.ctx)).toMatchObject({ allowed: false, reason: expect.stringMatching(/contrato assinado/) });
    await prisma.creator.update({ where: { id: a.creator.id }, data: { contractSigned: true } });
    expect(await productRequestState(prisma, a.ctx)).toEqual({ allowed: true });

    const two = [{ productId: a.serum.id, quantity: 2 }, { productId: a.creme.id, quantity: 1 }];
    await expect(requestProducts(prisma, a.ctx, a.userId, two, "")).rejects.toThrow(/endereço/);
    await updateMyAddress(prisma, a.ctx, a.userId, ADDRESS);
    await expect(requestProducts(prisma, a.ctx, a.userId, [{ productId: a.serum.id, quantity: 4 }], "")).rejects.toThrow(/no máximo 3/);
    await expect(requestProducts(prisma, a.ctx, a.userId, [], "")).rejects.toThrow(/pelo menos 1/);

    const id = await requestProducts(prisma, a.ctx, a.userId, two, "  gravar   o vídeo  ");
    const s = await prisma.shipment.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect(s).toMatchObject({ status: "AWAITING_APPROVAL", note: "Pedido da creator: gravar o vídeo", address: expect.objectContaining({ zip: "01310100" }) });
    expect(s.items.map((i) => [i.title, i.quantity]).sort()).toEqual([["Creme", 1], ["Sérum", 2]]);

    // Um pedido esperando por vez.
    expect(await productRequestState(prisma, a.ctx)).toMatchObject({ allowed: false, reason: expect.stringMatching(/esperando a aprovação/) });
    await expect(requestProducts(prisma, a.ctx, a.userId, [{ productId: a.serum.id, quantity: 1 }], "")).rejects.toThrow(ShipmentError);

    // Recusado: libera outro pedido. Aprovado: vai para "Preparando" e também libera.
    await rejectShipment(prisma, a.gestao, id, "Sem estoque agora");
    expect(await productRequestState(prisma, a.ctx)).toEqual({ allowed: true });
    const id2 = await requestProducts(prisma, a.ctx, a.userId, [{ productId: a.creme.id, quantity: 1 }], "");
    await approveShipment(prisma, a.gestao, id2);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: id2 } })).status).toBe("PREPARING");
    expect(await productRequestState(prisma, a.ctx)).toEqual({ allowed: true });
    expect(await prisma.auditLog.count({ where: { action: "shipment.request", entityId: { in: [id, id2] } } })).toBe(2);

    // Pausada não pede.
    await prisma.creator.update({ where: { id: a.creator.id }, data: { status: "INACTIVE" } });
    expect(await productRequestState(prisma, a.ctx)).toMatchObject({ allowed: false, reason: expect.stringMatching(/ativas/) });
  });
});
