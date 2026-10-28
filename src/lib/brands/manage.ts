import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith } from "@/lib/auth/permissions";
import { NF_SERVICE_CODE } from "@/domain";

/**
 * Marcas da Alliance (A1b, D-ALLIANCE): o super admin cadastra e edita nome, endereço (slug), cor, razão social e CNPJ
 * (tomador da nota fiscal das creators, D-NF), os dados para a creator emitir a nota (código e descrição do serviço e
 * observações, M1.3, D-NFDATA) e o site da loja (destino do link da creator, `/r/...`). As regras de comissão e saque nascem com o padrão das outras marcas.
 * Nada é apagado (D-ARCHIVE).
 */

export class BrandError extends Error {}

function requireSuperAdmin(actor: Actor | null): Actor {
  if (!actor || brandsWith(actor.grants, "staff.manage") !== "ALL") throw new BrandError("Só super admin.");
  return actor;
}

export type BrandInput = {
  name: string;
  slug?: string;
  primaryColor: string;
  legalName: string;
  cnpj: string;
  storeUrl?: string;
  nfServiceCode?: string;
  nfServiceDescription?: string;
  nfInstructions?: string;
  whatsappInstance?: string;
  /** M4.4a: comissão e desconto padrão das aprovações novas, em % (ex.: "15" ou "12,5"). */
  defaultRate?: string;
  defaultDiscount?: string;
  /** D-D4SIGN: produto sugerido na mensagem de aprovação; vazio = sem a linha da sugestão. */
  approvalSuggestion?: string;
  /** M5.1 (D-SHOPBALANCE): desconto da creator na loja com o saldo, em % ("0" a "90"). */
  shopDiscount?: string;
  /** D-NFMAIL: e-mail do financeiro (vazio = não envia). */
  financeEmail?: string;
  /** D-KITOPTIONS: ids dos produtos que a creator pode escolher no portal; nenhum = todos os ativos. */
  kitOptions?: string[];
};

/** "VermeFree Saúde" → "vermefree-saude". */
export function slugFrom(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function clean(input: BrandInput) {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (name.length < 2) throw new BrandError("Informe o nome da marca.");
  const color = input.primaryColor.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(color)) throw new BrandError("Cor no formato #RRGGBB (ex.: #0F766E).");
  const cnpj = input.cnpj.replace(/\D/g, "") || null;
  if (cnpj && cnpj.length !== 14) throw new BrandError("CNPJ precisa ter 14 números (ou deixe em branco por enquanto).");
  const legalName = input.legalName.trim().replace(/\s+/g, " ").slice(0, 160) || null;
  if (legalName && !/[A-Za-zÀ-ÿ]/.test(legalName)) throw new BrandError("Razão social é o nome da empresa (o CNPJ vai no campo ao lado).");
  const storeUrl = normalizeStoreUrl(input.storeUrl ?? "");
  const nfServiceCode = (input.nfServiceCode ?? "").replace(/\s/g, "") || null;
  if (nfServiceCode && !NF_SERVICE_CODE.test(nfServiceCode)) throw new BrandError("Código do serviço no formato 17.06 ou 17.06.01.");
  const nfServiceDescription = (input.nfServiceDescription ?? "").trim().replace(/\s+/g, " ").slice(0, 500) || null;
  const nfInstructions = (input.nfInstructions ?? "").trim().replace(/\n{3,}/g, "\n\n").slice(0, 1000) || null;
  const whatsappInstance = (input.whatsappInstance ?? "").trim().slice(0, 60) || null;
  if (whatsappInstance && !/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(whatsappInstance)) throw new BrandError("Instância do WhatsApp: use o nome exato da Evolution (letras, números, espaço, ponto, hífen).");
  // Campo da nota (e do WhatsApp) que não veio no formulário fica como está.
  const nf = {
    ...(input.nfServiceCode !== undefined && { nfServiceCode }),
    ...(input.nfServiceDescription !== undefined && { nfServiceDescription }),
    ...(input.nfInstructions !== undefined && { nfInstructions }),
    ...(input.whatsappInstance !== undefined && { whatsappInstance }),
    ...(input.approvalSuggestion !== undefined && { approvalSuggestion: input.approvalSuggestion.trim().replace(/\s+/g, " ").slice(0, 120) || null }),
    ...(input.financeEmail !== undefined && { financeEmail: financeEmailOf(input.financeEmail) }),
  };
  // M4.4a (D-BRANDLOGIN): padrões das aprovações novas (quem já é creator mantém a dela).
  const pct = (raw: string | undefined, label: string, max: number) => {
    if (raw === undefined) return undefined;
    const t = raw.trim().replace(",", ".").replace("%", "");
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) throw new BrandError(`${label}: informe a porcentagem (ex.: 15 ou 12,5).`);
    const bps = Math.round(Number(t) * 100);
    if (bps < 1 || bps > max) throw new BrandError(`${label}: entre 0,01% e ${max / 100}%.`);
    return bps;
  };
  const defaultCommissionBps = pct(input.defaultRate, "Comissão padrão", 5000);
  const defaultDiscountBps = pct(input.defaultDiscount, "Desconto padrão", 5000);
  let shopDiscountBps: number | undefined;
  if (input.shopDiscount !== undefined) {
    const t = input.shopDiscount.trim().replace(",", ".").replace("%", "") || "0";
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(t) || Number(t) > 90) throw new BrandError("Desconto da loja: de 0% a 90% (ex.: 0, 30 ou 12,5).");
    shopDiscountBps = Math.round(Number(t) * 100);
  }
  const defaults = {
    ...(shopDiscountBps !== undefined && { shopDiscountBps }),
    ...(defaultCommissionBps !== undefined && { defaultCommissionBps }),
    ...(defaultDiscountBps !== undefined && { defaultDiscountBps }),
  };
  return { name, primaryColor: color, nfTakerDocument: cnpj, legalName, storeUrl, ...nf, ...defaults };
}

