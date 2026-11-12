import { describe, expect, it } from "vitest";
import { isJpeg, photoHref, photoSource } from "@/domain";

describe("foto de perfil (D-PHOTO)", () => {
  it("subida vale primeiro; Instagram se a equipe não tirou; senão iniciais", () => {
    expect(photoSource({ photoPath: "a/b.jpg", igPhotoUrl: "https://x", photoHidden: true })).toBe("UPLOAD");
    expect(photoSource({ photoPath: null, igPhotoUrl: "https://x", photoHidden: false })).toBe("INSTAGRAM");
    expect(photoSource({ photoPath: null, igPhotoUrl: "https://x", photoHidden: true })).toBeNull();
    expect(photoSource({ photoPath: null, igPhotoUrl: null, photoHidden: false })).toBeNull();
  });
  it("endereço e JPEG", () => {
    expect(photoHref("c1")).toBe("/foto/c1");
    expect(photoHref("c1", new Date(5))).toBe("/foto/c1?v=5");
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]))).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });
});
