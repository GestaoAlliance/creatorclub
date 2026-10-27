/**
 * Loja com o saldo (M5.1, D-SHOPBALANCE): a creator compra produtos da marca com o saldo disponível. Preço da loja
 * menos o desconto da marca (Marcas; 0 = preço da loja), frete por conta da marca, sem nota fiscal da creator.
 */
export const SHOP_MAX_ITEMS = 20;

/** Preço para a creator, em centavos: preço da loja menos o desconto (pontos-base), arredondado ao centavo. */
export function creatorPriceCents(priceCents: number, discountBps: number): number {
  return priceCents - Math.round((priceCents * discountBps) / 10_000);
}

/** Itens da compra: quantidades inteiras positivas, sem produto repetido, até 20 unidades. */
export function validateShopItems(items: readonly { productId: string; quantity: number }[]): { productId: string; quantity: number }[] {
  const chosen = items.filter((i) => i.quantity !== 0);
  if (chosen.some((i) => !Number.isSafeInteger(i.quantity) || i.quantity < 0)) throw new RangeError("Quantidade inválida.");
  if (new Set(chosen.map((i) => i.productId)).size !== chosen.length) throw new RangeError("Produto repetido.");
  const total = chosen.reduce((s, i) => s + i.quantity, 0);
  if (total === 0) throw new RangeError("Escolha pelo menos 1 produto.");
  if (total > SHOP_MAX_ITEMS) throw new RangeError(`No máximo ${SHOP_MAX_ITEMS} unidades por compra.`);
  return chosen;
}