/** D-NFMAIL: e-mail do financeiro, minúsculo; vazio = null. */
function financeEmailOf(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (t.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) throw new BrandError("E-mail do financeiro inválido.");
  return t;
}

/** "vermefree.com.br" → "https://vermefree.com.br" (sem barra no fim); vazio = sem site. */
export function normalizeStoreUrl(raw: string): string | null {
  const t = raw.trim().replace(/\/+$/, "");
  if (!t) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    throw new BrandError("Site da loja inválido (ex.: https://vermefree.com.br).");
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".") || url.search || url.hash) throw new BrandError("Site da loja inválido (ex.: https://vermefree.com.br).");
  return `https://${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
}

export async function createBrand(prisma: PrismaClient, actor: Actor | null, input: BrandInput) {
  const manager = requireSuperAdmin(actor);
  const data = clean(input);
  const slug = slugFrom(input.slug?.trim() || data.name);
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) throw new BrandError("Endereço inválido: só letras minúsculas, números e hífen.");
  if (await prisma.brand.findUnique({ where: { slug }, select: { id: true } })) throw new BrandError(`Já existe uma marca com o endereço "${slug}".`);
  return prisma.$transaction(async (tx) => {
    const brand = await tx.brand.create({ data: { ...data, slug } });
    await tx.auditLog.create({
      data: { brandId: brand.id, actorType: "USER", actorId: manager.userId, action: "brand.create", entity: "Brand", entityId: brand.id, after: { ...data, slug } },
    });
    return brand;
  });
}

export async function updateBrand(prisma: PrismaClient, actor: Actor | null, brandId: string, input: BrandInput) {
  const manager = requireSuperAdmin(actor);
  const before = await prisma.brand.findUnique({ where: { id: brandId }, select: { name: true, primaryColor: true, nfTakerDocument: true, legalName: true, storeUrl: true, nfServiceCode: true, nfServiceDescription: true, nfInstructions: true, whatsappInstance: true, approvalSuggestion: true, shopDiscountBps: true, financeEmail: true, defaultCommissionBps: true, defaultDiscountBps: true },
  });
  if (!before) throw new BrandError("Marca não encontrada.");
  const data = clean(input);
  await prisma.$transaction(async (tx) => {
    await tx.brand.update({ where: { id: brandId }, data });
    await tx.auditLog.create({ data: { brandId, actorType: "USER", actorId: manager.userId, action: "brand.update", entity: "Brand", entityId: brandId, before, after: data } });
    if (input.kitOptions) {
      const ids = input.kitOptions;
      await tx.product.updateMany({ where: { brandId, id: { in: ids } }, data: { kitOption: true } });
      await tx.product.updateMany({ where: { brandId, id: { notIn: ids }, kitOption: true }, data: { kitOption: false } });
      await tx.auditLog.create({ data: { brandId, actorType: "USER", actorId: manager.userId, action: "brand.kit_options", entity: "Brand", entityId: brandId, after: { productIds: ids } } });
    }
  });
}

/** Marcas com o que importa para começar: loja conectada, creators ativas, equipe e textos publicados. */
export async function brandList(prisma: PrismaClient, actor: Actor | null) {
  requireSuperAdmin(actor);
  const brands = await prisma.brand.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      primaryColor: true,
      secondaryColor: true,
      legalName: true,
      nfTakerDocument: true,
      nfServiceCode: true,
      nfServiceDescription: true,
      nfInstructions: true,
      whatsappInstance: true,
      approvalSuggestion: true,
      shopDiscountBps: true,
      financeEmail: true,
      products: { where: { active: true }, orderBy: { title: "asc" }, select: { id: true, title: true, kitOption: true } },
      storeUrl: true,
      defaultCommissionBps: true,
      defaultDiscountBps: true,
      assets: { select: { kind: true, sha256: true, sizeBytes: true } },
      createdAt: true,
      integrations: { where: { kind: "SHOPIFY" }, select: { status: true, externalId: true } },
      _count: { select: { roleGrants: true, termsVersions: true, contractDocuments: true, contractTemplates: true } },
    },
  });
  const active = await prisma.creator.groupBy({ by: ["brandId"], where: { status: "ACTIVE" }, _count: true });
  const activeBy = new Map(active.map((a) => [a.brandId, a._count]));
  return brands.map((b) => ({ ...b, store: b.integrations[0] ?? null, activeCreators: activeBy.get(b.id) ?? 0 }));
}
