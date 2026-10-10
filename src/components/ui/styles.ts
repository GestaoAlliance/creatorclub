/**
 * Peças visuais únicas do sistema (D-DESIGNALL): o mesmo *liquid glass* do portal em todas as telas, da creator e
 * da equipe. Classes prontas, sem lógica, para as telas não inventarem estilo próprio.
 */
export const ui = {
  /** Cartão de vidro (bloco principal de cada assunto). */
  card: "glass flex flex-col gap-4 rounded-3xl p-5 md:p-6",
  /** Caixa interna, dentro de um cartão. */
  inset: "rounded-2xl bg-white/50 px-4 py-3 dark:bg-white/5",
  title: "text-2xl font-semibold tracking-tight",
  h2: "flex items-center gap-2 font-semibold",
  muted: "text-sm text-stone-600 dark:text-stone-400",
  hint: "text-xs text-stone-500",
  label: "flex flex-col gap-1 text-xs font-medium text-stone-500",
  input:
    "w-full rounded-2xl border border-stone-300/70 bg-white/70 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-brand dark:border-white/15 dark:bg-white/5 dark:text-stone-100",
  inputSm:
    "rounded-xl border border-stone-300/70 bg-white/70 px-2.5 py-1.5 text-sm text-stone-900 outline-none focus:border-brand dark:border-white/15 dark:bg-white/5 dark:text-stone-100",
  btn: "inline-flex items-center justify-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50",
  btnSm: "inline-flex items-center justify-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50",
  ghost: "glass inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-50",
  ghostSm: "glass inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold disabled:opacity-50",
  dangerSm:
    "inline-flex items-center justify-center gap-1.5 rounded-full border border-red-300/70 px-3.5 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50 dark:border-red-400/40 dark:text-red-300",
  link: "font-medium text-brand underline-offset-2 hover:underline dark:text-brand-2",
  /** Lista de linhas dentro de um cartão (no celular cada linha empilha; no computador vira colunas). */
  list: "divide-y divide-stone-200/70 dark:divide-white/10",
  row: "flex flex-col gap-2 py-4 first:pt-0 last:pb-0",
  error: "text-sm text-red-700 dark:text-red-400",
  ok: "text-sm text-emerald-700 dark:text-emerald-300",
  pill: "glass rounded-full px-3 py-1 text-xs",
  pillOn: "rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white",
} as const;

export const badge = {
  neutral: "rounded-full bg-stone-500/15 px-2.5 py-0.5 text-xs font-medium text-stone-700 dark:text-stone-300",
  amber: "rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300",
  sky: "rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-800 dark:text-sky-300",
  green: "rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300",
  red: "rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-300",
} as const;
