import { describe, expect, it } from "vitest";
import { percentToBps } from "@/lib/coupons/review";

describe("taxa digitada pela Ana", () => {
  it("aceita 15, 12,5, 12.5 e 20% e converte sem Float", () => {
    expect(percentToBps("15")).toBe(1500);
    expect(percentToBps("12,5")).toBe(1250);
    expect(percentToBps(" 12.5 ")).toBe(1250);
    expect(percentToBps("20%")).toBe(2000);
    expect(percentToBps("0")).toBe(0);
  });

  it("recusa texto, mais de duas casas e acima de 100%", () => {
    for (const bad of ["", "abc", "12,555", "101", "-5"]) expect(() => percentToBps(bad)).toThrow();
  });
});
