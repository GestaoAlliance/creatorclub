import type { PrismaClient } from "@/generated/prisma/client";
import { assertBps, normalizeCouponCode, validateNewCouponCode } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith, can } from "@/lib/auth/permissions";
import { normalizeEmail } from "@/lib/auth/rules";
import { isValidCpf } from "@/lib/terms/terms";

/**
 * Candidatas dos formulários Hunter (D-ONBOARD) e de Captação (D-CAPTACAO). O script do Google Forms manda cada
 * resposta para `/api/forms/[marca]/hunter` ou `/api/forms/[marca]/captacao`; a resposta vira uma candidata "Nova". A equipe (quem edita creators: Gestão e super
 * admin) aprova, com cupom, tipo, taxa e desconto (padrão 15% e 5%, editáveis), ou recusa. Aprovar cria, numa
 * transação: conta (ou reaproveita pelo e-mail), creator ativa, cupom de creator, dona e taxa já confirmadas e o
 * saque liberado (creator nova não tem pagamentos antigos a abater). O convite do portal sai logo depois.
 */

export class ApplicationError extends Error {}

export type Category = "INFLUENCER" | "PRESCRITOR" | "UGC";
export type HunterFields = {
  fullName: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  followers: string | null;
  niche: string | null;
  kindAnswer: string | null;
  address: string | null;
  suggestedCoupon: string | null;
  cpf: string | null;
  cnpj: string | null;
  companyName: string | null;
  pixKey: string | null;
  storiesViews: string | null;
  brandsWanted: string | null;
  collabInterest: string | null;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Cada campo e o começo da pergunta no formulário (sem acento, minúsculas). */
const QUESTIONS: [keyof HunterFields, string][] = [
  ["fullName", "seu nome completo"],
  ["kindAnswer", "sou"],
  ["phone", "seu whatsapp"],
  ["email", "email"],
  ["instagram", "@ do seu instagram"],
  ["followers", "quantidade de seguidores"],
  ["niche", "qual seu nicho"],
  ["address", "endereco para entrega"],
  ["suggestedCoupon", "sugestao de nome de cupom"],
  ["cpf", "cpf"],
  ["cnpj", "cnpj"],
  ["companyName", "razao social"],
  ["pixKey", "pix para pagamento"],
  // D-CAPTACAO: perguntas do formulário de Captação Botanika + VermeFree
  ["storiesViews", "quantos visualizacoes tem seus stories"],
  ["brandsWanted", "tenho interesse em representar"],
  ["collabInterest", "estamos selecionando alguns parceiros"],
];

/** Campo a que a pergunta corresponde (ou `null` se é uma pergunta sem campo próprio, que fica só na resposta original). */
function matchQuestion(title: string): keyof HunterFields | null {
  const t = norm(title).replace(/:$/, "");
  const hit = QUESTIONS.find(([, q]) => t === q || t.startsWith(`${q} `) || t.startsWith(`${q}:`) || (q.length > 4 && t.startsWith(q)));
  return hit ? hit[0] : null;
}

/** Perguntas sem campo próprio (conteúdo, por que faz sentido…), para a equipe ler na candidata. */
export function extraAnswers(raw: unknown): { question: string; answer: string }[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>).flatMap(([q, v]) => {
    if (matchQuestion(q)) return [];
    const answer = (Array.isArray(v) ? v.join(", ") : String(v ?? "")).trim();
    return answer ? [{ question: q.trim(), answer: answer.slice(0, 1000) }] : [];
  });
}

