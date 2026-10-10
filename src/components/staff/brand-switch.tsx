"use client";

import { usePathname } from "next/navigation";
import { chooseBrandAction } from "@/app/admin/actions";

/** Troca de marca no topo (A1): continua na mesma tela, agora com a outra marca. */
export function BrandSwitchOption({ slug, name, color }: { slug: string; name: string; color: string }) {
  const path = usePathname();
  return (
    <form action={chooseBrandAction}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="next" value={path.split("/").slice(0, 3).join("/")} />
      <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/60 dark:hover:bg-white/10">
        <span className="size-3 rounded-full" style={{ background: color }} />
        {name}
      </button>
    </form>
  );
}
