"use client";

import { Check, Compass, Download, EllipsisVertical, Share, Smartphone, SquarePlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { installPlatform, type InstallPlatform } from "@/domain";
import { tourSeenKey } from "@/domain/tutorial";
import { ui } from "@/components/ui/styles";
import { useStandalone } from "./use-standalone";

/**
 * Portal na tela de início (D-INSTALLAPP, "estilo BigBoom"): mini tutorial por aparelho (iPhone pelo Safari, Android
 * pelo Chrome), botão "Instalar agora" quando o Chrome oferece, cartão no Início, página "Instalar app" e um aviso
 * único depois de entrar. Aberto pelo ícone (como app), nada disso aparece.
 */

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// O Chrome avisa uma vez, logo depois de carregar: guarda o aviso antes de a tela montar.
let deferred: PromptEvent | null = null;
const CHANGED = "cc-install:changed";
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    window.dispatchEvent(new Event(CHANGED));
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    window.dispatchEvent(new Event(CHANGED));
  });
}

const DISMISSED = "cc-install:dismissed";
const ASKED = "cc-install:asked";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string) => {
  try {
    localStorage.setItem(k, "1");
  } catch {
    // Sem armazenamento: volta a aparecer no próximo acesso.
  }
};

function useInstall() {
  const standalone = useStandalone();
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  useEffect(() => {
    setPlatform(installPlatform(navigator.userAgent, navigator.maxTouchPoints));
    const sync = () => setCanPrompt(deferred !== null);
    sync();
    window.addEventListener(CHANGED, sync);
    return () => window.removeEventListener(CHANGED, sync);
  }, []);
  async function install(): Promise<boolean> {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;
    setCanPrompt(false);
    await e.prompt();
    return (await e.userChoice).outcome === "accepted";
  }
  return { standalone, platform, canPrompt, install };
}

function Step({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-7 shrink-0 place-content-center rounded-full bg-brand text-xs font-bold text-white dark:bg-brand-2 dark:text-stone-950">{n}</span>
      <span className="min-w-0 flex-1 pt-0.5 text-sm leading-relaxed">{children}</span>
      <span className="glass grid size-9 shrink-0 place-content-center rounded-xl text-brand dark:text-brand-2">{icon}</span>
    </li>
  );
}

/** Os passos de cada aparelho. */
export function InstallSteps({ brandName, platform }: { brandName: string; platform: "ios" | "ios-other" | "android" }) {
  const done = (
    <>
      Pronto: o ícone da <strong>{brandName}</strong> aparece na sua tela. É só tocar nele para entrar, como num app.
    </>
  );
  if (platform === "android") {
    return (
      <ol className="flex flex-col gap-3">
        <Step n={1} icon={<EllipsisVertical className="size-4" />}>No Chrome, toque nos <strong>três pontinhos</strong>, no canto de cima.</Step>
        <Step n={2} icon={<Download className="size-4" />}>Toque em <strong>Instalar app</strong> (ou <strong>Adicionar à tela inicial</strong>).</Step>
        <Step n={3} icon={<Check className="size-4" />}>Confirme em <strong>Instalar</strong>. {done}</Step>
      </ol>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {platform === "ios-other" && (
        <p className="rounded-2xl border border-amber-400/60 bg-amber-100/70 p-3 text-sm text-amber-950 dark:bg-amber-900/30 dark:text-amber-100">
          <Compass className="mr-1 inline size-4" />
          Você abriu por outro app (Instagram, WhatsApp ou Chrome). No iPhone, o caminho é pelo <strong>Safari</strong>: toque em <strong>⋯</strong> e
          escolha <strong>Abrir no Safari</strong> (ou copie o link e cole no Safari). Depois:
        </p>
      )}
      <ol className="flex flex-col gap-3">
        <Step n={1} icon={<Share className="size-4" />}>No Safari, toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima), na barra de baixo.</Step>
        <Step n={2} icon={<SquarePlus className="size-4" />}>Role a lista e toque em <strong>Adicionar à Tela de Início</strong>.</Step>
        <Step n={3} icon={<Check className="size-4" />}>Toque em <strong>Adicionar</strong>, no canto de cima. {done}</Step>
      </ol>
    </div>
  );
}

