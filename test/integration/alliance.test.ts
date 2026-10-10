import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { scopeGrants } from "@/lib/auth/permissions";
import { listApplications, receiveApplication } from "@/lib/onboarding/applications";
import { allianceOverview } from "@/lib/staff/overview";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

describe("Alliance: várias marcas (A1, banco real)", () => {
  it("visão geral com um cartão por marca; listas só da marca escolhida", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    const id = randomUUID();
    await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "SA", roleGrants: { create: { role: "SUPER_ADMIN", brandId: null } } } });
    const sa = (await loadActor(prisma, id))!;
    for (const brand of [a.brand, b.brand])
      await receiveApplication(prisma, { brandSlug: brand.slug, source: "hunter_form", externalKey: randomUUID(), submittedAt: new Date(), answers: { "Seu nome completo:": `Cand ${brand.slug}`, "EMAIL:": `${randomUUID()}@x.com` } });
    await prisma.brandIntegration.create({ data: { brandId: a.brand.id, kind: "SHOPIFY", status: "CONNECTED", externalId: "a.myshopify.com" } });

    const brands = [a.brand, b.brand].map((x) => ({ id: x.id, slug: x.slug, name: x.name, primaryColor: x.primaryColor, secondaryColor: x.secondaryColor }));
    const cards = await allianceOverview(prisma, sa, brands);
    expect(cards.map((c) => [c.slug, c.home.creators?.applications, c.store?.connected ?? false])).toEqual([
      [a.brand.slug, 1, true],
      [b.brand.slug, 1, false],
    ]);

    const inA = { ...sa, grants: scopeGrants(sa.grants, a.brand.id) };
    const rows = (await listApplications(prisma, inA)).rows;
    expect(rows.every((r) => r.brandId === a.brand.id)).toBe(true);
    expect(rows.some((r) => r.fullName === `Cand ${a.brand.slug}`)).toBe(true);
  });
});
