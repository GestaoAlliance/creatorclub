import { describe, expect, it } from "vitest";
import { kitProductsFor, parseKitTiers, validateKitChoice } from "@/domain";

const set2026 = parseKitTiers([{ fromCents: 400_000, products: 3 }, { fromCents: 1_000_000, products: 4 }]);
const out2026 = parseKitTiers([
  { fromCents: 100_000, toCents: 199_999, products: 1 },
  { fromCents: 200_000, toCents: 400_000, products: 2 },
  { fromCents: 1_000_000, products: 3 },
]);

describe("kit mensal (D-KIT)", () => {
  it("vale a faixa mais alta alcançada pelas vendas do mês", () => {
    expect(kitProductsFor(set2026, 399_999)).toBe(0);
    expect(kitProductsFor(set2026, 400_000)).toBe(3);
    expect(kitProductsFor(set2026, 999_999)).toBe(3);
    expect(kitProductsFor(set2026, 1_000_000)).toBe(4);
    expect(kitProductsFor([], 5_000_000)).toBe(0);
  });

  it("faixa com teto só vale até o teto", () => {
    expect(kitProductsFor(out2026, 99_999)).toBe(0);
    expect(kitProductsFor(out2026, 150_000)).toBe(1);
    expect(kitProductsFor(out2026, 400_000)).toBe(2);
    expect(kitProductsFor(out2026, 1_200_000)).toBe(3);
  });

  it("ignora faixas malformadas", () => {
    expect(parseKitTiers(null)).toEqual([]);
    expect(parseKitTiers([{ fromCents: "x", products: 2 }, { fromCents: 1, products: 0 }, { fromCents: 10, products: 1 }])).toEqual([
      { fromCents: 10, toCents: null, products: 1 },
    ]);
  });

  it("a escolha precisa somar o total do kit, sem produto repetido", () => {
    expect(validateKitChoice([{ productId: "a", quantity: 2 }, { productId: "b", quantity: 1 }, { productId: "c", quantity: 0 }], 3)).toEqual([
      { productId: "a", quantity: 2 },
      { productId: "b", quantity: 1 },
    ]);
    expect(() => validateKitChoice([{ productId: "a", quantity: 2 }], 3)).toThrow("Escolha 3 suplementos (você escolheu 2).");
    expect(() => validateKitChoice([{ productId: "a", quantity: 1 }, { productId: "a", quantity: 2 }], 3)).toThrow("repetido");
    expect(() => validateKitChoice([{ productId: "a", quantity: 1.5 }], 1)).toThrow("inválida");
    expect(() => validateKitChoice([{ productId: "a", quantity: -1 }, { productId: "b", quantity: 2 }], 1)).toThrow("inválida");
  });
});
