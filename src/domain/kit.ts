/**
 * Kit mensal do contrato (D-KIT). Cada modelo de contrato tem faixas de vendas do mês que dão N suplementos.
 * Vale a faixa mais alta que a venda do mês alcança (`fromCents` ≤ vendas e, se a faixa tiver teto, vendas ≤ `toCents`).
 */

export type KitTier = { fromCents: number; toCents?: number | null; products: number };

/** Lê as faixas gravadas no modelo (JSON); ignora entradas malformadas. */
export function parseKitTiers(json: unknown): KitTier[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((t) => {
    if (!t || typeof t !== "object") return [];
    const { fromCents, toCents, products } = t as Record<string, unknown>;
    if (!Number.isSafeInteger(fromCents) || !Number.isSafeInteger(products) || (products as number) <= 0) return [];
    if (toCents !== undefined && toCents !== null && !Number.isSafeInteger(toCents)) return [];
    return [{ fromCents: fromCents as number, toCents: (toCents as number | null | undefined) ?? null, products: products as number }];
  });
}

/** Quantos suplementos o mês dá (0 = nenhuma faixa alcançada). */
export function kitProductsFor(tiers: readonly KitTier[], salesCents: number): number {
  let best: KitTier | null = null;
  for (const t of tiers) {
    if (salesCents < t.fromCents) continue;
    if (t.toCents !== undefined && t.toCents !== null && salesCents > t.toCents) continue;
    if (!best || t.fromCents > best.fromCents) best = t;
  }
  return best?.products ?? 0;
}

/** Valida a escolha da creator: produtos distintos, quantidades inteiras positivas, total igual ao do kit. */
export function validateKitChoice(items: readonly { productId: string; quantity: number }[], products: number, brandSlug = "botanika"): { productId: string; quantity: number }[] {
  const chosen = items.filter((i) => i.quantity !== 0);
  if (chosen.some((i) => !Number.isSafeInteger(i.quantity) || i.quantity < 0)) throw new RangeError("Quantidade inválida.");
  if (new Set(chosen.map((i) => i.productId)).size !== chosen.length) throw new RangeError("Produto repetido.");
  const total = chosen.reduce((s, i) => s + i.quantity, 0);
  if (total !== products) throw new RangeError(`Escolha ${products} ${kitNoun(brandSlug, products)} (você escolheu ${total}).`);
  return chosen;
}

/** Marcas que vendem suplementos: Botanika e VermeFree (suplementos naturais antiparasitários). */
const SUPPLEMENT_BRANDS = new Set(["botanika", "vermefree"]);

/**
 * Como chamar o produto do kit em cada marca (D-WELCOMEKIT1): Botanika e VermeFree mandam suplementos; a Revita Derma
 * vende dermocosméticos (sérum, creme), então "produto". Marca nova sem cadastro aqui: "produto".
 */
export function kitNoun(brandSlug: string | null | undefined, n: number): string {
  if (brandSlug && SUPPLEMENT_BRANDS.has(brandSlug)) return n === 1 ? "suplemento" : "suplementos";
  return n === 1 ? "produto" : "produtos";
}

/** D-D4SIGN: kit de boas-vindas da aprovação, igual em todas as marcas. */
export const WELCOME_PRODUCTS = 1;
