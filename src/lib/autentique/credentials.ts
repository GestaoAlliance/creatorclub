import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { decryptSecret, encryptSecret, parseKey } from "@/lib/crypto/secret-box";
import { autentiqueMe, type Fetcher } from "./client";

/**
 * Conta do Autentique de cada marca (D-AUTENTIQUE): chave da API (gerada no painel do Autentique) cifrada em
 * `BrandIntegration` (AUTENTIQUE), como a Shopify. `sandbox` = documentos de teste (não valem como contrato).
 */
export type AutentiqueConnection = { brandId: string; token: string; sandbox: boolean; account: string | null };

const context = (brandId: string) => `${brandId}:AUTENTIQUE`;
const key = () => parseKey(process.env.INTEGRATION_ENC_KEY);

export class AutentiqueConnectError extends Error {}

/** Confere a chave no Autentique e guarda cifrada. Só quem gerencia integrações da marca. */
export async function connectAutentique(
  prisma: PrismaClient,
  actor: Actor | null,
  input: { brandId: string; token: string; sandbox: boolean },
  fetcher?: Fetcher,
  encKey: Buffer = key(),
): Promise<{ account: string }> {
  if (!actor || !can(actor.grants, "integrations.manage", input.brandId)) throw new AutentiqueConnectError("Sem permissão.");
  const token = input.token.trim();
  if (!/^[A-Za-z0-9._-]{20,200}$/.test(token)) throw new AutentiqueConnectError("Cole a chave da API do Autentique (Configurações → API).");
  let me;
  try {
    me = await autentiqueMe(token, fetcher);
  } catch (error) {
    throw new AutentiqueConnectError(error instanceof Error ? error.message : "Não foi possível falar com o Autentique.");
  }
  const account = me.email ?? me.name ?? me.id;
  const data = {
    status: "CONNECTED" as const,
    externalId: account,
    secretEncrypted: encryptSecret(JSON.stringify({ token, sandbox: input.sandbox }), encKey, context(input.brandId)),
    scopes: input.sandbox ? "sandbox" : null,
  };
  await prisma.$transaction([
    prisma.brandIntegration.upsert({
      where: { brandId_kind: { brandId: input.brandId, kind: "AUTENTIQUE" } },
      create: { brandId: input.brandId, kind: "AUTENTIQUE", ...data },
      update: data,
    }),
    prisma.auditLog.create({
      data: { brandId: input.brandId, actorType: "USER", actorId: actor.userId, action: "autentique.connect", entity: "BrandIntegration", entityId: input.brandId, after: { account, sandbox: input.sandbox } },
    }),
  ]);
  return { account };
}

/** Conta do Autentique da marca, com a chave aberta; `null` se a marca não tem Autentique ligado. */
/**
 * D-AUTENTIQUEENV (2026-10-29): chave da marca também pela variável segura `AUTENTIQUE_TOKENS` da Vercel (JSON
 * `{ "<slug da marca>": "<chave>" }`, só produção), quando não há conexão salva em Integrações. A salva em Integrações
 * vale primeiro. Nunca no código nem no repositório.
 */
export function envAutentiqueToken(slug: string, env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.AUTENTIQUE_TOKENS?.trim();
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, unknown>;
    const t = map[slug];
    return typeof t === "string" && /^[A-Za-z0-9._-]{20,200}$/.test(t.trim()) ? t.trim() : null;
  } catch {
    return null;
  }
}

async function envConnection(prisma: PrismaClient, brandId: string): Promise<AutentiqueConnection | null> {
  if (!process.env.AUTENTIQUE_TOKENS) return null;
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { slug: true } });
  const token = brand ? envAutentiqueToken(brand.slug) : null;
  return token ? { brandId, token, sandbox: false, account: "variável segura da Vercel" } : null;
}

export async function loadAutentique(prisma: PrismaClient, brandId: string, encKey?: Buffer): Promise<AutentiqueConnection | null> {
  const row = await prisma.brandIntegration.findUnique({ where: { brandId_kind: { brandId, kind: "AUTENTIQUE" } } });
  if (!row || row.status !== "CONNECTED" || !row.secretEncrypted) return envConnection(prisma, brandId);
  const s = JSON.parse(decryptSecret(row.secretEncrypted, encKey ?? key(), context(brandId))) as { token: string; sandbox?: boolean };
  return { brandId, token: s.token, sandbox: s.sandbox === true, account: row.externalId };
}

/** A marca assina contratos pelo Autentique? (sem abrir a chave) */
export async function hasAutentique(prisma: PrismaClient, brandId: string): Promise<boolean> {
  const row = await prisma.brandIntegration.findUnique({ where: { brandId_kind: { brandId, kind: "AUTENTIQUE" } }, select: { status: true, secretEncrypted: true } });
  if (row?.status === "CONNECTED" && !!row.secretEncrypted) return true;
  return (await envConnection(prisma, brandId)) !== null;
}
