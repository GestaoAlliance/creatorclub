import type { PrismaClient } from "@/generated/prisma/client";
import { enqueueJob, type JobHandlers } from "@/lib/jobs/queue";
import { markShippedFromOlist } from "@/lib/shipments/shipments";
import { olistCallRaw, olistToken, OlistError, type OlistFetcher } from "./client";

/**
 * D-OLISTORDER (Olist parte 2; respostas do Álvaro em 2026-11-05): o pedido da creator aprovado pela Gestão vira pedido
 * no Olist ERP da marca, já "aprovado", com a natureza de operação da marca (Botanika: remessa em bonificação, doação
 * ou brinde), os produtos pelo SKU a preço de custo e o frete por conta da empresa. O Álvaro só emite a nota e a
 * etiqueta no Olist (forma de envio escolhida lá; Correios Log+). A cada 30 minutos o sistema lê os pedidos em aberto:
 * com código de rastreio, o envio vira "Enviado" e a creator recebe o aviso com o link.
 */

export const OLIST_ORDER_JOB = "olist.order";
export const OLIST_TRACK_JOB = "olist.track";
const SLOT = 30 * 60_000;
const MAX_TRACK = 40;

/** Número do pedido do Creator Club no Olist (campo "número do pedido no e-commerce"): evita pedido repetido. */
export const olistRef = (shipmentId: string) => `CC-${shipmentId.slice(0, 8).toUpperCase()}`;

const money = (cents: number) => (cents / 100).toFixed(2);
const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const ddmmyyyy = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

export type OlistOrderInput = {
  ref: string;
  date: Date;
  natureId: string;
  person: { name: string; company: boolean; document: string; email: string | null; phone: string | null };
  address: { zip: string; street: string; number: string; complement: string | null; district: string; city: string; state: string };
  items: { sku: string; title: string; quantity: number; costCents: number }[];
  note: string;
};

/** Monta o JSON do `pedido.incluir` (documentação da API v2 do Olist: "Incluir Pedido"). */
export function buildOlistOrder(o: OlistOrderInput) {
  return {
    pedido: {
      numero_pedido_ecommerce: o.ref,
      data_pedido: ddmmyyyy(o.date),
      situacao: "aprovado",
      id_natureza_operacao: o.natureId,
      cliente: {
        nome: o.person.name,
        tipo_pessoa: o.person.company ? "J" : "F",
        cpf_cnpj: o.person.document,
        endereco: o.address.street,
        numero: o.address.number,
        ...(o.address.complement ? { complemento: o.address.complement } : {}),
        bairro: o.address.district,
        cep: o.address.zip,
        cidade: o.address.city,
        uf: o.address.state,
        ...(o.person.phone ? { fone: o.person.phone } : {}),
        ...(o.person.email ? { email: o.person.email } : {}),
      },
      itens: o.items.map((i) => ({ item: { codigo: i.sku, descricao: i.title.slice(0, 120), unidade: "UN", quantidade: String(i.quantity), valor_unitario: money(i.costCents) } })),
      frete_por_conta: "R",
      marcadores: [{ marcador: { descricao: "Creator Club" } }],
      obs: o.note.slice(0, 100),
    },
  };
}

type Registro = { status?: string; id?: string | number; numero?: string | number; erros?: { erro?: string }[] };
const firstRegistro = (r: Record<string, unknown>) => ((r.registros as { registro?: Registro }[] | undefined) ?? [])[0]?.registro ?? null;
const errorsOf = (r: { erros?: { erro?: string }[] }, reg: Registro | null) =>
  [...(reg?.erros ?? []), ...(r.erros ?? [])].map((e) => e.erro).filter(Boolean).join("; ") || "erro sem mensagem";

async function failWith(prisma: PrismaClient, shipmentId: string, message: string) {
  await prisma.shipment.update({ where: { id: shipmentId }, data: { olistError: message.slice(0, 300) } });
  return { ok: false as const, error: message };
}

/**
 * Cria o pedido no Olist (uma vez por envio). Dado que falta (SKU, custo, CPF/CNPJ, endereço) ou recusa do Olist fica
 * no envio (`olistError`) para a equipe ver; falha de rede sobe para a fila tentar de novo.
 */
