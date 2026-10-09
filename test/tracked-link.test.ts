import { describe, expect, it } from "vitest";
import { discountUrl, hashIp, safeStorePath } from "../src/lib/links/tracked";
import { T } from "./helpers";

describe("link rastreado (D-LINK)", () => {
  it("leva à loja com o cupom aplicado", () => {
    expect(discountUrl("https://botanikabrasil.com.br/", "MARIANA10")).toBe("https://botanikabrasil.com.br/discount/MARIANA10?redirect=%2F");
    expect(discountUrl("https://loja.com", "OSÓRIO", "/products/x")).toBe("https://loja.com/discount/OS%C3%93RIO?redirect=%2Fproducts%2Fx");
  });

  it("só aceita caminhos da própria loja (sem redirecionamento aberto)", () => {
    expect(safeStorePath("/products/hair")).toBe("/products/hair");
    for (const bad of [null, "", "https://mal.com", "//mal.com", "/\\mal.com", "products"]) expect(safeStorePath(bad)).toBe("/");
  });

  it("nunca guarda o IP: hash que muda a cada dia", () => {
    const a = hashIp("1.2.3.4", "b", T("2026-10-09T12:00:00Z"));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("1.2.3.4");
    expect(hashIp("1.2.3.4", "b", T("2026-10-09T20:00:00Z"))).toBe(a);
    expect(hashIp("1.2.3.4", "b", T("2026-10-10T12:00:00Z"))).not.toBe(a);
    expect(hashIp(null, "b", T("2026-10-09T12:00:00Z"))).toBeNull();
  });
});
