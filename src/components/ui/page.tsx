import type { ReactNode } from "react";
import type { HelpId } from "@/domain/tutorial";
import { ui } from "./styles";
import { HelpTip } from "./tour";

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

/** Cartão com título opcional. `help`: "?" no canto e passo do tutorial da tela (D-TUTORIAL). */
export function Card({ title, icon, children, className = "", help }: { title?: ReactNode; icon?: ReactNode; children: ReactNode; className?: string; help?: HelpId }) {
  return (
    <section data-tour={help} className={`${ui.card} ${help && !title ? "relative" : ""} ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2">
          <h2 className={ui.h2}>{icon}{title}</h2>
          {help && <HelpTip id={help} className="-my-1" />}
        </div>
      )}
      {help && !title && <HelpTip id={help} className="absolute right-3 top-3" />}
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