export async function sendOlistOrder(prisma: PrismaClient, shipmentId: string, deps: { token?: string | null; fetcher?: OlistFetcher; now?: Date } = {}) {
  const s = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true, brandId: true, creatorId: true, status: true, note: true, address: true, olistOrderId: true, approvedAt: true,
      brand: { select: { slug: true, olistNatureId: true } },
      items: { select: { title: true, quantity: true, product: { select: { sku: true, costCents: true } } } },
      creator: { select: { receivesAsIndividual: true, account: { select: { name: true, email: true, phone: true, cpf: true, cnpj: true } } } },
    },
  });
  if (!s || s.olistOrderId || s.status !== "PREPARING" || !s.approvedAt) return { ok: false as const, error: "skip" };
  const token = deps.token === undefined ? olistToken(s.brand.slug) : deps.token;
  if (!token || !s.brand.olistNatureId) return { ok: false as const, error: "skip" };

  const missingSku = s.items.find((i) => !i.product?.sku);
  if (missingSku) return failWith(prisma, s.id, `${missingSku.title}: produto sem SKU (código) na Shopify.`);
  const missingCost = s.items.find((i) => i.product?.costCents == null);
  if (missingCost) return failWith(prisma, s.id, `${missingCost.title}: produto sem custo cadastrado.`);
  const a = s.address as Partial<OlistOrderInput["address"]> & { raw?: string };
  if (!a.zip || !a.street || !a.city || !a.state) return failWith(prisma, s.id, "Endereço do envio incompleto.");
  const acc = s.creator.account;
  // Destinatário (resposta do responsável): empresa sai com a razão social e o CNPJ; pessoa física, com o CPF.
  const company = !s.creator.receivesAsIndividual && digits(acc.cnpj).length === 14;
  const document = company ? digits(acc.cnpj) : digits(acc.cpf);
  if (document.length !== (company ? 14 : 11)) return failWith(prisma, s.id, company ? "CNPJ do cadastro inválido." : "CPF do cadastro ausente ou inválido.");
  const app = company ? await prisma.creatorApplication.findFirst({ where: { creatorId: s.creatorId }, orderBy: { submittedAt: "desc" }, select: { companyName: true } }) : null;
  const ref = olistRef(s.id);
  const order = buildOlistOrder({
    ref,
    date: deps.now ?? new Date(),
    natureId: s.brand.olistNatureId,
    person: { name: (company && app?.companyName?.trim()) || acc.name, company, document, email: acc.email, phone: acc.phone },
    address: { zip: a.zip, street: a.street, number: a.number ?? "S/N", complement: a.complement ?? null, district: a.district ?? "", city: a.city, state: a.state },
    items: s.items.map((i) => ({ sku: i.product!.sku!, title: i.title, quantity: i.quantity, costCents: i.product!.costCents! })),
    note: `Creator Club ${ref}: ${s.note ?? "pedido da creator"} (${acc.name})`,
  });

  const r = await olistCallRaw(token, "pedido.incluir", { pedido: JSON.stringify(order) }, deps.fetcher);
  const reg = firstRegistro(r);
  let id = reg?.status === "OK" && reg.id ? String(reg.id) : null;
  let numero = id && reg?.numero != null ? String(reg.numero) : null;
  if (!id) {
    const msg = errorsOf(r as { erros?: { erro?: string }[] }, reg);
    // Já criado antes (a fila repetiu): acha o pedido pelo número do Creator Club.
    if (!/j[áa] existe/i.test(msg)) return failWith(prisma, s.id, `Olist recusou: ${msg}`);
    const found = await olistCallRaw(token, "pedidos.pesquisa", { numeroEcommerce: ref }, deps.fetcher);
    const hit = ((found.pedidos as { pedido?: { id?: string | number; numero?: string | number } }[] | undefined) ?? [])[0]?.pedido;
    if (!hit?.id) return failWith(prisma, s.id, `Olist diz que o pedido ${ref} já existe, mas não o encontrei.`);
    id = String(hit.id);
    numero = hit.numero != null ? String(hit.numero) : null;
  }
  const now = deps.now ?? new Date();
  await prisma.$transaction([
    prisma.shipment.update({ where: { id: s.id }, data: { olistOrderId: id, olistOrderNumber: numero, olistSentAt: now, olistError: null } }),
    prisma.auditLog.create({ data: { brandId: s.brandId, actorType: "SYSTEM", actorId: "system:olist", action: "shipment.olist_order", entity: "Shipment", entityId: s.id, after: { olistOrderId: id, numero, ref } } }),
  ]);
  return { ok: true as const, id, numero };
}

