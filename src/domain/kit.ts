import { addDaysKey } from "./time";

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

/**
 * Foto dos produtos que a creator pode escolher (pedido do responsável em 2026-10-27; fotos mandadas por ele, em
 * `public/produtos/`). Achada pelo nome do produto na marca; kit e combo ficam sem foto. Sem foto: só o nome.
 */
const PRODUCT_PHOTOS: Record<string, readonly [RegExp, string][]> = {
  "revita-derma": [[/^s[ée]rum pepti ?code/i, "revita-pepti-code"]],
  botanika: [
    [/hair botanika/i, "botanika-hair"],
    [/tri ?\[?mg\]?|tri magn/i, "botanika-tri-magnesio"],
    [/tetra ?vit/i, "botanika-tetravit"],
  ],
  vermefree: [[/protocolo.*adulto/i, "vermefree-protocolo-adulto"]],
};

export function productPhoto(brandSlug: string, title: string): string | null {
  if (/^kit|combo/i.test(title.trim())) return null;
  const hit = PRODUCT_PHOTOS[brandSlug]?.find(([re]) => re.test(title));
  return hit ? `/produtos/${hit[1]}.webp` : null;
}

/**
 * D-GOALKIT (regra da Vanessa, decidida pelo responsável em 2026-10-27; substitui o kit mensal por faixa, D-KIT):
 * a creator ganha 1 produto quando soma R$ 1.000 em vendas nos primeiros 45 dias e, depois, em cada janela fixa de 30
 * dias (46–75, 76–105…). Liberado na hora em que a meta é batida. Os dias contam do início da creator (aprovação; quem
 * já era ativa conta a partir de 2026-10-27), no fuso da marca.
 */
export const GOAL_SALES_CENTS = 100_000;
export const GOAL_FIRST_DAYS = 45;
export const GOAL_NEXT_DAYS = 30;
export const GOAL_PRODUCTS = 1;

export type GoalWindow = { index: number; from: string; to: string };

/** Janela `index` (0 = primeiros 45 dias) a partir do dia de início: de `from` até antes de `to` (dias AAAA-MM-DD). */
export function goalWindow(start: string, index: number): GoalWindow {
  const from = index === 0 ? start : addDaysKey(start, GOAL_FIRST_DAYS + GOAL_NEXT_DAYS * (index - 1));
  return { index, from, to: addDaysKey(from, index === 0 ? GOAL_FIRST_DAYS : GOAL_NEXT_DAYS) };
}

/** Janelas já começadas até `today` (a atual por último). */
export function goalWindowsUntil(start: string, today: string): GoalWindow[] {
  const out: GoalWindow[] = [];
  for (let i = 0; ; i++) {
    const w = goalWindow(start, i);
    if (w.from > today) return out;
    out.push(w);
  }
}

/**
 * D-TIERKIT (regras da Botanika da reunião de 2026-10-27; respostas do responsável em 2026-10-28): produtos pelas
 * vendas do mês (mês do pagamento, D-MONTH). Nos 3 primeiros meses da creator (o mês da entrada e os dois seguintes),
 * R$ 500 → 1 produto (vendendo mais, vale a tabela normal se der mais); depois, R$ 1.000 → 1, R$ 4.000 → 2, R$ 6.000 → 3, R$ 10.000 ou mais → 4. Liberado na hora, por
 * faixa: ao passar de cada faixa, libera a diferença. Vale nas marcas com `monthlyKitFrom` (Botanika desde 2026-11).
 */
export const TIER_TRIAL_MONTHS = 3;
export const TIER_TRIAL: readonly KitTier[] = [{ fromCents: 50_000, products: 1 }];
export const TIER_REGULAR: readonly KitTier[] = [
  { fromCents: 100_000, products: 1 },
  { fromCents: 400_000, products: 2 },
  { fromCents: 600_000, products: 3 },
  { fromCents: 1_000_000, products: 4 },
];

/** O mês (AAAA-MM) ainda está nos 3 primeiros meses de quem entrou no dia `entryDay` (AAAA-MM-DD)? */
export function isTierTrialMonth(entryDay: string, month: string): boolean {
  const [y, m] = entryDay.slice(0, 7).split("-").map(Number) as [number, number];
  const end = y * 12 + (m - 1) + TIER_TRIAL_MONTHS;
  const [my, mm] = month.split("-").map(Number) as [number, number];
  return my * 12 + (mm - 1) < end;
}

/** Total de produtos do mês pela tabela (0 = nenhuma faixa). Nos 3 primeiros meses vale a maior das duas tabelas. */
export function tierProducts(salesCents: number, trial: boolean): number {
  const regular = kitProductsFor(TIER_REGULAR, salesCents);
  return trial ? Math.max(regular, kitProductsFor(TIER_TRIAL, salesCents)) : regular;
}
