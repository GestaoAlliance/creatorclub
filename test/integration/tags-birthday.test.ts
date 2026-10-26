import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { actionQueue } from "@/lib/actions/queue";
import { listCreators, updateContact } from "@/lib/creators/profile";
import { addCreatorTag, brandTags, removeCreatorTag } from "@/lib/creators/tags";
import { approveApplication, createStaffApplication } from "@/lib/onboarding/applications";
import type { PortalContext } from "@/lib/portal/context";
import { setMyBirthDate } from "@/lib/portal/social";
import type { ShopifyClient } from "@/lib/shopify/client";
import { expectDbError, letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const client = { shop: "x", graphql: async () => ({ discountCodeBasicCreate: { codeDiscountNode: { id: "gid://shopify/DiscountCodeNode/9" }, userErrors: [] } }) } as unknown as ShopifyClient;

async function userWith(role: "GESTAO" | "PAGAMENTO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("tags e aniversário (M4.2, D-TAGS, banco real)", () => {
  it("tags: Gestão marca (mesmo nome sem acento = mesma tag), tira, auditoria; Pagamento não; marca isolada", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const other = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id);
    const t1 = await addCreatorTag(prisma, gestao, creator.id, " Mãe ");
    const t2 = await addCreatorTag(prisma, gestao, creator.id, "MAE");
    expect(t2.id).toBe(t1.id);
    await addCreatorTag(prisma, gestao, creator.id, "fitness");
    await expect(addCreatorTag(prisma, gestao, creator.id, "  ")).rejects.toThrow(/nome da tag/);
    await expect(addCreatorTag(prisma, await userWith("PAGAMENTO", brand.id), creator.id, "x")).rejects.toThrow(/permissão/);
    await expect(addCreatorTag(prisma, gestao, other.creator.id, "x")).rejects.toThrow(/permissão/);

    expect(await brandTags(prisma, brand.id)).toEqual([{ id: expect.any(String), name: "fitness", count: 1 }, { id: t1.id, name: "Mãe", count: 1 }]);
    const row = (await listCreators(prisma, gestao, brand.id)).find((c) => c.id === creator.id)!;
    expect(row.tags.map((t) => t.name)).toEqual(["fitness", "Mãe"]);

    await removeCreatorTag(prisma, gestao, creator.id, t1.id);
    await removeCreatorTag(prisma, gestao, creator.id, t1.id); // de novo: nada muda
    expect(await brandTags(prisma, brand.id)).toContainEqual({ id: t1.id, name: "Mãe", count: 0 });
    expect(await prisma.auditLog.count({ where: { entityId: creator.id, action: { in: ["creator.tag.add", "creator.tag.remove"] } } })).toBe(3);

    // Travas: tag de uma marca não entra em creator de outra; nome vazio.
    await expectDbError(prisma.creatorTagLink.create({ data: { creatorId: other.creator.id, tagId: t1.id, brandId: brand.id, createdById: "x" } }), /CreatorTagLink_creatorId_brandId_fkey/);
    await expectDbError(prisma.creatorTag.create({ data: { brandId: brand.id, name: " ", key: "k", createdById: "x" } }), /CreatorTag_name/);
  });

  it("aniversário: ficha (vazio apaga), portal só uma vez e nunca na visualização da equipe, trava do banco", async () => {
    const { brand, creator, account } = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", brand.id);
    const ctx = { creatorId: creator.id, viewAs: null } as unknown as PortalContext;
    await expect(setMyBirthDate(prisma, { ...ctx, viewAs: { userId: "x" } } as PortalContext, "u", "1995-03-15")).rejects.toThrow(/Visualização/);
    await expect(setMyBirthDate(prisma, ctx, "u", "31/02/1995")).rejects.toThrow(/inválida/);
    await setMyBirthDate(prisma, ctx, "u", "1995-03-15");
    await expect(setMyBirthDate(prisma, ctx, "u", "1996-03-15")).rejects.toThrow(/já foi informada/);
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: account.id } })).birthDate?.toISOString().slice(0, 10)).toBe("1995-03-15");

    const base = { name: account.name, email: account.email, phone: "" };
    await updateContact(prisma, gestao, creator.id, { ...base, birthDate: "1995-03-16" });
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: account.id } })).birthDate?.toISOString().slice(0, 10)).toBe("1995-03-16");
    await updateContact(prisma, gestao, creator.id, base); // sem o campo: não muda
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: account.id } })).birthDate).not.toBeNull();
    await expect(updateContact(prisma, gestao, creator.id, { ...base, birthDate: "2999-01-01" })).rejects.toThrow(/inválida/);
    await updateContact(prisma, gestao, creator.id, { ...base, birthDate: "" });
    expect((await prisma.creatorAccount.findUniqueOrThrow({ where: { id: account.id } })).birthDate).toBeNull();

    await expectDbError(prisma.creatorAccount.update({ where: { id: account.id }, data: { birthDate: new Date("1800-01-01") } }), /CreatorAccount_birthDate/);
  });

  it("fila de ações: aniversariante de 3 dias antes até o dia; nova candidata leva o nascimento para a conta", async () => {
    const { brand, creator, account } = await seedBrand(prisma);
    const now = new Date("2026-10-23T15:00:00Z"); // 12h em São Paulo
    const birthday = async (day: string) => {
      await prisma.creatorAccount.update({ where: { id: account.id }, data: { birthDate: new Date(`${day}T00:00:00Z`) } });
      return (await actionQueue(prisma, brand.id, now)).filter((t) => t.kind === "BIRTHDAY" && t.creatorId === creator.id);
    };
    expect(await birthday("1995-10-23")).toMatchObject([{ key: `BIRTHDAY:${creator.id}:2026-10-23`, owner: "GESTAO", detail: "faz aniversário hoje" }]);
    expect((await birthday("1995-10-26"))[0]?.detail).toBe("faz aniversário em 3 dias (26/10)");
    expect(await birthday("1995-10-27")).toEqual([]);
    expect(await birthday("1995-10-22")).toEqual([]);

    const gestao = await userWith("GESTAO", brand.id);
    const { id } = await createStaffApplication(prisma, gestao, brand.id, {
      fullName: "Bia", phone: "11912345678", email: "", instagram: "", tiktok: "", followers: "", category: "INFLUENCER", suggestedCoupon: "", note: "", birthDate: "2000-02-29",
    });
    const r = await approveApplication(prisma, gestao, { applicationId: id, contractSigned: true, couponCode: letters(6), category: "INFLUENCER", rateBps: 1500, discountBps: 500, email: `${randomUUID()}@x.com` }, async () => client);
    const acc = await prisma.creator.findUniqueOrThrow({ where: { id: r.creatorId }, select: { account: { select: { birthDate: true } } } });
    expect(acc.account.birthDate?.toISOString().slice(0, 10)).toBe("2000-02-29");
  });
});
