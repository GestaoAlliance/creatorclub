"use client";

import { UserRound, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { ui } from "@/components/ui/styles";

/**
 * D-PERIODPICK: escolher uma creator pelo nome (digita e escolhe na lista). Muda `creator` no endereço e mantém o
 * período e os outros filtros; o × tira o filtro.
 */
export function CreatorPicker({ options, value }: { options: { id: string; name: string }[]; value: string | null }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const list = useId();
  const current = options.find((o) => o.id === value) ?? null;
  const [text, setText] = useState(current?.name ?? "");

  const go = (id: string | null) => {
    const q = new URLSearchParams(params.toString());
    for (const k of ["creator", "pagina", "motivo"]) q.delete(k);
    if (id) q.set("creator", id);
    const s = q.toString();
    router.push(`${path}${s ? `?${s}` : ""}#lista`);
  };

  return (
    <label className="relative min-w-0 flex-[1_1_12rem]">
      <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
      <input
        list={list}
        value={text}
        placeholder="Creator"
        aria-label="Escolher creator"
        onChange={(e) => {
          setText(e.target.value);
          const hit = options.find((o) => o.name.toLowerCase() === e.target.value.trim().toLowerCase());
          if (hit && hit.id !== value) go(hit.id);
        }}
        className={`${ui.input} !rounded-full pl-10 ${current ? "pr-9 font-medium" : ""}`}
      />
      <datalist id={list}>
        {options.map((o) => <option key={o.id} value={o.name} />)}
      </datalist>
      {current && (
        <button type="button" onClick={() => { setText(""); go(null); }} aria-label="Tirar o filtro de creator" className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-content-center rounded-full hover:bg-stone-500/10">
          <X className="size-3.5" />
        </button>
      )}
    </label>
  );
}
