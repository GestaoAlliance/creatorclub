import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { addMonthsToDay, applicationPriority, assertBps, notices, WELCOME_PRODUCTS, WELCOME_VIDEO_PRODUCTS, WELCOME_VIDEOS, birthdayLabel, dayKey, parseBirthDate, filterApplications, findDuplicates, normalizeCouponCode, parseFollowers, usableHandle, validateNewCouponCode, wantedBrands, type ApplicationFilters, type DupSource } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith, can } from "@/lib/auth/permissions";
import { normalizeEmail } from "@/lib/auth/rules";
import { isValidCpf } from "@/lib/terms/terms";
import { CouponCreateError, createDiscountInShopify, validCouponDiscount } from "@/lib/coupons/create";
import { defaultClientFactory, type ClientFactory } from "@/lib/shopify/jobs";
import { notify } from "@/lib/notifications/notify";
import { hunterLinkIdFor } from "./hunters";
import { cancelApplicationContracts, enqueueCreatorContract } from "@/lib/autentique/applications";
import type { Fetcher } from "@/lib/autentique/client";

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
  tiktok: string | null;
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
  hunterCode: string | null;
  /** D-CONTRACTFLOW: "Vai receber como:" e "Envio inicial:" do cadastro do site. */
  payoutAnswer: string | null;
  welcomeAnswer: string | null;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Cada campo e o começo da pergunta no formulário (sem acento, minúsculas). */
const QUESTIONS: [keyof HunterFields, string][] = [
  ["fullName", "seu nome completo"],
  ["kindAnswer", "sou"],
  ["phone", "seu whatsapp"],
  ["email", "email"],
  ["instagram", "@ do seu instagram"],
  ["tiktok", "@ do seu tiktok"],
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
  // D-HUNTERLINK: vem pré-preenchida pelo link do hunter
  ["hunterCode", "codigo de quem te convidou"],
  // D-CONTRACTFLOW
  ["payoutAnswer", "vai receber como"],
  ["welcomeAnswer", "envio inicial"],
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
    tiktok: out.tiktok ?? null,
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
    payoutAnswer: out.payoutAnswer ?? null,
    welcomeAnswer: out.welcomeAnswer ?? null,
    hunterCode: out.hunterCode ?? null,
  };
}

/** Tipo a partir do "Sou:". */
export function categoryFromAnswer(answer: string | null): Category {
  const a = norm(answer ?? "");
  if (a.includes("prescritor") || a.includes("nutricion") || a.includes("medic")) return "PRESCRITOR";
  if (a.startsWith("ugc")) return "UGC";
  return "INFLUENCER";
}

/** Sugestão de cupom já no formato aceito (D-COUPONLETTERS: só letras, até 20); vazio se não der. */
export function couponFromSuggestion(suggestion: string | null): string {
  const s = (suggestion ?? "").split(/[,/;\n]| ou /i)[0] ?? "";
  return normalizeCouponCode(s.normalize("NFD").replace(/[^A-Za-z]/g, "")).slice(0, 20);
}

