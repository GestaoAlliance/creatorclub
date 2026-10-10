import { Gift } from "lucide-react";
import Link from "next/link";
import { ui } from "@/components/ui/styles";

/** Aviso no Início quando há kit para escolher (boas-vindas ou do mês): leva direto para Envios. */
export function KitBanner({ base, products, welcome }: { base: string; products: number; welcome: boolean }) {
  const what = `${products} ${products === 1 ? "suplemento" : "suplementos"}`;
  return (
    <Link href={`${base}/envios`} className="glass flex items-center gap-3 rounded-3xl p-4 ring-2 ring-brand/40 md:p-5">
      <span className="grid size-9 shrink-0 place-content-center rounded-2xl bg-brand/10 text-brand dark:bg-brand-2/15 dark:text-brand-2"><Gift className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{welcome ? `Seu kit de boas-vindas: ${what}` : `Você ganhou ${what}`}</span>
        <span className={ui.hint}>Escolha os produtos em Envios e a equipe prepara o envio.</span>
      </span>
      <span className={`${ui.btnSm} shrink-0`}>Escolher</span>
    </Link>
  );
}
