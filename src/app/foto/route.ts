import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { photosFor, supabasePhotoStore } from "@/lib/photos/photos";

export const dynamic = "force-dynamic";

/** D-PHOTO: fotos de várias creators num pedido só (`?ids=a,b,c`): { id: endereço da foto | null }. */
export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter((s) => /^[0-9a-zA-Z-]{1,64}$/.test(s));
  const map = await photosFor(db(), await currentActor(), ids, supabasePhotoStore());
  return NextResponse.json(map, { headers: { "Cache-Control": "private, max-age=600" } });
}
