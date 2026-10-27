import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { brandList, createBrand, slugFrom, updateBrand } from "@/lib/brands/manage";
import { grantRole } from "@/lib/team/invites";
import { expectDbError, letters, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "SUPER_ADMIN" | "GESTAO", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("marcas e papéis por marca (A1b, banco real)", () => {
  it("super admin cria e edita marca; endereço único; validações; Gestão não cria", async () => {
    const sa = await userWith("SUPER_ADMIN", null);
    expect(slugFrom("VermeFree Saúde")).toBe("vermefree-saude");
    const name = `Verme ${letters(5)}`;
    const b = await createBrand(prisma, sa, { name, primaryColor: "#0f766e", legalName: " Verme LTDA ", cnpj: "11.222.333/0001-81" });
    expect(b).toMatchObject({ slug: slugFrom(name), primaryColor: "#0F766E", legalName: "Verme LTDA", nfTakerDocument: "11222333000181", releaseMinCents: 30_000, releaseMinPrescriberCents: 30_000 });
    await expect(createBrand(prisma, sa, { name, primaryColor: "#000000", legalName: "", cnpj: "" })).rejects.toThrow(/Já existe/);
    await expect(createBrand(prisma, sa, { name: "X Y", primaryColor: "verde", legalName: "", cnpj: "" })).rejects.toThrow(/#RRGGBB/);
    await expect(createBrand(prisma, sa, { name: "X Z", primaryColor: "#000000", legalName: "", cnpj: "123" })).rejects.toThrow(/14 números/);
    await expect(createBrand(prisma, sa, { name: "X W", primaryColor: "#000000", legalName: "37.560.104/0001-60", cnpj: "" })).rejects.toThrow(/Razão social/);
    await updateBrand(prisma, sa, b.id, { name: `${name} Nova`, primaryColor: "#111111", legalName: "", cnpj: "", storeUrl: "verme.com.br/" });
    expect(await prisma.brand.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ name: `${name} Nova`, slug: b.slug, nfTakerDocument: null, storeUrl: "https://verme.com.br" });
    const card = (await brandList(prisma, sa)).find((x) => x.id === b.id)!;
    expect(card).toMatchObject({ store: null, activeCreators: 0, _count: { termsVersions: 0, contractDocuments: 0 } });
    const { brand } = await seedBrand(prisma);
    await expect(createBrand(prisma, await userWith("GESTAO", brand.id), { name: "Outra", primaryColor: "#000000", legalName: "", cnpj: "" })).rejects.toThrow(/super admin/);
    expect(await prisma.auditLog.count({ where: { entityId: b.id, action: { in: ["brand.create", "brand.update"] } } })).toBe(2);
  });

  it("M1.3 (D-NFDATA): dados para a creator emitir a nota; vazio volta ao padrão; campo fora do formulário fica", async () => {
    const sa = await userWith("SUPER_ADMIN", null);
    const b = await createBrand(prisma, sa, { name: `Nota ${letters(5)}`, primaryColor: "#000000", legalName: "Nota LTDA", cnpj: "" });
    const base = { name: b.name, primaryColor: "#000000", legalName: "Nota LTDA", cnpj: "" };
    await expect(updateBrand(prisma, sa, b.id, { ...base, nfServiceCode: "1706" })).rejects.toThrow(/17\.06/);
    await updateBrand(prisma, sa, b.id, { ...base, nfServiceCode: " 10.08 ", nfServiceDescription: "  Agenciamento   de publicidade ", nfInstructions: " Não destacar ISS. " });
    expect(await prisma.brand.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ nfServiceCode: "10.08", nfServiceDescription: "Agenciamento de publicidade", nfInstructions: "Não destacar ISS." });
    await updateBrand(prisma, sa, b.id, base);
    expect(await prisma.brand.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ nfServiceCode: "10.08", nfInstructions: "Não destacar ISS." });
    await updateBrand(prisma, sa, b.id, { ...base, nfServiceCode: "", nfServiceDescription: "", nfInstructions: "" });
    expect(await prisma.brand.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ nfServiceCode: null, nfServiceDescription: null, nfInstructions: null });
    await expectDbError(prisma.brand.update({ where: { id: b.id }, data: { nfServiceCode: "17-06" } }), /Brand_nf_service_code_format/);
    await expectDbError(prisma.brand.update({ where: { id: b.id }, data: { nfServiceDescription: "  " } }), /Brand_nf_service_description_filled/);
  });

  it("dar papel em outra marca a quem já está na equipe; sem repetir; super admin não tem marca", async () => {
    const sa = await userWith("SUPER_ADMIN", null);
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    const ana = await userWith("GESTAO", a.brand.id);
    await grantRole(prisma, sa, { userId: ana.userId, role: "GESTAO", brandId: b.brand.id });
    expect((await loadActor(prisma, ana.userId))!.grants).toEqual(expect.arrayContaining([{ role: "GESTAO", brandId: a.brand.id }, { role: "GESTAO", brandId: b.brand.id }]));
    await expect(grantRole(prisma, sa, { userId: ana.userId, role: "GESTAO", brandId: b.brand.id })).rejects.toThrow(/já tem esse papel/);
    await expect(grantRole(prisma, sa, { userId: ana.userId, role: "SUPER_ADMIN", brandId: b.brand.id })).rejects.toThrow(/todas as marcas/);
    await expect(grantRole(prisma, sa, { userId: ana.userId, role: "ENVIO", brandId: "" })).rejects.toThrow(/Escolha a marca/);
    await expect(grantRole(prisma, ana, { userId: ana.userId, role: "ENVIO", brandId: b.brand.id })).rejects.toThrow(/permissão/);
    await prisma.user.update({ where: { id: ana.userId }, data: { disabledAt: new Date() } });
    await expect(grantRole(prisma, sa, { userId: ana.userId, role: "ENVIO", brandId: b.brand.id })).rejects.toThrow(/não encontrada/);
  });
});
