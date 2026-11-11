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

describe("conteúdo: ranking, melhor dia e rede (D-CONTENTBOARD)", () => {
  it("melhor dia e rede pela média acima do normal (2+ posts completos); ranking por creator", async () => {
    const { bestOf, contentRanking, igKey, weekdayOf } = await import("@/domain");
    expect(igKey(" @Maria.Ex ")).toBe("maria.ex");
    expect(weekdayOf("2026-11-11")).toBe("quarta");
    const it = (creatorId: string | null, platform: "INSTAGRAM" | "TIKTOK", postedDay: string, above: number, likes: number | null = null, complete = true) => ({ creatorId, platform, postedDay, complete, windowCents: above + 1000, aboveCents: above, likes });
    const items = [
      it("a", "INSTAGRAM", "2026-11-11", 5000, 100), // quarta
      it("a", "INSTAGRAM", "2026-11-04", 3000, 300), // quarta
      it("b", "TIKTOK", "2026-11-09", 100), // segunda
      it("b", "TIKTOK", "2026-11-02", -100), // segunda
      it("b", "TIKTOK", "2026-11-12", 9999, null, false), // incompleto: fora do melhor dia
    ];
    const best = bestOf(items);
    expect(best.weekday[0]).toEqual({ key: "quarta", posts: 2, avgAboveCents: 4000 });
    expect(best.platform.map((p) => p.key)).toEqual(["INSTAGRAM", "TIKTOK"]);
    expect(contentRanking(items)).toEqual([
      { creatorId: "a", posts: 2, avgLikes: 200, salesPerPostCents: 5000, aboveCents: 8000 },
      { creatorId: "b", posts: 3, avgLikes: null, salesPerPostCents: Math.round((1100 + 900 + 10999) / 3), aboveCents: 0 },
    ]);
  });
});
