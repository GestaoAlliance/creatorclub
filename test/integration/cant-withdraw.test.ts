import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { actionQueue } from "@/lib/actions/queue";
import { withdrawBlocks } from "@/lib/payouts/withdraw-blocks";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const money = (brandId: string, creatorId: string, amountCents: number) =>
  prisma.ledgerEntry.create({ data: { brandId, creatorId, type: "ADJUSTMENT", amountCents, availableAt: new Date("2026-11-01T12:00:00Z"), idempotencyKey: randomUUID(), note: "teste", createdById: "x" } });

describe("tem saldo e não saca (D-CANTWITHDRAW, banco real)", () => {
  it("acha quem tem saldo e está travada, com o motivo; some quando resolve", async () => {
    const s = await seedBrand(prisma);
    await prisma.creator.update({ where: { id: s.creator.id }, data: { withdrawalsUnlockedAt: new Date(), withdrawalsUnlockedById: "x" } });
    const terms = await prisma.termsVersion.create({ data: { brandId: s.brand.id, version: 1, title: "Termo", body: "Texto do termo", createdById: "x" } });
    await money(s.brand.id, s.creator.id, 25_529);

    // Outra sem saldo e uma só UGC com saldo: ficam de fora.
    const mk = async (categories: ("INFLUENCER" | "UGC")[]) => {
      const a = await prisma.creatorAccount.create({ data: { name: `X ${randomUUID()}`, email: `${randomUUID()}@x.com` } });
      return prisma.creator.create({ data: { brandId: s.brand.id, accountId: a.id, categories } });
    };
    await mk(["INFLUENCER"]);
    const ugc = await mk(["UGC"]);
    await money(s.brand.id, ugc.id, 5_000);

    const now = new Date("2026-11-26T15:00:00Z");
    let blocks = await withdrawBlocks(prisma, s.brand.id, now);
    expect([...blocks.keys()]).toEqual([s.creator.id]);
    expect(blocks.get(s.creator.id)).toEqual({ availableCents: 25_529, reasons: ["NO_LOGIN", "TERMS"] });

    const task = (await actionQueue(prisma, s.brand.id, now)).find((t) => t.kind === "CANT_WITHDRAW");
    expect(task).toMatchObject({ creatorId: s.creator.id, owner: "GESTAO", tone: "urgent" });
    expect(task!.detail.replace(/ /g, " ")).toBe("tem R$ 255,29 para sacar e não consegue: sem acesso ao portal, termo do Creator Club para aceitar no portal");

    // Ganha o login: sobra o termo. Aceita o termo: sai da fila.
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email: `${userId}@x.com`, name: "C" } });
    await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { userId } });
    expect((await withdrawBlocks(prisma, s.brand.id, now)).get(s.creator.id)?.reasons).toEqual(["TERMS"]);
    await prisma.termsAcceptance.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, termsVersionId: terms.id, userId, fullName: "C", cpf: "00000000000" } });
    blocks = await withdrawBlocks(prisma, s.brand.id, now);
    expect(blocks.size).toBe(0);
    expect((await actionQueue(prisma, s.brand.id, now)).some((t) => t.kind === "CANT_WITHDRAW")).toBe(false);

    // Saldo em conferência também trava (é da equipe: sem mensagem para ela).
    await prisma.creator.update({ where: { id: s.creator.id }, data: { withdrawalsUnlockedAt: null, withdrawalsUnlockedById: null } });
    expect((await withdrawBlocks(prisma, s.brand.id, now, [s.creator.id])).get(s.creator.id)?.reasons).toEqual(["LOCKED"]);
    expect((await actionQueue(prisma, s.brand.id, now)).find((t) => t.kind === "CANT_WITHDRAW")?.message).toBeNull();
  });
});
