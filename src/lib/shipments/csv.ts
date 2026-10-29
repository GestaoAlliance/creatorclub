import type { PrismaClient } from "@/generated/prisma/client";
import { shipmentKind, type ShipmentCsvRow } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import type { ShipmentAddress } from "./address";
import { ShipmentError, type ShipmentStatusValue } from "./shipments";

/**
 * Planilha dos envios (D-SHIPCSV): o filtro da tela (situação) e o período pela data do pedido (dias de São Paulo).
 * Só quem vê envios e o endereço (Envio, Gestão, super admin): tem CPF, telefone e endereço.
 */
const MAX = 5000;

export async function shipmentsForCsv(
  prisma: PrismaClient,
  actor: Actor | null,
  brandId: string,
  opts: { status?: ShipmentStatusValue | undefined; from?: string | undefined; to?: string | undefined } = {},
): Promise<ShipmentCsvRow[]> {
  if (!actor || !can(actor.grants, "shipping.view", brandId) || !can(actor.grants, "personal.address", brandId)) throw new ShipmentError("Sem permissão para baixar os envios.");
  const ok = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const from = ok(opts.from);
  const to = ok(opts.to);
  // São Paulo está em UTC-3 o ano todo.
  const createdAt = {
    ...(from ? { gte: new Date(`${from}T03:00:00Z`) } : {}),
    ...(to ? { lt: new Date(new Date(`${to}T03:00:00Z`).getTime() + 86_400_000) } : {}),
  };
  const rows = await prisma.shipment.findMany({
    where: { brandId, ...(opts.status ? { status: opts.status } : {}), ...(from || to ? { createdAt } : {}) },
    orderBy: { createdAt: "desc" },
    take: MAX,
    select: {
      createdAt: true, status: true, address: true, freightCents: true, carrier: true, trackingCode: true, shippedAt: true, deliveredAt: true, balanceCents: true,
      kit: { select: { kind: true } },
      creator: { select: { account: { select: { name: true, instagram: true, cpf: true, cnpj: true, phone: true, email: true } } } },
      items: { orderBy: { title: "asc" }, select: { title: true, quantity: true, product: { select: { costCents: true } } } },
    },
  });
  return rows.map((r) => {
    const a = r.creator.account;
    return {
      createdAt: r.createdAt,
      status: r.status,
      kind: shipmentKind(r.kit?.kind ?? null, r.balanceCents),
      creator: a.name,
      instagram: a.instagram,
      doc: a.cnpj ?? a.cpf,
      phone: a.phone,
      email: a.email,
      address: (r.address as ShipmentAddress | null) ?? null,
      items: r.items.map((i) => ({ title: i.title, quantity: i.quantity, unitCostCents: i.product.costCents })),
      freightCents: r.freightCents,
      carrier: r.carrier,
      trackingCode: r.trackingCode,
      shippedAt: r.shippedAt,
      deliveredAt: r.deliveredAt,
    };
  });
}
