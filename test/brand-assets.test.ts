import { describe, expect, it } from "vitest";
import { checkBrandImage, loginBrandSlug, sniffImage } from "@/domain";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe("imagens da tela de entrar (M4.4a, D-BRANDLOGIN)", () => {
  it("reconhece PNG, JPG e WebP pelos bytes; SVG e o resto não", () => {
    expect([sniffImage(PNG), sniffImage(JPG), sniffImage(WEBP), sniffImage(SVG), sniffImage(new Uint8Array())]).toEqual(["image/png", "image/jpeg", "image/webp", null, null]);
  });

  it("limite: logo até 300 KB, fundo até 1 MB", () => {
    const big = new Uint8Array(301 * 1024);
    big.set(PNG);
    expect(checkBrandImage("LOGO", big)).toEqual({ ok: false, error: "Logo: no máximo 300 KB." });
    expect(checkBrandImage("BACKGROUND", big)).toEqual({ ok: true, mime: "image/png" });
    expect(checkBrandImage("LOGO", SVG)).toEqual({ ok: false, error: "Use uma imagem PNG, JPG ou WebP." });
  });

  it("marca da tela de entrar: ?marca= ou o portal de volta; nada estranho passa", () => {
    expect(loginBrandSlug("Botanika", undefined)).toBe("botanika");
    expect(loginBrandSlug(undefined, "/portal/revita-derma/saque")).toBe("revita-derma");
    expect(loginBrandSlug(undefined, "/admin")).toBeNull();
    expect(loginBrandSlug("../x", undefined)).toBeNull();
  });
});
