import type { PrismaClient } from "@/generated/prisma/client";
import { decryptSecret, encryptSecret, parseKey } from "@/lib/crypto/secret-box";
import { assertShopDomain, SHOPIFY_API_VERSION } from "./client";

/** Credenciais do app do Creator Club numa loja (D-SHOPAPP). Gravadas cifradas em `BrandIntegration`. */
export type ShopifyCredentials = { accessToken: string; webhookSecret: string };

export type ShopifyConnection = ShopifyCredentials & { brandId: string; shop: string; apiVersion: string; scopes: string | null };

const context = (brandId: string) => `${brandId}:SHOPIFY`;
const key = () => parseKey(process.env.INTEGRATION_ENC_KEY);

export async function saveShopifyCredentials(
  prisma: PrismaClient,
  input: { brandId: string; shop: string; scopes?: string; apiVersion?: string } & ShopifyCredentials,
  encKey: Buffer = key(),
): Promise<void> {
  if (!input.accessToken || !input.webhookSecret) throw new Error("Token e segredo do webhook são obrigatórios.");
  const shop = assertShopDomain(input.shop);
  const secretEncrypted = encryptSecret(
    JSON.stringify({ accessToken: input.accessToken, webhookSecret: input.webhookSecret }),
    encKey,
    context(input.brandId),
  );
  const data = {
    status: "CONNECTED" as const,
    externalId: shop,
    secretEncrypted,
    scopes: input.scopes ?? null,
    apiVersion: input.apiVersion ?? SHOPIFY_API_VERSION,
  };
  await prisma.brandIntegration.upsert({
    where: { brandId_kind: { brandId: input.brandId, kind: "SHOPIFY" } },
    create: { brandId: input.brandId, kind: "SHOPIFY", ...data },
    update: data,
  });
}

/** Loja ligada à marca, com segredos abertos. `null` se a marca não tem Shopify conectado. */
export async function loadShopifyConnection(
  prisma: PrismaClient,
  brandId: string,
  encKey: Buffer = key(),
): Promise<ShopifyConnection | null> {
  const row = await prisma.brandIntegration.findUnique({ where: { brandId_kind: { brandId, kind: "SHOPIFY" } } });
  if (!row || row.status !== "CONNECTED" || !row.externalId || !row.secretEncrypted) return null;
  const secrets = JSON.parse(decryptSecret(row.secretEncrypted, encKey, context(brandId))) as ShopifyCredentials;
  return {
    brandId,
    shop: row.externalId,
    apiVersion: row.apiVersion ?? SHOPIFY_API_VERSION,
    scopes: row.scopes,
    ...secrets,
  };
}

