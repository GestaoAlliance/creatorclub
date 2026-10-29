import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { cnpjAddressLine, heardFromValue, mustShipToCnpj, normalizeCampaignTag, normalizeHunterCode, sameShipAddress, signupBrandFor, signupConsentText, validateSignup } from "@/domain";
import { lookupCnpj, type CnpjLookup } from "@/lib/cnpj/lookup";
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

/** `existing: "request"`: e-mail ou CPF de uma creator já cadastrada que ainda não criou a senha (D-ACCESSREQ). */
export type SignupOutcome = { ok: true; email: string | null } | { ok: false; errors: Record<string, string>; existing?: "request" };

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
  input: { brandSlug: string; values: Record<string, string | undefined>; password: string; honeypot: string; hunterCode: string | null; ip: string | null; campaignTag?: string | null },
  auth: SignupAuth,
  now = new Date(),
  cnpjLookup: CnpjLookup = lookupCnpj,
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
    prisma.creatorAccount.findUnique({ where: { email: acc.email }, select: { id: true, userId: true } }),
    prisma.user.findUnique({ where: { email: acc.email }, select: { id: true } }),
    prisma.creatorAccount.findFirst({ where: { cpf: acc.cpf }, select: { id: true, userId: true } }),
    signupCouponTaken(prisma, brand.id, acc.coupon),
  ]);
  // D-ACCESSREQ: creator que já está no sistema (importada ou aprovada) e nunca criou a senha: em vez do erro, o
  // formulário oferece pedir o link de acesso à equipe. Quem já tem senha continua indo para "Entrar".
  const found = [byEmail, byCpf].filter((a) => a !== null);
  if (!staff && found.length > 0 && found.every((a) => a.userId === null)) return { ok: false, errors: {}, existing: "request" };
  if (byEmail || staff) errors.email = "Você já tem acesso com este e-mail. Entre com ele (ou toque em \"Esqueci a senha\").";
  if (byCpf) errors.cpf = "Este CPF já tem acesso ao portal. Entre com o seu e-mail (ou toque em \"Esqueci a senha\").";
  if (couponTaken) errors.coupon = "Este cupom já está em uso. Escolha outro.";
  if (Object.keys(errors).length) return { ok: false, errors };

  // D-PJADDR: empresa que não é MEI recebe os produtos no endereço do CNPJ (dados públicos da Receita).
  let cnpjNote: string | null = null;
  if (mustShipToCnpj(acc.cnpj, acc.taxRegime)) {
    const info = await cnpjLookup(acc.cnpj!);
    if (info === "notfound") return { ok: false, errors: { cnpj: "Não encontramos este CNPJ na Receita. Confira os números." } };
    if (info === "unavailable") cnpjNote = "não conferido (consulta da Receita fora do ar)";
    else if (!sameShipAddress(acc.address, info.address))
      return { ok: false, errors: { addrZip: `Para empresa que não é MEI, os produtos vão para o endereço do CNPJ: ${cnpjAddressLine(info.address)}.` } };
    else cnpjNote = `conferido com a Receita (${info.legalName})`;
  }

  const login = await auth.createUser(acc.email, input.password);
  if ("error" in login) {
    return login.error === "exists"
      ? { ok: false, errors: { email: "Este e-mail já tem cadastro. Entre com ele ou fale com a equipe." } }
      : { ok: false, errors: { _form: "Não foi possível criar a conta agora. Tente de novo em instantes." } };
  }

  const code = normalizeHunterCode(input.hunterCode);
  // D-ORIGIN: etiqueta de campanha do link e "Como conheceu a marca?" (opcional).
  const campaignTag = normalizeCampaignTag(input.campaignTag);
  const heardFrom = heardFromValue(input.values.heardFrom, input.values.heardFromOther);
  const answers: Record<string, string> = {
    ...(heardFrom ? { "Como conheceu a marca?": heardFrom } : {}),
    ...(campaignTag ? { "Campanha do link:": campaignTag } : {}),
    ...checked.answers,
    [BRANDS_QUESTION]: brandName,
    ...(code ? { [HUNTER_QUESTION]: code } : {}),
    ...(cnpjNote ? { "Endereço do CNPJ:": cnpjNote } : {}),
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
          taxRegime: acc.taxRegime,
          instagram: acc.instagram,
          tiktok: acc.tiktok,
          tiktokShop: acc.tiktokShop,
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
      if (campaignTag || heardFrom) await tx.creatorApplication.update({ where: { id: app.id }, data: { campaignTag, heardFrom } });
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

/** Intervalo mínimo entre dois pedidos de acesso da mesma conta (evita repetir a tarefa da equipe). */
const ACCESS_REQUEST_EVERY = 60 * 60 * 1000;

/**
 * Pedido do link de acesso (D-ACCESSREQ): a creator já cadastrada (sem senha) tentou se cadastrar de novo e tocou em
 * "Pedir meu link de acesso". Marca a conta (pelo e-mail ou pelo CPF digitados) e a Gestão de cada marca dela vê a
 * tarefa em Ações. Nada é revelado a quem pediu: a resposta é a mesma, ache ou não a conta.
 */
export async function requestPortalAccess(prisma: PrismaClient, values: Record<string, string | undefined>, now = new Date()): Promise<void> {
  const checked = validateSignup(values);
  if (!checked.ok) return;
  const { email, cpf } = checked.account;
  const accounts = await prisma.creatorAccount.findMany({
    where: { userId: null, OR: [{ email }, ...(cpf ? [{ cpf }] : [])] },
    select: { id: true, accessRequestedAt: true, creators: { select: { brandId: true } } },
  });
  for (const a of accounts) {
    if (a.accessRequestedAt && now.getTime() - a.accessRequestedAt.getTime() < ACCESS_REQUEST_EVERY) continue;
    await prisma.$transaction([
      prisma.creatorAccount.update({ where: { id: a.id }, data: { accessRequestedAt: now } }),
      prisma.auditLog.create({
        data: { brandId: a.creators[0]?.brandId ?? null, actorType: "SYSTEM", actorId: "signup:access-request", action: "creator.access_request", entity: "CreatorAccount", entityId: a.id },
      }),
    ]);
  }
}
