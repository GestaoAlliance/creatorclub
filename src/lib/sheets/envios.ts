import type { PrismaClient } from "@/generated/prisma/client";
import { normHeader, notices, parseYesNo, sheetText } from "@/domain";
import { normalizeEmail } from "@/lib/auth/rules";
import { notify } from "@/lib/notifications/notify";
import { brandOf, findCreator, issue } from "./central";

/**
 * Planilha "Envios de pedidos" lida pelo sistema, só leitura (D-SHEETREADONLY, S2). Cada linha vira um envio na ficha
 * e no portal da creator: produtos em texto (nota), endereço em texto, "ENVIADO?" Sim com rastreio = Enviado, senão
 * Preparando. Se a equipe já criou o envio no sistema, a linha só completa o rastreio dele. Nunca mexe em envio
 * entregue ou cancelado; não conta como kit. Coluna "FRETE" (planilha da VermeFree, S4) vira o frete do envio (custo do
 * programa, D-COST). A primeira leitura traz o histórico sem avisar as creators; depois, envio
 * que passa a "Enviado" pela planilha avisa a creator como no sistema.
 */

const SHEET = "envios";
const ACTOR = "sheet:envios";

export type EnviosReadRow = { tab: string; row: number; values: Record<string, unknown> };
export type EnviosReadResult = { rows: number; matched: number; unmatched: number; created: number; shipped: number; baseline: boolean };

const COLUMNS: Record<string, "name" | "phone" | "cpf" | "email" | "address" | "products" | "sent" | "tracking" | "freight"> = {
  NOME: "name",
  "NOME COMPLETO": "name",
  TELEFONE: "phone",
  WHATSAPP: "phone",
  CPF: "cpf",
  "E-MAIL": "email",
  EMAIL: "email",
  ENDERECO: "address",
  PRODUTOS: "products",
  "ENVIADO?": "sent",
  ENVIADO: "sent",
  "CODIGO DE RASTREIO": "tracking",
  RASTREIO: "tracking",
  FRETE: "freight",
  "VALOR DO FRETE": "freight",
};

type Fields = Partial<Record<(typeof COLUMNS)[string], string>>;

function fieldsOf(values: Record<string, unknown>): Fields {
  const f: Fields = {};
  for (const [h, v] of Object.entries(values)) {
    const k = COLUMNS[normHeader(h)];
    if (k && f[k] === undefined) f[k] = sheetText(v, 500) ?? "";
  }
  return f;
}

/** CPF e e-mail às vezes vêm trocados de coluna: usa o que tiver cara de cada um. */
function idsOf(f: Fields) {
  const both = [f.cpf ?? "", f.email ?? ""];
  const email = both.map((v) => normalizeEmail(v)).find((v) => v && v.includes("@")) ?? null;
  const cpf = both.map((v) => v.replace(/\D/g, "")).find((d) => d.length === 11) ?? null;
  return { cpf, email };
}

