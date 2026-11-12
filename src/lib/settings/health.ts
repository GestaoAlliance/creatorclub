import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";

/**
 * Faixa de saúde das Configurações (D-SETTINGSBOARD, pedido do responsável em 2026-11-12), da marca escolhida no topo:
 * o que falta na marca, a loja Shopify, a equipe, o termo e os contratos. Cada parte só para quem pode abrir a aba.
 * E o histórico de mudanças de cada aba, vindo da auditoria.
 */

const DAY = 86_400_000;

/** O que a marca precisa para funcionar inteira (mesma lista da tela Marcas). */
export function brandChecklist(b: {
  legalName: string | null;
  nfTakerDocument: string | null;
  storeUrl: string | null;
  whatsappInstance: string | null;
  financeEmail: string | null;
  bankConvenio: string | null;
  bankAccount: string | null;
  shipFrom: unknown;
  welcomeOneIds: string[];
  nfServiceCode: string | null;
  storeConnected: boolean;
  terms: number;
  contracts: number;
  logo: boolean;
}) {
  const zip = b.shipFrom && typeof b.shipFrom === "object" ? (b.shipFrom as Record<string, unknown>).zip : null;
  return [
    { id: "dados", label: "Dados da empresa e site", done: Boolean(b.legalName && b.nfTakerDocument && b.storeUrl) },
    { id: "loja", label: "Loja Shopify conectada", done: b.storeConnected },
    { id: "termo", label: "Termo publicado", done: b.terms > 0 },
    { id: "contratos", label: "Contratos publicados", done: b.contracts > 0 },
    { id: "nota", label: "Dados da nota fiscal", done: Boolean(b.nfServiceCode) },
    { id: "financeiro", label: "Financeiro e SICOOB", done: Boolean(b.financeEmail && b.bankConvenio && b.bankAccount) },
    { id: "envio", label: "Remetente das etiquetas", done: typeof zip === "string" && zip.length > 0 },
    { id: "kits", label: "Envio inicial (boas-vindas)", done: b.welcomeOneIds.length > 0 },
    { id: "whatsapp", label: "WhatsApp dos avisos", done: Boolean(b.whatsappInstance) },
    { id: "login", label: "Logo da tela de entrar", done: b.logo },
  ];
}

export async function settingsHealth(prisma: PrismaClient, actor: Actor, brandId: string, now = new Date()) {
  const admin = can(actor.grants, "staff.manage", brandId);
  const integrations = can(actor.grants, "integrations.manage", brandId);
  const [brand, store, failed, people, invites, terms, creators, contracts, waiting] = await Promise.all([
    prisma.brand.findUniqueOrThrow({
      where: { id: brandId },
      select: {
        name: true,
        legalName: true,
        nfTakerDocument: true,
        storeUrl: true,
        whatsappInstance: true,
        financeEmail: true,
        bankConvenio: true,
        bankAccount: true,
        shipFrom: true,
        welcomeOneIds: true,
        nfServiceCode: true,
        assets: { where: { kind: "LOGO" }, select: { kind: true } },
        _count: { select: { termsVersions: true, contractDocuments: true } },
      },
    }),
    prisma.brandIntegration.findFirst({ where: { brandId, kind: "SHOPIFY" }, select: { status: true, lastSyncAt: true, externalId: true } }),
    integrations ? prisma.job.count({ where: { brandId, status: "FAILED", finishedAt: { gte: new Date(now.getTime() - DAY) } } }) : Promise.resolve(0),
    admin ? prisma.user.count({ where: { disabledAt: null, roleGrants: { some: { OR: [{ brandId }, { brandId: null }] } } } }) : Promise.resolve(0),
    admin ? prisma.staffInvite.count({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: now }, OR: [{ brandId }, { extraBrandIds: { has: brandId } }] } }) : Promise.resolve(0),
    prisma.termsVersion.findFirst({ where: { brandId }, orderBy: { version: "desc" }, select: { id: true, version: true } }),
    prisma.creator.count({ where: { brandId, status: { not: "DEACTIVATED" } } }),
    prisma.contractDocument.groupBy({ by: ["kind"], where: { brandId } }),
    prisma.creator.count({ where: { brandId, awaitingContractAt: { not: null }, status: { not: "DEACTIVATED" } } }),
  ]);
  const termsAccepted = terms ? await prisma.termsAcceptance.count({ where: { termsVersionId: terms.id } }) : 0;
  const checklist = brandChecklist({
    ...brand,
    storeConnected: store?.status === "CONNECTED",
    terms: brand._count.termsVersions,
    contracts: brand._count.contractDocuments,
    logo: brand.assets.length > 0,
  });
  return {
    admin,
    integrations,
    checklist,
    shopify: { connected: store?.status === "CONNECTED", shop: store?.externalId ?? null, lastSyncAt: store?.lastSyncAt ?? null, failed24h: failed },
    team: { people, invites },
    terms: { version: terms?.version ?? null, accepted: termsAccepted, creators },
    contracts: { kinds: contracts.length, waiting },
  };
}

/** Prefixos de ação de cada aba (auditoria). */
export const HISTORY_ACTIONS = {
  marcas: ["brand."],
  equipe: ["invite.", "role.", "user.", "staff.", "password."],
  contratos: ["contract.published"],
  termo: ["terms.published"],
  sync: ["integration.", "sheet."],
  importar: ["import."],
} as const;

/** Últimas mudanças de uma aba, com o nome de quem fez. */
export async function recentChanges(prisma: PrismaClient, brandId: string | null, prefixes: readonly string[], take = 8) {
  const rows = await prisma.auditLog.findMany({
    where: { OR: prefixes.map((p) => ({ action: { startsWith: p } })), ...(brandId ? { AND: [{ OR: [{ brandId }, { brandId: null }] }] } : {}) },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, actorId: true, actorType: true, createdAt: true },
  });
  const ids = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => Boolean(x)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const name = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ id: r.id, action: r.action, at: r.createdAt, who: r.actorType === "SYSTEM" ? "Sistema" : (r.actorId && name.get(r.actorId)) || "—" }));
}
