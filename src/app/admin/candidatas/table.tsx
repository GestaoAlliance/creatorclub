"use client";

import { ChevronDown, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useActionState, useCallback, useEffect, useState, type ReactNode } from "react";
import { Msg } from "@/components/ui/msg";
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/ui/social-icons";
import { badge, ui } from "@/components/ui/styles";
import { instagramUrl, whatsappChatUrl } from "@/domain";
import { rejectAction, rejectManyAction } from "./actions";

/** O essencial de cada candidata para a tabela (o cartão completo vem pronto do servidor em `detail`). */
export type CandidateRow = {
  id: string;
  name: string;
  phone: string | null;
  instagram: string | null;
  tiktok: string | null;
  followers: string | null;
  kind: string;
  kindTone: "neutral" | "sky" | "amber";
  origin: string;
  hunter: string | null;
  /** D-ORIGIN: código digitado sem link correspondente, e se veio do formulário de hunter. */
  hunterCode: string | null;
  viaHunterForm: boolean;
  brands: string[];
  duplicate: boolean;
  /** M2.3 (D-PRIORITY): selo e os motivos (aparecem ao passar o mouse e no celular). */
  priority: { level: "ALTA" | "MEDIA" | "BAIXA" | "REPETIDA"; label: string; reasons: string };
  days: number;
  canDecide: boolean;
  creatorId: string | null;
  detail: ReactNode;
};

type Chip = "" | "dup" | "hunter" | "old";
type Open = { id: string; mode: "view" | "reject" } | null;

const ext = { target: "_blank", rel: "noopener noreferrer", onClick: (e: React.MouseEvent) => e.stopPropagation() } as const;
const handle = (h: string) => h.replace(/^@/, "");
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const ago = (d: number) => (d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`);

/** Recusar direto na linha: motivo opcional (só a equipe vê) e confirmar. Quem é recusada não recebe mensagem. */
function QuickReject({ id, name, onCancel }: { id: string; name: string; onCancel: () => void }) {
  const [state, action, pending] = useActionState(rejectAction, undefined);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={action} onClick={(e) => e.stopPropagation()} className="flex flex-col gap-2 rounded-2xl border border-red-300/60 bg-red-50/70 p-3 dark:border-red-400/30 dark:bg-red-950/30">
      <input type="hidden" name="applicationId" value={id} />
      <p className="text-sm">Recusar <strong>{name}</strong>?</p>
      <div className="flex flex-wrap items-center gap-2">
        <input name="note" maxLength={300} placeholder="Motivo (opcional, só a equipe vê)" className={`${ui.inputSm} min-w-0 basis-full sm:basis-0 sm:flex-1`} autoFocus />
        <button className={ui.dangerSm} disabled={pending}>{pending ? "Recusando…" : "Confirmar recusa"}</button>
        <button type="button" onClick={onCancel} className={ui.ghostSm}>Cancelar</button>
      </div>
      <Msg state={state?.error ? { error: state.error } : undefined} />
    </form>
  );
}

/** M4.1 (D-MANUALAPP): recusar as marcadas de uma vez, com um motivo opcional para todas (aprovar segue uma a uma). */
function BulkReject({ ids, onDone, onClear }: { ids: string[]; onDone: () => void; onClear: () => void }) {
  const [state, action, pending] = useActionState(rejectManyAction, undefined);
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      setConfirm(false);
      onDone();
      router.refresh();
    }
  }, [state, router, onDone]);
  if (ids.length === 0) return state?.ok ? <Msg state={state} /> : null;
  return (
    <form action={action} className="sticky top-2 z-10 flex flex-col gap-2 rounded-2xl border border-stone-200/80 bg-white/90 p-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-stone-900/90">
      {ids.map((id) => <input key={id} type="hidden" name="applicationId" value={id} />)}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{ids.length === 1 ? "1 marcada" : `${ids.length} marcadas`}</p>
        {confirm ? (
          <>
            <input name="note" maxLength={300} placeholder="Motivo (opcional, só a equipe vê)" className={`${ui.inputSm} min-w-0 basis-full sm:basis-0 sm:flex-1`} autoFocus />
            <button className={ui.dangerSm} disabled={pending}>{pending ? "Recusando…" : `Confirmar recusa de ${ids.length}`}</button>
            <button type="button" onClick={() => setConfirm(false)} className={ui.ghostSm}>Cancelar</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setConfirm(true)} className={ui.dangerSm}>Recusar marcadas</button>
            <button type="button" onClick={onClear} className={ui.ghostSm}>Desmarcar</button>
          </>
        )}
      </div>
      <Msg state={state?.error ? state : undefined} />
    </form>
  );
}

function Pick({ c, picked, onPick }: { c: CandidateRow; picked: boolean; onPick: (id: string) => void }) {
  if (!c.canDecide) return null;
  return (
    <input
      type="checkbox"
      checked={picked}
      onChange={() => onPick(c.id)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Marcar ${c.name}`}
      className="size-4 accent-current"
    />
  );
}

