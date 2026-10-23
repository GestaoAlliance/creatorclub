/**
 * Logo da tela de entrar da marca (M4.4a, D-BRANDLOGIN; fundo liso, a pedido do responsável). Só PNG, JPG ou WebP, reconhecidos pelos
 * primeiros bytes (nunca pelo nome ou pelo tipo que o navegador diz); SVG fica de fora porque pode levar código.
 */

export type BrandAssetKind = "LOGO";

export const BRAND_ASSET_MAX: Record<BrandAssetKind, number> = { LOGO: 300 * 1024 };
export const BRAND_ASSET_LABEL: Record<BrandAssetKind, string> = { LOGO: "Logo" };

/** Endereço público da imagem: /marca/<slug>/logo. */
export const BRAND_ASSET_PATH: Record<BrandAssetKind, string> = { LOGO: "logo" };

/** Tipo da imagem pelos primeiros bytes; null se não é PNG, JPG ou WebP. */
export function sniffImage(b: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** Confere a imagem: tipo e tamanho. */
export function checkBrandImage(kind: BrandAssetKind, b: Uint8Array): { ok: true; mime: string } | { ok: false; error: string } {
  if (b.length === 0) return { ok: false, error: "Escolha uma imagem." };
  const mime = sniffImage(b);
  if (!mime) return { ok: false, error: "Use uma imagem PNG, JPG ou WebP." };
  if (b.length > BRAND_ASSET_MAX[kind]) return { ok: false, error: `${BRAND_ASSET_LABEL[kind]}: no máximo ${Math.round(BRAND_ASSET_MAX[kind] / 1024)} KB.` };
  return { ok: true, mime };
}

/** Marca da tela de entrar: `?marca=` ou, sem ele, a do portal para onde a pessoa vai depois (`next=/portal/<slug>`). */
export function loginBrandSlug(marca: string | undefined, next: string | undefined): string | null {
  const ok = (s: string | undefined) => (s && /^[a-z0-9][a-z0-9-]{1,39}$/.test(s) ? s : null);
  return ok(marca?.toLowerCase()) ?? ok(/^\/portal\/([a-z0-9-]+)/.exec(next ?? "")?.[1]);
}