export async function receiveApplication(
  prisma: PrismaClient,
  input: { brandSlug: string; source: string; externalKey: string; submittedAt: Date; answers: Record<string, unknown>; consentAt?: Date; ipHash?: string | null; accountId?: string },
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
  // Resposta já importada da planilha (D-CAPTACAO): mesmo formulário e mesmo segundo não duplica. Não compara o nome:
  // o texto da planilha pode vir com outra codificação de acentos ou espaços que o do formulário.
  const second = new Date(Math.floor(input.submittedAt.getTime() / 1000) * 1000);
  const imported = await prisma.creatorApplication.findFirst({
    where: {
      brandId: brand.id,
      source: input.source,
      externalKey: { startsWith: "planilha:" },
      submittedAt: { gte: second, lt: new Date(second.getTime() + 1000) },
    },
    select: { id: true },
  });
  if (imported) return { id: imported.id, created: false };
  try {
    const a = await prisma.creatorApplication.create({
      data: {
        brandId: brand.id,
        source: input.source,
        externalKey: key,
        submittedAt: input.submittedAt,
        ...fields,
        hunterLinkId: await hunterLinkIdFor(prisma, brand.id, fields.hunterCode),
        ...(input.consentAt ? { consentAt: input.consentAt } : {}),
        ...(input.ipHash ? { ipHash: input.ipHash } : {}),
        ...(input.accountId ? { accountId: input.accountId } : {}),
        raw: input.answers as object,
      },
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

export async function listApplications(prisma: PrismaClient, actor: Actor | null, status: ApplicationFilter = "NEW", filters: ApplicationFilters = {}) {
  if (!actor) throw new ApplicationError("Sem permissão.");
  const brands = brandsWith(actor.grants, "creators.view");
  if (brands !== "ALL" && brands.length === 0) throw new ApplicationError("Sem permissão.");
  const scope = { ...(brands === "ALL" ? {} : { brandId: { in: brands } }), brand: { archivedAt: null } };
  const rows = await prisma.creatorApplication.findMany({
    where: { ...scope, status },
    orderBy: status === "NEW" ? { submittedAt: "asc" } : { decidedAt: "desc" },
    take: 1000,
    include: { brand: { select: { name: true, slug: true, defaultCommissionBps: true, defaultDiscountBps: true } }, hunterLink: { select: { code: true, user: { select: { name: true } } } } },
  });
  const counts = await prisma.creatorApplication.groupBy({ by: ["status"], where: scope, _count: true });
  // F2: repetidas — mesmo e-mail, CPF ou @ em outra candidata (qualquer situação) ou numa creator da marca.
  const brandIds = [...new Set(rows.map((r) => r.brandId))];
  const [others, accounts] = await Promise.all([
    prisma.creatorApplication.findMany({ where: { brandId: { in: brandIds } }, select: { id: true, brandId: true, fullName: true, status: true, email: true, cpf: true, instagram: true } }),
    prisma.creator.findMany({ where: { brandId: { in: brandIds } }, select: { id: true, brandId: true, account: { select: { name: true, email: true, cpf: true, instagram: true } } } }),
  ]);
  const pool = (brandId: string): DupSource[] => [
    ...others.filter((o) => o.brandId === brandId).map((o) => ({ id: o.id, kind: "candidata" as const, name: o.fullName, status: o.status, email: o.email, cpf: o.cpf, instagram: o.instagram })),
    ...accounts.filter((c) => c.brandId === brandId).map((c) => ({ id: c.id, kind: "creator" as const, name: c.account.name, email: c.account.email, cpf: c.account.cpf, instagram: c.account.instagram })),
  ];
  const hunters = [...new Map(rows.filter((r) => r.hunterLink).map((r) => [r.hunterLink!.code, r.hunterLink!.user.name])).entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const mapped = rows.map((r) => {
      const fiscal = can(actor.grants, "personal.fiscal", r.brandId);
      const address = can(actor.grants, "personal.address", r.brandId);
      return {
        id: r.id,
        brandId: r.brandId,
        brandName: r.brand.name,
        /** Padrão da marca para a aprovação (VermeFree 10%, Botanika 15%). */
        defaultRateBps: r.brand.defaultCommissionBps,
        defaultDiscountBps: r.brand.defaultDiscountBps,
        status: r.status,
        submittedAt: r.submittedAt,
        decidedAt: r.decidedAt,
        decisionNote: r.decisionNote,
        creatorId: r.creatorId,
        fullName: r.fullName,
        email: r.email,
        phone: r.phone,
        instagram: r.instagram,
        tiktok: r.tiktok,
        /** D-SIGNUPACCOUNT: criou a conta com senha no cadastro (aprovar não gera convite). */
        hasLogin: r.accountId !== null,
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
        brands: wantedBrands(r.brandsWanted),
        note: r.note,
        extras: extraAnswers(r.raw),
        hunter: r.hunterLink ? { name: r.hunterLink.user.name, code: r.hunterLink.code } : null,
        // D-ORIGIN: código de hunter digitado que não bate com nenhum link (a Gestão vê para decidir).
        hunterCode: r.hunterLink ? null : r.hunterCode?.trim() || null,
        campaignTag: r.campaignTag,
        heardFrom: r.heardFrom,
        // D-CONTRACTFLOW: o que ela escolheu no cadastro (pré-preenche a aprovação).
        payoutAnswer: r.payoutAnswer,
        welcomeAnswer: r.welcomeAnswer,
        followersCount: parseFollowers(r.followers),
        duplicates: findDuplicates(r, pool(r.brandId)).filter((d) => !(d.kind === "creator" && d.id === r.creatorId)),
      };
  }).map((a, i) => {
      const r = rows[i]!;
      // M2.3 (D-PRIORITY): a prioridade usa os dados completos (mesmo os que a pessoa não vê, como o CPF).
      const priority = applicationPriority(
        {
          hunter: a.hunter,
          instagram: a.instagram,
          tiktok: a.tiktok,
          followersCount: a.followersCount,
          storiesViews: a.storiesViews,
          complete: Boolean((r.cpf || r.cnpj) && r.address && (r.suggestedCoupon || r.accountId)),
          niche: a.niche,
          categoryProposal: a.categoryProposal,
          collabInterest: a.collabInterest,
          duplicate: a.duplicates.length > 0,
        },
        r.brand.slug,
      );
      return { ...a, priority };
  });
  // D-AUTENTIQUE2: marcas com Autentique e o contrato mais recente de cada candidata.
  const [autentique, requests] = await Promise.all([
    prisma.brandIntegration.findMany({ where: { kind: "AUTENTIQUE", status: "CONNECTED", secretEncrypted: { not: null }, brandId: { in: brandIds } }, select: { brandId: true } }),
    prisma.contractRequest.findMany({
      where: { applicationId: { in: mapped.map((m) => m.id) } },
      orderBy: { sentAt: "desc" },
      select: {
        applicationId: true, status: true, sandbox: true, sentAt: true, signedAt: true, rejectedAt: true, rejectReason: true, signLink: true, linkSentAt: true, lastCheckedAt: true, lastError: true,
        pendingCouponCode: true, pendingDiscountBps: true, rateBps: true, contractTemplate: { select: { name: true, documentKind: true } },
      },
    }),
  ]);
  const withAutentique = new Set(autentique.map((b) => b.brandId));
  // D-CONTRACTFLOW: aprovada esperando o contrato (portal travado até assinar e ativar).
  const awaiting = new Map(
    (await prisma.creator.findMany({ where: { id: { in: mapped.flatMap((m) => (m.creatorId ? [m.creatorId] : [])) }, awaitingContractAt: { not: null } }, select: { id: true, contractSigned: true } })).map((c) => [c.id, c]),
  );
  const lastRequest = new Map<string, (typeof requests)[number]>();
  for (const r of requests) if (r.applicationId && !lastRequest.has(r.applicationId)) lastRequest.set(r.applicationId, r);
  const contractError = new Map(rows.map((x) => [x.id, x.contractError]));
  const withContract = <T extends { id: string; brandId: string; creatorId: string | null }>(m: T) => {
    const r = lastRequest.get(m.id);
    return {
      ...m,
      autentique: withAutentique.has(m.brandId),
      awaitingContract: m.creatorId ? (awaiting.get(m.creatorId) ? { signed: awaiting.get(m.creatorId)!.contractSigned === true } : null) : null,
      contractError: contractError.get(m.id) ?? null,
      contract: r
        ? {
            status: r.status, sandbox: r.sandbox, sentAt: r.sentAt, signedAt: r.signedAt, rejectedAt: r.rejectedAt, rejectReason: r.rejectReason, signLink: r.signLink, linkSentAt: r.linkSentAt,
            lastCheckedAt: r.lastCheckedAt, lastError: r.lastError, coupon: r.pendingCouponCode, discountBps: r.pendingDiscountBps, rateBps: r.rateBps,
            templateName: r.contractTemplate.name, category: r.contractTemplate.documentKind,
          }
        : null,
    };
  };
  const templates = await prisma.contractTemplate.findMany({
    where: { brandId: { in: brandIds } },
    orderBy: { createdAt: "asc" },
    select: { id: true, brandId: true, name: true, documentKind: true, key: true },
  });
  return {
    templates,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<ApplicationFilter, number>>,
    total: mapped.length,
    hunters,
    rows: filterApplications(mapped, filters).map(withContract),
  };
}

export async function approveApplication(
  prisma: PrismaClient,
  actor: Actor | null,
  input: {
    applicationId: string; couponCode: string; category: Category; rateBps: number; discountBps: number; email?: string; contractTemplateId?: string | null;
    /** Creator CPF (saque com recibo) ou CNPJ (com nota). Sem escolha: CNPJ se ela informou um válido, senão CPF. */
    receivesAsIndividual?: boolean;
    /** D-WELCOMEVIDEO: envio inicial com 2 produtos + 3 vídeos (Opção 2); sem marcar, 1 produto. */
    welcomeWithVideos?: boolean;
  },
  clientFor: ClientFactory = defaultClientFactory,
  now = new Date(),
): Promise<{ creatorId: string; accountId: string; couponCode: string; awaitingContract: boolean }> {
  const app = await prisma.creatorApplication.findUnique({ where: { id: input.applicationId }, include: { brand: { select: { slug: true } } } });
  if (!app) throw new ApplicationError("Candidata não encontrada.");
  if (!actor || !can(actor.grants, "creators.edit", app.brandId)) throw new ApplicationError("Sem permissão.");
  if (app.status !== "NEW") throw new ApplicationError("Esta candidata já foi decidida.");
  const { brand } = app;
  // D-CONTRACTFLOW: na marca com Autentique, aprovar não cria o cupom nem o kit: a creator espera o contrato, que sai
  // sozinho; o cupom fica reservado e é criado na Shopify depois da assinatura.
  // D-CONTRACTLOCK (2026-10-29): aprovar sempre trava (com ou sem Autentique); libera na assinatura ou quando a Gestão
  // marca "Contrato assinado" (quem assinou fora, ex.: D4Sign).
  const autentique = true;
  const coupon = validateNewCouponCode(input.couponCode);
  if (!coupon.ok) throw new ApplicationError("Cupom inválido: só letras, até 20.");
  // D-COUPONLETTERS (pedido da Vanessa em 2026-10-29): cupom de creator nova só com letras.
  if (/[0-9]/.test(coupon.code)) throw new ApplicationError("Cupom só com letras (sem números). Ex.: MARIA.");
  if (!["INFLUENCER", "PRESCRITOR", "UGC"].includes(input.category)) throw new ApplicationError("Tipo inválido.");
  try {
    assertBps(input.rateBps);
    assertBps(input.discountBps);
  } catch {
    throw new ApplicationError("Taxa ou desconto inválido.");
  }
  if (!validCouponDiscount(input.discountBps)) throw new ApplicationError("O desconto precisa ficar entre 0,01% e 50%.");
  // D-SIGNUPACCOUNT: cadastro do site já tem conta com login; a aprovação usa ela (o e-mail é o do login).
  const own = app.accountId ? await prisma.creatorAccount.findUnique({ where: { id: app.accountId }, select: { email: true } }) : null;
  const email = normalizeEmail(own?.email ?? input.email ?? app.email ?? "");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApplicationError("Informe um e-mail válido para o convite.");
  const welcomeProducts = input.welcomeWithVideos ? WELCOME_VIDEO_PRODUCTS : WELCOME_PRODUCTS;
  const cpfDigits = app.cpf?.replace(/\D/g, "") ?? "";
  const cnpjDigits = app.cnpj?.replace(/\D/g, "") ?? "";

  // D-D4SIGN: versão do contrato que ela assinou no D4Sign (da mesma marca): dá a duração e as faixas do kit.
  // D-CONTRACTFLOW: com Autentique, sem escolha, a versão mais nova do tipo.
  const template = input.contractTemplateId
    ? await prisma.contractTemplate.findFirst({ where: { id: input.contractTemplateId, brandId: app.brandId }, select: { id: true, months: true } })
    : autentique
      ? ((await prisma.contractTemplate.findMany({ where: { brandId: app.brandId, documentKind: input.category }, select: { id: true, months: true, key: true } })).sort((a, b) => b.key.localeCompare(a.key))[0] ?? null)
      : null;
  if (input.contractTemplateId && !template) throw new ApplicationError("Versão de contrato inválida.");
  if (!template && (await prisma.contractTemplate.count({ where: { brandId: app.brandId } })) > 0) throw new ApplicationError("Escolha a versão do contrato que ela assinou.");
  const start = dayKey(now);

  // F3: confere tudo antes de ir à Shopify; o cupom é criado lá primeiro e, se a Shopify recusar, nada é gravado.
  if (await prisma.coupon.findUnique({ where: { brandId_code: { brandId: app.brandId, code: coupon.code } }, select: { id: true } }))
    throw new ApplicationError(`O cupom ${coupon.code} já existe nesta marca. Escolha outro.`);
  if (await prisma.creator.findFirst({ where: { brandId: app.brandId, pendingCouponCode: coupon.code }, select: { id: true } }))
    throw new ApplicationError(`O cupom ${coupon.code} já está reservado para outra creator esperando o contrato. Escolha outro.`);
  const known = await prisma.creatorAccount.findUnique({ where: { email }, select: { creators: { select: { brandId: true } } } });
  if (known?.creators.some((c) => c.brandId === app.brandId)) throw new ApplicationError("Esta pessoa já é creator nesta marca.");
  // Isolamento entre marcas (D-BRANDISOLATION): juntar ao cadastro de quem já é creator de uma marca fora do acesso de
  // quem aprova mostraria a essa pessoa os dados que a creator deu lá (CPF, Pix, endereço). Só quem tem as duas marcas.
  if (known?.creators.some((c) => !can(actor.grants, "creators.edit", c.brandId)))
    throw new ApplicationError("Este e-mail já é de uma creator de outra marca que você não acessa. Peça a um super admin para aprovar esta candidata.");
  let shopifyId: string | null = null;
  try {
    if (!autentique) shopifyId = await createDiscountInShopify(prisma, app.brandId, coupon.code, input.discountBps, clientFor, now);
  } catch (error) {
    if (error instanceof CouponCreateError) throw new ApplicationError(`Cupom não criado na Shopify: ${error.message} Nada foi gravado.`);
    throw error;
  }

  let created: { creatorId: string; accountId: string; couponCode: string; awaitingContract: boolean };
  try {
    created = await prisma.$transaction(async (tx) => {
      const taken = await tx.coupon.findUnique({ where: { brandId_code: { brandId: app.brandId, code: coupon.code } }, select: { id: true } });
      if (taken) throw new ApplicationError(`O cupom ${coupon.code} já existe nesta marca. Escolha outro.`);
      // Redes respondidas no formulário vão para o cadastro (D-SOCIALFILL); o que a conta já tem não é trocado.
      const instagram = usableHandle(app.instagram);
      const tiktok = usableHandle(app.tiktok);
      let account = await tx.creatorAccount.findUnique({ where: { email }, select: { id: true, instagram: true, tiktok: true, birthDate: true } });
      if (account) {
        const already = await tx.creator.findUnique({ where: { brandId_accountId: { brandId: app.brandId, accountId: account.id } }, select: { id: true } });
        if (already) throw new ApplicationError("Esta pessoa já é creator nesta marca.");
        // M4.2 (D-TAGS): o nascimento da candidatura também completa a conta (sem trocar o que ela já tem).
        if ((!account.instagram && instagram) || (!account.tiktok && tiktok) || (!account.birthDate && app.birthDate)) {
          await tx.creatorAccount.update({ where: { id: account.id }, data: { instagram: account.instagram ?? instagram, tiktok: account.tiktok ?? tiktok, birthDate: account.birthDate ?? app.birthDate } });
        }
      } else {
        account = await tx.creatorAccount.create({
          data: {
            name: app.fullName,
            email,
            phone: app.phone,
            instagram,
            tiktok,
            cpf: isValidCpf(cpfDigits) ? cpfDigits : null,
            cnpj: cnpjDigits.length === 14 ? cnpjDigits : null,
            pixKey: app.pixKey && !/^(n\/?a|nao tenho|não tenho|-)$/i.test(app.pixKey.trim()) ? app.pixKey.slice(0, 140) : null,
            birthDate: app.birthDate,
          },
          select: { id: true, instagram: true, tiktok: true, birthDate: true },
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
          // D-D4SIGN: aprovar já é o contrato assinado (no D4Sign, antes do cadastro); vale da aprovação pelos meses da
          // versão. Sem contrato no portal.
          contractTemplateId: template?.id ?? null,
          contractRequiredAt: null,
          // D-CONTRACTFLOW: com Autentique, o contrato vale da assinatura; até lá o portal fica travado e o cupom reservado.
          ...(autentique
            ? { contractSigned: false, contractStart: null, contractEnd: null, awaitingContractAt: now, pendingCouponCode: coupon.code, pendingDiscountBps: input.discountBps }
            : {
                contractSigned: true,
                contractStart: new Date(`${start}T00:00:00Z`),
                contractEnd: template ? new Date(`${addMonthsToDay(start, template.months)}T00:00:00Z`) : null,
              }),
          // Pedido da Vanessa (2026-10-27): creator CPF saca com recibo; creator CNPJ, com nota fiscal.
          receivesAsIndividual: input.receivesAsIndividual ?? cnpjDigits.length !== 14,
          // D-GOALKIT: as janelas da meta de vendas (45 dias, depois 30) começam na aprovação (com Autentique, na assinatura).
          goalStartAt: autentique ? null : new Date(`${start}T00:00:00Z`),
          welcomeVideos: input.welcomeWithVideos ? WELCOME_VIDEOS : 0,
        },
      });
      if (autentique) {
        // D-CONTRACTFLOW: o contrato sai sozinho (tarefa gravada junto com a creator).
        await enqueueCreatorContract(tx, app.brandId, creator.id, now);
      } else {
        const c = await tx.coupon.create({
          data: { brandId: app.brandId, code: coupon.code, kind: "CREATOR", classifiedAt: now, classifiedById: actor.userId, discountBps: input.discountBps, shopifyId },
        });
        await tx.couponAssignment.create({
          data: { brandId: app.brandId, couponId: c.id, creatorId: creator.id, validFrom: now, createdById: actor.userId, confirmedAt: now, confirmedById: actor.userId },
        });
        // D-D4SIGN: 1 produto de boas-vindas em todas as marcas, para ela escolher na aba Pedidos; D-WELCOMEVIDEO: 2 na Opção 2.
        const month = start.slice(0, 7);
        await tx.kitGrant.create({ data: { brandId: app.brandId, creatorId: creator.id, kind: "WELCOME", month, salesCents: 0, products: welcomeProducts } });
        await notify(tx, [{ brandId: app.brandId, creatorId: creator.id, notice: notices.kitAvailable("WELCOME", month, welcomeProducts, brand.slug) }]);
      }
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
          after: { creatorId: creator.id, coupon: coupon.code, shopifyId, receivesAsIndividual: input.receivesAsIndividual ?? cnpjDigits.length !== 14, contractTemplateId: template?.id ?? null, awaitingContract: autentique, contractStart: autentique ? null : start, welcomeProducts, welcomeVideos: input.welcomeWithVideos ? WELCOME_VIDEOS : 0, category: input.category, rateBps: input.rateBps, discountBps: input.discountBps },
        },
      });
      return { creatorId: creator.id, accountId: account.id, couponCode: coupon.code, awaitingContract: autentique };
    });
  } catch (error) {
    // Raro (outra pessoa decidiu ao mesmo tempo): o desconto já existe na loja e precisa ser apagado lá.
    const orphan = ` O cupom ${coupon.code} chegou a ser criado na Shopify: apague-o lá antes de tentar de novo.`;
    if (error instanceof ApplicationError) throw new ApplicationError(error.message + orphan);
    if (String(error).includes("Coupon_brandId_code_key")) throw new ApplicationError(`O cupom ${coupon.code} já existe nesta marca.${orphan}`);
    throw error;
  }
  return created;
}

/** Dados da candidata cadastrada pela equipe (M4.1, D-MANUALAPP). */
export type StaffApplicationInput = {
  fullName: string;
  phone: string;
  email: string;
  instagram: string;
  tiktok: string;
  followers: string;
  category: Category;
  suggestedCoupon: string;
  note: string;
  /** M4.2 (D-TAGS): opcional. */
  birthDate?: string;
  /** D-CEPAUTO: endereço numa linha (montado pela busca do CEP); opcional. */
  address?: string;
};

const KIND_ANSWER: Record<Category, string> = { INFLUENCER: "Influencer", UGC: "UGC", PRESCRITOR: "Prescritor" };

/**
 * "Nova candidata" (M4.1, D-MANUALAPP): quem não veio por formulário entra pela equipe (Gestão e super admin) e segue
 * o mesmo fluxo de aprovação (cupom, contrato, convite). Origem "Cadastro da equipe"; auditoria com quem cadastrou.
 */
export async function createStaffApplication(prisma: PrismaClient, actor: Actor | null, brandId: string, input: StaffApplicationInput, now = new Date()) {
  if (!actor || !can(actor.grants, "creators.edit", brandId)) throw new ApplicationError("Sem permissão.");
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { archivedAt: true } });
  if (!brand || brand.archivedAt) throw new ApplicationError("Marca não encontrada.");
  const clean = (v: string, max = 200) => v.replace(/\s+/g, " ").trim().slice(0, max) || null;
  const fullName = clean(input.fullName, 120);
  if (!fullName) throw new ApplicationError("Informe o nome.");
  const phone = clean(input.phone, 40);
  if (!phone || phone.replace(/\D/g, "").length < 10) throw new ApplicationError("Informe o WhatsApp com DDD.");
  const email = clean(input.email) ? normalizeEmail(input.email) : null;
  if (clean(input.email) && !email) throw new ApplicationError("E-mail inválido.");
  if (!(input.category in KIND_ANSWER)) throw new ApplicationError("Escolha o tipo.");
  const birth = parseBirthDate(input.birthDate, dayKey(now, "America/Sao_Paulo"));
  if (!birth.ok) throw new ApplicationError(birth.error);
  const fields = {
    fullName,
    phone,
    email,
    instagram: clean(input.instagram, 100),
    tiktok: clean(input.tiktok, 100),
    followers: clean(input.followers, 40),
    kindAnswer: KIND_ANSWER[input.category],
    suggestedCoupon: clean(input.suggestedCoupon, 40),
    note: clean(input.note, 300),
    birthDate: birth.day ? new Date(`${birth.day}T00:00:00Z`) : null,
    address: clean(input.address ?? "", 300),
  };
  const raw = {
    "Seu nome completo": fields.fullName,
    "Sou": fields.kindAnswer,
    "Seu WhatsApp": fields.phone,
    "Email": fields.email,
    "@ do seu Instagram": fields.instagram,
    "@ do seu TikTok": fields.tiktok,
    "Quantidade de seguidores": fields.followers,
    "Sugestão de nome de cupom": fields.suggestedCoupon,
    "Endereço": fields.address,
    ...(birth.day ? { "Data de nascimento": birthdayLabel(birth.day, true) } : {}),
  };
  return prisma.$transaction(async (tx) => {
    const a = await tx.creatorApplication.create({
      data: { brandId, source: "staff_form", externalKey: `equipe:${randomUUID()}`, submittedAt: now, ...fields, raw },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: { brandId, actorType: "USER", actorId: actor.userId, action: "application.created", entity: "CreatorApplication", entityId: a.id, after: { source: "staff_form", name: fullName } },
    });
    return a;
  });
}

