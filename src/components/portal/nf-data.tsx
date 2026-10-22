import { formatCnpj, type NfData } from "@/domain";
import { CopyButton } from "./copy-button";

/**
 * Dados para emitir a nota (M1.3, D-NFDATA), no modelo da referência: cada dado numa linha com botão de copiar.
 * Vêm da marca (Configurações → Marcas); o serviço tem padrão quando a marca não definiu o seu.
 */
export function NfDataList({ nf }: { nf: NfData }) {
  const rows: { label: string; value: string | null; mono?: boolean }[] = [
    { label: "Razão social do tomador", value: nf.legalName },
    { label: "CNPJ do tomador", value: nf.takerDocument ? formatCnpj(nf.takerDocument) : null, mono: true },
    { label: "Código do serviço", value: nf.serviceCode, mono: true },
    { label: "Descrição do serviço", value: nf.serviceDescription },
  ];
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 rounded-2xl bg-white/50 px-4 py-3 dark:bg-white/5">
          <div className="min-w-0">
            <p className="text-xs text-stone-500">{r.label}</p>
            <p className={`text-sm ${r.mono ? "font-mono font-semibold" : ""} ${r.value ? "" : "text-stone-400"}`}>{r.value ?? "em breve"}</p>
          </div>
          {r.value && <CopyButton value={r.value} label="Copiar" />}
        </div>
      ))}
      {nf.notes && (
        <div className="rounded-2xl bg-white/50 px-4 py-3 text-sm dark:bg-white/5">
          <p className="text-xs text-stone-500">Observações</p>
          <p className="mt-1 whitespace-pre-line">{nf.notes}</p>
        </div>
      )}
    </div>
  );
}
