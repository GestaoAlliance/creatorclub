import type { ReactNode } from "react";
import { ui } from "./styles";

/** Título da tela com uma linha de explicação e ações à direita. */
export function PageHeader({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex max-w-3xl flex-col gap-1">
        <h1 className={ui.title}>{title}</h1>
        {children && <p className={ui.muted}>{children}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Cartão com título opcional. */
export function Card({ title, icon, children, className = "" }: { title?: ReactNode; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${ui.card} ${className}`}>
      {title && <h2 className={ui.h2}>{icon}{title}</h2>}
      {children}
    </section>
  );
}

/** Indicador (número grande com rótulo), opcionalmente clicável. */
export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "red" | "amber" | undefined }) {
  const color = tone === "red" ? "text-red-700 dark:text-red-400" : tone === "amber" ? "text-amber-700 dark:text-amber-300" : "";
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className={ui.hint}>{hint}</p>}
    </div>
  );
}

/** Rótulo pequeno que só aparece no celular, quando as colunas viram linhas empilhadas. */
export function MobileLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs text-stone-500 md:hidden">{children} </span>;
}
