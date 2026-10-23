import { describe, expect, it } from "vitest";
import { actionDetail, actionMessage, overlapsAnother, parsePostUrl, postLift, postWindow } from "@/domain";

describe("posts (M4.6, D-POSTS)", () => {
  it("link: plataforma pelo endereço; sem https ganha https; outro esquema recusado", () => {
    expect(parsePostUrl("https://www.instagram.com/p/abc/")).toEqual({ ok: true, url: "https://www.instagram.com/p/abc/", platform: "INSTAGRAM" });
    expect(parsePostUrl("vm.tiktok.com/ZM123")).toMatchObject({ ok: true, platform: "TIKTOK", url: "https://vm.tiktok.com/ZM123" });
    expect(parsePostUrl("https://youtu.be/x")).toMatchObject({ platform: "YOUTUBE" });
    expect(parsePostUrl("https://k.kwai.com/p/x")).toMatchObject({ platform: "KWAI" });
    expect(parsePostUrl("https://blog.exemplo.com/post")).toMatchObject({ platform: "OUTRO" });
    expect(parsePostUrl("javascript:alert(1)").ok).toBe(false);
    expect(parsePostUrl(" ").ok).toBe(false);
  });

  it("janela de 3 dias, base de 14 dias antes; acima do normal; posts perto", () => {
    expect(postWindow("2026-10-30")).toEqual({ from: "2026-10-30", to: "2026-11-02", baseFrom: "2026-10-16" });
    expect(postLift(50_000, 14_000)).toEqual({ windowCents: 50_000, normalCents: 3_000, aboveCents: 47_000 });
    expect(overlapsAnother("2026-10-10", ["2026-10-12"])).toBe(true);
    expect(overlapsAnother("2026-10-10", ["2026-10-13", "2026-10-07"])).toBe(false);
    expect(overlapsAnother("2026-10-10", ["2026-10-10"])).toBe(true);
  });

  it("fila: sem post há 15 dias, com mensagem pronta", () => {
    expect(actionDetail({ kind: "NO_POST", days: 16, never: true })).toBe("nenhum post registrado há 16 dias");
    expect(actionMessage({ kind: "NO_POST", days: 16, never: false }, "Ana Lima", "Botanika")).toMatch(/^Oi, Ana! Aqui é da Botanika\. Faz 16 dias que não vemos um post seu registrado/);
  });
});