/** Lê as respostas pelo título das perguntas (tolerante a acento, maiúsculas e ":" no fim). */
export function parseHunterAnswers(answers: Record<string, unknown>): HunterFields {
  const out: Record<string, string | null> = {};
  for (const [title, value] of Object.entries(answers)) {
    const text = (Array.isArray(value) ? value.join(", ") : String(value ?? "")).trim().slice(0, 1000);
    const field = matchQuestion(title);
    if (field && !out[field]) out[field] = text || null;
  }
  const fullName = (out.fullName ?? "").replace(/\s+/g, " ").trim();
  if (!fullName) throw new ApplicationError("Resposta sem nome.");
  const email = out.email ? normalizeEmail(out.email) : null;
  return {
    fullName,
    email: email || null,
    phone: out.phone ?? null,
    instagram: out.instagram ?? null,
    followers: out.followers ?? null,
    niche: out.niche ?? null,
    kindAnswer: out.kindAnswer ?? null,
    address: out.address ?? null,
    suggestedCoupon: out.suggestedCoupon ?? null,
    cpf: out.cpf ?? null,
    cnpj: out.cnpj ?? null,
    companyName: out.companyName ?? null,
    pixKey: out.pixKey ?? null,
    storiesViews: out.storiesViews ?? null,
    brandsWanted: out.brandsWanted ?? null,
    collabInterest: out.collabInterest ?? null,
  };
}

/** Tipo a partir do "Sou:". */
export function categoryFromAnswer(answer: string | null): Category {
  const a = norm(answer ?? "");
  if (a.includes("prescritor") || a.includes("nutricion") || a.includes("medic")) return "PRESCRITOR";
  if (a.startsWith("ugc")) return "UGC";
  return "INFLUENCER";
}

/** Sugestão de cupom já no formato aceito (só letras, até 8); vazio se não der. */
export function couponFromSuggestion(suggestion: string | null): string {
  const s = (suggestion ?? "").split(/[,/;\n]| ou /i)[0] ?? "";
  const v = validateNewCouponCode(s);
  if (v.ok) return v.code;
  return normalizeCouponCode(s.normalize("NFD").replace(/[^A-Za-z]/g, "")).slice(0, 8);
}

