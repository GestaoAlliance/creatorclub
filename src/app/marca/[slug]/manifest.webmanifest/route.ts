import { appManifest } from "@/domain";
import { loginBrand } from "@/lib/brands/assets";
import { db } from "@/lib/db";

// Manifesto do app da marca (D-INSTALLAPP): público (o navegador busca sem a sessão), com cache curto.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await loginBrand(db(), slug);
  if (!b) return new Response("Não encontrado.", { status: 404 });
  return new Response(JSON.stringify(appManifest(b)), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
