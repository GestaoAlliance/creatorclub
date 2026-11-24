"use client";

import { FileSignature } from "lucide-react";
import { useActionState } from "react";
import { Msg } from "@/components/ui/msg";
import { ui } from "@/components/ui/styles";
import { legacyAction } from "./actions";

type Row = { id: string; name: string; signerNames: string[]; signerEmails: string[]; signedAt: Date; status: string; candidates: { id: string; name: string }[] };

const date = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function Decide({ r, creators }: { r: Row; creators: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(legacyAction, undefined);
  const options = r.candidates.length ? r.candidates : creators;
  return (
    <li className={`${ui.row} flex flex-col gap-2`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{r.name}</span>
        <span className={ui.hint}>assinado em {date(r.signedAt)}</span>
      </div>
      <p className={ui.hint}>
        Quem assinou: {r.signerNames.join(", ") || "—"}{r.signerEmails.length ? ` (${r.signerEmails.join(", ")})` : ""}.{" "}
        {r.status === "AMBIGUOUS" ? "Mais de uma creator possível: escolha qual." : "Nenhuma creator com esse e-mail ou nome."}
      </p>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="legacyId" value={r.id} />
        <select name="creatorId" className={`${ui.input} max-w-72`} defaultValue="">
          <option value="" disabled>Escolha a creator…</option>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className={ui.btnSm} name="op" value="link" disabled={pending}>É dela</button>
        <button className={ui.ghostSm} name="op" value="ignore" disabled={pending}>Não é de creator</button>
        <Msg state={state} />
      </form>
    </li>
  );
}

/** D-LEGACYCONTRACT: contratos assinados no Autentique antes do Creator Club. */
export function LegacyContracts({ open, creators, attached }: { open: Row[]; creators: { id: string; name: string }[]; attached: number }) {
  const [state, action, pending] = useActionState(legacyAction, undefined);
  return (
    <section className={`${ui.card} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={ui.h2}><FileSignature className="size-4" /> Contratos antigos do Autentique</h2>
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="op" value="scan" />
          <button className={ui.ghostSm} disabled={pending}>{pending ? "Pedindo…" : "Buscar agora"}</button>
          <Msg state={state} />
        </form>
      </div>
      <p className={ui.hint}>
        O sistema procura todo dia, no Autentique da marca, os contratos assinados antes do Creator Club e anexa o mais recente na
        ficha de cada creator (pelo e-mail ou pelo nome de quem assinou). {attached} {attached === 1 ? "contrato já anexado" : "contratos já anexados"}.
        {open.length ? " Estes precisam de você:" : " Nada para conferir."}
      </p>
      {open.length > 0 && <ul className={ui.list}>{open.map((r) => <Decide key={r.id} r={r} creators={creators} />)}</ul>}
    </section>
  );
}
