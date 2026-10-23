/**
 * Portal na tela de início do celular (D-INSTALLAPP, pedido do responsável em 2026-10-23, "estilo BigBoom"): o portal
 * abre como app (ícone e nome da marca, sem a barra do navegador). Regras puras (testadas em test/install.test.ts).
 */

export type InstallPlatform = "ios" | "ios-other" | "android" | "desktop";

/**
 * Aparelho pelo navegador. iPhone/iPad no Safari: "ios". No iPhone fora do Safari (Instagram, Facebook, Chrome...):
 * "ios-other" (o Safari é o caminho certo). iPad novo se apresenta como Mac com tela de toque.
 */
export function installPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const ua = userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|Line\/|GSA\//i.test(ua) ? "ios-other" : "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export const ICON_SIZES = [180, 192, 512] as const;
export type IconSize = (typeof ICON_SIZES)[number];

export function isIconSize(n: number): n is IconSize {
  return (ICON_SIZES as readonly number[]).includes(n);
}

/** Manifesto do app de uma marca: abre no Início do portal dela, com o nome, a cor e o ícone da marca. */
export function appManifest(b: { slug: string; name: string; primaryColor: string; logo: string | null }) {
  const v = b.logo ? `?v=${b.logo}` : "";
  const icon = (size: IconSize, purpose: "any" | "maskable") => ({ src: `/marca/${b.slug}/app-icon/${size}${v}`, sizes: `${size}x${size}`, type: "image/png", purpose });
  return {
    id: `/portal/${b.slug}`,
    name: `${b.name} · Creator Club`,
    short_name: b.name,
    description: `Seu portal de creator da ${b.name}: vendas, cupom, saldo e saque.`,
    lang: "pt-BR",
    start_url: `/portal/${b.slug}`,
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: b.primaryColor,
    icons: [icon(192, "any"), icon(512, "any"), icon(512, "maskable")],
  };
}

/** Largura e altura de um PNG ou JPG pelos bytes (para centrar o logo no ícone); outro formato ou ilegível: null. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const u16 = (i: number) => (b[i]! << 8) | b[i + 1]!;
  const u32 = (i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50) return { width: u32(16), height: u32(20) };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC): altura e largura.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: u16(i + 7), height: u16(i + 5) };
      i += 2 + u16(i + 2);
    }
  }
  return null;
}

/** Tamanho do logo dentro do ícone: cabe num quadrado de `box`, mantendo a proporção. */
export function fitInside(s: { width: number; height: number }, box: number): { width: number; height: number } {
  const k = Math.min(box / s.width, box / s.height);
  return { width: Math.max(1, Math.round(s.width * k)), height: Math.max(1, Math.round(s.height * k)) };
}