function Actions({ c, onApprove, onReject }: { c: CandidateRow; onApprove: () => void; onReject: () => void }) {
  if (c.creatorId) return <Link href={`/admin/creators/${c.creatorId}`} onClick={(e) => e.stopPropagation()} className={ui.ghostSm}>Abrir a ficha</Link>;
  if (!c.canDecide) return null;
  return (
    <span className="flex items-center justify-end gap-1.5">
      <button type="button" onClick={(e) => { e.stopPropagation(); onApprove(); }} className={ui.btnSm}>Aprovar</button>
      <button type="button" onClick={(e) => { e.stopPropagation(); onReject(); }} className={ui.ghostSm} aria-label={`Recusar ${c.name}`}>
        <X className="size-3.5" /> Recusar
      </button>
    </span>
  );
}

function Socials({ c }: { c: CandidateRow }) {
  const ig = c.instagram ? instagramUrl(c.instagram) : null;
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {c.instagram ? (
        ig ? <a href={ig} {...ext} className="inline-flex items-center gap-1.5 hover:underline"><InstagramIcon className="size-3.5 text-pink-600" />{handle(c.instagram)}</a> : <span>@{handle(c.instagram)}</span>
      ) : (
        <span className="text-stone-400">—</span>
      )}
      {c.tiktok && <a href={`https://www.tiktok.com/@${handle(c.tiktok)}`} {...ext} className="inline-flex items-center gap-1.5 hover:underline"><TikTokIcon className="size-3.5" />{handle(c.tiktok)}</a>}
      {c.followers && <span className="text-stone-500">{c.followers} seguidores</span>}
    </div>
  );
}

const PRIORITY_TONE = { ALTA: badge.green, MEDIA: badge.amber, BAIXA: badge.neutral, REPETIDA: badge.red } as const;

function PriorityBadge({ c }: { c: CandidateRow }) {
  return <span title={c.priority.reasons} className={PRIORITY_TONE[c.priority.level]}>{c.priority.label}</span>;
}

