import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { tiktokList } from "@/lib/tiktok/list";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function user(role: "TIKTOK" | "ENVIO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("lista do TikTok (D-TIKTOKLIST, banco real)", () => {
  it("candidatas novas e creators com TikTok; sem desligada, arquivada ou decidida; só quem tem o acesso", async () => {
    const s = await seedBrand(prisma);
    await prisma.creatorAccount.update({ where: { id: s.account.id }, data: { tiktok: "creator.tt", tiktokShop: true, phone: "(31) 99999-9999", niches: ["Fitness"], addrCity: "Belo Horizonte", addrState: "MG" } });
    await prisma.creator.update({ where: { id: s.creator.id }, data: { status: "ACTIVE", activatedAt: new Date("2026-10-01T12:00:00Z") } });
    const off = await prisma.creatorAccount.create({ data: { name: "Desligada", email: `${randomUUID()}@x.com`, tiktok: "off.tt" } });
    await prisma.creator.create({ data: { brandId: s.brand.id, accountId: off.id, categories: ["INFLUENCER"], status: "DEACTIVATED" } });
    const app = (name: string, tiktok: string | null, status: "NEW" | "REJECTED" = "NEW") =>
      prisma.creatorApplication.create({
        data: { brandId: s.brand.id, source: "site_form", externalKey: randomUUID(), submittedAt: new Date("2026-10-20T12:00:00Z"), consentAt: new Date("2026-10-20T12:00:00Z"), fullName: name, tiktok, followers: "10 mil", phone: "(11) 98888-7777", raw: {}, status, ...(status === "NEW" ? {} : { decidedAt: new Date(), decidedById: "x" }) },
      });
    await app("Candidata TT", "@cand.tt");
    await app("Sem TikTok", null);
    await app("Recusada", "@rec.tt", "REJECTED");

    const mafe = await user("TIKTOK", s.brand.id);
    const rows = await tiktokList(prisma, mafe, s.brand.id);
    expect(rows.map((r) => [r.name, r.kind, r.tiktok])).toEqual([
      ["Candidata TT", "CANDIDATA", "cand.tt"],
      [expect.stringContaining("Creator"), "ATIVA", "creator.tt"],
    ]);
    expect(rows[1]).toMatchObject({ tiktokShop: true, niche: "Fitness", place: "Belo Horizonte/MG", whatsapp: "https://wa.me/5531999999999" });
    expect(rows[0]).toMatchObject({ followers: "10 mil", whatsapp: "https://wa.me/5511988887777" });
    expect(await tiktokList(prisma, await user("ENVIO", s.brand.id), s.brand.id)).toEqual([]);
    const other = await seedBrand(prisma);
    expect(await tiktokList(prisma, mafe, other.brand.id)).toEqual([]);
  });
});
