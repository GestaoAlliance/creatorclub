"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatBRL } from "@/domain";
import type { SalesDay } from "@/lib/portal/sales";

/**
 * Vendas por dia (D-PERIOD): uma série (vendas) com área suave, linha de 2px e cruz que acompanha o dedo/mouse.
 * A ficha mostra vendas, comissão e pedidos do dia. Uma escala só (sem segundo eixo). Teclado: setas mudam o dia.
 * Os mesmos números ficam numa tabela para leitor de tela.
 */

const W = 1000;
const H = 240;
const PAD_TOP = 12;

const shortDay = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;
const compact = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(cents / 100);

function niceMax(v: number): number {
  if (v <= 0) return 100_00;
  const exp = 10 ** Math.floor(Math.log10(v));
  const n = v / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
}

export function SalesChart({ days }: { days: SalesDay[] }) {
  const gradient = useId();
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...days.map((d) => d.baseCents)));
  const x = (i: number) => (days.length === 1 ? W / 2 : (i / (days.length - 1)) * W);
  const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP);
  const points = days.map((d, i) => [x(i), y(d.baseCents)] as const);
  const line = points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const step = Math.max(1, Math.ceil(days.length / 8));

  function pick(e: PointerEvent<HTMLDivElement>) {
    const r = box.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setActive(Math.round(ratio * (days.length - 1)));
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const cur = active ?? days.length - 1;
    setActive(Math.min(days.length - 1, Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1))));
  }

  const a = active === null ? null : days[active]!;
  const left = active === null ? 0 : (x(active) / W) * 100;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-xs font-medium uppercase tracking-wide text-stone-500">Vendas por dia</figcaption>
      <div className="flex gap-2">
        <div className="flex h-[200px] flex-col justify-between py-0 text-right text-[11px] tabular-nums text-stone-500 md:h-[240px]" aria-hidden>
          <span>{compact(max)}</span>
          <span>{compact(max / 2)}</span>
          <span>R$ 0</span>
        </div>
        <div
          ref={box}
          role="img"
          tabIndex={0}
          aria-label="Gráfico de vendas por dia. Use as setas para ver cada dia."
          className="relative h-[200px] flex-1 touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-brand/50 md:h-[240px]"
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setActive(null)}
          onKeyDown={key}
          onBlur={() => setActive(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full text-brand dark:text-brand-2">
            <defs>
              <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((t) => (
              <line key={t} x1="0" x2={W} y1={y(max * t)} y2={y(max * t)} className="stroke-stone-300/70 dark:stroke-white/10" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={area} fill={`url(#${gradient})`} />
            <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {a && (
              <line x1={x(active!)} x2={x(active!)} y1="0" y2={H} className="stroke-stone-400 dark:stroke-white/40" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {a && (
            <>
              <span
                className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-white dark:bg-brand-2 dark:ring-stone-900"
                style={{ left: `${left}%`, top: `${(y(a.baseCents) / H) * 100}%` }}
              />
              <div
                className="glass pointer-events-none absolute top-0 z-10 min-w-36 rounded-2xl px-3 py-2 text-xs"
                style={{ left: `${left}%`, transform: `translateX(${left > 60 ? "calc(-100% - 10px)" : "10px"})` }}
              >
                <p className="mb-1 font-medium text-stone-500">{shortDay(a.day)}</p>
                <p className="flex justify-between gap-4"><span className="text-stone-500">Vendas</span><strong className="tabular-nums">{formatBRL(a.baseCents)}</strong></p>
                <p className="flex justify-between gap-4"><span className="text-stone-500">Comissão</span><strong className="tabular-nums">{formatBRL(a.commissionCents)}</strong></p>
                <p className="flex justify-between gap-4"><span className="text-stone-500">Pedidos</span><strong className="tabular-nums">{a.count}</strong></p>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="relative ml-12 h-4 text-[11px] text-stone-500" aria-hidden>
        {days.map((d, i) =>
          (i % step === 0 && days.length - 1 - i >= step / 2) || i === days.length - 1 ? (
            <span
              key={d.day}
              className={`absolute tabular-nums ${i === 0 ? "" : i === days.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left: `${(x(i) / W) * 100}%` }}
            >
              {shortDay(d.day)}
            </span>
          ) : null,
        )}
      </div>
      <table className="sr-only">
        <caption>Vendas por dia</caption>
        <thead><tr><th>Dia</th><th>Vendas</th><th>Comissão</th><th>Pedidos</th></tr></thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}><td>{shortDay(d.day)}</td><td>{formatBRL(d.baseCents)}</td><td>{formatBRL(d.commissionCents)}</td><td>{d.count}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
