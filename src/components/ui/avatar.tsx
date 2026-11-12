"use client";

import { useEffect, useRef, useState } from "react";
import { photoHref } from "@/domain";

const SIZE = { sm: "size-6 text-[9px]", md: "size-9 text-xs", lg: "size-14 text-lg", xl: "size-16 text-xl", hero: "size-16 text-2xl md:size-20 md:text-3xl" } as const;

/**
 * Foto de perfil no círculo (D-PHOTO); enquanto carrega, ou sem foto, as iniciais com a cor da marca. `id` = creator
 * (a rota /foto confere quem pode ver); `v` troca quando a foto muda.
 */
export function Avatar({ name, id, v, size = "md", square = false, className = "" }: { name: string; id?: string | null; v?: Date | string | number | null; size?: keyof typeof SIZE; square?: boolean; className?: string }) {
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A imagem pode ter carregado (ou falhado) antes da página ficar interativa.
    const img = ref.current;
    if (img?.complete) setState(img.naturalWidth > 0 ? "ok" : "none");
  }, [id, v]);
  return (
    <span
      aria-hidden
      className={`relative grid shrink-0 place-content-center overflow-hidden ${square ? "rounded-[22px]" : "rounded-full"} bg-[radial-gradient(120%_120%_at_25%_10%,color-mix(in_srgb,var(--brand)_70%,white),var(--brand)_55%,color-mix(in_srgb,var(--brand)_75%,black))] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_4px_10px_-4px_var(--brand)] ${SIZE[size]} ${className}`}
    >
      {ini}
      {id && state !== "none" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={photoHref(id, typeof v === "number" ? String(v) : v)}
          alt=""
          loading="lazy"
          onLoad={() => setState("ok")}
          onError={() => setState("none")}
          className={`absolute inset-0 size-full object-cover transition-opacity ${state === "ok" ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}
