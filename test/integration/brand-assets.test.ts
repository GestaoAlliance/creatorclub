import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { brandAssetBySlug, loginBrand, removeBrandAsset, setBrandAsset } from "@/lib/brands/assets";
import { updateBrand } from "@/lib/brands/manage";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

async function user(role: "SUPER_ADMIN" | "GESTAO", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("marca: padrões e tela de entrar (M4.4a, D-BRANDLOGIN, banco real)", () => {
  it("logo e fundo: só super admin; troca substitui; tirar; trava do banco", async () => {
    const { brand } = await seedBrand(prisma);
    const admin = await user("SUPER_ADMIN", null);
    await expect(setBrandAsset(prisma, await user("GESTAO", brand.id), brand.id, "LOGO", PNG)).rejects.toThrow(/super admin/);
    await expect(setBrandAsset(prisma, admin, brand.id, "LOGO", new TextEncoder().encode("<svg/>"))).rejects.toThrow(/PNG, JPG ou WebP/);
    await setBrandAsset(prisma, admin, brand.id, "LOGO", PNG);
    await setBrandAsset(prisma, admin, brand.id, "LOGO", new Uint8Array([...PNG, 9]));
    expect(await prisma.brandAsset.count({ where: { brandId: brand.id } })).toBe(1);
    const a = await brandAssetBySlug(prisma, brand.slug, "LOGO");
    expect(a?.mime).toBe("image/png");
    expect(a?.bytes.length).toBe(PNG.length + 1);
    const lb = await loginBrand(prisma, brand.slug);
    expect(lb).toMatchObject({ slug: brand.slug, logo: a!.sha256.slice(0, 12), background: null });
    await removeBrandAsset(prisma, admin, brand.id, "LOGO");
    expect(await brandAssetBySlug(prisma, brand.slug, "LOGO")).toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: brand.id, action: { startsWith: "brand.asset" } } })).toBe(3);
    await expectDbError(
      prisma.brandAsset.create({ data: { brandId: brand.id, kind: "LOGO", mime: "image/svg+xml", bytes: Buffer.from(PNG), sizeBytes: PNG.length, sha256: "x", uploadedById: "x" } }),
      /BrandAsset_valid/,
    );
  });

  it("comissão e desconto padrão editáveis (em %), com limites; o resto da marca não muda", async () => {
    const { brand } = await seedBrand(prisma);
    const admin = await user("SUPER_ADMIN", null);
    const base = { name: brand.name, primaryColor: "#18181B", legalName: "", cnpj: "" };
    await updateBrand(prisma, admin, brand.id, { ...base, defaultRate: "12,5", defaultDiscount: "10" });
    expect(await prisma.brand.findUniqueOrThrow({ where: { id: brand.id }, select: { defaultCommissionBps: true, defaultDiscountBps: true } })).toEqual({ defaultCommissionBps: 1250, defaultDiscountBps: 1000 });
    await expect(updateBrand(prisma, admin, brand.id, { ...base, defaultRate: "abc" })).rejects.toThrow(/porcentagem/);
    await expect(updateBrand(prisma, admin, brand.id, { ...base, defaultRate: "0" })).rejects.toThrow(/entre/);
    await updateBrand(prisma, admin, brand.id, base); // sem os campos: não muda
    expect((await prisma.brand.findUniqueOrThrow({ where: { id: brand.id } })).defaultCommissionBps).toBe(1250);
  });
});
