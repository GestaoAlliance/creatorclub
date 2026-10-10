import type { PrismaClient } from "@/generated/prisma/client";
import { formUrlFor, isHunterForm, isValidFormTemplate, isValidHunterCode, normalizeHunterCode, type HunterForm } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith, can } from "@/lib/auth/permissions";
import { hashIp } from "@/lib/links/tracked";

/**
 * Links dos hunters (D-HUNTERLINK). Hunter é quem tem o papel Hunter na equipe (convite em /admin/equipe). Quem
 * edita creators (Gestão, super admin) cria o código de cada hunter e cola os links pré-preenchidos dos formulários.
 * O clique no link é contado (IP só como hash do dia) e a candidata que responde chega marcada com o hunter.
 */

export class HunterError extends Error {}

const DAY = 86_400_000;

function assertEdit(actor: Actor | null, brandId: string): asserts actor is Actor {
  if (!actor || !can(actor.grants, "creators.edit", brandId)) throw new HunterError("Sem permissão.");
}

/** Hunters de cada marca que a pessoa edita, com código, links, cliques e candidatas. */
export async function hunterPanel(prisma: PrismaClient, actor: Actor | null, now = new Date()) {
  if (!actor) throw new HunterError("Sem permissão.");
  const allowed = brandsWith(actor.grants, "creators.edit");
  if (allowed !== "ALL" && allowed.length === 0) throw new HunterError("Sem permissão.");
  const brands = await prisma.brand.findMany({
    where: { archivedAt: null, ...(allowed === "ALL" ? {} : { id: { in: allowed } }) },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, formLinks: { select: { form: true, urlTemplate: true } } },
  });
  const grants = await prisma.roleGrant.findMany({
    where: { role: "HUNTER", user: { disabledAt: null } },
    select: { brandId: true, user: { select: { id: true, name: true, email: true } } },
  });
  const links = await prisma.hunterLink.findMany({
    where: { brandId: { in: brands.map((b) => b.id) } },
    select: {
      id: true,
      brandId: true,
      userId: true,
      code: true,
      _count: { select: { clicks: true } },
      applications: { select: { status: true } },
    },
  });
  const recent = await prisma.hunterClick.groupBy({
    by: ["hunterLinkId"],
    where: { hunterLinkId: { in: links.map((l) => l.id) }, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } },
    _count: true,
  });
  const recentBy = new Map(recent.map((r) => [r.hunterLinkId, r._count]));
  return brands.map((b) => {
    const users = new Map(grants.filter((g) => g.brandId === null || g.brandId === b.id).map((g) => [g.user.id, g.user]));
    const hunters = [...users.values()]
      .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"))
      .map((u) => {
        const l = links.find((x) => x.brandId === b.id && x.userId === u.id);
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          link: l
            ? {
                code: l.code,
                clicks: l._count.clicks,
                clicks30: recentBy.get(l.id) ?? 0,
                applications: l.applications.length,
                approved: l.applications.filter((a) => a.status === "APPROVED").length,
              }
            : null,
        };
      });
    const template = (form: HunterForm) => b.formLinks.find((f) => f.form === form)?.urlTemplate ?? null;
    return { id: b.id, slug: b.slug, name: b.name, forms: { hunter: template("hunter"), captacao: template("captacao") }, hunters };
  });
}

export async function createHunterLink(prisma: PrismaClient, actor: Actor | null, input: { brandId: string; userId: string; code: string }) {
  assertEdit(actor, input.brandId);
  const code = normalizeHunterCode(input.code);
  if (!isValidHunterCode(code)) throw new HunterError("O código precisa ter de 2 a 20 letras ou números.");
  const grant = await prisma.roleGrant.findFirst({
    where: { userId: input.userId, role: "HUNTER", OR: [{ brandId: input.brandId }, { brandId: null }], user: { disabledAt: null } },
    select: { id: true },
  });
  if (!grant) throw new HunterError("Esta pessoa não é hunter desta marca.");
  try {
    const link = await prisma.hunterLink.create({ data: { brandId: input.brandId, userId: input.userId, code } });
    await prisma.auditLog.create({
      data: { brandId: input.brandId, actorType: "USER", actorId: actor.userId, action: "hunter.link", entity: "HunterLink", entityId: link.id, after: { code, userId: input.userId } },
    });
    return link;
  } catch (error) {
    if (String(error).includes("Unique constraint")) throw new HunterError("Este código já é de outro hunter (ou o hunter já tem link).");
    throw error;
  }
}

export async function setFormLink(prisma: PrismaClient, actor: Actor | null, input: { brandId: string; form: string; url: string }) {
  assertEdit(actor, input.brandId);
  if (!isHunterForm(input.form)) throw new HunterError("Formulário inválido.");
  const url = input.url.trim();
  if (!isValidFormTemplate(url))
    throw new HunterError("Cole o link pré-preenchido do Google Forms com a palavra CODIGO na resposta de \"Código de quem te convidou\".");
  const row = await prisma.formLink.upsert({
    where: { brandId_form: { brandId: input.brandId, form: input.form } },
    create: { brandId: input.brandId, form: input.form, urlTemplate: url, updatedById: actor.userId },
    update: { urlTemplate: url, updatedById: actor.userId },
  });
  await prisma.auditLog.create({
    data: { brandId: input.brandId, actorType: "USER", actorId: actor.userId, action: "form.link", entity: "FormLink", entityId: row.id, after: { form: input.form } },
  });
}

/** Destino do link do hunter. Código desconhecido: abre o formulário sem código (o link nunca quebra), sem contar clique. */
export async function resolveHunterLink(prisma: PrismaClient, brandSlug: string, form: string, rawCode: string) {
  if (!isHunterForm(form)) return null;
  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug.toLowerCase() }, select: { id: true, archivedAt: true } });
  if (!brand || brand.archivedAt) return null;
  const template = await prisma.formLink.findUnique({ where: { brandId_form: { brandId: brand.id, form } }, select: { urlTemplate: true } });
  if (!template) return null;
  const code = normalizeHunterCode(decodeURIComponent(rawCode));
  const link = code ? await prisma.hunterLink.findUnique({ where: { brandId_code: { brandId: brand.id, code } }, select: { id: true } }) : null;
  return {
    url: formUrlFor(template.urlTemplate, link ? code : null),
    click: link ? { brandId: brand.id, hunterLinkId: link.id, form } : null,
  };
}

export async function recordHunterClick(
  prisma: PrismaClient,
  click: { brandId: string; hunterLinkId: string; form: string },
  req: { ip: string | null; userAgent: string | null },
  now = new Date(),
) {
  await prisma.hunterClick.create({
    data: { ...click, ipHash: hashIp(req.ip, click.brandId, now), userAgent: req.userAgent?.slice(0, 300) ?? null, createdAt: now },
  });
}

/** Hunter da candidata pelo código que veio no formulário (null se vazio ou desconhecido). */
export async function hunterLinkIdFor(prisma: PrismaClient, brandId: string, rawCode: string | null): Promise<string | null> {
  const code = normalizeHunterCode(rawCode);
  if (!code) return null;
  const link = await prisma.hunterLink.findUnique({ where: { brandId_code: { brandId, code } }, select: { id: true } });
  return link?.id ?? null;
}
