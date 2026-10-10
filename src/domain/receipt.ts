/**
 * Recibo da creator pessoa física (D-PFRECEIPT): no pedido de saque ela confere o texto, digita nome completo e CPF e
 * aceita; o texto aceito fica gravado (`WithdrawalReceipt`). Sem retenção de imposto (decisão de 2026-10-10).
 */

const UNITS = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function upTo999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]!);
  if (rest < 20) {
    if (rest) parts.push(UNITS[rest]!);
  } else {
    parts.push(TENS[Math.floor(rest / 10)]! + (rest % 10 ? ` e ${UNITS[rest % 10]}` : ""));
  }
  return parts.join(" e ");
}

function integerInWords(n: number): string {
  if (n === 0) return "zero";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const groups: string[] = [];
  if (millions) groups.push(millions === 1 ? "um milhão" : `${upTo999(millions)} milhões`);
  if (thousands) groups.push(thousands === 1 ? "mil" : `${upTo999(thousands)} mil`);
  if (rest) groups.push(upTo999(rest));
  // "e" antes do último grupo quando ele é menor que 100 ou centena redonda (ex.: mil e cinquenta, mil e duzentos)
  if (groups.length > 1 && rest && (rest < 100 || rest % 100 === 0)) return `${groups.slice(0, -1).join(", ")} e ${groups.at(-1)}`;
  return groups.join(" ");
}

/** Valor em reais por extenso: 152809 → "mil quinhentos e vinte e oito reais e nove centavos". */
export function brlInWords(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents >= 1_000_000_000 * 100) throw new RangeError(`valor inválido: ${cents}`);
  const reais = Math.floor(cents / 100);
  const c = cents % 100;
  const parts: string[] = [];
  if (reais) {
    const words = integerInWords(reais);
    const de = reais % 1_000_000 === 0 ? " de" : ""; // "um milhão de reais"
    parts.push(`${words}${de} ${reais === 1 ? "real" : "reais"}`);
  }
  if (c) parts.push(`${integerInWords(c)} ${c === 1 ? "centavo" : "centavos"}`);
  return parts.length ? parts.join(" e ") : "zero real";
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const fmtCpf = (cpf: string) => `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
const fmtCnpj = (d: string) => (d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d);
const fmtBrl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function receiptText(r: {
  fullName: string;
  cpf: string;
  payerName: string;
  payerDocument: string | null;
  brandName: string;
  amountCents: number;
  /** Último mês liberado ("AAAA-MM"). */
  releasedThrough: string | null;
  /** Dia do aceite ("AAAA-MM-DD", fuso da marca). */
  day: string;
}): string {
  const [y, m, d] = r.day.split("-").map(Number) as [number, number, number];
  const through = r.releasedThrough
    ? (() => {
        const [ry, rm] = r.releasedThrough.split("-").map(Number) as [number, number];
        return ` liberadas até ${MONTHS[rm - 1]} de ${ry}`;
      })()
    : "";
  const payer = r.payerDocument ? `${r.payerName} (CNPJ ${fmtCnpj(r.payerDocument.replace(/\D/g, ""))})` : r.payerName;
  return [
    "RECIBO",
    `Eu, ${r.fullName.trim()}, CPF ${fmtCpf(r.cpf)}, declaro que recebo de ${payer} a quantia de ${fmtBrl(r.amountCents)} (${brlInWords(r.amountCents)}), referente às comissões de vendas do Creator Club ${r.brandName}${through}, paga por Pix na chave informada no portal.`,
    "Este recibo vale como quitação deste valor depois que o Pix for feito.",
    `${d} de ${MONTHS[m - 1]} de ${y}`,
  ].join("\n\n");
}
