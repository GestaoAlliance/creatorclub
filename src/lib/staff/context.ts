import "server-only";
import { cookies } from "next/headers";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db";

/** Cookie da marca escolhida no painel da equipe (só muda a cor e a marca mostrada no topo). */
export const STAFF_BRAND_COOKIE = "cc_brand";

export type StaffBrand = { id: string; slug: string; name: string; primaryColor: string; secondaryColor: string | null };

/** Marcas da pessoa da equipe (todas para o super admin) e a escolhida (D-DESIGNALL: a cor segue a marca). */
export async function staffContext(actor: Actor) {
  const global = actor.grants.some((g) => g.brandId === null && g.role === "SUPER_ADMIN");
  const ids = [...new Set(actor.grants.map((g) => g.brandId).filter((b): b is string => b !== null))];
  const [brands, user] = await Promise.all([
    db().brand.findMany({
      where: global ? {} : { id: { in: ids } },
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, primaryColor: true, secondaryColor: true },
    }),
    db().user.findUnique({ where: { id: actor.userId }, select: { name: true } }),
  ]);
  const chosen = (await cookies()).get(STAFF_BRAND_COOKIE)?.value;
  const brand: StaffBrand | null = brands.find((b) => b.slug === chosen) ?? brands[0] ?? null;
  return { brands: brands as StaffBrand[], brand, firstName: (user?.name ?? "").split(" ")[0] || "equipe", isCreator: Object.keys(actor.creatorIds).length > 0 };
}