function InstallButton({ install, label = "Instalar agora" }: { install: () => Promise<boolean>; label?: string }) {
  return (
    <button type="button" onClick={() => void install()} className={ui.btn}>
      <Download className="size-4" /> {label}
    </button>
  );
}

/** Página "Instalar app": abas iPhone e Android, já na do aparelho dela. */
export function InstallGuide({ brandName }: { brandName: string }) {
  const { standalone, platform, canPrompt, install } = useInstall();
  const [tab, setTab] = useState<"ios" | "android" | null>(null);
  const shown = tab ?? (platform === "android" ? "android" : "ios");
  if (standalone) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <Check className="size-4 text-emerald-600" /> Você já está usando o app da {brandName}. Para entrar, é só tocar no ícone na sua tela.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {platform === "desktop" && <p className={ui.muted}>Abra este portal no seu celular (o mesmo endereço) e siga os passos do seu aparelho.</p>}
      <div className="flex gap-2">
        {(["ios", "android"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={shown === t ? ui.pillOn : ui.pill}>{t === "ios" ? "iPhone" : "Android"}</button>
        ))}
      </div>
      {shown === "android" && canPrompt && <InstallButton install={install} />}
      <InstallSteps brandName={brandName} platform={shown === "ios" && platform === "ios-other" ? "ios-other" : shown} />
    </div>
  );
}

const mobile = (p: InstallPlatform | null): p is "ios" | "ios-other" | "android" => p === "ios" || p === "ios-other" || p === "android";

/** Cartão no Início (só no celular, até ela fechar ou abrir pelo ícone). */
export function InstallCard({ brandName, base }: { brandName: string; base: string }) {
  const { standalone, platform, canPrompt, install } = useInstall();
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(read(DISMISSED) === "1"), []);
  if (hidden || standalone || !mobile(platform)) return null;
  return (
    <section className="glass flex flex-col gap-3 rounded-3xl p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-content-center rounded-2xl bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2"><Smartphone className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Tenha o portal na tela do seu celular</span>
          <span className="text-sm text-stone-600 dark:text-stone-300">Abre como app, com o ícone da {brandName}: vendas, cupom e saldo num toque.</span>
        </span>
        <button type="button" aria-label="Fechar" onClick={() => (write(DISMISSED), setHidden(true))} className="grid size-8 place-content-center rounded-full text-stone-500 hover:bg-stone-500/10">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {platform === "android" && canPrompt ? <InstallButton install={install} /> : <Link href={`${base}/app`} className={ui.btn}>Ver como (3 passos)</Link>}
        <button type="button" onClick={() => (write(DISMISSED), setHidden(true))} className={ui.ghost}>Agora não</button>
      </div>
    </section>
  );
}

/** Aviso único depois de entrar (no celular), depois do tutorial do Início. */
export function InstallModal({ brandName, base }: { brandName: string; base: string }) {
  const { standalone, platform, canPrompt, install } = useInstall();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (standalone || !mobile(platform) || read(ASKED) === "1") return;
    // Espera o tutorial em balão do Início terminar, para não abrir um em cima do outro.
    const t = window.setInterval(() => {
      if (read(tourSeenKey("inicio")) === "1") {
        window.clearInterval(t);
        write(ASKED);
        setOpen(true);
      }
    }, 1500);
    return () => window.clearInterval(t);
  }, [standalone, platform]);
  if (!open || !mobile(platform)) return null;
  const close = () => setOpen(false);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="install-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-3xl bg-white p-5 shadow-xl dark:bg-stone-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id="install-title" className="text-lg font-semibold">Coloque o portal na sua tela</p>
            <p className="text-sm text-stone-600 dark:text-stone-300">Assim você entra direto, com o ícone da {brandName}, sem procurar o link.</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={close} className="grid size-8 shrink-0 place-content-center rounded-full text-stone-500 hover:bg-stone-500/10"><X className="size-4" /></button>
        </div>
        {platform === "android" && canPrompt && <InstallButton install={async () => { const ok = await install(); if (ok) close(); return ok; }} />}
        <InstallSteps brandName={brandName} platform={platform} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`${base}/app`} onClick={close} className={`${ui.link} text-sm`}>Ver depois em Instalar</Link>
          <button type="button" onClick={close} className={ui.btn}>Entendi</button>
        </div>
      </div>
    </div>
  );
}
