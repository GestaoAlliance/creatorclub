/** Categoria da creator na lista Creators (D-CREATORCAT). Uma creator pode ter mais de uma. */
export type CreatorCategoryValue = "INFLUENCER" | "UGC" | "PRESCRITOR";

export const CREATOR_CATEGORIES: CreatorCategoryValue[] = ["INFLUENCER", "UGC", "PRESCRITOR"];
export const CREATOR_CATEGORY_LABEL: Record<CreatorCategoryValue, string> = { INFLUENCER: "Influencer", UGC: "UGC", PRESCRITOR: "Prescritor" };

/** Valor do seletor: "" = todas, uma categoria ou "NONE" (sem categoria). Valor desconhecido vira "todas". */
export type CategoryFilter = "" | CreatorCategoryValue | "NONE";

export function parseCategoryFilter(raw: string | undefined | null): CategoryFilter {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "NONE" || (CREATOR_CATEGORIES as string[]).includes(v)) return v as CategoryFilter;
  return "";
}

export function matchesCategory(categories: readonly string[], filter: CategoryFilter): boolean {
  if (filter === "") return true;
  if (filter === "NONE") return categories.length === 0;
  return categories.includes(filter);
}