/**
 * Recusar várias de uma vez (M4.1, D-MANUALAPP): só as que ainda estão "Novas" e da marca em que a pessoa edita
 * creators; as outras são ignoradas e contadas. Mesmo motivo (opcional) para todas; uma auditoria por candidata.
 */
export async function rejectApplications(prisma: PrismaClient, actor: Actor | null, applicationIds: readonly string[], note: string, now = new Date(), deps: { fetcher?: Fetcher; encKey?: Buffer } = {}) {
  if (!actor) throw new ApplicationError("Sem permissão.");
  const ids = [...new Set(applicationIds)].slice(0, 500);
  if (ids.length === 0) throw new ApplicationError("Marque ao menos uma candidata.");
  const apps = await prisma.creatorApplication.findMany({ where: { id: { in: ids } }, select: { id: true, brandId: true, status: true } });
  const ok = apps.filter((a) => a.status === "NEW" && can(actor.grants, "creators.edit", a.brandId));
  const decisionNote = note.trim().replace(/\s+/g, " ").slice(0, 300) || null;
  const rejected = await prisma.$transaction(async (tx) => {
    let n = 0;
    for (const app of ok) {
      const { count } = await tx.creatorApplication.updateMany({
        where: { id: app.id, status: "NEW" },
        data: { status: "REJECTED", decidedAt: now, decidedById: actor.userId, decisionNote },
      });
      if (count === 0) continue;
      n += 1;
      await tx.auditLog.create({
        data: { brandId: app.brandId, actorType: "USER", actorId: actor.userId, action: "application.rejected", entity: "CreatorApplication", entityId: app.id, after: { note: decisionNote, bulk: true } },
      });
    }
    return n;
  });
  // D-AUTENTIQUE2: contrato esperando assinatura é cancelado no Autentique.
  await cancelApplicationContracts(prisma, ok.map((a) => a.id), actor.userId, deps);
  return { rejected, skipped: ids.length - rejected };
}

export async function rejectApplication(prisma: PrismaClient, actor: Actor | null, applicationId: string, note: string, now = new Date(), deps: { fetcher?: Fetcher; encKey?: Buffer } = {}) {
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
  return { cancelled: await cancelApplicationContracts(prisma, [app.id], actor.userId, deps) };
}
