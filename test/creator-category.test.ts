import { describe, expect, it } from "vitest";
import { matchesCategory, parseCategoryFilter } from "@/domain";

describe("filtro de categoria da lista Creators (D-CREATORCAT)", () => {
  it("lê o valor do seletor e ignora valor desconhecido", () => {
    expect(parseCategoryFilter("ugc")).toBe("UGC");
    expect(parseCategoryFilter(" Prescritor ")).toBe("PRESCRITOR");
    expect(parseCategoryFilter("none")).toBe("NONE");
    expect(parseCategoryFilter("hunter")).toBe("");
    expect(parseCategoryFilter(undefined)).toBe("");
  });

  it("todas, uma categoria, várias categorias e sem categoria", () => {
    expect(matchesCategory([], "")).toBe(true);
    expect(matchesCategory(["INFLUENCER"], "INFLUENCER")).toBe(true);
    expect(matchesCategory(["INFLUENCER"], "UGC")).toBe(false);
    expect(matchesCategory(["INFLUENCER", "PRESCRITOR"], "PRESCRITOR")).toBe(true);
    expect(matchesCategory([], "NONE")).toBe(true);
    expect(matchesCategory(["UGC"], "NONE")).toBe(false);
  });
});
