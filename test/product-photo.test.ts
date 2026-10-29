import { describe, expect, it } from "vitest";
describe("foto do produto no pedido", () => {
  it("acha pelo nome na marca; kit e combo ficam sem foto", async () => {
    const { productPhoto } = await import("@/domain");
    expect(productPhoto("revita-derma", "Sérum Pepti Code GHK-Cu com 14 Peptídeos, Niacinamida e Pantenol")).toBe("/produtos/revita-pepti-code.webp");
    expect(productPhoto("revita-derma", "Kit Duo Lift Natural: Sérum GHK-Cu Pepti Code + Gel Creme Nano Retinal")).toBeNull();
    expect(productPhoto("botanika", "Hair Botanika 60 cápsulas")).toBe("/produtos/botanika-hair.webp");
    // D-KITOPTIONS: Whey Balance nos 3 sabores; kit com whey continua sem foto.
    expect(productPhoto("botanika", "Whey Balance 455g Chocolate — Whey Concentrado + Colágeno C-PURE®")).toBe("/produtos/botanika-whey-chocolate.webp");
    expect(productPhoto("botanika", "Whey Balance 455g Sem Sabor — Whey Concentrado + Colágeno C-PURE®")).toBe("/produtos/botanika-whey-sem-sabor.webp");
    expect(productPhoto("botanika", "Whey Balance 455g Cappuccino — Whey Concentrado + Colágeno C-PURE®")).toBe("/produtos/botanika-whey-cappuccino.webp");
    expect(productPhoto("botanika", "Kit Whey Balance + Creatina + Taurato")).toBeNull();
    expect(productPhoto("botanika", "Tri[Mg] Complex — Magnésio 3 em 1 de Rápida Absorção")).toBe("/produtos/botanika-tri-magnesio.webp");
    expect(productPhoto("botanika", "Tri Magnésio Complex")).toBe("/produtos/botanika-tri-magnesio.webp");
    expect(productPhoto("botanika", "TetraVit D 30ml")).toBe("/produtos/botanika-tetravit.webp");
    expect(productPhoto("vermefree", "Protocolo Completo Adulto")).toBe("/produtos/vermefree-protocolo-adulto.webp");
    expect(productPhoto("vermefree", "Combo Protocolo Adulto")).toBeNull();
    expect(productPhoto("botanika", "Ômega 3")).toBeNull();
  });
});
