import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeHunterCode, signupBrandFor, signupConsentText, validateSignup } from "@/domain";
import { passwordProblem } from "@/lib/auth/rules";
import { hashIp } from "@/lib/links/tracked";
import { ApplicationError, receiveApplication } from "./applications";

/**
 * Cadastro de creator pelo site (D-SIGNUPACCOUNT, substitui D-SIGNUP no envio): a conta nasce com login (e-mail e senha)
 * e uma inscrição "Nova" na marca do endereço, ligada a ela. A pessoa já entra e vê "cadastro em análise"; a Ana aprova
 * como antes (contrato e cupom). O cupom escolhido fica reservado: não pode repetir um cupom da marca nem o de outra
 * inscrição ainda em análise. Proteções do formulário aberto: campo invisível que só robô preenche, limite de envios
 * por IP (hash do dia), e-mail e CPF que já têm cadastro não criam outro.
 */

export const SIGNUP_SOURCE = "site_form";
export const SIGNUP_LIMIT_PER_HOUR = 5;
const HUNTER_QUESTION = "Código de quem te convidou";
const BRANDS_QUESTION = "Tenho interesse em representar:";

/** Login do Supabase Auth (trocado nos testes). */
export type SignupAuth = {
  createUser(email: string, password: string): Promise<{ userId: string } | { error: "exists" | "failed" }>;
  deleteUser(userId: string): Promise<void>;
};

export type SignupOutcome = { ok: true; email: string | null } | { ok: false; errors: Record<string, string> };

/** Cupom já usado na marca ou reservado por outra inscrição em análise. */
export async function signupCouponTaken(prisma: PrismaClient, brandId: string, code: string): Promise<boolean> {
  const c = code.toUpperCase();
  const [coupon, pending] = await Promise.all([
    prisma.coupon.findFirst({ where: { brandId, code: { equals: c, mode: "insensitive" } }, select: { id: true } }),
    prisma.creatorApplication.findFirst({ where: { brandId, status: "NEW", suggestedCoupon: { equals: c, mode: "insensitive" } }, select: { id: true } }),
  ]);
  return Boolean(coupon || pending);
}

export async function submitSignup(
  prisma: PrismaClient,
  input: { brandSlug: string; values: Record<string, string | undefined>; password: string; honeypot: string; hunterCode: string | null; ip: string | null },
  auth: SignupAuth,
  now = new Date(),
): Promise<SignupOutcome> {
  const brand = await prisma.brand.findUnique({ where: { slug: input.brandSlug.toLowerCase() }, select: { id: true, slug: true, name: true, archivedAt: true } });
  if (!brand || brand.archivedAt) throw new ApplicationError("Marca não encontrada.");
  // Campo invisível preenchido: robô. Responde como se tivesse dado certo e não grava nada.
  if (input.honeypot.trim()) return { ok: true, email: null };

  const brandName = signupBrandFor(brand.slug) ?? brand.name;
  const checked = validateSignup(input.values);
  const errors: Record<string, string> = checked.ok ? {} : { ...checked.errors };
  const badPassword = passwordProblem(input.password);
  if (badPassword) errors.password = badPassword;
  if (!checked.ok || badPassword) return { ok: false, errors };
  const acc = checked.account;

  const ipHash = hashIp(input.ip, brand.id, now);
  if (ipHash) {
    const recent = await prisma.creatorApplication.count({ where: { brandId: brand.id, ipHash, createdAt: { gte: new Date(now.getTime() - 3_600_000) } } });
    if (recent >= SIGNUP_LIMIT_PER_HOUR) return { ok: false, errors: { _form: "Recebemos muitos cadastros deste aparelho agora. Tente de novo mais tarde." } };
  }

  const [byEmail, staff, byCpf, couponTaken] = await Promise.all([
    prisma.creatorAccount.findUnique({ where: { email: acc.email }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: acc.email }, select: { id: true } }),
    prisma.creatorAccount.findFirst({ where: { cpf: acc.cpf }, select: { id: true } }),
    signupCouponTaken(prisma, brand.id, acc.coupon),
  ]);
  if (byEmail || staff) errors.email = "Este e-mail já tem cadastro. Entre com ele ou fale com a equipe.";
  if (byCpf) errors.cpf = "Este CPF já tem cadastro. Entre com o seu e-mail ou fale com a equipe.";
  if (couponTaken) errors.coupon = "Este cupom já está em uso. Escolha outro.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const login = await auth.createUser(acc.email, input.password);
  if ("error" in login) {
    return login.error === "exists"
      ? { ok: false, errors: { email: "Este e-mail já tem cadastro. Entre com ele ou fale com a equipe." } }
      : { ok: false, errors: { _form: "Não foi possível criar a conta agora. Tente de novo em instantes." } };
  }

  const code = normalizeHunterCode(input.hunterCode);
  const answers: Record<string, string> = {
    ...checked.answers,
    [BRANDS_QUESTION]: brandName,
    ...(code ? { [HUNTER_QUESTION]: code } : {}),
    Aceite: signupConsentText(brandName),
  };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: login.userId, email: acc.email, name: acc.name, phone: acc.phone } });
      const account = await tx.creatorAccount.create({
        data: {
          userId: login.userId,
          name: acc.name,
          email: acc.email,
          phone: acc.phone,
          cpf: acc.cpf,
          cnpj: acc.cnpj,
          instagram: acc.instagram,
          tiktok: acc.tiktok,
          birthDate: acc.birthDate ? new Date(`${acc.birthDate}T00:00:00Z`) : null,
          ...acc.profile,
          addrZip: acc.address.zip,
          addrStreet: acc.address.street,
          addrNumber: acc.address.number,
          addrComplement: acc.address.complement,
          addrDistrict: acc.address.district,
          addrCity: acc.address.city,
          addrState: acc.address.state,
        },
        select: { id: true },
      });
      const app = await receiveApplication(tx as unknown as PrismaClient, {
        brandSlug: brand.slug,
        source: SIGNUP_SOURCE,
        externalKey: `site:${randomUUID()}`,
        submittedAt: now,
        answers,
        consentAt: now,
        ipHash,
        accountId: account.id,
      });
      await tx.auditLog.create({
        data: { brandId: brand.id, actorType: "USER", actorId: login.userId, action: "signup.account", entity: "CreatorApplication", entityId: app.id, after: { accountId: account.id, coupon: acc.coupon } },
      });
    });
  } catch (error) {
    // Nada gravado: o login criado agora é apagado para a pessoa poder tentar de novo com o mesmo e-mail.
    await auth.deleteUser(login.userId).catch(() => {});
    if (String(error).includes("Unique constraint")) return { ok: false, errors: { email: "Este e-mail já tem cadastro. Entre com ele ou fale com a equipe." } };
    throw error;
  }
  return { ok: true, email: acc.email };
}
