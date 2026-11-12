import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { photoFor, supabasePhotoStore } from "@/lib/photos/photos";

export const dynamic = "force-dynamic";

/**
 * Foto de perfil (D-PHOTO): confere quem pede (equipe da marca ou creator da mesma marca) e manda para a foto (link
 * assinado do bucket privado ou a do Instagram). Sem foto ou sem acesso: 404 (a tela mostra as iniciais).
 */
export async function GET(req: Request, { params }: { params: Promise<{ creatorId: string }> }) {
  const { creatorId } = await params;
  const url = await photoFor(db(), await currentActor(), creatorId, supabasePhotoStore());
  const headers = { "Cache-Control": "private, max-age=600" };
  if (!url) return new NextResponse(null, { status: 404, headers });
  return NextResponse.redirect(new URL(url, req.url), { status: 302, headers });
}
