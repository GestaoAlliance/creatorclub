import { calendarToday, type CalendarDays } from "@/domain";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];

/**
 * D-CALENDAR: o mês com os marcos de pagamento (fechamento no dia 1, pedido de saque, pagamento), "hoje" marcado e a
 * extensão do mês, se houver. Só mostra; quem calcula as datas é o servidor. `light` = sobre a faixa colorida.
 */
export function PayCalendar({ month, days, normalEnd, today, light = false, compact = false, who = "team" }: { month: string; days: CalendarDays; normalEnd: number; today: number | null; light?: boolean; compact?: boolean; who?: "team" | "creator" }) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const payStart = days.payFrom ?? days.end + 1;
  const kind = (d: number) =>
    d === 1 ? "close" : d >= days.start && d <= normalEnd ? "req" : d > normalEnd && d <= days.end ? "ext" : d >= payStart && d <= days.payBy ? "pay" : null;
  const tone = {
    close: light ? "bg-white/90 text-stone-900" : "bg-stone-800 text-white dark:bg-white dark:text-stone-900",
    req: "bg-brand text-white dark:bg-brand-2 dark:text-stone-900",
    ext: "bg-amber-400 text-stone-900",
    pay: "bg-emerald-500 text-white",
  } as const;
  const muted = light ? "text-white/60" : "text-stone-400";
  const t = today !== null ? calendarToday(days, today) : null;
  const legend: [keyof typeof tone, string][] = [
    ["close", who === "creator" ? "Libera a comissão do mês anterior" : "Fechamento (libera a comissão)"],
    ["req", who === "creator" ? `Enviar a nota (dia ${days.start} ao ${normalEnd})` : `Pedido de saque (dia ${days.start} ao ${normalEnd})`],
    ...(days.end > normalEnd ? [["ext", `Prazo estendido neste mês (até o dia ${days.end})`] as [keyof typeof tone, string]] : []),
    ["pay", who === "creator" ? `Você recebe (${days.payFrom ? `dia ${days.payFrom} ao ${days.payBy}` : `até o dia ${days.payBy}`})` : `Pagamento (${days.payFrom ? `dia ${days.payFrom} ao ${days.payBy}` : `até o dia ${days.payBy}`})`],
  ];
  return (
    <div className={`flex flex-col gap-3 ${compact ? "" : "@3xl:flex-row @3xl:items-start @3xl:gap-6"}`}>
      <div className="min-w-0 @3xl:w-80">
        <p className={`mb-1.5 text-xs font-semibold ${light ? "text-white/85" : "text-stone-600 dark:text-stone-300"}`}>{MONTHS[m - 1]!.charAt(0).toUpperCase() + MONTHS[m - 1]!.slice(1)} de {y}</p>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] tabular-nums">
          {WEEK.map((w, i) => <span key={i} className={`font-semibold ${muted}`}>{w}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
          {Array.from({ length: total }, (_, i) => {
            const d = i + 1;
            const k = kind(d);
            return (
              <span key={d} aria-label={d === today ? `Hoje, dia ${d}` : undefined} className={`grid aspect-square place-content-center rounded-lg font-medium ${k ? tone[k] : light ? "text-white/80" : "text-stone-600 dark:text-stone-300"} ${d === today ? (light ? "ring-2 ring-white ring-offset-1 ring-offset-transparent" : "ring-2 ring-stone-900 ring-offset-1 dark:ring-white") : ""}`}>
                {d}
              </span>
            );
          })}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {t && (
          <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${light ? "bg-white/15" : "bg-stone-500/8"}`}>
            <p className="font-semibold">Hoje (dia {today}): {t.now}</p>
            {t.next && <p className={light ? "text-white/80" : "text-stone-600 dark:text-stone-300"}>Depois: {t.next}</p>}
          </div>
        )}
        <ul className="flex flex-col gap-1.5 text-xs">
          {legend.map(([k, label]) => (
            <li key={k} className="flex items-center gap-2"><span className={`size-3 shrink-0 rounded ${tone[k]}`} />{label}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
