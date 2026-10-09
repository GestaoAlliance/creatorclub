import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { dayKey } from "@/domain";

/**
 * Link rastreado `/r/[marca]/[código]` (D-LINK, mesma rota do app antigo): registra o clique e leva à loja com o
 * cupom aplicado (`/discount/<CÓDIGO>?redirect=<caminho>`). Código desconhecido, promocional ou de creator
 * desligada: leva à página inicial da loja, sem cupom e sem registrar clique (o link da bio nunca quebra).
 * O IP nunca é gravado: só um hash que muda a cada dia (dá para contar visitas, não para identificar pessoas).
 */

export type TrackedTarget = { url: string; click: { brandId: string; couponId: string } | null };

/** Só caminhos da própria loja (começa com "/" e não com "//"), para não virar redirecionamento aberto. */
export function safeStorePath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export function discountUrl(storeUrl: string, code: string, path = "/"): string {
  const base = storeUrl.replace(/\/+$/, "");
  return `${base}/discount/${encodeURIComponent(code)}?redirect=${encodeURIComponent(path)}`;
}

export function hashIp(ip: string | null, brandId: string, now: Date): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${ip}|${brandId}|${dayKey(now)}`).digest("hex").slice(0, 32);
}

export async function resolveTrackedLink(prisma: PrismaClient, brandSlug: string, rawCode: string, path: string, now = new Date()): Promise<TrackedTarget | null> {
  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug.toLowerCase() }, select: { id: true, storeUrl: true } });
  if (!brand?.storeUrl) return null;
  const code = decodeURIComponent(rawCode).trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({
    where: { brandId_code: { brandId: brand.id, code } },
    select: {
      id: true,
      kind: true,
      code: true,
      assignments: {
        where: { validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
        select: { creator: { select: { status: true } } },
        take: 1,
      },
    },
  });
  const owner = coupon?.assignments[0]?.creator;
  if (!coupon || coupon.kind !== "CREATOR" || !owner || owner.status === "DEACTIVATED") {
    return { url: `${brand.storeUrl.replace(/\/+$/, "")}${path}`, click: null };
  }
  return { url: discountUrl(brand.storeUrl, coupon.code, path), click: { brandId: brand.id, couponId: coupon.id } };
}

export async function recordClick(
  prisma: PrismaClient,
  click: { brandId: string; couponId: string },
  req: { ip: string | null; userAgent: string | null; referrer: string | null; landing: string },
  now = new Date(),
) {
  await prisma.click.create({
    data: {
      brandId: click.brandId,
      couponId: click.couponId,
      ipHash: hashIp(req.ip, click.brandId, now),
      userAgent: req.userAgent?.slice(0, 300) ?? null,
      referrer: req.referrer?.slice(0, 500) ?? null,
      landing: req.landing.slice(0, 500),
      createdAt: now,
    },
  });
}
