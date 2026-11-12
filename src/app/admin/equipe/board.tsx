"use client";

import { Search, ShieldCheck, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AccessBox } from "@/components/staff/access-box";
import { ui } from "@/components/ui/styles";
import { PERMISSION_LABEL } from "@/domain";
import { Avatar } from "../creators/list-parts";
import { SidePanel } from "../desempenho/parts";
import { disableUserAction, revokeGrantAction, revokeInviteAction } from "./actions";
import { GrantForm, PhoneForm, RoleSelect } from "./grant-form";
import { InviteForm } from "./invite-form";

export const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Super admin", GESTAO: "Gestão", ENVIO: "Envio", PAGAMENTO: "Pagamento", HUNTER: "Hunter", TIKTOK: "TikTok", VIEWER: "Leitura" };
const ROLE_ORDER = ["SUPER_ADMIN", "GESTAO", "PAGAMENTO", "ENVIO", "VIEWER", "HUNTER", "TIKTOK"] as const;

type User = { id: string; name: string; email: string; phone: string | null; lastSeenAt: string | null; roleGrants: { id: string; role: string; brandId: string | null }[] };
type Invite = { id: string; name: string; email: string | null; role: string; brands: string; expires: string; emailed: boolean };

const ago = (iso: string | null) => {
  if (!iso) return "nunca entrou";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "entrou hoje" : `entrou há ${d} ${d === 1 ? "dia" : "dias"}`;
};

