import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { loadActor, type Actor } from "@/lib/auth/actor";

/**
 * Login OAuth 2.1 do conector do Creator Club no Claude (M3.4b, D-MCP). O Claude se cadastra sozinho (RFC 7591),
 * manda a pessoa para `/oauth/authorize` (ela entra com o login do Creator Club e permite), troca o código por uma
 * chave (PKCE S256 obrigatório) e renova sem pedir login de novo. Chaves e códigos aleatórios; no banco só o hash.
 * Só pessoas da equipe (com papel). Acesso de 1 h; renovação de 30 dias, trocada a cada uso.
 */

export class OAuthError extends Error {
  constructor(
    public code: "invalid_request" | "invalid_client" | "invalid_grant" | "unauthorized_client" | "unsupported_grant_type" | "access_denied" | "invalid_redirect_uri",
    message: string,
  ) {
    super(message);
  }
}

export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_S = 30 * 24 * 60 * 60;
const CODE_TTL_MS = 10 * 60 * 1000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const random = () => randomBytes(32).toString("base64url");

/** Para onde o código pode voltar: o Claude (claude.ai / claude.com) ou um app local (Claude Code, Desktop). */
export function allowedRedirect(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:" && ["claude.ai", "claude.com", "www.claude.ai", "www.claude.com"].includes(u.hostname)) return true;
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}

/** Cadastro dinâmico do aplicativo (RFC 7591). */
export async function registerClient(prisma: PrismaClient, body: unknown) {
  const b = (body ?? {}) as { redirect_uris?: unknown; client_name?: unknown };
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (uris.length === 0 || uris.length > 10) throw new OAuthError("invalid_redirect_uri", "Informe redirect_uris.");
  if (!uris.every(allowedRedirect)) throw new OAuthError("invalid_redirect_uri", "Endereço de retorno não permitido.");
  const name = typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim().slice(0, 80) : "Claude";
  const c = await prisma.mcpClient.create({ data: { name, redirectUris: uris } });
  return {
    client_id: c.id,
    client_name: c.name,
    redirect_uris: c.redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(c.createdAt.getTime() / 1000),
  };
}

export type AuthorizeRequest = { clientId: string; clientName: string; redirectUri: string; codeChallenge: string; state: string | null };

/** Confere o pedido de autorização antes de mostrar a tela de permitir. */
export async function checkAuthorize(prisma: PrismaClient, q: Record<string, string | undefined>): Promise<AuthorizeRequest> {
  if (q.response_type !== "code") throw new OAuthError("invalid_request", "response_type precisa ser code.");
  const client = q.client_id ? await prisma.mcpClient.findUnique({ where: { id: q.client_id } }).catch(() => null) : null;
  if (!client) throw new OAuthError("invalid_client", "Aplicativo desconhecido.");
  if (!q.redirect_uri || !client.redirectUris.includes(q.redirect_uri)) throw new OAuthError("invalid_redirect_uri", "Endereço de retorno não confere.");
  if (q.code_challenge_method !== "S256" || !q.code_challenge || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge))
    throw new OAuthError("invalid_request", "PKCE S256 obrigatório.");
  return { clientId: client.id, clientName: client.name, redirectUri: q.redirect_uri, codeChallenge: q.code_challenge, state: q.state ?? null };
}

/** A pessoa permitiu: código de uso único para o aplicativo trocar pela chave. */
export async function issueCode(prisma: PrismaClient, actor: Actor | null, req: AuthorizeRequest, now = new Date()): Promise<string> {
  if (!actor || actor.grants.length === 0) throw new OAuthError("access_denied", "Só a equipe do Creator Club conecta o Claude.");
  const code = random();
  await prisma.mcpAuthCode.create({
    data: { codeHash: sha256(code), clientId: req.clientId, userId: actor.userId, redirectUri: req.redirectUri, codeChallenge: req.codeChallenge, expiresAt: new Date(now.getTime() + CODE_TTL_MS) },
  });
  return code;
}

async function issueTokens(prisma: PrismaClient, clientId: string, userId: string, now: Date) {
  const access = random();
  const refresh = random();
  await prisma.mcpToken.createMany({
    data: [
      { tokenHash: sha256(access), kind: "ACCESS", clientId, userId, expiresAt: new Date(now.getTime() + ACCESS_TTL_S * 1000) },
      { tokenHash: sha256(refresh), kind: "REFRESH", clientId, userId, expiresAt: new Date(now.getTime() + REFRESH_TTL_S * 1000) },
    ],
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: "leitura" };
}

/** Endpoint de chave: troca o código (com o verificador PKCE) ou renova. */
export async function tokenGrant(prisma: PrismaClient, f: Record<string, string | undefined>, now = new Date()) {
  if (f.grant_type === "authorization_code") {
    if (!f.code || !f.code_verifier || !f.client_id) throw new OAuthError("invalid_request", "Faltam code, code_verifier ou client_id.");
    const row = await prisma.mcpAuthCode.findUnique({ where: { codeHash: sha256(f.code) } });
    if (!row || row.usedAt || row.expiresAt <= now || row.clientId !== f.client_id) throw new OAuthError("invalid_grant", "Código inválido ou vencido.");
    if (f.redirect_uri && f.redirect_uri !== row.redirectUri) throw new OAuthError("invalid_grant", "Endereço de retorno não confere.");
    if (createHash("sha256").update(f.code_verifier).digest("base64url") !== row.codeChallenge) throw new OAuthError("invalid_grant", "Verificador PKCE não confere.");
    const used = await prisma.mcpAuthCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
    if (used.count === 0) throw new OAuthError("invalid_grant", "Código já usado.");
    return issueTokens(prisma, row.clientId, row.userId, now);
  }
  if (f.grant_type === "refresh_token") {
    if (!f.refresh_token) throw new OAuthError("invalid_request", "Falta refresh_token.");
    const row = await prisma.mcpToken.findUnique({ where: { tokenHash: sha256(f.refresh_token) } });
    if (!row || row.kind !== "REFRESH" || row.revokedAt || row.expiresAt <= now || (f.client_id && f.client_id !== row.clientId))
      throw new OAuthError("invalid_grant", "Renovação inválida ou vencida.");
    const used = await prisma.mcpToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: now } });
    if (used.count === 0) throw new OAuthError("invalid_grant", "Renovação já usada.");
    return issueTokens(prisma, row.clientId, row.userId, now);
  }
  throw new OAuthError("unsupported_grant_type", "grant_type não suportado.");
}

/** Quem está chamando o conector (pela chave de acesso). null = sem acesso. */
export async function actorFromBearer(prisma: PrismaClient, header: string | null, now = new Date()): Promise<Actor | null> {
  if (!header?.startsWith("Bearer ")) return null;
  const row = await prisma.mcpToken.findUnique({ where: { tokenHash: sha256(header.slice(7).trim()) } });
  if (!row || row.kind !== "ACCESS" || row.revokedAt || row.expiresAt <= now) return null;
  const actor = await loadActor(prisma, row.userId);
  if (!actor || actor.grants.length === 0) return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 60_000) await prisma.mcpToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
  return actor;
}

/** "Desconectar o Claude": cancela todas as chaves da pessoa. */
export async function revokeAll(prisma: PrismaClient, userId: string, now = new Date()): Promise<number> {
  return (await prisma.mcpToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } })).count;
}
