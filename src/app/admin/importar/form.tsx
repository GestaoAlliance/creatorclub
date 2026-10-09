"use client";

import { useActionState } from "react";
import { importAction } from "./actions";

const input = "w-full rounded border border-stone-300 px-3 py-2";

export function ImportForm({ brands }: { brands: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(importAction, undefined);
  const r = state?.report;
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">Marca
          <select className={input} name="brandId">
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">Arquivo da tabela Creator do app antigo (CSV)
          <input className={input} name="file" type="file" accept=".csv,text/csv" required />
        </label>
        {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        <button className="rounded bg-brand px-3 py-2 font-semibold text-white disabled:opacity-60" disabled={pending}>
          {pending ? "Importando…" : "Importar"}
        </button>
      </form>

      {r && (
        <section className="flex flex-col gap-2 text-sm">
          <h2 className="font-semibold">Resultado</h2>
          <p>{r.rowsForBrand} linhas desta marca (de {r.rowsInFile} no arquivo).</p>
          <p>
            Criados: {r.created.accounts} contas, {r.created.creators} creators, {r.created.coupons} cupons,{" "}
            {r.created.assignments} donas e {r.created.policies} taxas, tudo <strong>a confirmar</strong>. Sem mudança: {r.unchanged}.
          </p>
          {r.fakeEmails.length > 0 && (
            <p>E-mail falso do app antigo (revisar antes de convidar): {r.fakeEmails.map((f) => f.name).join(", ")}.</p>
          )}
          {r.differences.length > 0 && (
            <div>
              <h3 className="font-semibold">Diferenças entre o arquivo e o sistema (nada foi sobrescrito)</h3>
              <ul className="list-disc pl-5">
                {r.differences.map((d, i) => (
                  <li key={i}>{d.name} · {d.field}: arquivo “{d.file}”, sistema “{d.current}”</li>
                ))}
              </ul>
            </div>
          )}
          {r.errors.length > 0 && (
            <div className="text-red-800">
              <h3 className="font-semibold">Linhas com erro (não importadas)</h3>
              <ul className="list-disc pl-5">{r.errors.map((e) => <li key={e.legacyId}>{e.legacyId}: {e.error}</li>)}</ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
