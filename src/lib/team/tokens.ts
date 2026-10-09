import { createHash, randomBytes } from "node:crypto";

/** Token do link de convite (mostrado uma vez) e o hash que fica no banco. */
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** DECISÃO-ABERTA: D-INVITE-TTL — prazo do convite; proposta em uso: 7 dias. */
export const INVITE_TTL_DAYS = 7;
