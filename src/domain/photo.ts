/**
 * Foto de perfil (D-PHOTO): a subida (portal ou equipe) vale primeiro; sem ela, a do Instagram, a não ser que a equipe
 * tenha tirado. Sem nenhuma, as iniciais.
 */

export type PhotoSource = "UPLOAD" | "INSTAGRAM" | null;

export function photoSource(a: { photoPath: string | null; igPhotoUrl: string | null; photoHidden: boolean }): PhotoSource {
  if (a.photoPath) return "UPLOAD";
  if (a.igPhotoUrl && !a.photoHidden) return "INSTAGRAM";
  return null;
}

/** JPEG de verdade (começa com FF D8 FF) e no tamanho certo (o navegador já reduz para 512 × 512). */
export const MAX_PHOTO_BYTES = 700 * 1024;
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