function Who({ c }: { c: CandidateRow }) {
  const wa = c.phone ? whatsappChatUrl(c.phone) : null;
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid size-10 shrink-0 place-content-center rounded-full bg-gradient-to-br from-brand to-brand/60 text-sm font-semibold text-white shadow-sm dark:from-brand-2 dark:to-brand-2/60">{initials(c.name)}</span>
      <div className="min-w-0">
        <p className="truncate font-medium">{c.name}</p>
        {wa ? (
          <a href={wa} {...ext} className="inline-flex items-center gap-1 text-xs text-stone-600 hover:text-emerald-700 dark:text-stone-300"><WhatsAppIcon className="size-3.5 text-emerald-600" />{c.phone}</a>
        ) : (
          <span className="text-xs text-stone-500">{c.phone ?? "sem WhatsApp"}</span>
        )}
        {(c.duplicate || c.brands.length > 0) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {c.duplicate && <span className={badge.red}>repetida</span>}
            {c.brands.map((b) => <span key={b} className={badge.green}>{b}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Candidatas no modelo da referência: tabela com redes, tipo, origem e há quantos dias espera; aprovar e recusar na
 * linha. Aprovar abre o formulário já preenchido (cupom, tipo, comissão, desconto) para confirmar, porque cria o cupom
 * na Shopify; recusar pede só o motivo opcional. Clicar na linha mostra tudo o que ela respondeu.
 */
/** D-ORIGIN: de onde a candidata veio, em destaque (a Gestão decide sabendo qual hunter trouxe). */
function CameFrom({ c }: { c: CandidateRow }) {
  if (c.hunter)
    return (
      <span className="flex flex-col items-start gap-0.5">
        <span className="rounded-xl bg-brand px-2.5 py-1 text-xs font-semibold leading-tight text-white dark:bg-brand-2">Hunter: {c.hunter}</span>
        <span className="text-[11px] text-stone-500">{c.origin}</span>
      </span>
    );
  if (c.hunterCode || c.viaHunterForm)
    return (
      <span className="flex flex-col items-start gap-0.5">
        <span className="rounded-xl bg-amber-500/15 px-2.5 py-1 text-xs font-medium leading-tight text-amber-800 dark:text-amber-300">{c.hunterCode ? `Hunter: código "${c.hunterCode}" não encontrado` : "Hunter não informado"}</span>
        <span className="text-[11px] text-stone-500">{c.origin}</span>
      </span>
    );
  return <span className="text-xs">{c.origin}</span>;
}

export function CandidateTable({ rows, pending }: { rows: CandidateRow[]; pending: boolean }) {
  const [open, setOpen] = useState<Open>(null);
  const [chip, setChip] = useState<Chip>("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pick = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clear = useCallback(() => setPicked(new Set()), []);
  const chips: { id: Chip; label: string; test: (c: CandidateRow) => boolean }[] = [
    { id: "old", label: "esperando há mais de 7 dias", test: (c) => pending && c.days > 7 },
    { id: "hunter", label: "trazidas por hunter", test: (c) => c.hunter !== null || c.hunterCode !== null || c.viaHunterForm },
    { id: "dup", label: "podem ser repetidas", test: (c) => c.duplicate },
  ];
  const active = chips.find((x) => x.id === chip);
  const shown = active ? rows.filter(active.test) : rows;
  const pickable = pending ? shown.filter((c) => c.canDecide) : [];
  const allPicked = pickable.length > 0 && pickable.every((c) => picked.has(c.id));
  const pickAll = () => setPicked(allPicked ? new Set() : new Set(pickable.map((c) => c.id)));
  const toggle = (id: string, mode: "view" | "reject" = "view") => setOpen((o) => (o?.id === id && o.mode === mode ? null : { id, mode }));
  const approve = (id: string) => {
    setOpen({ id, mode: "view" });
    setTimeout(() => document.getElementById(`cand-${id}`)?.querySelector("form input[name=coupon]")?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
  };
  const expanded = (c: CandidateRow) =>
    open?.id === c.id && (
      <div id={`cand-${c.id}`} className="flex flex-col gap-3 pb-4" onClick={(e) => e.stopPropagation()}>
        {open.mode === "reject" ? <QuickReject id={c.id} name={c.name} onCancel={() => setOpen(null)} /> : c.detail}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {chips.map((x) => {
          const n = rows.filter(x.test).length;
          if (!n && chip !== x.id) return null;
          return (
            <button key={x.id} type="button" onClick={() => setChip(chip === x.id ? "" : x.id)} className={`rounded-full border px-3 py-1 text-xs font-medium ${chip === x.id ? "border-amber-500 bg-amber-500 text-white" : "border-amber-400/60 bg-amber-100/60 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"}`}>
              {n} {x.label}
            </button>
          );
        })}
      </div>

      {pending && <BulkReject ids={[...picked].filter((id) => rows.some((r) => r.id === id))} onDone={clear} onClear={clear} />}

      {shown.length === 0 ? (
        <p className={ui.muted}>Nenhuma candidata aqui.</p>
      ) : (
        <>
          {/* Celular: um cartão por candidata. */}
          <ul data-tour="cand-lista" className="flex flex-col divide-y divide-stone-200/70 md:hidden dark:divide-white/10">
            {shown.map((c) => (
              <li key={c.id} onClick={() => toggle(c.id)} className="flex cursor-pointer flex-col gap-2 py-3">
                <div className="flex items-start gap-2">
                  {pending && <span className="pt-3"><Pick c={c} picked={picked.has(c.id)} onPick={pick} /></span>}
                  <Who c={c} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-12 text-xs">
                  {c.instagram && <span className="inline-flex items-center gap-1"><InstagramIcon className="size-3.5 text-pink-600" />{handle(c.instagram)}</span>}
                  {c.tiktok && <span className="inline-flex items-center gap-1"><TikTokIcon className="size-3.5" />{handle(c.tiktok)}</span>}
                  {c.followers && <span className="text-stone-500">{c.followers} seg.</span>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-12">
                  <PriorityBadge c={c} />
                  <span className={badge[c.kindTone]}>{c.kind}</span>
                  <span className={ui.hint}>{ago(c.days)}</span>
                </div>
                <div className="pl-12">
                  <CameFrom c={c} />
                </div>
                <div className="pl-12">
                  <Actions c={c} onApprove={() => approve(c.id)} onReject={() => toggle(c.id, "reject")} />
                </div>
                {expanded(c)}
              </li>
            ))}
          </ul>
          <div className="-mx-2 hidden overflow-x-auto md:block">
            <table data-tour="cand-lista" className="w-full min-w-[1000px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:text-xs [&>th]:font-medium [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-stone-500">
                  {pending && (
                    <th className="w-8">
                      {pickable.length > 0 && <input type="checkbox" checked={allPicked} onChange={pickAll} aria-label="Marcar todas" className="size-4 accent-current" />}
                    </th>
                  )}
                  <th>Prioridade</th>
                  <th>Candidata</th>
                  <th>Redes</th>
                  <th>Tipo</th>
                  <th>Veio de</th>
                  <th>Chegou</th>
                  <th className="!text-right">{pending ? "Decidir" : ""}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <Fragment key={c.id}>
                    <tr onClick={() => toggle(c.id)} className="group cursor-pointer align-top transition-colors hover:bg-stone-500/5 [&>td]:border-t [&>td]:border-stone-200/70 [&>td]:px-3 [&>td]:py-3 dark:[&>td]:border-white/10">
                      {pending && <td><Pick c={c} picked={picked.has(c.id)} onPick={pick} /></td>}
                      <td>
                        <PriorityBadge c={c} />
                        {c.priority.reasons && <span className="mt-1 block max-w-36 text-[11px] leading-tight text-stone-500">{c.priority.reasons}</span>}
                      </td>
                      <td className="max-w-72"><Who c={c} /></td>
                      <td><Socials c={c} /></td>
                      <td><span className={badge[c.kindTone]}>{c.kind}</span></td>
                      <td className="min-w-40 max-w-52"><CameFrom c={c} /></td>
                      <td className={`whitespace-nowrap text-xs ${pending && c.days > 7 ? "font-medium text-amber-700 dark:text-amber-300" : "text-stone-500"}`}>{ago(c.days)}</td>
                      <td>
                        <span className="flex items-center justify-end gap-2">
                          <Actions c={c} onApprove={() => approve(c.id)} onReject={() => toggle(c.id, "reject")} />
                          <ChevronDown className={`size-4 shrink-0 text-stone-400 transition-transform ${open?.id === c.id && open.mode === "view" ? "rotate-180" : ""}`} />
                        </span>
                      </td>
                    </tr>
                    {open?.id === c.id && (
                      <tr>
                        <td colSpan={pending ? 8 : 7} className="px-3">{expanded(c)}</td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
