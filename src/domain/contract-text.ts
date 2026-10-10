import type { KitTier } from "./kit";
import { formatBRL } from "./money";

/**
 * Contrato assinado no portal (D-SIGNCONTRACT). O texto de cada tipo (influencer, prescritor, UGC) tem campos entre
 * chaves duplas que o sistema preenche com os dados da creator e da versão do contrato dela. A creator assina o texto
 * já preenchido; esse texto é guardado exatamente como foi assinado.
 */

export const CONTRACT_KINDS = ["INFLUENCER", "PRESCRITOR", "UGC"] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];
export const CONTRACT_KIND_LABEL: Record<ContractKind, string> = { INFLUENCER: "Influencer", PRESCRITOR: "Prescritor", UGC: "UGC (permuta)" };

/** Campos que o texto pode usar. */
export const CONTRACT_FIELDS = {
  CONTRATADA: "qualificação: nome, CPF e endereço (ou empresa, CNPJ e representante)",
  NOME: "nome completo",
  CPF: "CPF",
  ENDERECO: "endereço completo",
  CUPOM: "código do cupom",
  DESCONTO: "desconto do cupom (ex.: 5%)",
  COMISSAO: "comissão (ex.: 15%)",
  MINIMO: "mínimo de vendas para liberar a comissão",
  KIT: "faixas do kit mensal, uma por linha",
  MESES: "prazo do contrato (ex.: 6 (seis) meses)",
  VIDEOS: "meta de vídeos da UGC no período",
  DATA: "data da assinatura (ex.: 10 de outubro de 2026)",
} as const;
export type ContractField = keyof typeof CONTRACT_FIELDS;

export type ContractData = {
  fullName: string;
  cpf: string;
  address: string;
  cnpj: string | null;
  companyName: string | null;
  coupon: string | null;
  discountBps: number | null;
  rateBps: number | null;
  releaseMinCents: number | null;
  kitTiers: readonly KitTier[];
  months: number;
  videoGoal: number;
  signedAt: Date;
};

const WORDS = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze"];
const spelled = (n: number) => (WORDS[n] ? `${String(n).padStart(2, "0")} (${WORDS[n]})` : String(n));
const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
const money = (cents: number) => formatBRL(cents).replace(/ /g, " ");
export const formatCpf = (d: string) => d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
export const formatCnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

/** Data por extenso no fuso de São Paulo. */
export function longDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" });
}

/** Faixas do kit em linhas legíveis (D-KIT: vendas do mês; vale a faixa mais alta alcançada). */
export function kitText(tiers: readonly KitTier[]): string {
  const sorted = [...tiers].sort((a, b) => a.fromCents - b.fromCents);
  if (sorted.length === 0) return "Esta versão do contrato não tem kit mensal.";
  const lines = [`Vendas do mês abaixo de ${money(sorted[0]!.fromCents)}: sem novo kit;`];
  sorted.forEach((t, i) => {
    const next = sorted[i + 1];
    const range = t.toCents != null
      ? `de ${money(t.fromCents)} até ${money(t.toCents)}`
      : next ? `de ${money(t.fromCents)} a ${money(next.fromCents - 1)}` : `a partir de ${money(t.fromCents)}`;
    lines.push(`Vendas do mês ${range}: ${spelled(t.products)} ${t.products === 1 ? "suplemento" : "suplementos"}${next ? ";" : "."}`);
  });
  return lines.join("\n");
}

function values(d: ContractData): Record<ContractField, string> {
  const cpf = formatCpf(d.cpf);
  const contratada = d.cnpj
    ? `${d.companyName || d.fullName}, inscrita no CNPJ sob o nº ${formatCnpj(d.cnpj)}, com endereço em ${d.address}, neste ato representada por ${d.fullName}, inscrita no CPF sob o nº ${cpf}`
    : `${d.fullName}, inscrita no CPF sob o nº ${cpf}, residente em ${d.address}`;
  return {
    CONTRATADA: contratada,
    NOME: d.fullName,
    CPF: cpf,
    ENDERECO: d.address,
    CUPOM: d.coupon ?? "(a definir)",
    DESCONTO: d.discountBps != null ? pct(d.discountBps) : "(a definir)",
    COMISSAO: d.rateBps != null ? pct(d.rateBps) : "(a definir)",
    MINIMO: d.releaseMinCents != null ? money(d.releaseMinCents) : "(sem comissão)",
    KIT: kitText(d.kitTiers),
    MESES: `${spelled(d.months)} meses`,
    VIDEOS: spelled(d.videoGoal),
    DATA: longDate(d.signedAt),
  };
}

/** Campos usados no texto que o sistema não conhece (erro de digitação ao editar o contrato). */
export function unknownContractFields(body: string): string[] {
  const used = [...body.matchAll(/\{\{\s*([A-Z_]+)\s*\}\}/g)].map((m) => m[1]!);
  return [...new Set(used.filter((f) => !(f in CONTRACT_FIELDS)))];
}

/** Texto final do contrato com os dados da creator. */
export function renderContract(body: string, data: ContractData): string {
  const v = values(data);
  return body.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (all, f: string) => (f in v ? v[f as ContractField] : all));
}

/** Tipo de texto pela versão do contrato escolhida na ficha. */
export const isContractKind = (k: string): k is ContractKind => (CONTRACT_KINDS as readonly string[]).includes(k);
