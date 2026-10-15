import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeHunterCode, SIGNUP_QUESTIONS, signupBrandFor, signupConsentText, validateSignup } from "@/domain";
import { normalizeEmail } from "@/lib/auth/rules";
import { hashIp } from "@/lib/links/tracked";
import { ApplicationError, receiveApplication } from "./applications";

/**
 * Inscrição pelo formulário do próprio sistema (D-SIGNUP): vira uma candidata "Nova" como as do Google, com o aceite
 * de uso dos dados e o hunter do link. Um formulário por marca (D-SIGNUPBRAND, substitui D-SIGNUPBRANDS): a candidatura
 * fica na marca do endereço. Proteções do formulário aberto: campo invisível que só robô preenche, limite
 * de envios por IP (hash do dia) e o mesmo e-mail em 24 h não duplica.
 */

export const SIGNUP_SOURCE = "site_form";
export const SIGNUP_LIMIT_PER_HOUR = 5;
const HUNTER_QUESTION = "Código de quem te convidou";
const BRANDS_QUESTION = SIGNUP_QUESTIONS.find((q) => q.key === "brands")!.title;

export type SignupOutcome = { ok: true } | { ok: false; errors: Record<string, string> };

export async function submitSignup(
  prisma: PrismaClient,
  input: { brandSlug: string; values: Record<string, string | undefined>; consent: boolean; honeypot: string; hunterCode: string | null; ip: string | null },
  now = new Date(),
): Promise<SignupOutcome> {
  const brand = await prisma.brand.findUnique({ where: { slug: input.brandSlug.toLowerCase() }, select: { id: true, slug: true, name: true, archivedAt: true } });
  if (!brand || brand.archivedAt) throw new ApplicationError("Marca não encontrada.");
  // Campo invisível preenchido: robô. Responde como se tivesse dado certo e não grava nada.
  if (input.honeypot.trim()) return { ok: true };

  // D-SIGNUPBRAND: um formulário por marca; a marca é a do endereço, não uma escolha da pessoa.
  const brandName = signupBrandFor(brand.slug) ?? brand.name;
  const checked = validateSignup({ ...input.values, brands: "" }, input.consent);
  if (!checked.ok) return checked;
  checked.answers[BRANDS_QUESTION] = brandName;

  const targets = [{ id: brand.id, slug: brand.slug }];

  // Limite por aparelho: vale para qualquer marca de destino (nada é gravado se uma delas já passou do limite).
  for (const t of targets) {
    const ipHash = hashIp(input.ip, t.id, now);
    if (!ipHash) continue;
    const recent = await prisma.creatorApplication.count({
      where: { brandId: t.id, ipHash, createdAt: { gte: new Date(now.getTime() - 3_600_000) } },
    });
    if (recent >= SIGNUP_LIMIT_PER_HOUR) return { ok: false, errors: { _form: "Recebemos muitas inscrições deste aparelho agora. Tente de novo mais tarde." } };
  }

  const email = normalizeEmail(input.values.email);
  const code = normalizeHunterCode(input.hunterCode);
  const answers: Record<string, string> = { ...checked.answers, ...(code ? { [HUNTER_QUESTION]: code } : {}), "Aceite": signupConsentText(brandName) };
  for (const t of targets) {
    if (email) {
      const twin = await prisma.creatorApplication.findFirst({
        where: { brandId: t.id, source: SIGNUP_SOURCE, email, createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
        select: { id: true },
      });
      if (twin) continue; // mesma pessoa enviando de novo no mesmo dia: já está com a equipe desta marca
    }
    await receiveApplication(prisma, {
      brandSlug: t.slug,
      source: SIGNUP_SOURCE,
      externalKey: `site:${randomUUID()}`,
      submittedAt: now,
      answers,
      consentAt: now,
      ipHash: hashIp(input.ip, t.id, now),
    });
  }
  return { ok: true };
}
