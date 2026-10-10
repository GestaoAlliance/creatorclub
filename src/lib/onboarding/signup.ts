import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeHunterCode, SIGNUP_CONSENT_TEXT, validateSignup } from "@/domain";
import { normalizeEmail } from "@/lib/auth/rules";
import { hashIp } from "@/lib/links/tracked";
import { ApplicationError, receiveApplication } from "./applications";

/**
 * Inscrição pelo formulário do próprio sistema (D-SIGNUP): vira uma candidata "Nova" como as do Google, com o aceite
 * de uso dos dados e o hunter do link. Proteções do formulário aberto: campo invisível que só robô preenche, limite
 * de envios por IP (hash do dia) e o mesmo e-mail em 24 h não duplica.
 */

export const SIGNUP_SOURCE = "site_form";
export const SIGNUP_LIMIT_PER_HOUR = 5;
const HUNTER_QUESTION = "Código de quem te convidou";

export type SignupOutcome = { ok: true } | { ok: false; errors: Record<string, string> };

export async function submitSignup(
  prisma: PrismaClient,
  input: { brandSlug: string; values: Record<string, string | undefined>; consent: boolean; honeypot: string; hunterCode: string | null; ip: string | null },
  now = new Date(),
): Promise<SignupOutcome> {
  const brand = await prisma.brand.findUnique({ where: { slug: input.brandSlug.toLowerCase() }, select: { id: true, slug: true, archivedAt: true } });
  if (!brand || brand.archivedAt) throw new ApplicationError("Marca não encontrada.");
  // Campo invisível preenchido: robô. Responde como se tivesse dado certo e não grava nada.
  if (input.honeypot.trim()) return { ok: true };

  const checked = validateSignup(input.values, input.consent);
  if (!checked.ok) return checked;

  const ipHash = hashIp(input.ip, brand.id, now);
  if (ipHash) {
    const recent = await prisma.creatorApplication.count({
      where: { brandId: brand.id, ipHash, createdAt: { gte: new Date(now.getTime() - 3_600_000) } },
    });
    if (recent >= SIGNUP_LIMIT_PER_HOUR) return { ok: false, errors: { _form: "Recebemos muitas inscrições deste aparelho agora. Tente de novo mais tarde." } };
  }

  const email = normalizeEmail(input.values.email);
  if (email) {
    const twin = await prisma.creatorApplication.findFirst({
      where: { brandId: brand.id, source: SIGNUP_SOURCE, email, createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
      select: { id: true },
    });
    if (twin) return { ok: true }; // mesma pessoa enviando de novo no mesmo dia: já está com a equipe
  }

  const code = normalizeHunterCode(input.hunterCode);
  const answers: Record<string, string> = { ...checked.answers, ...(code ? { [HUNTER_QUESTION]: code } : {}), "Aceite": SIGNUP_CONSENT_TEXT };
  await receiveApplication(prisma, {
    brandSlug: brand.slug,
    source: SIGNUP_SOURCE,
    externalKey: `site:${randomUUID()}`,
    submittedAt: now,
    answers,
    consentAt: now,
    ipHash,
  });
  return { ok: true };
}
