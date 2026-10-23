import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { approveApplication, createStaffApplication, listApplications, receiveApplication, rejectApplications } from "@/lib/onboarding/applications";
import type { ShopifyClient } from "@/lib/shopify/client";
import { letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

/** Shopify falso (D-REALSTORE). */
const client = { shop: "x", graphql: async () => ({ discountCodeBasicCreate: { codeDiscountNode: { id: "gid://shopify/DiscountCodeNode/9" }, userErrors: [] } }) } as unknown as ShopifyClient;
const clientFor = async () => client;

async function userWith(role: "GESTAO" | "PAGAMENTO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

const input = (extra: object = {}) => ({
  fullName: "  Joana   Lima ", phone: "(11) 91234-5678", email: "", instagram: "@joana", tiktok: "", followers: "12 mil",
  category: "PRESCRITOR" as const, suggestedCoupon: "joana", note: "indicada no evento", ...extra,
});

async function received(slug: string) {
  return receiveApplication(prisma, { brandSlug: slug, source: "hunter_form", externalKey: randomUUID(), submittedAt: new Date(), answers: { "Seu nome completo:": "Ana", "EMAIL:": `${randomUUID()}@x.com` } });
}

describe("M4.1: nova candidata pela equipe e recusa em massa (D-MANUALAPP, banco real)", () => {
  it("Gestão cadastra; entra nas pendentes com origem da equipe e é aprovada pelo fluxo normal; Pagamento não cadastra", async () => {
    const { brand } = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id);
    await expect(createStaffApplication(prisma, await userWith("PAGAMENTO", brand.id), brand.id, input())).rejects.toThrow(/permissão/);
    await expect(createStaffApplication(prisma, gestao, brand.id, input({ fullName: " " }))).rejects.toThrow(/nome/);
    await expect(createStaffApplication(prisma, gestao, brand.id, input({ phone: "123" }))).rejects.toThrow(/WhatsApp/);
    await expect(createStaffApplication(prisma, gestao, brand.id, input({ email: "x@" }))).rejects.toThrow(/E-mail/);
    const other = await seedBrand(prisma);
    await expect(createStaffApplication(prisma, gestao, other.brand.id, input())).rejects.toThrow(/permissão/);

    const { id } = await createStaffApplication(prisma, gestao, brand.id, input());
    const row = (await listApplications(prisma, gestao)).rows.find((r) => r.id === id)!;
    expect(row).toMatchObject({ fullName: "Joana Lima", source: "staff_form", categoryProposal: "PRESCRITOR", couponProposal: "JOANA", instagram: "@joana", note: "indicada no evento", canDecide: true });
    expect(await prisma.auditLog.count({ where: { entityId: id, action: "application.created", actorId: gestao.userId } })).toBe(1);

    const r = await approveApplication(prisma, gestao, { applicationId: id, couponCode: letters(6), category: "PRESCRITOR", rateBps: 1500, discountBps: 500, email: `${randomUUID()}@x.com` }, clientFor);
    expect(await prisma.creator.count({ where: { id: r.creatorId, brandId: brand.id } })).toBe(1);
  });

  it("recusa em massa: só as novas da marca de quem recusa; mesmo motivo; auditoria por candidata", async () => {
    const { brand } = await seedBrand(prisma);
    const other = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id);
    const [a, b, c] = [await received(brand.slug), await received(brand.slug), await received(brand.slug)];
    const foreign = await received(other.brand.slug);
    await rejectApplications(prisma, gestao, [c.id], "");
    await expect(rejectApplications(prisma, gestao, [], "")).rejects.toThrow(/Marque/);
    await expect(rejectApplications(prisma, await userWith("PAGAMENTO", brand.id), [a.id], "")).resolves.toEqual({ rejected: 0, skipped: 1 });

    const r = await rejectApplications(prisma, gestao, [a.id, b.id, c.id, foreign.id, a.id], "  fora   do perfil ");
    expect(r).toEqual({ rejected: 2, skipped: 2 });
    const rows = await prisma.creatorApplication.findMany({ where: { id: { in: [a.id, b.id, foreign.id] } }, select: { id: true, status: true, decisionNote: true, decidedById: true } });
    expect(rows.find((x) => x.id === a.id)).toMatchObject({ status: "REJECTED", decisionNote: "fora do perfil", decidedById: gestao.userId });
    expect(rows.find((x) => x.id === b.id)?.status).toBe("REJECTED");
    expect(rows.find((x) => x.id === foreign.id)?.status).toBe("NEW");
    expect(await prisma.auditLog.count({ where: { entityId: { in: [a.id, b.id] }, action: "application.rejected" } })).toBe(2);
  });
});
