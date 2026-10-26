"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { UFS } from "@/lib/shipments/address";

/**
 * Endereço com busca pelo CEP (D-CEPAUTO, pedido do responsável em 2026-10-26): ao completar os 8 dígitos, rua, bairro,
 * cidade e UF vêm do ViaCEP e o cursor vai para o número. Usado no portal (Envios), no contrato do portal e na "Nova
 * candidata" da equipe. Com `compose`, manda o endereço numa linha só (campo de texto); sem ele, um campo por parte.
 */

export type AddressValue = { zip: string; street: string; number: string; complement: string; district: string; city: string; state: string };

const EMPTY: AddressValue = { zip: "", street: "", number: "", complement: "", district: "", city: "", state: "" };

const maskZip = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

/** O endereço numa linha (o mesmo jeito do cadastro pelo site). Incompleto: vazio. */
export function addressLine(a: AddressValue): string {
  const zip = a.zip.replace(/\D/g, "");
  if (zip.length !== 8 || !a.street.trim() || !a.number.trim() || !a.city.trim() || !a.state) return "";
  const comp = a.complement.trim() ? ` — ${a.complement.trim()}` : "";
  return `${a.street.trim()}, ${a.number.trim()}${comp}, ${a.district.trim()}, ${a.city.trim()}/${a.state}, CEP ${zip.slice(0, 5)}-${zip.slice(5)}`;
}

type Lookup = "idle" | "loading" | "notfound";

export function AddressFields({
  initial,
  inputClass,
  labelClass = "flex flex-col gap-1 text-xs text-stone-500",
  compose,
  required = true,
  onChange,
}: {
  initial?: { [K in keyof AddressValue]?: string | null } | null;
  inputClass: string;
  labelClass?: string;
  /** Nome do campo que leva o endereço numa linha (sem ele: zip, street, number, complement, district, city, state). */
  compose?: string;
  required?: boolean;
  onChange?: (v: AddressValue, line: string) => void;
}) {
  const [v, setV] = useState<AddressValue>({ ...EMPTY, ...Object.fromEntries(Object.entries(initial ?? {}).filter(([, x]) => x != null)) });
  const [lookup, setLookup] = useState<Lookup>("idle");
  const asked = useRef("");
  const numberRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof AddressValue, value: string) => setV((cur) => ({ ...cur, [k]: value }));

  // A função de fora muda a cada desenho; guardada num ref para avisar só quando o endereço muda.
  const notify = useRef(onChange);
  notify.current = onChange;
  useEffect(() => notify.current?.(v, addressLine(v)), [v]);

  async function search(zip: string) {
    const d = zip.replace(/\D/g, "");
    if (d.length !== 8 || asked.current === d) return;
    asked.current = d;
    setLookup("loading");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const data = (await res.json()) as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (asked.current !== d) return;
      if (!res.ok || data.erro) return setLookup("notfound");
      setV((cur) => ({
        ...cur,
        street: data.logradouro || cur.street,
        district: data.bairro || cur.district,
        city: data.localidade || cur.city,
        state: data.uf || cur.state,
      }));
      setLookup("idle");
      requestAnimationFrame(() => numberRef.current?.focus());
    } catch {
      setLookup("notfound");
    }
  }

  // CEP já preenchido ao abrir (ex.: vindo do endereço informado): busca uma vez.
  useEffect(() => {
    if (v.zip.replace(/\D/g, "").length === 8 && !v.street) void search(v.zip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = (k: keyof AddressValue) => (compose ? undefined : k);
  const req = required;
  return (
    <div className="grid grid-cols-6 gap-3">
      {compose && <input type="hidden" name={compose} value={addressLine(v)} />}
      <label className={`${labelClass} col-span-3 md:col-span-2`}>
        CEP
        <span className="relative">
          <input
            name={name("zip")}
            value={maskZip(v.zip)}
            onChange={(e) => {
              set("zip", e.target.value);
              void search(e.target.value);
            }}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            required={req}
            className={inputClass}
          />
          {lookup === "loading" && <LoaderCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-stone-400" />}
        </span>
        {lookup === "notfound" && <span className="text-amber-700 dark:text-amber-300">CEP não encontrado: preencha o endereço.</span>}
      </label>
      <label className={`${labelClass} col-span-3 md:col-span-1`}>
        UF
        <select name={name("state")} value={v.state} onChange={(e) => set("state", e.target.value)} required={req} className={inputClass}>
          <option value="" disabled>—</option>
          {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
        </select>
      </label>
      <label className={`${labelClass} col-span-6 md:col-span-3`}>
        Cidade
        <input name={name("city")} value={v.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" required={req} className={inputClass} />
      </label>
      <label className={`${labelClass} col-span-6 md:col-span-4`}>
        Rua
        <input name={name("street")} value={v.street} onChange={(e) => set("street", e.target.value)} autoComplete="address-line1" required={req} className={inputClass} />
      </label>
      <label className={`${labelClass} col-span-2 md:col-span-2`}>
        Número
        <input ref={numberRef} name={name("number")} value={v.number} onChange={(e) => set("number", e.target.value)} maxLength={20} required={req} className={inputClass} />
      </label>
      <label className={`${labelClass} col-span-4 md:col-span-3`}>
        Complemento
        <input name={name("complement")} value={v.complement} onChange={(e) => set("complement", e.target.value)} maxLength={80} autoComplete="address-line2" className={inputClass} />
      </label>
      <label className={`${labelClass} col-span-6 md:col-span-3`}>
        Bairro
        <input name={name("district")} value={v.district} onChange={(e) => set("district", e.target.value)} maxLength={80} required={req} className={inputClass} />
      </label>
    </div>
  );
}
