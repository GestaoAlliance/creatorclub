import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseKey } from "@/lib/crypto/secret-box";

const key = randomBytes(32);

describe("cofre de segredos (AES-256-GCM)", () => {
  it("abre o que cifrou, e cada cifragem sai diferente", () => {
    const a = encryptSecret("shpat_123", key, "marca-1:SHOPIFY");
    const b = encryptSecret("shpat_123", key, "marca-1:SHOPIFY");
    expect(a).not.toBe(b);
    expect(a).not.toContain("shpat_123");
    expect(decryptSecret(a, key, "marca-1:SHOPIFY")).toBe("shpat_123");
  });

  it("não abre com outra chave, outro contexto (marca) ou texto adulterado", () => {
    const box = encryptSecret("shpat_123", key, "marca-1:SHOPIFY");
    expect(() => decryptSecret(box, randomBytes(32), "marca-1:SHOPIFY")).toThrow(/Não foi possível/);
    expect(() => decryptSecret(box, key, "marca-2:SHOPIFY")).toThrow(/Não foi possível/);
    const parts = box.split(".");
    parts[3] = Buffer.from("outra coisa").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key, "marca-1:SHOPIFY")).toThrow(/Não foi possível/);
    expect(() => decryptSecret("v0.a.b.c", key, "marca-1:SHOPIFY")).toThrow(/formato/);
  });

  it("exige chave de 32 bytes em base64", () => {
    expect(parseKey(key.toString("base64"))).toEqual(key);
    expect(() => parseKey(undefined)).toThrow(/32 bytes/);
    expect(() => parseKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
