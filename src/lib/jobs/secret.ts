import { createHash, timingSafeEqual } from "node:crypto";

/** Tamanho mínimo do segredo das chamadas agendadas (D-CRON). */
export const JOBS_SECRET_MIN_LENGTH = 32;

/**
 * Confere `Authorization: Bearer <segredo>` em tempo constante.
 * Sem segredo configurado (ou curto demais), ninguém passa.
 */
export function isAuthorizedBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < JOBS_SECRET_MIN_LENGTH || !header?.startsWith("Bearer ")) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(header.slice("Bearer ".length)), digest(secret));
}
