"use client";

import { Camera } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { removePhotoAction, uploadPhotoAction } from "@/app/foto/actions";
import { Avatar } from "./avatar";

/** Reduz a foto no navegador: recorte quadrado no centro, 512 × 512, JPEG. */
async function squareJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 512, 512);
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("foto"))), "image/jpeg", 0.85));
}

/**
 * Foto de perfil com trocar e tirar (D-PHOTO). `marca` = a própria creator no portal; sem `marca`, a equipe na ficha
 * (`creatorId`). Creator: "Usar a do Instagram" tira a foto subida; equipe: "Tirar foto" (volta para a do Instagram
 * ou esconde a do Instagram).
 */
export function PhotoEditor({ creatorId, name, marca = null, size = "md", square = false, light = false }: { creatorId: string; name: string; marca?: string | null; size?: "md" | "lg" | "hero"; square?: boolean; light?: boolean }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);
  const base = () => {
    const f = new FormData();
    if (marca) f.set("marca", marca);
    else f.set("creatorId", creatorId);
    return f;
  };
  const pick = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      try {
        const f = base();
        f.set("photo", new File([await squareJpeg(file)], "foto.jpg", { type: "image/jpeg" }));
        const r = await uploadPhotoAction(f);
        setMsg(r ?? null);
        if (r?.ok) setV(Date.now());
      } catch {
        setMsg({ error: "Não deu para ler essa foto. Tente outra (JPG ou PNG)." });
      }
      setOpen(false);
    });
  };
  const remove = () =>
    start(async () => {
      const r = await removePhotoAction(base());
      setMsg(r ?? null);
      if (r?.ok) setV(Date.now());
      setOpen(false);
    });
  return (
    <span className="relative inline-flex shrink-0">
      <button type="button" onClick={() => setOpen(!open)} aria-label="Foto de perfil: trocar" className={`relative rounded-full ${pending ? "animate-pulse" : ""}`}>
        <Avatar key={v ?? 0} name={name} id={creatorId} v={v} size={size} square={square} className={light ? "ring-2 ring-white/60" : ""} />
        <span className="absolute -bottom-1 -right-1 grid size-6 place-content-center rounded-full bg-white text-stone-700 shadow ring-1 ring-black/5 dark:bg-stone-800 dark:text-stone-200"><Camera className="size-3.5" /></span>
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {open && (
        <span className="absolute left-0 top-full z-30 mt-2 flex w-56 flex-col gap-1 rounded-2xl bg-white/95 p-1.5 text-sm text-stone-800 shadow-lg ring-1 ring-black/5 backdrop-blur dark:bg-stone-900/95 dark:text-stone-100 dark:ring-white/10">
          <button type="button" disabled={pending} onClick={() => input.current?.click()} className="rounded-xl px-3 py-2 text-left font-medium hover:bg-stone-500/10">Trocar foto</button>
          <button type="button" disabled={pending} onClick={remove} className="rounded-xl px-3 py-2 text-left hover:bg-stone-500/10">{marca ? "Usar a foto do Instagram" : "Tirar foto"}</button>
          <span className="px-3 pb-1 text-[11px] text-stone-500">{marca ? "Sem foto aqui, usamos a do seu Instagram." : "Sem foto subida, vale a do Instagram; tirar de novo esconde a do Instagram."}</span>
        </span>
      )}
      {msg && (
        <span role="status" className={`absolute left-0 top-full z-20 mt-2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium shadow ${msg.error ? "bg-red-600 text-white" : "bg-emerald-600 text-white"} ${open ? "hidden" : ""}`}>
          {msg.error ?? msg.ok}
        </span>
      )}
    </span>
  );
}
