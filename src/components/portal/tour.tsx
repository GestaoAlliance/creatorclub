"use client";

import { CircleHelp, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { HELP, helpText, placeBalloon, tourScreenFor, tourSeenKey, tourSteps, type HelpId } from "@/domain/tutorial";

/** Mini tutoriais do portal (D-TUTORIAL): "?" em cada cartão e passo a passo no primeiro acesso a cada tela. */

const TutorialContext = createContext({ ugc: false });
const RESTART = "cc-tour:restart";
const BALLOON =
  "fixed z-[60] w-80 max-w-[calc(100vw-2rem)] rounded-3xl border border-white/70 bg-white/95 p-4 text-sm text-stone-900 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/95 dark:text-stone-100";

const bottomInset = () => (matchMedia("(min-width: 768px)").matches ? 0 : 96);
const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

/** Primeiro alvo visível (as vendas têm uma versão para celular e outra para computador). */
function findTarget(id: HelpId): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** Moldura: guarda se é só UGC (textos sem comissão) e roda o passo a passo da tela aberta. */
export function TutorialProvider({ ugc, auto, children }: { ugc: boolean; auto: boolean; children: ReactNode }) {
  return (
    <TutorialContext.Provider value={{ ugc }}>
      {children}
      <PortalTour auto={auto} />
    </TutorialContext.Provider>
  );
}

/** Botão do topo: mostra de novo o tutorial da tela aberta. */
export function TourButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(RESTART))}
      aria-label="Ver o tutorial desta tela"
      title="Ver o tutorial desta tela"
      className="glass grid size-10 place-content-center rounded-full"
    >
      <CircleHelp className="size-4" />
    </button>
  );
}

function PortalTour({ auto }: { auto: boolean }) {
  const { ugc } = useContext(TutorialContext);
  const screen = tourScreenFor(usePathname());
  const [steps, setSteps] = useState<HelpId[]>([]);
  const [index, setIndex] = useState(0);

  const start = useCallback(() => {
    if (!screen) return;
    const found = tourSteps(screen, (id) => findTarget(id) !== null);
    setIndex(0);
    setSteps(found);
  }, [screen]);

  const finish = useCallback(() => {
    if (screen) {
      try {
        localStorage.setItem(tourSeenKey(screen), "1");
      } catch {
        // Navegador sem armazenamento: o tutorial volta no próximo acesso.
      }
    }
    setSteps([]);
  }, [screen]);

  useEffect(() => {
    setSteps([]);
    if (!screen || !auto) return;
    let seen = false;
    try {
      seen = localStorage.getItem(tourSeenKey(screen)) === "1";
    } catch {
      seen = false;
    }
    if (seen) return;
    // Espera a tela desenhar antes de procurar os cartões.
    const t = window.setTimeout(start, 600);
    return () => window.clearTimeout(t);
  }, [screen, auto, start]);

  useEffect(() => {
    window.addEventListener(RESTART, start);
    return () => window.removeEventListener(RESTART, start);
  }, [start]);

  const id = steps[index];
  if (!id) return null;
  return (
    <TourStep
      key={id}
      id={id}
      text={helpText(id, ugc)}
      position={`${index + 1} de ${steps.length}`}
      last={index === steps.length - 1}
      onNext={() => (index === steps.length - 1 ? finish() : setIndex(index + 1))}
      onSkip={finish}
    />
  );
}

function TourStep({ id, text, position, last, onNext, onSkip }: { id: HelpId; text: string; position: string; last: boolean; onNext: () => void; onSkip: () => void }) {
  const balloon = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const measure = useCallback(() => {
    const el = findTarget(id);
    if (el) setRect(el.getBoundingClientRect());
  }, [id]);

  useEffect(() => {
    const el = findTarget(id);
    if (!el) return onSkip();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    measure();
    const t = window.setTimeout(measure, reduce ? 0 : 400);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [id, measure, onSkip]);

  useLayoutEffect(() => {
    if (!rect || !balloon.current) return;
    const { width, height } = balloon.current.getBoundingClientRect();
    setPos(placeBalloon(rect, { width, height }, viewport(), 14, bottomInset()));
  }, [rect]);

  useEffect(() => {
    next.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onSkip();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  const pad = 6;
  return (
    <>
      {/* Camada que escurece a tela e deixa só o cartão do passo em destaque. */}
      <div aria-hidden className="fixed inset-0 z-[55]" />
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[56] rounded-3xl ring-2 ring-brand transition-all dark:bg-white/[0.06] duration-300 motion-reduce:transition-none dark:ring-brand-2"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.5)" }}
        />
      )}
      <div
        ref={balloon}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className={`${BALLOON} transition-opacity duration-200 motion-reduce:transition-none`}
        style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, opacity: pos ? 1 : 0 }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium text-stone-500">{position}</p>
          <button type="button" onClick={onSkip} aria-label="Fechar o tutorial" className="-m-1 rounded-full p-1 text-stone-500 hover:text-stone-900 dark:hover:text-white">
            <X className="size-4" />
          </button>
        </div>
        <p id="tour-title" className="mt-1 font-semibold">{HELP[id].title}</p>
        <p className="mt-1 text-stone-700 dark:text-stone-300">{text}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" onClick={onSkip} className="text-xs font-medium text-stone-500 underline-offset-4 hover:underline">
            Pular
          </button>
          <button ref={next} type="button" onClick={onNext} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2">
            {last ? "Entendi" : "Próximo"}
          </button>
        </div>
      </div>
    </>
  );
}

/** "?" no canto de um cartão: abre o balão com a explicação daquele cartão. */
export function HelpTip({ id, className = "" }: { id: HelpId; className?: string }) {
  const { ugc } = useContext(TutorialContext);
  const button = useRef<HTMLButtonElement>(null);
  const balloon = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !button.current || !balloon.current) return;
    const { width, height } = balloon.current.getBoundingClientRect();
    setPos(placeBalloon(button.current.getBoundingClientRect(), { width, height }, viewport(), 8, bottomInset()));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!balloon.current?.contains(t) && !button.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => {
          setPos(null);
          setOpen((o) => !o);
        }}
        aria-label={`O que é: ${HELP[id].title}`}
        aria-expanded={open}
        className={`grid size-7 shrink-0 place-content-center rounded-full text-stone-400 transition-colors hover:bg-white/60 hover:text-brand dark:hover:bg-white/10 dark:hover:text-brand-2 ${className}`}
      >
        <CircleHelp className="size-4" />
      </button>
      {/* No corpo da página: dentro do cartão de vidro (backdrop-filter) o `fixed` ficaria preso ao cartão. */}
      {open &&
        createPortal(
          <div ref={balloon} role="tooltip" className={BALLOON} style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, opacity: pos ? 1 : 0 }}>
            <p className="font-semibold">{HELP[id].title}</p>
            <p className="mt-1 text-stone-700 dark:text-stone-300">{helpText(id, ugc)}</p>
          </div>,
          document.body,
        )}
    </>
  );
}