/** Equipe (D-SETTINGSBOARD): lista com papéis e último acesso, painel com tudo da pessoa, convite e "Quem pode o quê". */
export function TeamBoard({ users, invites, brands, me, matrix }: { users: User[]; invites: Invite[]; brands: { id: string; name: string }[]; me: string; matrix: Record<string, readonly string[]> }) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const brandName = (id: string | null) => (id ? (brands.find((b) => b.id === id)?.name ?? "?") : "todas as marcas");
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const list = useMemo(() => users.filter((u) => !q || norm(`${u.name} ${u.email}`).includes(norm(q))), [users, q]);
  const open = users.find((u) => u.id === openId) ?? null;
  const perms = [...new Set(Object.values(matrix).flat())];

  return (
    <div className="flex flex-col gap-4">
      <section className="glass flex flex-wrap items-center gap-2 rounded-3xl p-3 md:p-4">
        <label className="relative min-w-0 flex-[1_1_14rem]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pessoa" aria-label="Buscar pessoa" className={`${ui.input} !rounded-full pl-10`} />
        </label>
        <button type="button" onClick={() => setShowMatrix((v) => !v)} aria-expanded={showMatrix} className={ui.ghostSm}><ShieldCheck className="size-4" />Quem pode o quê</button>
        <button type="button" onClick={() => setInviting((v) => !v)} aria-expanded={inviting} className={ui.btnSm}>{inviting ? <X className="size-4" /> : <UserPlus className="size-4" />}{inviting ? "Fechar" : "Convidar"}</button>
      </section>

      {inviting && <section className="glass rounded-3xl p-4 md:p-5"><InviteForm brands={brands} /></section>}

      {showMatrix && (
        <section className="glass flex flex-col gap-2 rounded-3xl p-4">
          <h3 className="text-sm font-semibold">Quem pode o quê</h3>
          <p className="text-xs text-stone-500">Cada papel vale na marca em que foi dado. Super admin vale em todas.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-3 font-medium">Pode</th>
                  {ROLE_ORDER.map((r) => <th key={r} className="px-2 py-2 text-center font-medium">{ROLE_LABEL[r]}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200/70 dark:divide-white/10">
                {perms.map((p) => (
                  <tr key={p}>
                    <td className="py-1.5 pr-3">{PERMISSION_LABEL[p] ?? p}</td>
                    {ROLE_ORDER.map((r) => <td key={r} className="px-2 py-1.5 text-center">{matrix[r]?.includes(p) ? <span className="text-emerald-600" aria-label="sim">●</span> : <span className="text-stone-300 dark:text-stone-600" aria-label="não">·</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="@container glass overflow-hidden rounded-3xl !p-0">
        <ul className="flex flex-col divide-y divide-stone-200/70 dark:divide-white/10">
          {list.map((u) => (
            <li key={u.id}>
              <button type="button" onClick={() => setOpenId(u.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left @3xl:px-5 ${openId === u.id ? "bg-brand/8" : "hover:bg-stone-500/5"}`}>
                <Avatar name={u.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{u.name}{u.id === me && <span className="text-xs font-normal text-stone-500"> · você</span>}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {u.roleGrants.map((g) => <span key={g.id} className="rounded-full bg-stone-500/10 px-2 py-0.5 text-[11px] font-medium text-stone-700 dark:text-stone-200">{ROLE_LABEL[g.role]} · {brandName(g.brandId)}</span>)}
                  </span>
                </span>
                <span className="hidden shrink-0 text-xs text-stone-500 @xl:block">{ago(u.lastSeenAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass flex flex-col gap-2 rounded-3xl p-4">
        <h3 className="text-sm font-semibold">Convites pendentes <span className="text-stone-500">{invites.length}</span></h3>
        {invites.length === 0 ? <p className="text-sm text-stone-500">Nenhum.</p> : (
          <ul className="divide-y divide-stone-200/70 dark:divide-white/10">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0"><span className="font-medium">{i.name}</span><span className="block text-xs text-stone-500">{i.email ?? "e-mail no primeiro acesso"} · {ROLE_LABEL[i.role]} ({i.brands}) · vence {i.expires}{i.emailed ? " · enviado por e-mail" : ""}</span></span>
                <form action={revokeInviteAction}><input type="hidden" name="id" value={i.id} /><button className={ui.dangerSm}>Cancelar</button></form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <SidePanel
          label={`Equipe: ${open.name}`}
          onClose={() => setOpenId(null)}
          header={
            <span className="flex items-center gap-3">
              <span className="rounded-full ring-2 ring-white/60"><Avatar name={open.name} size="lg" /></span>
              <span className="min-w-0">
                <span className="block truncate text-lg font-semibold leading-tight">{open.name}</span>
                <span className="block truncate text-xs text-white/80">{open.email}</span>
              </span>
            </span>
          }
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Papéis</span>
            <ul className="flex flex-col gap-1.5">
              {open.roleGrants.map((g) => (
                <li key={g.id} className="liquid-tile flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-sm">
                  {g.brandId && g.role !== "SUPER_ADMIN" ? <RoleSelect grantId={g.id} role={g.role} brandName={brandName(g.brandId)} /> : <span>{ROLE_LABEL[g.role]} · {brandName(g.brandId)}</span>}
                  {!(open.id === me && g.role === "SUPER_ADMIN") && (
                    <form action={revokeGrantAction}><input type="hidden" name="id" value={g.id} /><button aria-label="Tirar papel" title="Tirar papel" className="rounded-full px-2 text-stone-500 hover:text-red-700">×</button></form>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {open.id !== me && !open.roleGrants.some((g) => g.role === "SUPER_ADMIN") && brands.length > 0 && (
            <div className="flex flex-col gap-1.5"><span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Dar papel em outra marca</span><GrantForm userId={open.id} brands={brands} /></div>
          )}
          <AccessBox userId={open.id} lastSeenAt={open.lastSeenAt} canReset={open.id !== me} name={open.name} phone={open.phone} loginEmail={open.email} />
          {open.roleGrants.some((g) => g.role === "GESTAO" || g.role === "SUPER_ADMIN") && <PhoneForm userId={open.id} phone={open.phone} />}
          {open.id !== me && (
            <form action={disableUserAction} onSubmit={(e) => { if (!confirm(`Remover ${open.name} da equipe? Ela perde o acesso ao painel.`)) e.preventDefault(); }} className="border-t border-stone-200/70 pt-4 dark:border-white/10">
              <input type="hidden" name="id" value={open.id} />
              <button className={ui.dangerSm}>Remover da equipe</button>
            </form>
          )}
        </SidePanel>
      )}
    </div>
  );
}
