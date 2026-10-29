import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { originsFor, originSummary, setCreatorOrigin } from "@/lib/creators/origin";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function user(role: "GESTAO" | "HUNTER" | "PAGAMENTO", brandId: string, name: string = role) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name, roleGrants: { create: { role, brandId } } } });
  return { id, actor: (await loadActor(prisma, id))! };
}

describe("origem das creators (D-ORIGIN, banco real)", () => {
  it("vem da inscrição (hunter) ou da marcação na ficha; resumo por origem", async () => {
    const s = await seedBrand(prisma);
    const gestao = await user("GESTAO", s.brand.id);
    const hunter = await user("HUNTER", s.brand.id, "Hunter Bia");
    const link = await prisma.hunterLink.create({ data: { brandId: s.brand.id, userId: hunter.id, code: `bia${randomUUID().slice(0, 6)}` } });
    // Creator com inscrição pelo link da hunter.
    await prisma.creatorApplication.create({ data: { brandId: s.brand.id, source: "site_form", consentAt: new Date(), externalKey: randomUUID(), submittedAt: new Date("2026-10-12T15:00:00Z"), fullName: "X", raw: {}, status: "APPROVED", decidedAt: new Date(), decidedById: gestao.id, hunterLinkId: link.id, creatorId: s.creator.id } });
    await prisma.creatorApplication.create({ data: { brandId: s.brand.id, source: "site_form", consentAt: new Date(), externalKey: randomUUID(), submittedAt: new Date(), fullName: "Y", raw: {}, hunterLinkId: link.id } });
    // Importada, sem inscrição.
    const acc = await prisma.creatorAccount.create({ data: { name: "Importada", email: `${randomUUID()}@x.com` } });
    const old = await prisma.creator.create({ data: { brandId: s.brand.id, accountId: acc.id, categories: ["INFLUENCER"] } });

    let m = await originsFor(prisma, [s.creator.id, old.id]);
    expect(m.get(s.creator.id)).toMatchObject({ kind: "HUNTER", hunter: { id: hunter.id, name: "Hunter Bia" }, day: "2026-10-12" });
    expect(m.get(old.id)).toMatchObject({ kind: "UNKNOWN" });

    await expect(setCreatorOrigin(prisma, gestao.actor, s.creator.id, { kind: "OUTRO" })).rejects.toThrow(/inscrição/);
    const pag = await user("PAGAMENTO", s.brand.id);
    await expect(setCreatorOrigin(prisma, pag.actor, old.id, { kind: "OUTRO" })).rejects.toThrow(/permissão/);
    await expect(setCreatorOrigin(prisma, gestao.actor, old.id, { kind: "XYZ" })).rejects.toThrow(/inválida/);
    await setCreatorOrigin(prisma, gestao.actor, old.id, { kind: "HUNTER", hunterId: hunter.id, note: "  planilha antiga " });
    m = await originsFor(prisma, [old.id]);
    expect(m.get(old.id)).toMatchObject({ kind: "HUNTER", manual: true, note: "planilha antiga", hunter: { id: hunter.id } });

    const rows = await originSummary(prisma, gestao.actor, s.brand.id, new Map([[s.creator.id, 20_000]]));
    expect(rows).toEqual([expect.objectContaining({ key: `HUNTER:${hunter.id}`, applications: 2, approved: 1, active: 2, sellers: 1, salesCents: 20_000 })]);
    await expect(originSummary(prisma, pag.actor, s.brand.id, new Map())).rejects.toThrow(/permissão/);
    await setCreatorOrigin(prisma, gestao.actor, old.id, { kind: "" });
    expect((await originsFor(prisma, [old.id])).get(old.id)?.kind).toBe("UNKNOWN");
  });

  it("trava: origem válida e hunter só com HUNTER", async () => {
    const s = await seedBrand(prisma);
    const h = await user("HUNTER", s.brand.id);
    await expectDbError(prisma.creator.update({ where: { id: s.creator.id }, data: { originKind: "XYZ" } }), /Creator_origin/);
    await expectDbError(prisma.creator.update({ where: { id: s.creator.id }, data: { originKind: "SITE", originHunterId: h.id } }), /Creator_origin/);
    await expectDbError(prisma.creator.update({ where: { id: s.creator.id }, data: { originNote: "x" } }), /Creator_origin/);
  });
});
