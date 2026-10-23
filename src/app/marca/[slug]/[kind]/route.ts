import { BRAND_ASSET_PATH, type BrandAssetKind } from "@/domain";
import { brandAssetBySlug } from "@/lib/brands/assets";
import { db } from "@/lib/db";

// Logo e fundo da tela de entrar (M4.4a, D-BRANDLOGIN): públicos, com cache; o endereço leva a versão (?v=hash).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  const k = (Object.entries(BRAND_ASSET_PATH).find(([, p]) => p === kind)?.[0] ?? null) as BrandAssetKind | null;
  if (!k) return new Response("Não encontrado.", { status: 404 });
  const a = await brandAssetBySlug(db(), slug, k);
  if (!a) return new Response("Não encontrado.", { status: 404 });
  const etag = `"${a.sha256}"`;
  const headers = { "Content-Type": a.mime, "Cache-Control": "public, max-age=3600", ETag: etag, "Content-Security-Policy": "default-src 'none'" };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(a.bytes), { headers });
}
