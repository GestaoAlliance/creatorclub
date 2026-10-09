import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadShopifyConnection, saveShopifyCredentials } from "@/lib/shopify/credentials";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());
const key = randomBytes(32);

describe("credenciais do Shopify no banco", () => {
  it("grava cifrado e lê de volta só com a chave certa", async () => {
    const { brand } = await seedBrand(prisma);
    await saveShopifyCredentials(
      prisma,
      { brandId: brand.id, shop: "Loja-Dev.myshopify.com", clientId: "cid_abc", clientSecret: "csec_xyz", scopes: "read_orders" },
      key,
    );
    const row = await prisma.brandIntegration.findUniqueOrThrow({ where: { brandId_kind: { brandId: brand.id, kind: "SHOPIFY" } } });
    expect(row).toMatchObject({ status: "CONNECTED", externalId: "loja-dev.myshopify.com", apiVersion: "2026-10" });
    expect(row.secretEncrypted).not.toContain("cid_abc");
    expect(row.secretEncrypted).not.toContain("csec_xyz");

    expect(await loadShopifyConnection(prisma, brand.id, key)).toEqual({
      brandId: brand.id,
      shop: "loja-dev.myshopify.com",
      apiVersion: "2026-10",
      scopes: "read_orders",
      clientId: "cid_abc",
      clientSecret: "csec_xyz",
    });
    await expect(loadShopifyConnection(prisma, brand.id, randomBytes(32))).rejects.toThrow(/Não foi possível/);
  });

  it("o segredo de uma marca não abre como se fosse de outra", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    await saveShopifyCredentials(prisma, { brandId: a.brand.id, shop: "a.myshopify.com", clientId: "t", clientSecret: "w" }, key);
    const row = await prisma.brandIntegration.findUniqueOrThrow({ where: { brandId_kind: { brandId: a.brand.id, kind: "SHOPIFY" } } });
    await prisma.brandIntegration.create({
      data: { brandId: b.brand.id, kind: "SHOPIFY", status: "CONNECTED", externalId: "b.myshopify.com", secretEncrypted: row.secretEncrypted },
    });
    await expect(loadShopifyConnection(prisma, b.brand.id, key)).rejects.toThrow(/Não foi possível/);
  });

  it("marca sem Shopify conectado devolve null; domínio inválido não grava", async () => {
    const { brand } = await seedBrand(prisma);
    expect(await loadShopifyConnection(prisma, brand.id, key)).toBeNull();
    await expect(
      saveShopifyCredentials(prisma, { brandId: brand.id, shop: "evil.com", clientId: "t", clientSecret: "w" }, key),
    ).rejects.toThrow(/inválido/);
    expect(await prisma.brandIntegration.count({ where: { brandId: brand.id } })).toBe(0);
  });
});
