import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { listApplications, receiveApplication } from "@/lib/onboarding/applications";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function gestao(brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: "G", roleGrants: { create: { role: "GESTAO", brandId } } } });
  return (await loadActor(prisma, id))!;
}

const answer = (slug: string, name: string, email: string, extra: Record<string, string> = {}, at = new Date()) =>
  receiveApplication(prisma, {
    brandSlug: slug, source: "site_form", externalKey: randomUUID(), submittedAt: at, consentAt: at,
    answers: { "Seu nome completo:": name, "EMAIL:": email, ...extra },
  });

describe("organização das candidatas (F2, banco real)", () => {
  it("filtra, ordena por seguidores e marca repetidas (outra candidata ou creator já cadastrada)", async () => {
    const a = await seedBrand(prisma);
    const g = await gestao(a.brand.id);
    await prisma.creatorAccount.update({ where: { id: a.account.id }, data: { instagram: "ja.creator" } });
    await answer(a.brand.slug, "Ana Um", "ana@x.com", { "Quantidade de seguidores no instagram": "2 mil", "Sou:": "UGC" }, new Date("2026-10-01T12:00:00Z"));
    await answer(a.brand.slug, "Bia Dois", "bia@x.com", { "Quantidade de seguidores no instagram": "15.000", "@ do seu Instagram:": "@Ja.Creator" }, new Date("2026-10-02T12:00:00Z"));
    await answer(a.brand.slug, "Ana Repetida", "ANA@x.com", { "Quantidade de seguidores no instagram": "300" }, new Date("2026-10-03T12:00:00Z"));
    // Outra marca: não entra na comparação.
    const other = await seedBrand(prisma);
    await answer(other.brand.slug, "Ana Outra Marca", "ana@x.com");

    const all = await listApplications(prisma, g, "NEW");
    expect(all.total).toBe(3);
    expect(all.rows.map((r) => r.fullName)).toEqual(["Ana Um", "Bia Dois", "Ana Repetida"]);
    const byName = Object.fromEntries(all.rows.map((r) => [r.fullName, r]));
    expect(byName["Ana Um"]!.duplicates).toEqual([expect.objectContaining({ name: "Ana Repetida", kind: "candidata", by: ["e-mail"] })]);
    expect(byName["Bia Dois"]!.duplicates).toEqual([expect.objectContaining({ id: a.creator.id, kind: "creator", by: ["@"] })]);
    expect(byName["Bia Dois"]!.followersCount).toBe(15_000);

    expect((await listApplications(prisma, g, "NEW", { sort: "seguidores" })).rows.map((r) => r.fullName)).toEqual(["Bia Dois", "Ana Um", "Ana Repetida"]);
    expect((await listApplications(prisma, g, "NEW", { q: "repetida" })).rows.map((r) => r.fullName)).toEqual(["Ana Repetida"]);
    expect((await listApplications(prisma, g, "NEW", { kind: "UGC" })).rows.map((r) => r.fullName)).toEqual(["Ana Um"]);
    const f = await listApplications(prisma, g, "NEW", { source: "captacao_form" });
    expect(f.rows).toHaveLength(0);
    expect(f.total).toBe(3);
  });
});
