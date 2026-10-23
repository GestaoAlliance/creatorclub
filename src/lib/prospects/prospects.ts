import type { PrismaClient } from "@/generated/prisma/client";
import {
  dayKey,
  isDayKey,
  MAX_HANDLES_PER_ADD,
  needsFollowUp,
  parseHandles,
  PROSPECT_STATUS_LABEL,
  PROSPECT_STATUSES,
  prospectHandle,
  prospectMessages,
  type ProspectStatusKey,
} from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * Prospecção antes do formulário (U6, D-PROSPECT): a Gestão e as hunters registram os perfis que abordaram; um @ por
 * marca (repetido avisa quem abordou e não duplica). Quem se inscreve com o mesmo @ vira "Inscrita" sozinha, ligada à
 * candidata. A Gestão vê todos da marca; a hunter, só os dela. Nada é apagado.
 */

export class ProspectError extends Error {}

const MAX_NOTE = 500;
const MAX_MESSAGE = 2000;

function access(actor: Actor | null, brandId: string) {
  if (!actor) throw new ProspectError("Sem permissão.");
  const all = can(actor.grants, "creators.edit", brandId);
  const own = can(actor.grants, "prospects.own", brandId);
  if (!all && !own) throw new ProspectError("Sem permissão.");
  return { all, userId: actor.userId };
}

const dbDay = (day: string) => new Date(`${day}T00:00:00Z`);

export type AddProspectsResult = {
  created: string[];
  duplicates: { handle: string; owner: string; approachedOn: string; status: string }[];
  invalid: string[];
};

export async function addProspects(
  prisma: PrismaClient,
  actor: Actor | null,
  brandId: string,
  input: { handles: string; approachedOn: string; status?: string; note?: string },
  now = new Date(),
): Promise<AddProspectsResult> {
  const a = access(actor, brandId);
  const { handles, invalid } = parseHandles(input.handles);
  if (handles.length === 0) throw new ProspectError(invalid.length ? `Nenhum @ válido (${invalid.slice(0, 3).join(", ")}).` : "Escreva pelo menos um @.");
  if (handles.length > MAX_HANDLES_PER_ADD) throw new ProspectError(`No máximo ${MAX_HANDLES_PER_ADD} perfis de uma vez.`);
  const today = dayKey(now);
  if (!isDayKey(input.approachedOn) || input.approachedOn > today) throw new ProspectError("Informe o dia da abordagem (hoje ou antes).");
  const status = (input.status || "FIRST_MESSAGE") as ProspectStatusKey;
  if (!PROSPECT_STATUSES.includes(status) || status === "SIGNED_UP") throw new ProspectError("Situação inválida.");
  const note = input.note?.trim() || null;
  if (note && note.length > MAX_NOTE) throw new ProspectError(`Observação com até ${MAX_NOTE} letras.`);

  const existing = await prisma.prospect.findMany({
    where: { brandId, handle: { in: handles } },
    select: { handle: true, approachedOn: true, status: true, owner: { select: { name: true, email: true } } },
  });
  const taken = new Map(existing.map((e) => [e.handle, e]));
  const fresh = handles.filter((h) => !taken.has(h));
  await prisma.$transaction(async (tx) => {
    for (const handle of fresh) {
      const p = await tx.prospect.create({ data: { brandId, handle, ownerId: a.userId, approachedOn: dbDay(input.approachedOn), status, statusAt: now, note } });
      await tx.auditLog.create({ data: { brandId, actorType: "USER", actorId: a.userId, action: "prospect.create", entity: "Prospect", entityId: p.id, after: { handle, status } } });
    }
  });
  return {
    created: fresh,
    duplicates: existing.map((e) => ({
      handle: e.handle,
      owner: e.owner.name ?? e.owner.email,
      approachedOn: e.approachedOn.toISOString().slice(0, 10),
      status: PROSPECT_STATUS_LABEL[e.status],
    })),
    invalid,
  };
}

