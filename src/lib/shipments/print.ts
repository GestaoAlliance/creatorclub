import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import type { Address, ShipmentAddress } from "./address";
import { ShipmentError } from "./shipments";

/**
 * Etiqueta e declaração de conteúdo dos Correios (D-LABEL): remetente = endereço de envio da marca (Marcas);
 * destinatário = endereço copiado no envio. Na declaração, cada produto vale o custo cadastrado (vazio sem custo).
 * Quem imprime: quem vê envios e o endereço (Envio, Gestão, super admin).
 */

export type PrintSender = { name: string; doc: string | null; address: (Address & { phone: string | null }) | null };

export type PrintShipment = {
  id: string;
  recipient: { name: string; doc: string | null; phone: string | null };
  address: ShipmentAddress;
  items: { title: string; quantity: number; unitCostCents: number | null }[];
  totalCents: number | null;
};

const MAX = 120;

export async function shipmentsToPrint(prisma: PrismaClient, actor: Actor | null, brandId: string, opts: { ids?: readonly string[]; preparing?: boolean }) {
  if (!actor || !can(actor.grants, "shipping.view", brandId) || !can(actor.grants, "personal.address", brandId)) throw new ShipmentError("Sem permissão para imprimir envios.");
  const ids = opts.ids?.filter(Boolean).slice(0, MAX) ?? [];
  if (!ids.length && !opts.preparing) return { sender: null, shipments: [] as PrintShipment[] };
  const [brand, rows] = await Promise.all([
    prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { name: true, legalName: true, nfTakerDocument: true, shipFrom: true } }),
    prisma.shipment.findMany({
      where: { brandId, ...(ids.length ? { id: { in: ids } } : { status: "PREPARING" }) },
      orderBy: { createdAt: "asc" },
      take: MAX,
      select: {
        id: true,
        address: true,
        creator: { select: { account: { select: { name: true, cpf: true, cnpj: true, phone: true } } } },
        items: { select: { title: true, quantity: true, product: { select: { costCents: true } } } },
      },
    }),
  ]);
  const ship = brand.shipFrom as (Address & { phone: string | null }) | null;
  const sender: PrintSender = { name: brand.legalName ?? brand.name, doc: brand.nfTakerDocument, address: ship && typeof ship === "object" && ship.zip ? ship : null };
  const shipments: PrintShipment[] = rows.map((r) => {
    const a = r.creator.account;
    const items = r.items.map((i) => ({ title: i.title, quantity: i.quantity, unitCostCents: i.product.costCents }));
    const priced = items.every((i) => i.unitCostCents !== null);
    return {
      id: r.id,
      recipient: { name: a.name, doc: a.cnpj ?? a.cpf, phone: a.phone },
      address: r.address as ShipmentAddress,
      items,
      totalCents: priced ? items.reduce((s, i) => s + i.quantity * (i.unitCostCents ?? 0), 0) : null,
    };
  });
  return { sender, shipments };
}
