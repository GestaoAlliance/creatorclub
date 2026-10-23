import { ImageResponse } from "next/og";
import { fitInside, imageSize, isIconSize } from "@/domain";
import { brandAssetBySlug, loginBrand } from "@/lib/brands/assets";
import { db } from "@/lib/db";

// Ícone do app da marca (D-INSTALLAPP): o logo de Marcas num fundo branco, com margem (cabe no recorte redondo do
// Android); sem logo (ou WebP, que o gerador não lê), a inicial na cor da marca. Público, com cache.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; size: string }> }) {
  const { slug, size: raw } = await params;
  const size = Number(raw);
  const b = isIconSize(size) ? await loginBrand(db(), slug) : null;
  if (!b) return new Response("Não encontrado.", { status: 404 });
  const logo = b.logo ? await brandAssetBySlug(db(), slug, "LOGO") : null;
  const dims = logo ? imageSize(new Uint8Array(logo.bytes)) : null;
  const src = logo && dims ? `data:${logo.mime};base64,${Buffer.from(logo.bytes).toString("base64")}` : null;
  const fit = dims ? fitInside(dims, Math.round(size * 0.62)) : null;
  return new ImageResponse(
    src ? (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={fit!.width} height={fit!.height} />
      </div>
    ) : (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: b.primaryColor, color: "#ffffff", fontSize: Math.round(size * 0.5), fontWeight: 700 }}>
        {b.name.trim().charAt(0).toUpperCase()}
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
