import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatBRL, formatBrPhone, formatDoc } from "@/domain";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { formatAddress, type Address } from "@/lib/shipments/address";
import { shipmentsToPrint, type PrintSender, type PrintShipment } from "@/lib/shipments/print";
import { ShipmentError } from "@/lib/shipments/shipments";
import { staffContext } from "@/lib/staff/context";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const today = () => new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const chunks = <T,>(list: T[], n: number) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

function SenderLines({ s }: { s: PrintSender }) {
  return (
    <>
      <p className="font-semibold uppercase">{s.name}</p>
      {s.address ? formatAddress(s.address as Address).map((l) => <p key={l}>{l}</p>) : <p className="text-red-700">Cadastre o endereço de envio em Marcas</p>}
    </>
  );
}

/** Etiqueta (105 × 148 mm, 4 por A4): destinatário grande, remetente embaixo. */
function Label({ s, sender }: { s: PrintShipment; sender: PrintSender }) {
  return (
    <div className="flex h-[148.5mm] w-[105mm] flex-col justify-between border border-dashed border-stone-300 p-[8mm] text-[11pt] leading-snug">
      <div>
        <p className="text-[9pt] font-bold tracking-widest text-stone-500">DESTINATÁRIO</p>
        <p className="mt-1 text-[14pt] font-bold uppercase">{s.recipient.name}</p>
        {formatAddress(s.address).map((l, i) => <p key={l} className={i === formatAddress(s.address).length - 1 ? "mt-1 text-[14pt] font-bold" : ""}>{l}</p>)}
        {s.recipient.phone && <p className="mt-1">Tel. {formatBrPhone(s.recipient.phone)}</p>}
      </div>
      <div className="border-t border-stone-400 pt-2 text-[9pt]">
        <p className="font-bold tracking-widest text-stone-500">REMETENTE</p>
        <SenderLines s={sender} />
      </div>
    </div>
  );
}

const DECLARATION =
  "Declaro que não me enquadro no conceito de contribuinte previsto no art. 4º da Lei Complementar nº 87/1996, uma vez que não realizo, com habitualidade ou em volume que caracterize intuito comercial, operações de circulação de mercadoria, ainda que se iniciem no exterior, ou estou dispensado da emissão da nota fiscal por força da legislação tributária vigente, responsabilizando-me, nos termos da lei e a quem de direito, por informações inverídicas. Declaro ainda que não estou postando conteúdo inflamável, explosivo, causador de combustão espontânea, tóxico, corrosivo, gás ou qualquer outro conteúdo que constitua perigo, conforme o art. 13 da Lei Postal nº 6.538/78.";

