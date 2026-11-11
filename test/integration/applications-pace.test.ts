import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { applicationsPace } from "@/lib/onboarding/pace";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const DAY = 86_400_000;

describe("candidatas: ritmo da equipe (D-CANDBOARD, banco real)", () => {
  it("decididas nos últimos 30 dias, tempo médio até decidir e quem espera assinar (3+ dias)", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const now = new Date();
    const app = (status: "NEW" | "REJECTED", submittedDaysAgo: number, decidedDaysAgo: number | null) =>
      prisma.creatorApplication.create({
        data: {
          brandId: brand.id,
          source: "staff_form",
          externalKey: randomUUID(),
          submittedAt: new Date(now.getTime() - submittedDaysAgo * DAY),
          fullName: "X",
          raw: {},
          status,
          ...(decidedDaysAgo !== null ? { decidedAt: new Date(now.getTime() - decidedDaysAgo * DAY), decidedById: "seed" } : {}),
        },
      });
    await app("REJECTED", 10, 6); // 4 dias para decidir
    await app("REJECTED", 12, 10); // 2 dias
    await app("REJECTED", 90, 60); // fora dos 30 dias
    await app("NEW", 1, null);
    await prisma.creator.update({ where: { id: creator.id }, data: { awaitingContractAt: new Date(now.getTime() - 5 * DAY) } });
    const other = await prisma.creatorAccount.create({ data: { name: "Y", email: `${randomUUID()}@x.com` } });
    await prisma.creator.create({ data: { brandId: brand.id, accountId: other.id, categories: ["INFLUENCER"], awaitingContractAt: new Date(now.getTime() - DAY) } });

    expect(await applicationsPace(prisma, brand.id, now)).toEqual({ approved30: 0, rejected30: 2, avgDecisionDays: 3, waiting: 2, waitingSlow: 1 });
  });
});