/** Muda a situação e/ou a observação. Quem abordou ou a Gestão. Ligada a uma inscrição: a situação não muda mais. */
export async function updateProspect(prisma: PrismaClient, actor: Actor | null, id: string, input: { status?: string; note?: string | null }, now = new Date()) {
  const p = await prisma.prospect.findUnique({ where: { id }, select: { id: true, brandId: true, ownerId: true, status: true, note: true, applicationId: true } });
  if (!p) throw new ProspectError("Perfil não encontrado.");
  const a = access(actor, p.brandId);
  if (!a.all && p.ownerId !== a.userId) throw new ProspectError("Só quem abordou ou a Gestão muda este perfil.");
  const data: { status?: ProspectStatusKey; statusAt?: Date; note?: string | null } = {};
  if (input.status !== undefined && input.status !== p.status) {
    if (!PROSPECT_STATUSES.includes(input.status as ProspectStatusKey)) throw new ProspectError("Situação inválida.");
    if (p.applicationId) throw new ProspectError("Ela já se inscreveu: a situação fica como Inscrita.");
    data.status = input.status as ProspectStatusKey;
    data.statusAt = now;
  }
  if (input.note !== undefined) {
    const note = input.note?.trim() || null;
    if (note && note.length > MAX_NOTE) throw new ProspectError(`Observação com até ${MAX_NOTE} letras.`);
    if (note !== p.note) data.note = note;
  }
  if (Object.keys(data).length === 0) return;
  await prisma.$transaction([
    prisma.prospect.update({ where: { id }, data }),
    prisma.auditLog.create({ data: { brandId: p.brandId, actorType: "USER", actorId: a.userId, action: "prospect.update", entity: "Prospect", entityId: id, before: { status: p.status, note: p.note }, after: data } }),
  ]);
}

/** Liga à candidata quem se inscreveu com o mesmo @ (na marca) e marca "Inscrita". Devolve quantos ligou. */
export async function linkSignedUp(prisma: PrismaClient, brandId: string): Promise<number> {
  const open = await prisma.prospect.findMany({ where: { brandId, applicationId: null }, select: { id: true, handle: true } });
  if (open.length === 0) return 0;
  const apps = await prisma.creatorApplication.findMany({
    where: { brandId, instagram: { not: null } },
    orderBy: { submittedAt: "asc" },
    select: { id: true, instagram: true, submittedAt: true },
  });
  const byHandle = new Map<string, { id: string; submittedAt: Date }>();
  for (const app of apps) {
    const h = prospectHandle(app.instagram);
    if (h && !byHandle.has(h)) byHandle.set(h, app);
  }
  let linked = 0;
  for (const p of open) {
    const app = byHandle.get(p.handle);
    if (!app) continue;
    await prisma.prospect.update({ where: { id: p.id }, data: { applicationId: app.id, status: "SIGNED_UP", statusAt: app.submittedAt } });
    linked++;
  }
  return linked;
}

export type ProspectFilters = { status?: string; owner?: string; followUp?: boolean; q?: string };

