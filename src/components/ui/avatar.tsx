"use client";

import { useEffect, useState } from "react";

const SIZE = { sm: "size-6 text-[9px]", md: "size-9 text-xs", lg: "size-14 text-lg", xl: "size-16 text-xl", hero: "size-16 text-2xl md:size-20 md:text-3xl" } as const;

/**
 * Fotos pedidas em lote (D-PHOTO): todas as fotos que aparecem na tela juntas num pedido só (`/foto?ids=`), para não
 * fazer um pedido ao servidor (e ao banco) por foto. Guarda o resultado enquanto a página estiver aberta.
 */
const cache = new Map<string, Promise<string | null>>();
let queue: { id: string; resolve: (url: string | null) => void }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const batch = queue;
  queue = [];
  for (let i = 0; i < batch.length; i += 100) {
    const part = batch.slice(i, i + 100);
    fetch(`/foto?ids=${part.map((p) => encodeURIComponent(p.id)).join(",")}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, string | null>>) : {}))
      .catch(() => ({}) as Record<string, string | null>)
      .then((map) => part.forEach((p) => p.resolve((map as Record<string, string | null>)[p.id] ?? null)));
  }
}

function photoUrl(id: string, fresh: boolean): Promise<string | null> {
  if (!fresh && cache.has(id)) return cache.get(id)!;
  const p = new Promise<string | null>((resolve) => {
    queue.push({ id, resolve });
    timer ??= setTimeout(flush, 30);
  });
  cache.set(id, p);
  return p;
}

/**
 * Foto de perfil no círculo (D-PHOTO); enquanto carrega, ou sem foto, as iniciais com a cor da marca. `id` = creator
 * (o servidor confere quem pode ver); `v` muda quando a foto acabou de mudar (busca de novo).
 */
export function Avatar({ name, id, v, size = "md", square = false, className = "" }: { name: string; id?: string | null; v?: Date | string | number | null; size?: keyof typeof SIZE; square?: boolean; className?: string }) {
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const [src, setSrc] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    setOk(false);
    if (!id) return void setSrc(null);
    photoUrl(id, Boolean(v)).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [id, v]);
  return (
    <span
      aria-hidden
      className={`relative grid shrink-0 place-content-center overflow-hidden ${square ? "rounded-[22px]" : "rounded-full"} bg-[radial-gradient(120%_120%_at_25%_10%,color-mix(in_srgb,var(--brand)_70%,white),var(--brand)_55%,color-mix(in_srgb,var(--brand)_75%,black))] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_4px_10px_-4px_var(--brand)] ${SIZE[size]} ${className}`}
    >
      {ini}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onLoad={() => setOk(true)}
          onError={() => setSrc(null)}
          className={`absolute inset-0 size-full object-cover transition-opacity ${ok ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}
