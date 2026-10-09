import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifra segredos de integração (token do Shopify, segredo do webhook) antes de gravar no banco (D-SHOPAPP).
 * AES-256-GCM com chave de 32 bytes que fica só na Vercel (`INTEGRATION_ENC_KEY`, base64).
 * `context` (ex.: "<brandId>:SHOPIFY") entra como dado autenticado: o texto cifrado de uma marca não abre em outra.
 * Formato gravado: `v1.<iv>.<tag>.<cifrado>` em base64url.
 */

const VERSION = "v1";

export class SecretBoxError extends Error {}

export function parseKey(base64: string | undefined): Buffer {
  const key = Buffer.from(base64 ?? "", "base64");
  if (key.length !== 32) throw new SecretBoxError("INTEGRATION_ENC_KEY precisa ter 32 bytes em base64.");
  return key;
}

export function encryptSecret(plain: string, key: Buffer, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptSecret(box: string, key: Buffer, context: string): string {
  const [version, iv, tag, data] = box.split(".");
  if (version !== VERSION || !iv || !tag || data === undefined) throw new SecretBoxError("Segredo em formato desconhecido.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // Chave errada, outro contexto ou texto adulterado: nunca devolve nada parcial.
    throw new SecretBoxError("Não foi possível abrir o segredo.");
  }
}
