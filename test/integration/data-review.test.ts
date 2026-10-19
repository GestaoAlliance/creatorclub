import { afterAll, describe, expect, it } from "vitest";
import { dataReview } from "@/lib/creators/data-review";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("Cadastros a revisar (banco real)", () => {
  it("lista nome com dados, nome de cupom, repetidas e criadas pela planilha", async () => {
    const { brand, creator, account } = await seedBrand(prisma);
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { name: "Ana Eliza de Medeiros" } });
    const make = async (name: string, source?: string) => {
      const a = await prisma.creatorAccount.create({ data: { name, email: `${Math.random().toString(36).slice(2)}@x.com` } });
      return prisma.creator.create({ data: { brandId: brand.id, accountId: a.id, categories: ["INFLUENCER"], source: source ?? null } });
    };
    const twin = await make("Ana Eliza Medeiros", "central");
    const row = await make("Fulana (31) 98450-5560 FULANA https://x.com/discount/FULANA");
    const code = await make("ANOVA10");
    await make("Pessoa Normal");
    const rows = await dataReview(prisma, brand.id);
    const by = new Map(rows.map((r) => [r.id, r]));
    expect(rows).toHaveLength(4);
    expect(by.get(creator.id)!.reasons).toEqual(["possível repetida"]);
    expect(by.get(creator.id)!.twins.map((t) => t.id)).toEqual([twin.id]);
    expect(by.get(twin.id)!.reasons).toEqual(["possível repetida", "criada pela planilha"]);
    expect(by.get(row.id)!.reasons).toEqual(["dados no nome"]);
    expect(by.get(code.id)!.reasons).toEqual(["nome de cupom"]);
  });
});
