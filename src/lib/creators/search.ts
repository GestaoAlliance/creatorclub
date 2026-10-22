import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { brandsWith } from "@/lib/auth/permissions";

/**
 * Busca de creator no painel inteiro (M0.5, D-SEARCH): de qualquer tela, em todas as marcas em que a pessoa vê
 * creators. Procura pelo nome, cupom, @ do Instagram ou do TikTok e e-mail; pelo CPF só nas marcas em que ela vê dado
 * fiscal. Devolve o mínimo para escolher e abrir a ficha (sem CPF, telefone ou dinheiro).
 */

export type CreatorHit = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "DEACTIVATED";
  brand: { slug: string; name: string; primaryColor: string };
  coupon: string | null;
  instagram: string | null;
  tiktok: string | null;
};

const LIMIT = 12;
const ORDER = { ACTIVE: 0, INACTIVE: 1, DEACTIVATED: 2 } as const;

export async function searchCreators(prisma: PrismaClient, actor: Actor | null, raw: string): Promise<CreatorHit[]> {
  if (!actor) return [];
  const q = raw.trim().replace(/^@+/, "").slice(0, 60);
  if (q.length < 2) return [];
  const view = brandsWith(actor.grants, "creators.view");
  if (view !== "ALL" && view.length === 0) return [];
  const fiscal = brandsWith(actor.grants, "personal.fiscal");
  const inBrands = (b: "ALL" | string[]): Prisma.CreatorWhereInput => (b === "ALL" ? {} : { brandId: { in: b } });
  const text = { contains: q, mode: "insensitive" as const };
  const digits = q.replace(/\D/g, "");

  const or: Prisma.CreatorWhereInput[] = [
    { account: { name: text } },
    { account: { email: text } },
    { account: { instagram: text } },
    { account: { tiktok: text } },
    { couponAssignments: { some: { coupon: { code: { contains: q.toUpperCase() } } } } },
  ];
  // CPF só onde a pessoa vê dado fiscal (Gestão, super admin), e com pelo menos 6 números para não achar por acaso.
  if (digits.length >= 6 && digits.length === q.replace(/[.\-\s]/g, "").length && (fiscal === "ALL" || fiscal.length > 0))
    or.push({ AND: [inBrands(fiscal), { account: { cpf: { contains: digits } } }] });

  const rows = await prisma.creator.findMany({
    where: { ...inBrands(view), brand: { archivedAt: null }, OR: or },
    take: 40,
    select: {
      id: true,
      status: true,
      brand: { select: { slug: true, name: true, primaryColor: true } },
      account: { select: { name: true, instagram: true, tiktok: true } },
      couponAssignments: { where: { validTo: null }, orderBy: { validFrom: "desc" }, take: 1, select: { coupon: { select: { code: true } } } },
    },
  });
  return rows
    .map((c) => ({
      id: c.id,
      name: c.account.name,
      status: c.status,
      brand: c.brand,
      coupon: c.couponAssignments[0]?.coupon.code ?? null,
      instagram: c.account.instagram,
      tiktok: c.account.tiktok,
    }))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, LIMIT);
}
