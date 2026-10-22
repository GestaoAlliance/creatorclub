import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { addCreatorNote, creatorNumbers, creatorTimeline } from "@/lib/creators/timeline";
import { commissionEntry, expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "GESTAO" | "ENVIO", brandId: string, name = role) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("ficha da creator: números e linha do tempo (M0.2, banco real)", () => {
  it("números de 30 dias, aguardando pagamento (estimativa pela taxa) e estornos", async () => {
    const now = new Date("2026-10-22T15:00:00Z");
    const { brand, creator, coupon, order } = await seedBrand(prisma); // pedido pago em 01/09: fora dos 30 dias
    await prisma.orderAttribution.create({ data: { brandId: brand.id, orderId: order.id, creatorId: creator.id, couponId: coupon.id, rateBps: 1000, rule: "first", evidenceCodes: [coupon.code] } });
    await prisma.commissionPolicy.create({ data: { brandId: brand.id, creatorId: creator.id, rateBps: 1000, validFrom: new Date("2026-01-01"), confirmedAt: new Date(), confirmedById: "seed" } });
    const mk = async (extra: object) => {
      const o = await prisma.order.create({
        data: { brandId: brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: `#${randomUUID().slice(0, 6)}`, createdAtShop: new Date("2026-10-20T12:00:00Z"), financialStatus: "PAID", subtotalCents: 10_000, totalCents: 11_000, discountCodes: [coupon.code], shopifyUpdatedAt: now, ...extra },
      });
      await prisma.orderAttribution.create({ data: { brandId: brand.id, orderId: o.id, creatorId: creator.id, couponId: coupon.id, rule: "first", evidenceCodes: [coupon.code] } });
      return o;
    };
    await mk({ paidAt: new Date("2026-10-20T12:00:00Z") });
    await mk({ paidAt: new Date("2026-10-10T12:00:00Z"), subtotalCents: 20_000 });
    await mk({ financialStatus: "PENDING" });
    await mk({ financialStatus: "PENDING", cancelledAt: now }); // cancelado: não conta
    await prisma.ledgerEntry.create({ data: commissionEntry({ brandId: brand.id, creatorId: creator.id, orderId: order.id }, { type: "REVERSAL", amountCents: -1_500 }) });

    expect(await creatorNumbers(prisma, creator.id, now)).toEqual({
      last30: { salesCents: 30_000, orders: 2, ticketCents: 15_000 },
      pending: { orders: 1, salesCents: 10_000, commissionCents: 1_000 },
      reversedCents: 1_500,
    });
  });

  it("observação: só quem edita escreve, até 1000 caracteres, não se apaga; entra na linha do tempo com o resto", async () => {
    const { brand, creator, coupon, order } = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id, "Ana Gestão");
    const envio = await userWith("ENVIO", brand.id);
    await prisma.couponAssignment.create({ data: { brandId: brand.id, couponId: coupon.id, creatorId: creator.id, validFrom: new Date("2026-08-01"), createdById: "seed" } });
    await prisma.orderAttribution.create({ data: { brandId: brand.id, orderId: order.id, creatorId: creator.id, couponId: coupon.id, rateBps: 1500, rule: "first", evidenceCodes: [coupon.code] } });
    await prisma.commissionPolicy.create({ data: { brandId: brand.id, creatorId: creator.id, rateBps: 1500, validFrom: new Date("2026-08-01"), confirmedAt: new Date(), confirmedById: "seed" } });

    await expect(addCreatorNote(prisma, envio, creator.id, "oi")).rejects.toThrow(/Sem permissão/);
    await expect(addCreatorNote(prisma, gestao, creator.id, "   ")).rejects.toThrow(/Escreva/);
    await expect(addCreatorNote(prisma, gestao, creator.id, "x".repeat(1001))).rejects.toThrow(/1000/);
    const note = await addCreatorNote(prisma, gestao, creator.id, "  Combinou post na sexta  ");
    expect(note.body).toBe("Combinou post na sexta");

    const events = await creatorTimeline(prisma, gestao, creator.id);
    expect(events[0]).toMatchObject({ kind: "note", title: "Combinou post na sexta", detail: "Ana Gestão" });
    expect(events.map((e) => e.title)).toEqual(expect.arrayContaining([`Cupom ${coupon.code} passou a ser dela`, "Primeira venda paga", "Entrou no Creator Club", "Comissão de 15%"]));
    // Mais recente primeiro.
    expect(events.map((e) => e.at.getTime())).toEqual([...events.map((e) => e.at.getTime())].sort((a, b) => b - a));
    // Quem não vê dinheiro (Envio) não vê saques nem taxa na linha do tempo.
    expect((await creatorTimeline(prisma, envio, creator.id)).some((e) => e.kind === "withdrawal" || e.kind === "rate")).toBe(false);

    // Travas do banco: texto vazio e somente inserção.
    await expectDbError(prisma.creatorNote.create({ data: { brandId: brand.id, creatorId: creator.id, authorId: gestao.userId, body: "  " } }), /CreatorNote_body_length/);
    await expectDbError(prisma.creatorNote.update({ where: { id: note.id }, data: { body: "outro" } }), /somente inserção/);
    await expectDbError(prisma.creatorNote.delete({ where: { id: note.id } }), /somente inserção/);
  });
});
