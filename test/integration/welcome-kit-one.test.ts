import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("kit de boas-vindas de 1 produto (D-WELCOMEKIT1, banco real)", () => {
  it("contratos e kits não escolhidos viram 1; kit já escolhido e kit mensal não mudam; texto ganha nova versão", async () => {
    const s = await seedBrand(prisma);
    const t = await prisma.contractTemplate.create({ data: { brandId: s.brand.id, key: `inf-${letters(4)}`, name: "Inf", releaseMinCents: 50_000, months: 6, kitTiers: [], welcomeProducts: 3 } });
    const other = await seedBrand(prisma);
    const welcome = await prisma.kitGrant.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, kind: "WELCOME", month: "2026-10", salesCents: 0, products: 3 } });
    const shipment = await prisma.shipment.create({ data: { brandId: other.brand.id, creatorId: other.creator.id, status: "AWAITING_APPROVAL", address: { city: "São Paulo" }, createdById: "teste" } });
    const chosen = await prisma.kitGrant.create({ data: { brandId: other.brand.id, creatorId: other.creator.id, kind: "WELCOME", month: "2026-10", salesCents: 0, products: 3, status: "CHOSEN", chosenAt: new Date(), shipmentId: shipment.id } });
    const monthly = await prisma.kitGrant.create({ data: { brandId: s.brand.id, creatorId: s.creator.id, kind: "MONTHLY", month: "2026-09", salesCents: 1_000_000, products: 3 } });
    await prisma.contractDocument.create({
      data: { brandId: s.brand.id, kind: "PRESCRITOR", version: 1, title: "Contrato", body: "2.1. A CONTRATANTE enviará à CONTRATADA 3 (três) produtos Botanika no início da parceria. Resto.", createdById: "teste" },
    });

    await prisma.$executeRawUnsafe(readFileSync("prisma/migrations/20261022230000_welcome_kit_one/migration.sql", "utf8"));

    expect((await prisma.contractTemplate.findUniqueOrThrow({ where: { id: t.id } })).welcomeProducts).toBe(1);
    expect((await prisma.kitGrant.findUniqueOrThrow({ where: { id: welcome.id } })).products).toBe(1);
    expect((await prisma.kitGrant.findUniqueOrThrow({ where: { id: chosen.id } })).products).toBe(3);
    expect((await prisma.kitGrant.findUniqueOrThrow({ where: { id: monthly.id } })).products).toBe(3);
    const docs = await prisma.contractDocument.findMany({ where: { brandId: s.brand.id, kind: "PRESCRITOR" }, orderBy: { version: "asc" } });
    expect(docs.map((d) => d.version)).toEqual([1, 2]);
    expect(docs[1]!.body).toContain("1 (um) produto Botanika no início da parceria");
    expect(docs[0]!.body).toContain("3 (três) produtos"); // o texto já assinado não muda
  });
});