/** Declaração de conteúdo dos Correios (uma por página A4). */
function Declaration({ s, sender }: { s: PrintShipment; sender: PrintSender }) {
  const box = "border border-stone-800 p-3";
  const qty = s.items.reduce((n, i) => n + i.quantity, 0);
  return (
    <section className="flex min-h-[297mm] w-[210mm] break-after-page flex-col gap-3 p-[12mm] text-[10pt]">
      <h2 className="text-center text-[14pt] font-bold">DECLARAÇÃO DE CONTEÚDO</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className={box}>
          <p className="text-[8pt] font-bold">REMETENTE</p>
          <SenderLines s={sender} />
          {sender.address?.phone && <p>Tel. {formatBrPhone(sender.address.phone)}</p>}
          {sender.doc && <p>CNPJ {formatDoc(sender.doc)}</p>}
        </div>
        <div className={box}>
          <p className="text-[8pt] font-bold">DESTINATÁRIO</p>
          <p className="font-semibold uppercase">{s.recipient.name}</p>
          {formatAddress(s.address).map((l) => <p key={l}>{l}</p>)}
          {s.recipient.doc && <p>{s.recipient.doc.length === 14 ? "CNPJ" : "CPF"} {formatDoc(s.recipient.doc)}</p>}
        </div>
      </div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="[&>th]:border [&>th]:border-stone-800 [&>th]:px-2 [&>th]:py-1 [&>th]:text-[8pt]">
            <th className="w-10">ITEM</th>
            <th>CONTEÚDO</th>
            <th className="w-16 text-right">QUANT.</th>
            <th className="w-28 text-right">VALOR</th>
          </tr>
        </thead>
        <tbody>
          {s.items.map((i, n) => (
            <tr key={n} className="[&>td]:border [&>td]:border-stone-800 [&>td]:px-2 [&>td]:py-1">
              <td>{n + 1}</td>
              <td>{i.title}</td>
              <td className="text-right">{i.quantity}</td>
              <td className="text-right">{i.unitCostCents !== null ? formatBRL(i.unitCostCents * i.quantity) : ""}</td>
            </tr>
          ))}
          <tr className="[&>td]:border [&>td]:border-stone-800 [&>td]:px-2 [&>td]:py-1 font-semibold">
            <td colSpan={2} className="text-right">TOTAIS</td>
            <td className="text-right">{qty}</td>
            <td className="text-right">{s.totalCents !== null ? formatBRL(s.totalCents) : ""}</td>
          </tr>
          <tr className="[&>td]:border [&>td]:border-stone-800 [&>td]:px-2 [&>td]:py-1">
            <td colSpan={3} className="text-right">PESO TOTAL (kg)</td>
            <td />
          </tr>
        </tbody>
      </table>
      <div className={box}>
        <p className="text-[8pt] font-bold">DECLARAÇÃO</p>
        <p className="mt-1 text-justify leading-relaxed">{DECLARATION}</p>
        <div className="mt-8 grid grid-cols-2 gap-6">
          <p className="border-t border-stone-800 pt-1">{sender.address?.city ?? ""}, {today()}</p>
          <p className="border-t border-stone-800 pt-1">Assinatura do declarante/remetente</p>
        </div>
      </div>
      <p className="text-[8pt] text-stone-500">Valores pelo custo cadastrado do produto (Produtos). Envio {s.id.slice(0, 8)}.</p>
    </section>
  );
}

// Etiquetas (4 por A4) e declarações de conteúdo dos envios (D-LABEL). ?ids=a,b ou ?todos=1 (os em "Preparando").
export default async function PrintShipmentsPage({ searchParams }: { searchParams: Promise<{ ids?: string; todos?: string }> }) {
  const sp = await searchParams;
  const actor = await currentActor();
  if (!actor) redirect("/entrar?next=/admin/envios");
  const { brand } = await staffContext(actor);
  if (!brand) notFound();
  let data;
  try {
    data = await shipmentsToPrint(db(), actor, brand.id, { ids: (sp.ids ?? "").split(","), preparing: sp.todos === "1" });
  } catch (error) {
    if (error instanceof ShipmentError) redirect("/admin/envios");
    throw error;
  }
  const { sender, shipments } = data;
  return (
    <div className="bg-white text-stone-900">
      <style>{"@page { size: A4; margin: 0 } @media print { .no-print { display: none !important } body { background: white } }"}</style>
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white/95 px-6 py-3">
        <div className="text-sm">
          <p className="font-semibold">
            {shipments.length} {shipments.length === 1 ? "envio" : "envios"} · {Math.ceil(shipments.length / 4)} {Math.ceil(shipments.length / 4) === 1 ? "folha" : "folhas"} de etiquetas + {shipments.length} {shipments.length === 1 ? "declaração" : "declarações"}
          </p>
          {sender && !sender.address && <p className="text-red-700">Falta o endereço de envio da marca: cadastre em Configurações → Marcas.</p>}
          {shipments.some((s) => s.totalCents === null) && <p className="text-amber-700">Algum produto está sem custo cadastrado: o valor sai em branco para preencher à mão.</p>}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/envios" className="text-sm underline">Voltar para Envios</Link>
          {shipments.length > 0 && <PrintButton />}
        </div>
      </div>
      {!sender || shipments.length === 0 ? (
        <p className="no-print p-8 text-sm text-stone-600">Nenhum envio para imprimir.</p>
      ) : (
        <>
          {chunks(shipments, 4).map((page, i) => (
            <section key={i} className="grid h-[297mm] w-[210mm] break-after-page grid-cols-2 grid-rows-2">
              {page.map((s) => <Label key={s.id} s={s} sender={sender} />)}
            </section>
          ))}
          {shipments.map((s) => <Declaration key={s.id} s={s} sender={sender} />)}
        </>
      )}
    </div>
  );
}
