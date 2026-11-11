"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * D-LIQUIDHOME: o brilho dos painéis de vidro acompanha o ponteiro. Um só ouvinte para a área inteira; cada painel
 * recebe a posição relativa em `--gx`/`--gy` (sem re-render). Toque e "reduzir movimento": não faz nada.
 */
export function GlassLight({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let ev: PointerEvent | null = null;
    const paint = () => {
      raf = 0;
      if (!ev) return;
      for (const el of root.querySelectorAll<HTMLElement>("section.glass, aside.glass, .liquid-tile, .frost-tile")) {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--gx", `${(((ev.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
        el.style.setProperty("--gy", `${(((ev.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      ev = e;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    root.addEventListener("pointermove", move);
    return () => {
      root.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
