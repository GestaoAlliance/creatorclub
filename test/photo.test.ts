import { describe, expect, it } from "vitest";
import { isJpeg, photoSource } from "@/domain";

describe("foto de perfil (D-PHOTO)", () => {
  it("subida vale primeiro; Instagram se a equipe não tirou; senão iniciais", () => {
    expect(photoSource({ photoPath: "a/b.jpg", igPhotoUrl: "https://x", photoHidden: true })).toBe("UPLOAD");
    expect(photoSource({ photoPath: null, igPhotoUrl: "https://x", photoHidden: false })).toBe("INSTAGRAM");
    expect(photoSource({ photoPath: null, igPhotoUrl: "https://x", photoHidden: true })).toBeNull();
    expect(photoSource({ photoPath: null, igPhotoUrl: null, photoHidden: false })).toBeNull();
  });
  it("JPEG", () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]))).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });
});