/** Na aprovação: agenda o pedido no Olist quando a marca tem o Olist ligado (token e natureza de operação). */
export async function enqueueOlistOrder(tx: Parameters<typeof enqueueJob>[0], shipment: { id: string; brandId: string; brandSlug: string; olistNatureId: string | null }, env: Record<string, string | undefined> = process.env) {
  if (!shipment.olistNatureId || !olistToken(shipment.brandSlug, env)) return false;
  return enqueueJob(tx, { type: OLIST_ORDER_JOB, brandId: shipment.brandId, payload: { shipmentId: shipment.id }, dedupeKey: `olist-order:${shipment.id}`, maxAttempts: 5 });
}

/** Lê os pedidos em aberto no Olist: com rastreio, o envio vira "Enviado" (aviso à creator com o link). */
export async function trackOlistOrders(prisma: PrismaClient, brandId: string, deps: { token?: string | null; fetcher?: OlistFetcher; now?: Date } = {}) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { slug: true } });
  const token = deps.token === undefined ? olistToken(brand.slug) : deps.token;
  if (!token) return { checked: 0, shipped: 0 };
  const open = await prisma.shipment.findMany({ where: { brandId, status: "PREPARING", olistOrderId: { not: null } }, orderBy: { olistSentAt: "asc" }, take: MAX_TRACK, select: { id: true, olistOrderId: true } });
  let shipped = 0;
  for (const s of open) {
    try {
      const r = await olistCallRaw(token, "pedido.obter", { id: s.olistOrderId! }, deps.fetcher);
      const p = r.pedido as { situacao?: string; codigo_rastreamento?: string; nome_transportador?: string } | undefined;
      if (!p) continue;
      const code = (p.codigo_rastreamento ?? "").trim();
      if (code) {
        await markShippedFromOlist(prisma, { shipmentId: s.id, carrier: (p.nome_transportador ?? "").trim() || "Correios", trackingCode: code }, deps.now);
        shipped++;
      } else if ((p.situacao ?? "").toLowerCase().startsWith("cancel")) {
        await prisma.shipment.update({ where: { id: s.id }, data: { olistError: "Pedido cancelado no Olist." } });
      }
    } catch (error) {
      if (!(error instanceof OlistError)) throw error;
      await prisma.shipment.update({ where: { id: s.id }, data: { olistError: error.message.slice(0, 300) } });
    }
  }
  return { checked: open.length, shipped };
}

/** Agenda a leitura dos rastreios das marcas com Olist ligado, uma a cada 30 minutos. */
export async function enqueueDueOlistTracking(prisma: PrismaClient, now = new Date(), env: Record<string, string | undefined> = process.env): Promise<number> {
  if (!env.OLIST_TOKENS) return 0;
  const brands = await prisma.brand.findMany({ where: { archivedAt: null, olistNatureId: { not: null } }, select: { id: true, slug: true } });
  let n = 0;
  for (const b of brands) {
    if (!olistToken(b.slug, env)) continue;
    if (!(await prisma.shipment.count({ where: { brandId: b.id, status: "PREPARING", olistOrderId: { not: null } } }))) continue;
    if (await enqueueJob(prisma, { type: OLIST_TRACK_JOB, brandId: b.id, dedupeKey: `olist-track:${b.id}:${Math.floor(now.getTime() / SLOT)}`, runAt: now, maxAttempts: 1 })) n++;
  }
  return n;
}

export function olistOrderHandlers(prisma: PrismaClient): JobHandlers {
  return {
    [OLIST_ORDER_JOB]: async (job) => {
      const id = (job.payload as { shipmentId?: string } | null)?.shipmentId;
      if (id) await sendOlistOrder(prisma, id);
    },
    [OLIST_TRACK_JOB]: async (job) => {
      if (!job.brandId) throw new Error("Tarefa sem marca.");
      await trackOlistOrders(prisma, job.brandId);
    },
  };
}