export async function listProspects(prisma: PrismaClient, actor: Actor | null, brandId: string, filters: ProspectFilters = {}, now = new Date()) {
  const a = access(actor, brandId);
  await linkSignedUp(prisma, brandId);
  const rows = await prisma.prospect.findMany({
    where: { brandId, ...(a.all ? {} : { ownerId: a.userId }) },
    orderBy: [{ approachedOn: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      handle: true,
      ownerId: true,
      approachedOn: true,
      status: true,
      statusAt: true,
      note: true,
      owner: { select: { name: true, email: true } },
      application: { select: { id: true, fullName: true, status: true } },
    },
  });
  const all = rows.map((r) => ({
    id: r.id,
    handle: r.handle,
    ownerId: r.ownerId,
    owner: r.owner.name ?? r.owner.email,
    approachedOn: r.approachedOn.toISOString().slice(0, 10),
    status: r.status as ProspectStatusKey,
    statusAt: r.statusAt,
    note: r.note,
    application: r.application,
    followUp: needsFollowUp(r, now),
    canEdit: a.all || r.ownerId === a.userId,
  }));
  const month = dayKey(now).slice(0, 7);
  const kpis = {
    month: all.filter((r) => r.approachedOn.startsWith(month)).length,
    formSent: all.filter((r) => r.status === "FORM_SENT").length,
    signedUp: all.filter((r) => r.status === "SIGNED_UP").length,
    followUp: all.filter((r) => r.followUp).length,
  };
  const owners = [...new Map(all.map((r) => [r.ownerId, r.owner])).entries()].map(([id, name]) => ({ id, name })).sort((x, y) => x.name.localeCompare(y.name, "pt-BR"));
  const q = prospectHandle(filters.q ?? "") ?? (filters.q ?? "").trim().toLowerCase();
  const shown = all.filter(
    (r) =>
      (!filters.status || r.status === filters.status) &&
      (!filters.owner || r.ownerId === filters.owner) &&
      (!filters.followUp || r.followUp) &&
      (!q || r.handle.includes(q) || (r.note ?? "").toLowerCase().includes(q)),
  );
  return { rows: shown, total: all.length, kpis, owners, seeAll: a.all };
}

/** Mensagens prontas da marca, já com o nome de quem manda e o link de inscrição dela (o da hunter, se tiver). */
export async function myProspectMessages(prisma: PrismaClient, actor: Actor | null, brandId: string, origin: string) {
  const a = access(actor, brandId);
  const [brand, user, link] = await Promise.all([
    prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { slug: true, name: true, defaultCommissionBps: true, defaultDiscountBps: true, prospectFirstMessage: true, prospectProposalMessage: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { name: true, email: true } }),
    prisma.hunterLink.findUnique({ where: { brandId_userId: { brandId, userId: a.userId } }, select: { code: true } }),
  ]);
  return {
    ...prospectMessages(brand),
    vars: { me: user.name ?? user.email, brand: brand.name, link: link ? `${origin}/i/${link.code}` : `${origin}/inscricao`, discountBps: brand.defaultDiscountBps, commissionBps: brand.defaultCommissionBps },
    canEdit: a.all,
  };
}

/** A Gestão edita as mensagens da marca. Texto vazio volta ao padrão. */
export async function saveProspectMessages(prisma: PrismaClient, actor: Actor | null, brandId: string, input: { first: string; proposal: string }) {
  if (!actor || !can(actor.grants, "creators.edit", brandId)) throw new ProspectError("Só a Gestão edita as mensagens.");
  const clean = (s: string) => s.replace(/\r\n/g, "\n").trim() || null;
  const first = clean(input.first);
  const proposal = clean(input.proposal);
  if ((first?.length ?? 0) > MAX_MESSAGE || (proposal?.length ?? 0) > MAX_MESSAGE) throw new ProspectError(`Cada mensagem com até ${MAX_MESSAGE} letras.`);
  const before = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { slug: true, prospectFirstMessage: true, prospectProposalMessage: true } });
  // Igual ao padrão: guarda null (continua acompanhando o padrão).
  const base = prospectMessages({ slug: before.slug, prospectFirstMessage: null, prospectProposalMessage: null });
  const data = { prospectFirstMessage: first === base.first ? null : first, prospectProposalMessage: proposal === base.proposal ? null : proposal };
  await prisma.$transaction([
    prisma.brand.update({ where: { id: brandId }, data }),
    prisma.auditLog.create({ data: { brandId, actorType: "USER", actorId: actor.userId, action: "brand.prospect_messages", entity: "Brand", entityId: brandId, before: { first: before.prospectFirstMessage, proposal: before.prospectProposalMessage }, after: data } }),
  ]);
}
