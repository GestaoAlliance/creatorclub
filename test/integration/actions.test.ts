import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { dayKey, monthKey } from "@/domain";
import { actionQueue, markActionDone, visibleTasks } from "@/lib/actions/queue";
import { loadActor } from "@/lib/auth/actor";
import { staffHome } from "@/lib/staff/home";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const DAY = 86_400_000;
const NOW = new Date();
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const dayIn = (d: number) => new Date(`${dayKey(new Date(NOW.getTime() + d * DAY))}T00:00:00Z`);

async function user(role: "GESTAO" | "ENVIO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("fila de ações por creator (M2.1, D-ACTIONS, banco real)", () => {
  it("cinco tipos de tarefa, quem cuida, mensagem no WhatsApp; feito tira a ocorrência; resolvido some sozinho", async () => {
    const a = await seedBrand(prisma);
    const mk = async (data: Record<string, unknown> = {}, phone: string | null = "(31) 99876-5432") => {
      const acc = await prisma.creatorAccount.create({ data: { name: "Maria Teste", email: `${randomUUID()}@x.com`, phone } });
      return prisma.creator.create({ data: { brandId: a.brand.id, accountId: acc.id, categories: ["INFLUENCER"], contractStart: dayIn(-10), ...data } });
    };
    const idle = await mk({ contractStart: dayIn(-90) });
    const ending = await mk({ contractEnd: dayIn(10) }, null);
    const near = await mk();
    const order = await prisma.order.create({
      data: {
        brandId: a.brand.id, shopifyId: `gid://shopify/Order/${randomUUID()}`, name: "#n", createdAtShop: NOW, paidAt: NOW, financialStatus: "PAID",
        subtotalCents: 40_000, totalCents: 40_000, discountCodes: [a.coupon.code], shopifyUpdatedAt: NOW,
      },
    });
    await prisma.orderAttribution.create({ data: { brandId: a.brand.id, orderId: order.id, creatorId: near.id, couponId: a.coupon.id, rateBps: 1500, rule: "first_creator_code", evidenceCodes: [a.coupon.code] } });
    const kitOwner = await mk();
    const kit = await prisma.kitGrant.create({ data: { brandId: a.brand.id, creatorId: kitOwner.id, kind: "WELCOME", month: "2026-09", salesCents: 0, products: 1, createdAt: ago(8) } });
    await prisma.kitGrant.create({ data: { brandId: a.brand.id, creatorId: kitOwner.id, kind: "MONTHLY", month: "2026-09", salesCents: 0, products: 1, createdAt: ago(2) } }); // recente: fora
    const ship = await prisma.shipment.create({ data: { brandId: a.brand.id, creatorId: kitOwner.id, address: {}, createdById: "x", createdAt: ago(4) } });
    await mk({ contractStart: dayIn(-90), status: "DEACTIVATED" }); // desligada: fora

    const tasks = await actionQueue(prisma, a.brand.id, NOW);
    const of = (creatorId: string) => tasks.filter((t) => t.creatorId === creatorId).map((t) => t.kind).sort();
    expect(of(idle.id)).toEqual(["IDLE"]);
    expect(of(ending.id)).toEqual(["CONTRACT"]);
    expect(of(near.id)).toEqual(["NEAR_MIN"]);
    expect(of(kitOwner.id)).toEqual(["KIT_PENDING", "SHIP_STUCK"]);
    const t = (kind: string) => tasks.find((x) => x.kind === kind)!;
    expect(t("IDLE")).toMatchObject({ owner: "GESTAO", key: `IDLE:${idle.id}:nunca`, whatsappUrl: expect.stringMatching(/^https:\/\/wa\.me\/5531998765432\?text=Oi%2C%20Maria!/) });
    expect(t("CONTRACT")).toMatchObject({ whatsappUrl: null, message: expect.stringContaining("vence em") }); // sem telefone: só o texto
    expect(t("NEAR_MIN")).toMatchObject({ key: `NEAR_MIN:${near.id}:${monthKey(NOW, "America/Sao_Paulo")}`, detail: expect.stringMatching(/faltam R\$\s100,00/) });
    expect(t("KIT_PENDING").key).toBe(`KIT_PENDING:${kit.id}`);
    expect(t("SHIP_STUCK")).toMatchObject({ key: `SHIP_STUCK:${ship.id}`, owner: "ENVIO", message: null });

    const ana = await user("GESTAO", a.brand.id);
    const envio = await user("ENVIO", a.brand.id);
    expect(visibleTasks(tasks, envio, a.brand.id).map((x) => x.kind)).toEqual(["SHIP_STUCK"]);
    expect((await staffHome(prisma, envio)).actions).toEqual({ open: 1, shipStuck: 1 });
    expect((await staffHome(prisma, ana)).actions?.open).toBeGreaterThanOrEqual(5);

    // Feito: sai da fila; envio não marca tarefa da Gestão; outra marca não vê.
    await expect(markActionDone(prisma, envio, a.brand.id, t("IDLE").key, NOW)).rejects.toThrow(/saiu da fila/);
    await markActionDone(prisma, ana, a.brand.id, t("IDLE").key, NOW);
    await expect(markActionDone(prisma, ana, a.brand.id, t("IDLE").key, NOW)).rejects.toThrow(/saiu da fila/);
    expect((await actionQueue(prisma, a.brand.id, NOW)).some((x) => x.creatorId === idle.id)).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "action.done", entityId: idle.id } })).toBe(1);
    const other = await seedBrand(prisma);
    await expect(markActionDone(prisma, await user("GESTAO", other.brand.id), a.brand.id, t("CONTRACT").key, NOW)).rejects.toThrow(/saiu da fila/);

    // Resolvido some sozinho: contrato renovado.
    await prisma.creator.update({ where: { id: ending.id }, data: { contractEnd: dayIn(200) } });
    expect((await actionQueue(prisma, a.brand.id, NOW)).some((x) => x.kind === "CONTRACT")).toBe(false);

    await expectDbError(prisma.actionDone.create({ data: { brandId: a.brand.id, creatorId: idle.id, key: "OUTRO:x", doneById: "x" } }), /ActionDone_key_format/);
  });
});
