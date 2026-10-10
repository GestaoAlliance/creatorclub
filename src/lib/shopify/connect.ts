import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { createShopifyClient, type ShopifyClient } from "./client";
import { loadStoredShopifyCredentials, saveShopifyCredentials } from "./credentials";
import { requestAccessToken } from "./token";
import { ORDER_TOPICS } from "./webhook";

/**
 * Conectar a loja de uma marca (só super admin): confere o Client ID/Client secret pedindo uma chave ao Shopify,
 * confere a loja (domínio, imposto, moeda) e as permissões do app, grava as credenciais cifradas e cadastra os
 * webhooks de pedido apontando para `/api/webhooks/shopify/<marca>`.
 */

/**
 * Permissões que o sync precisa (D-SHOPAPP). `read_all_orders` é para pedidos com mais de 60 dias (carga histórica).
 * Cupons (`read_discounts`/`write_discounts`) só entram na E4: até lá o app é só leitura (D-REALSTORE).
 */
export const REQUIRED_SCOPES = ["read_orders"];
export const RECOMMENDED_SCOPES = ["read_all_orders", "read_discounts", "write_discounts"];

/** Para que serve cada permissão recomendada (aparece na tela de sync quando falta). */
export const SCOPE_PURPOSE: Record<string, string> = {
  read_all_orders: "ler pedidos com mais de 60 dias (carga histórica)",
  read_discounts: "ler cupons da loja",
  write_discounts: "criar cupom na Shopify pela ficha (D-COUPONCREATE)",
};

export function missingRecommendedScopes(scopes: string | null | undefined): string[] {
  const have = (scopes ?? "").split(",").map((s) => s.trim());
  // O Shopify não lista read_x quando o app tem write_x: escrever já inclui ler.
  return RECOMMENDED_SCOPES.filter((s) => !have.includes(s) && !(s.startsWith("read_") && have.includes(`write_${s.slice(5)}`)));
}

const TOPIC_ENUM: Record<string, string> = {
  "orders/create": "ORDERS_CREATE",
  "orders/updated": "ORDERS_UPDATED",
  "orders/paid": "ORDERS_PAID",
  "orders/cancelled": "ORDERS_CANCELLED",
  "refunds/create": "REFUNDS_CREATE",
};

const SHOP_QUERY = `query Shop { shop { myshopifyDomain taxesIncluded currencyCode } }`;
const SUBS_QUERY = `query Subs { webhookSubscriptions(first: 50) { nodes { id topic uri } } }`;
const SUB_MUTATION = `mutation Sub($topic: WebhookSubscriptionTopic!, $uri: String!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri, format: JSON }) {
    webhookSubscription { id } userErrors { field message } } }`;

export class ConnectError extends Error {}

export type ConnectResult = { shop: string; scopes: string[]; missingRecommended: string[]; webhooksCreated: number; warnings: string[] };

export async function connectShopifyStore(
  prisma: PrismaClient,
  actor: Actor | null,
  /** Client ID/secret em branco = reaproveitar os já guardados para a marca. */
  input: { brandId: string; shop: string; clientId?: string; clientSecret?: string; appUrl: string },
  deps: { fetch?: typeof fetch; client?: (shop: string, token: string) => ShopifyClient; encKey?: Buffer } = {},
): Promise<ConnectResult> {
  if (!actor || !can(actor.grants, "integrations.manage", input.brandId)) throw new ConnectError("Sem permissão.");
  const brand = await prisma.brand.findUnique({ where: { id: input.brandId }, select: { id: true, slug: true } });
  if (!brand) throw new ConnectError("Marca não encontrada.");
  let clientId = (input.clientId ?? "").trim();
  let clientSecret = (input.clientSecret ?? "").trim();
  if (!clientId && !clientSecret) {
    const stored = await loadStoredShopifyCredentials(prisma, brand.id, ...(deps.encKey ? [deps.encKey] : []));
    if (!stored) throw new ConnectError("Informe o Client ID e o Client secret.");
    ({ clientId, clientSecret } = stored);
  }
  if (!clientId || !clientSecret) throw new ConnectError("Informe o Client ID e o Client secret.");

  let token;
  try {
    token = await requestAccessToken({ shop: input.shop, clientId, clientSecret }, deps.fetch ? { fetch: deps.fetch } : {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível falar com o Shopify.";
    throw new ConnectError(/app_not_installed/.test(message) ? "O app ainda não está instalado nesta loja." : message);
  }
  const missing = REQUIRED_SCOPES.filter((s) => !token.scopes.includes(s));
  if (missing.length) throw new ConnectError(`O app não tem a permissão: ${missing.join(", ")}.`);

  const client = deps.client ? deps.client(input.shop, token.accessToken) : createShopifyClient({ shop: input.shop, accessToken: token.accessToken, ...(deps.fetch ? { fetch: deps.fetch } : {}) });
  const { shop } = await client.graphql<{ shop: { myshopifyDomain: string; taxesIncluded: boolean; currencyCode: string } }>(SHOP_QUERY);
  const warnings: string[] = [];
  if (shop.taxesIncluded) warnings.push("A loja usa preço com imposto incluso (D-TAX): a comissão desses pedidos fica bloqueada.");
  if (shop.currencyCode !== "BRL") warnings.push(`A loja está em ${shop.currencyCode}, não em BRL.`);

  await saveShopifyCredentials(
    prisma,
    { brandId: brand.id, shop: shop.myshopifyDomain, clientId, clientSecret, scopes: token.scopes.join(",") },
    ...(deps.encKey ? [deps.encKey] : []),
  );

  const uri = `${input.appUrl.replace(/\/$/, "")}/api/webhooks/shopify/${brand.slug}`;
  const existing = await client.graphql<{ webhookSubscriptions: { nodes: Array<{ topic: string; uri: string }> } }>(SUBS_QUERY);
  let webhooksCreated = 0;
  for (const topic of ORDER_TOPICS) {
    const enumTopic = TOPIC_ENUM[topic]!;
    if (existing.webhookSubscriptions.nodes.some((n) => n.topic === enumTopic && n.uri === uri)) continue;
    const res = await client.graphql<{ webhookSubscriptionCreate: { userErrors: Array<{ message: string }> } }>(SUB_MUTATION, { topic: enumTopic, uri });
    const errors = res.webhookSubscriptionCreate.userErrors;
    if (errors.length) throw new ConnectError(`Shopify recusou o webhook ${topic}: ${errors.map((e) => e.message).join("; ")}`);
    webhooksCreated++;
  }

  await prisma.auditLog.create({
    data: {
      brandId: brand.id,
      actorType: "USER",
      actorId: actor.userId,
      action: "integration.connect",
      entity: "BrandIntegration",
      entityId: brand.id,
      after: { shop: shop.myshopifyDomain, scopes: token.scopes, webhooksCreated },
    },
  });
  return {
    shop: shop.myshopifyDomain,
    scopes: token.scopes,
    missingRecommended: missingRecommendedScopes(token.scopes.join(",")),
    webhooksCreated,
    warnings,
  };
}
