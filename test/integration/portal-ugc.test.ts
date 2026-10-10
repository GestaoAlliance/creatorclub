import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { portalContext } from "@/lib/portal/context";
import { pendingTerms } from "@/lib/terms/terms";
import { requestWithdrawal } from "@/lib/withdrawals/request";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function loginFor(accountId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "Creator" } });
  await prisma.creatorAccount.update({ where: { id: accountId }, data: { userId: id } });
  return { userId: id, actor: (await loadActor(prisma, id))! };
}

describe("portal de quem é só UGC (D-UGCPORTAL, banco real)", () => {
  it("só UGC: portal simplificado, sem termo e sem saque; UGC que também é influencer segue com o portal completo", async () => {
    const a = await seedBrand(prisma);
    await prisma.creator.update({
      where: { id: a.creator.id },
      data: { categories: ["UGC"], withdrawalsUnlockedAt: new Date(), withdrawalsUnlockedById: "pagamento" },
    });
    await prisma.termsVersion.create({ data: { brandId: a.brand.id, version: 1, title: "Termo", body: "Texto do termo.", createdById: "x" } });
    const { userId, actor } = await loginFor(a.account.id);

    const ctx = await portalContext(prisma, actor, a.brand.slug);
    expect(ctx.ugcOnly).toBe(true);
    expect(await pendingTerms(prisma, ctx)).toBeNull();
    await expect(
      requestWithdrawal(prisma, ctx, { actorUserId: userId, requestId: randomUUID(), amountCents: 10_000, pdf: new Uint8Array([1]) }, new Date("2026-10-05T15:00:00Z")),
    ).rejects.toThrow(/UGC não tem saque/);

    // Também influencer: portal completo, com o termo.
    await prisma.creator.update({ where: { id: a.creator.id }, data: { categories: ["INFLUENCER", "UGC"] } });
    const full = await portalContext(prisma, actor, a.brand.slug);
    expect(full.ugcOnly).toBe(false);
    expect(await pendingTerms(prisma, full)).not.toBeNull();
  });

  it("a equipe vendo o portal (D-VIEWAS) vê o portal simplificado da UGC", async () => {
    const a = await seedBrand(prisma);
    await prisma.creator.update({ where: { id: a.creator.id }, data: { categories: ["UGC"] } });
    const id = randomUUID();
    await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "SA", roleGrants: { create: { role: "SUPER_ADMIN", brandId: null } } } });
    const ctx = await portalContext(prisma, (await loadActor(prisma, id))!, a.brand.slug, a.creator.id);
    expect(ctx).toMatchObject({ creatorId: a.creator.id, ugcOnly: true });
  });
});
