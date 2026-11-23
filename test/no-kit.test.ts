import { describe, expect, it } from "vitest";
import { welcomeWithoutKit } from "@/lib/onboarding/applications";

describe("D-NOKIT: marca sem o kit de 2 produtos", () => {
  it("só quando o envio inicial está configurado e a opção de 2 produtos está vazia", () => {
    expect(welcomeWithoutKit({ welcomeOneIds: ["gel"], welcomeTwoIds: [] })).toBe(true);
    expect(welcomeWithoutKit({ welcomeOneIds: ["gel", "serum"], welcomeTwoIds: ["gel", "serum"] })).toBe(false);
    // Marca sem envio inicial configurado (Botanika) continua com a opção 2 das regras dela.
    expect(welcomeWithoutKit({ welcomeOneIds: [], welcomeTwoIds: [] })).toBe(false);
  });
});
