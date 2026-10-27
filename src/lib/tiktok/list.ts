import type { PrismaClient } from "@/generated/prisma/client";
import { whatsappChatUrl } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith } from "@/lib/auth/permissions";

/**
 * Lista do TikTok (D-TIKTOKLIST, pedido da Vanessa: login da Mafe para ver quem tem TikTok). Candidatas ainda não
 * decididas e creators (não arquivadas nem desligadas) que informaram TikTok, nas marcas do acesso. Só leitura e só o
 * que serve para chamar: nome, @, TikTok Shop, WhatsApp, Instagram, nicho, seguidores, situação, marca, data e
 * cidade. Nada de vendas, saldo, CPF ou pagamentos.
 */

export type TikTokRow = {
  key: string;
  kind: "CANDIDATA" | "ATIVA" | "PAUSADA";
  name: string;
  tiktok: string;
  tiktokShop: boolean | null;
  instagram: string | null;
  phone: string | null;
  whatsapp: string | null;
  niche: string | null;
  followers: string | null;
  place: string | null;
  brand: { slug: string; name: string };
  since: Date;
};

const handle = (h: string | null) => (h ?? "").trim().replace(/^@+/, "") || null;

/** Na marca escolhida no topo (A1, D-ALLIANCE); só quem tem `tiktok.view` nela. */
export async function tiktokList(prisma: PrismaClient, actor: Actor | null, brandId: string): Promise<TikTokRow[]> {
  if (!actor) return [];
  const brands = brandsWith(actor.grants, "tiktok.view");
  if (brands !== "ALL" && !brands.includes(brandId)) return [];
  const inBrands = { brandId, brand: { archivedAt: null } };
  const [apps, creators] = await Promise.all([
    prisma.creatorApplication.findMany({
      where: { ...inBrands, status: "NEW", OR: [{ tiktok: { not: null } }, { account: { tiktok: { not: null } } }] },
      select: {
        id: true, fullName: true, tiktok: true, instagram: true, phone: true, niche: true, followers: true, submittedAt: true,
        brand: { select: { slug: true, name: true } },
        account: { select: { tiktok: true, tiktokShop: true, niches: true, addrCity: true, addrState: true } },
      },
    }),
    prisma.creator.findMany({
      where: { ...inBrands, archivedAt: null, status: { not: "DEACTIVATED" }, account: { tiktok: { not: null } } },
      select: {
        id: true, status: true, activatedAt: true, createdAt: true,
        brand: { select: { slug: true, name: true } },
        account: { select: { name: true, tiktok: true, tiktokShop: true, instagram: true, phone: true, niches: true, addrCity: true, addrState: true } },
      },
    }),
  ]);
  const followers = new Map(
    (await prisma.creatorApplication.findMany({ where: { creatorId: { in: creators.map((c) => c.id) } }, orderBy: { submittedAt: "asc" }, select: { creatorId: true, followers: true } })).map((a) => [a.creatorId!, a.followers]),
  );
  const place = (city: string | null, uf: string | null) => (uf ? (city ? `${city}/${uf}` : uf) : null);
  const rows: TikTokRow[] = [
    ...apps.flatMap((a): TikTokRow[] => {
      const tiktok = handle(a.account?.tiktok ?? a.tiktok);
      if (!tiktok) return [];
      return [{
        key: `a:${a.id}`, kind: "CANDIDATA", name: a.fullName, tiktok, tiktokShop: a.account?.tiktokShop ?? null, instagram: handle(a.instagram), phone: a.phone,
        whatsapp: whatsappChatUrl(a.phone), niche: a.account?.niches.length ? a.account.niches.join(", ") : a.niche, followers: a.followers,
        place: place(a.account?.addrCity ?? null, a.account?.addrState ?? null), brand: a.brand, since: a.submittedAt,
      }];
    }),
    ...creators.flatMap((c): TikTokRow[] => {
      const tiktok = handle(c.account.tiktok);
      if (!tiktok) return [];
      return [{
        key: `c:${c.id}`, kind: c.status === "ACTIVE" ? "ATIVA" : "PAUSADA", name: c.account.name, tiktok, tiktokShop: c.account.tiktokShop, instagram: handle(c.account.instagram),
        phone: c.account.phone, whatsapp: whatsappChatUrl(c.account.phone), niche: c.account.niches.join(", ") || null, followers: followers.get(c.id) ?? null,
        place: place(c.account.addrCity, c.account.addrState), brand: c.brand, since: c.activatedAt ?? c.createdAt,
      }];
    }),
  ];
  return rows.sort((a, b) => b.since.getTime() - a.since.getTime());
}
