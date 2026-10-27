import { describe, expect, it } from "vitest";
import { creatorPriceCents, validateShopItems } from "@/domain";

describe("loja com o saldo (M5.1, D-SHOPBALANCE)", () => {
  it("preço da creator: preço da loja menos o desconto; 0% = preço da loja", () => {
    expect(creatorPriceCents(8990, 0)).toBe(8990);
    expect(creatorPriceCents(8990, 3000)).toBe(6293);
    expect(creatorPriceCents(10000, 1250)).toBe(8750);
  });
  it("itens: inteiros, sem repetir, de 1 a 20", () => {
    expect(validateShopItems([{ productId: "a", quantity: 2 }, { productId: "b", quantity: 0 }])).toEqual([{ productId: "a", quantity: 2 }]);
    expect(() => validateShopItems([])).toThrow(/pelo menos 1/);
    expect(() => validateShopItems([{ productId: "a", quantity: 21 }])).toThrow(/20/);
    expect(() => validateShopItems([{ productId: "a", quantity: 1.5 }])).toThrow(/inválida/);
  });
});