export async function receiveApplication(
  prisma: PrismaClient,
  input: { brandSlug: string; source: string; externalKey: string; submittedAt: Date; answers: Record<string, unknown> },
): Promise<{ id: string; created: boolean }> {
  const brand = await prisma.brand.findUnique({ where: { slug: input.brandSlug }, select: { id: true, archivedAt: true } });
  if (!brand || brand.archivedAt) throw new ApplicationError("Marca não encontrada.");
  const key = input.externalKey.trim().slice(0, 200);
  if (!key) throw new ApplicationError("Resposta sem identificador.");
  const existing = await prisma.creatorApplication.findUnique({
    where: { brandId_source_externalKey: { brandId: brand.id, source: input.source, externalKey: key } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };
  const fields = parseHunterAnswers(input.answers);
  // Resposta já importada da planilha (D-CAPTACAO): mesmo formulário, mesmo segundo e mesmo nome não duplica.
  const second = new Date(Math.floor(input.submittedAt.getTime() / 1000) * 1000);
  const imported = await prisma.creatorApplication.findFirst({
    where: {
      brandId: brand.id,
      source: input.source,
      externalKey: { startsWith: "planilha:" },
      fullName: fields.fullName,
      submittedAt: { gte: second, lt: new Date(second.getTime() + 1000) },
    },
    select: { id: true },
  });
  if (imported) return { id: imported.id, created: false };
  try {
    const a = await prisma.creatorApplication.create({
      data: { brandId: brand.id, source: input.source, externalKey: key, submittedAt: input.submittedAt, ...fields, raw: input.answers as object },
    });
    return { id: a.id, created: true };
  } catch (error) {
    if (String(error).includes("Unique constraint")) {
      const again = await prisma.creatorApplication.findUniqueOrThrow({
        where: { brandId_source_externalKey: { brandId: brand.id, source: input.source, externalKey: key } },
        select: { id: true },
      });
      return { id: again.id, created: false };
    }
    throw error;
  }
}

export type ApplicationFilter = "NEW" | "APPROVED" | "REJECTED";

export async function listApplications(prisma: PrismaClient, actor: Actor | null, status: ApplicationFilter = "NEW") {
  if (!actor) throw new ApplicationError("Sem permissão.");
  const brands = brandsWith(actor.grants, "creators.view");
  if (brands !== "ALL" && brands.length === 0) throw new ApplicationError("Sem permissão.");
  const rows = await prisma.creatorApplication.findMany({
    where: { ...(brands === "ALL" ? {} : { brandId: { in: brands } }), status, brand: { archivedAt: null } },
    orderBy: status === "NEW" ? { submittedAt: "asc" } : { decidedAt: "desc" },
    take: 200,
  });
  const counts = await prisma.creatorApplication.groupBy({
    by: ["status"],
    where: { ...(brands === "ALL" ? {} : { brandId: { in: brands } }), brand: { archivedAt: null } },
    _count: true,
  });
  return {
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<ApplicationFilter, number>>,
    rows: rows.map((r) => {
      const fiscal = can(actor.grants, "personal.fiscal", r.brandId);
      const address = can(actor.grants, "personal.address", r.brandId);
      return {
        id: r.id,
        brandId: r.brandId,
        status: r.status,
        submittedAt: r.submittedAt,
        decidedAt: r.decidedAt,
        decisionNote: r.decisionNote,
        creatorId: r.creatorId,
        fullName: r.fullName,
        email: r.email,
        phone: r.phone,
        instagram: r.instagram,
        followers: r.followers,
        niche: r.niche,
        kindAnswer: r.kindAnswer,
        suggestedCoupon: r.suggestedCoupon,
        couponProposal: couponFromSuggestion(r.suggestedCoupon),
        categoryProposal: categoryFromAnswer(r.kindAnswer),
        address: address ? r.address : null,
        cpf: fiscal ? r.cpf : null,
        cnpj: fiscal ? r.cnpj : null,
        companyName: fiscal ? r.companyName : null,
        pixKey: fiscal ? r.pixKey : null,
        canDecide: can(actor.grants, "creators.edit", r.brandId),
        source: r.source,
        storiesViews: r.storiesViews,
        collabInterest: r.collabInterest,
        alsoVermeFree: /vermefree/i.test(r.brandsWanted ?? ""),
        note: r.note,
        extras: extraAnswers(r.raw),
      };
    }),
  };
}

export async function approveApplication(
  prisma: PrismaClient,
  actor: Actor | null,
  input: { applicationId: string; couponCode: string; category: Category; rateBps: number; discountBps: number; email?: string },
  now = new Date(),
): Promise<{ creatorId: string; accountId: string; couponCode: string }> {
  const app = await prisma.creatorApplication.findUnique({ where: { id: input.applicationId } });
  if (!app) throw new ApplicationError("Candidata não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", app.brandId)) throw new ApplicationError("Sem permissão.");
  if (app.status !== "NEW") throw new ApplicationError("Esta candidata já foi decidida.");
  const coupon = validateNewCouponCode(input.couponCode);
  if (!coupon.ok) throw new ApplicationError("Cupom inválido: só letras, até 8.");
  if (!["INFLUENCER", "PRESCRITOR", "UGC"].includes(input.category)) throw new ApplicationError("Tipo inválido.");
  try {
    assertBps(input.rateBps);
    assertBps(input.discountBps);
  } catch {
    throw new ApplicationError("Taxa ou desconto inválido.");
  }
  const email = normalizeEmail(input.email ?? app.email ?? "");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApplicationError("Informe um e-mail válido para o convite.");
  const cpfDigits = app.cpf?.replace(/\D/g, "") ?? "";
  const cnpjDigits = app.cnpj?.replace(/\D/g, "") ?? "";

  try {
    return await prisma.$transaction(async (tx) => {
      const taken = await tx.coupon.findUnique({ where: { brandId_code: { brandId: app.brandId, code: coupon.code } }, select: { id: true } });
      if (taken) throw new ApplicationError(`O cupom ${coupon.code} já existe nesta marca. Escolha outro.`);
      let account = await tx.creatorAccount.findUnique({ where: { email }, select: { id: true } });
      if (account) {
        const already = await tx.creator.findUnique({ where: { brandId_accountId: { brandId: app.brandId, accountId: account.id } }, select: { id: true } });
        if (already) throw new ApplicationError("Esta pessoa já é creator nesta marca.");
      } else {
        account = await tx.creatorAccount.create({
          data: {
            name: app.fullName,
            email,
            phone: app.phone,
            cpf: isValidCpf(cpfDigits) ? cpfDigits : null,
            cnpj: cnpjDigits.length === 14 ? cnpjDigits : null,
            pixKey: app.pixKey && !/^(n\/?a|nao tenho|não tenho|-)$/i.test(app.pixKey.trim()) ? app.pixKey.slice(0, 140) : null,
          },
          select: { id: true },
        });
      }
      const creator = await tx.creator.create({
        data: {
          brandId: app.brandId,
          accountId: account.id,
          categories: [input.category],
          status: "ACTIVE",
          activatedAt: now,
          source: "hunter_form",
          // Creator nova não tem pagamento antigo a abater (D-ONBOARD): saque liberado e conferência dispensada.
          withdrawalsUnlockedAt: now,
          withdrawalsUnlockedById: actor.userId,
          reviewedAt: now,
          reviewedById: actor.userId,
        },
      });
      const c = await tx.coupon.create({
        data: { brandId: app.brandId, code: coupon.code, kind: "CREATOR", classifiedAt: now, classifiedById: actor.userId, discountBps: input.discountBps },
      });
      await tx.couponAssignment.create({
        data: { brandId: app.brandId, couponId: c.id, creatorId: creator.id, validFrom: now, createdById: actor.userId, confirmedAt: now, confirmedById: actor.userId },
      });
      await tx.commissionPolicy.create({
        data: { brandId: app.brandId, creatorId: creator.id, rateBps: input.rateBps, validFrom: now, createdById: actor.userId, confirmedAt: now, confirmedById: actor.userId },
      });
      const { count } = await tx.creatorApplication.updateMany({
        where: { id: app.id, status: "NEW" },
        data: { status: "APPROVED", decidedAt: now, decidedById: actor.userId, creatorId: creator.id },
      });
      if (count === 0) throw new ApplicationError("Esta candidata já foi decidida.");
      await tx.auditLog.create({
        data: {
          brandId: app.brandId,
          actorType: "USER",
          actorId: actor.userId,
          action: "application.approved",
          entity: "CreatorApplication",
          entityId: app.id,
          after: { creatorId: creator.id, coupon: coupon.code, category: input.category, rateBps: input.rateBps, discountBps: input.discountBps },
        },
      });
      return { creatorId: creator.id, accountId: account.id, couponCode: coupon.code };
    });
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    if (String(error).includes("Coupon_brandId_code_key")) throw new ApplicationError(`O cupom ${coupon.code} já existe nesta marca. Escolha outro.`);
    throw error;
  }
}

export async function rejectApplication(prisma: PrismaClient, actor: Actor | null, applicationId: string, note: string, now = new Date()) {
  const app = await prisma.creatorApplication.findUnique({ where: { id: applicationId }, select: { id: true, brandId: true, status: true } });
  if (!app) throw new ApplicationError("Candidata não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", app.brandId)) throw new ApplicationError("Sem permissão.");
  const decisionNote = note.trim().replace(/\s+/g, " ").slice(0, 300) || null;
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.creatorApplication.updateMany({
      where: { id: app.id, status: "NEW" },
      data: { status: "REJECTED", decidedAt: now, decidedById: actor.userId, decisionNote },
    });
    if (count === 0) throw new ApplicationError("Esta candidata já foi decidida.");
    await tx.auditLog.create({
      data: { brandId: app.brandId, actorType: "USER", actorId: actor.userId, action: "application.rejected", entity: "CreatorApplication", entityId: app.id, after: { note: decisionNote } },
    });
  });
}