const cleanTracking = (v: string | undefined) => (v ?? "").replace(/\s+/g, "").toUpperCase().slice(0, 60);
const carrierOf = (code: string) => (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(code) ? "Correios" : null);
/** "R$ 85,90" → 8590; vazio ou ilegível → null (frete não muda). */
export function freightCentsOf(v: string | undefined): number | null {
  const t = (v ?? "").replace(/R\$|\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([,.]\d{1,2})?$/.test(t)) return null;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
const noteOf = (products: string | undefined) => `Produtos: ${products?.trim() || "(sem produtos na planilha)"} · planilha de envios`.slice(0, 500);

export async function readEnvios(prisma: PrismaClient, slug: string, rows: EnviosReadRow[], now = new Date()): Promise<EnviosReadResult> {
  const brandId = await brandOf(prisma, slug);
  const sync = await prisma.sheetSync.findUnique({ where: { brandId_sheet: { brandId, sheet: SHEET } }, select: { snapshot: true } });
  const before = (sync?.snapshot ?? null) as Record<string, string> | null;
  const baseline = !before;
  const next: Record<string, string> = {};
  const result: EnviosReadResult = { rows: 0, matched: 0, unmatched: 0, created: 0, shipped: 0, baseline };

  for (const r of rows.slice(0, 2000)) {
    if (!Number.isInteger(r.row)) continue;
    const f = fieldsOf(r.values ?? {});
    const name = f.name?.trim();
    if (!name) continue;
    result.rows++;
    const { cpf, email } = idsOf(f);
    const creatorId = await findCreator(prisma, brandId, { cpf, email, name });
    if (!creatorId) {
      result.unmatched++;
      await issue(prisma, brandId, r.tab, r.row, `${name}: não achei a creator no sistema (CPF ou e-mail). O envio não foi lido.`, now, SHEET);
      continue;
    }
    result.matched++;
    const key = `${creatorId}|${r.tab}|${r.row}`;
    const tracking = cleanTracking(f.tracking);
    const sent = parseYesNo(f.sent) === true && !!tracking;
    const note = noteOf(f.products);
    const freightCents = freightCentsOf(f.freight);

    // Mesmo envio de antes: pela linha; senão pelo rastreio; senão um envio da equipe ainda sem rastreio.
    let shipment = before?.[key] ? await prisma.shipment.findFirst({ where: { id: before[key], creatorId } }) : null;
    if (!shipment && tracking) shipment = await prisma.shipment.findFirst({ where: { creatorId, trackingCode: tracking } });
    if (!shipment && sent)
      shipment = await prisma.shipment.findFirst({ where: { creatorId, status: "PREPARING", trackingCode: null, createdById: { not: ACTOR } }, orderBy: { createdAt: "desc" } });

    if (!shipment) {
      const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId }, select: { status: true } });
      if (creator.status === "DEACTIVATED") {
        await issue(prisma, brandId, r.tab, r.row, `${name}: creator desligada no sistema; o envio não foi criado.`, now, SHEET);
        continue;
      }
      const created = await prisma.$transaction(async (tx) => {
        const s = await tx.shipment.create({
          data: {
            brandId,
            creatorId,
            note,
            address: { raw: f.address?.trim() || "(sem endereço na planilha)" },
            createdById: ACTOR,
            ...(freightCents !== null ? { freightCents } : {}),
            ...(sent ? { status: "SHIPPED" as const, carrier: carrierOf(tracking), trackingCode: tracking, shippedAt: now, shippedById: ACTOR } : {}),
          },
        });
        await tx.auditLog.create({ data: { brandId, actorType: "SYSTEM", actorId: ACTOR, action: "sheet.shipment", entity: "Shipment", entityId: s.id, after: { tab: r.tab, row: r.row, sent } } });
        if (sent && !baseline) await notify(tx, [{ brandId, creatorId, notice: notices.shipped(s.id, carrierOf(tracking) ?? "", tracking) }]);
        return s;
      });
      result.created++;
      if (sent) result.shipped++;
      next[key] = created.id;
      continue;
    }

    next[key] = shipment.id;
    const ours = shipment.createdById === ACTOR;
    if (shipment.status === "PREPARING" && sent) {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.shipment.updateMany({
          where: { id: shipment.id, status: "PREPARING" },
          data: { status: "SHIPPED", carrier: carrierOf(tracking), trackingCode: tracking, shippedAt: now, shippedById: ACTOR, ...(ours ? { note } : {}) },
        });
        if (!count) return;
        await tx.auditLog.create({ data: { brandId, actorType: "SYSTEM", actorId: ACTOR, action: "shipment.shipped", entity: "Shipment", entityId: shipment.id, after: { trackingCode: tracking, tab: r.tab, row: r.row } } });
        if (!baseline) await notify(tx, [{ brandId, creatorId, notice: notices.shipped(shipment.id, carrierOf(tracking) ?? "", tracking) }]);
      });
      result.shipped++;
    } else if (ours && (shipment.note !== note || (shipment.status === "SHIPPED" && tracking && shipment.trackingCode !== tracking))) {
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: { note, ...(shipment.status === "SHIPPED" && tracking ? { trackingCode: tracking, carrier: carrierOf(tracking) } : {}) },
      });
    }
    // Frete da planilha: completa o envio que ainda não tem (nunca troca o que a equipe pôs no sistema).
    if (freightCents !== null && shipment.freightCents === null) await prisma.shipment.update({ where: { id: shipment.id }, data: { freightCents } });
  }

  await prisma.sheetSync.upsert({
    where: { brandId_sheet: { brandId, sheet: SHEET } },
    create: { brandId, sheet: SHEET, lastPushAt: now, snapshot: next },
    update: { lastPushAt: now, snapshot: next },
  });
  return result;
}
