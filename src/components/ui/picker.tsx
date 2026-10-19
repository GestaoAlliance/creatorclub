"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { badge, ui } from "./styles";

/** Uma opção do seletor: nome em destaque, detalhe (cupom, @, e-mail) embaixo e um selo opcional. */
export type PickerOption = { id: string; name: string; detail?: string | null; tag?: string | null; disabled?: boolean };

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Seletor com busca (D-DESIGNALL) no lugar de um `<select>` com dezenas de nomes: abre uma lista que filtra por nome,
 * cupom, @ ou e-mail enquanto se digita; setas e Enter escolhem, Esc fecha. O valor vai num campo escondido `name`,
 * então funciona dentro de qualquer formulário de ação do servidor.
 */
export function Picker(props: {
  name: string;
  options: PickerOption[];
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
  /** Versão compacta, para linhas de tabela. */
  small?: boolean;
}) {
  const [value, setValue] = useState(props.defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const selected = props.options.find((o) => o.id === value) ?? null;

  const shown = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return props.options;
    return props.options.filter((o) => {
      const hay = norm(`${o.name} ${o.detail ?? ""}`);
      return words.every((w) => hay.includes(w));
    });
  }, [q, props.options]);

  const choose = (o: PickerOption | undefined) => {
    if (!o || o.disabled) return;
    setValue(o.id);
    setOpen(false);
    setQ("");
  };
  const move = (step: number) => {
    setCursor((c) => {
      const next = Math.max(0, Math.min(shown.length - 1, c + step));
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
      return next;
    });
  };

  return (
    <div className={props.small ? "w-full min-w-56 max-w-sm" : "w-full"}>
      {/* Campo escondido com o valor; `required` só vale se nada foi escolhido. */}
      <input type="hidden" name={props.name} value={value} />
      {props.required && !value && <input tabIndex={-1} aria-hidden required value="" onChange={() => {}} className="sr-only" />}
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setCursor(0);
          }}
          aria-haspopup="listbox"
          className={`${props.small ? ui.inputSm : ui.input} flex w-full items-center justify-between gap-2 text-left`}
        >
          {selected ? (
            <span className="min-w-0 truncate">
              <span className="font-medium">{selected.name}</span>
              {selected.detail && <span className="ml-1.5 text-xs text-stone-500">{selected.detail}</span>}
            </span>
          ) : (
            <span className="text-stone-500">{props.placeholder ?? "Escolher…"}</span>
          )}
          <ChevronDown className="size-4 shrink-0 text-stone-500" />
        </button>
      ) : (
        <div className="glass flex flex-col overflow-hidden rounded-2xl shadow-lg">
          <div className="flex items-center gap-2 border-b border-stone-200/70 px-3 dark:border-white/10">
            <Search className="size-4 shrink-0 text-stone-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCursor(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") (e.preventDefault(), move(1));
                else if (e.key === "ArrowUp") (e.preventDefault(), move(-1));
                else if (e.key === "Enter") (e.preventDefault(), choose(shown[cursor]));
                else if (e.key === "Escape") (e.preventDefault(), setOpen(false));
              }}
              placeholder="Buscar por nome, cupom, @ ou e-mail"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              className="w-full bg-transparent py-2.5 text-sm outline-none"
            />
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-full p-1 text-stone-500 hover:bg-stone-500/10">
              <X className="size-4" />
            </button>
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="max-h-72 overflow-y-auto p-1.5">
            {shown.length === 0 && <li className="px-3 py-4 text-center text-sm text-stone-500">Ninguém encontrado.</li>}
            {shown.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={o.id === value}
                aria-disabled={o.disabled}
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(o)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 ${o.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${i === cursor ? "bg-stone-500/10 dark:bg-white/10" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{o.name}</span>
                  {o.detail && <span className="block truncate text-xs text-stone-500">{o.detail}</span>}
                </span>
                {o.tag && <span className={badge.neutral}>{o.tag}</span>}
                {o.id === value && <Check className="size-4 shrink-0 text-brand" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
