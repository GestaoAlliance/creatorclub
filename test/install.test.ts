import { describe, expect, it } from "vitest";
import { appManifest, fitInside, imageSize, installPlatform, isIconSize } from "@/domain";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("portal na tela de início (D-INSTALLAPP)", () => {
  it("aparelho pelo navegador", () => {
    expect(installPlatform(IPHONE)).toBe("ios");
    expect(installPlatform(`${IPHONE} Instagram 300.0`)).toBe("ios-other");
    expect(installPlatform(IPHONE.replace("Version/18.0", "CriOS/129.0"))).toBe("ios-other");
    expect(installPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", 5)).toBe("ios");
    expect(installPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", 0)).toBe("desktop");
    expect(installPlatform("Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36")).toBe("android");
    expect(installPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0")).toBe("desktop");
  });

  it("manifesto da marca: abre no Início dela, nome e cor da marca, ícone com a versão do logo", () => {
    const m = appManifest({ slug: "botanika", name: "Botanika", primaryColor: "#2E3A8C", logo: "abc123" });
    expect(m).toMatchObject({ start_url: "/portal/botanika", short_name: "Botanika", display: "standalone", theme_color: "#2E3A8C", scope: "/" });
    expect(m.icons.map((i) => i.src)).toEqual(["/marca/botanika/app-icon/192?v=abc123", "/marca/botanika/app-icon/512?v=abc123", "/marca/botanika/app-icon/512?v=abc123"]);
    expect(appManifest({ slug: "x", name: "X", primaryColor: "#000000", logo: null }).icons[0]!.src).toBe("/marca/x/app-icon/192");
    expect([isIconSize(180), isIconSize(192), isIconSize(512), isIconSize(64)]).toEqual([true, true, true, false]);
  });

  it("tamanho do logo (PNG e JPG) e encaixe no ícone", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.set([0, 0, 1, 0x2c, 0, 0, 0, 100], 16); // 300 × 100
    expect(imageSize(png)).toEqual({ width: 300, height: 100 });
    // JPG: SOI, APP0 (tamanho 4), SOF0 com altura 50 e largura 200.
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0, 50, 0, 200, 3, 0, 0, 0, 0, 0, 0]);
    expect(imageSize(jpg)).toEqual({ width: 200, height: 50 });
    expect(imageSize(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull();
    expect(fitInside({ width: 300, height: 100 }, 300)).toEqual({ width: 300, height: 100 });
    expect(fitInside({ width: 100, height: 400 }, 200)).toEqual({ width: 50, height: 200 });
  });
});
