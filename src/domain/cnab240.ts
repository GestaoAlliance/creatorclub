/**
 * Remessa de pagamentos Pix no padrão CNAB 240 do SICOOB (D-REMESSA; "Guia de importação de arquivos CNAB 240",
 * Sicoob, layout de arquivo 087 e de lote 045). Transferência Pix por chave (forma de lançamento 45): um lote com
 * Header de lote, um par de segmentos A e B por saque e o Trailer de lote, entre o Header e o Trailer do arquivo.
 * Cada linha tem exatamente 240 posições; números à direita com zeros, textos à esquerda com brancos, em maiúsculas
 * e sem acento. Antes de gerar, tudo é conferido (lista do Guilherme): favorecido com CPF/CNPJ e nome, chave Pix
 * compatível com o tipo, valor positivo, data válida, sem repetição, totais dos trailers.
 */

export const SICOOB_BANK = "756";

export type CnabCompany = {
  cnpj: string;
  name: string;
  /** Código do convênio CNAB 240 do Internet Banking (G007). */
  convenio: string;
  agency: string;
  agencyDv: string;
  account: string;
  accountDv: string;
};

export type CnabPayment = {
  /** Identificador do saque (vai em "Seu Número" e volta no retorno). */
  id: string;
  name: string;
  /** CPF ou CNPJ do favorecido (só dígitos). */
  doc: string;
  pixKey: string;
  amountCents: number;
};

/** Tipo da chave Pix (G100): 01 telefone, 02 e-mail, 03 CPF/CNPJ, 04 aleatória; e o texto que vai no arquivo. */
export type PixKeyKind = "01" | "02" | "03" | "04";

const onlyDigits = (v: string) => v.replace(/\D/g, "");

function cpfValid(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function cnpjValid(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => {
    const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((t, x, i) => t + x * Number(d[i]), 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

export const validDoc = (d: string) => (d.length === 11 ? cpfValid(d) : d.length === 14 ? cnpjValid(d) : false);

/** Lê a chave Pix como a creator digitou e diz o tipo; null se não der para saber. */
export function pixKeyOf(raw: string): { kind: PixKeyKind; value: string } | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return { kind: "04", value: t.toLowerCase() };
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) return t.length <= 77 ? { kind: "02", value: t.toLowerCase() } : null;
  const d = onlyDigits(t);
  if (/^\+/.test(t) || /[()]/.test(t) || (d.length >= 12 && d.startsWith("55") && d.length <= 13)) {
    const n = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
    return n.length === 10 || n.length === 11 ? { kind: "01", value: `+55${n}` } : null;
  }
  if ((d.length === 11 || d.length === 14) && validDoc(d)) return { kind: "03", value: d };
  if (d.length === 10 || d.length === 11) return { kind: "01", value: `+55${d}` };
  return null;
}

/** Texto sem acento, maiúsculo, só caracteres seguros, cortado/completado com brancos. */
export function alfa(v: string, size: number): string {
  const t = v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 @.\-_/+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, size).padEnd(size, " ");
}

/** Chave Pix como digitada (e-mail e aleatória em minúsculas são aceitas; só tira acento). */
const key = (v: string, size: number) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, size).padEnd(size, " ");

export function num(v: number | string, size: number): string {
  const t = typeof v === "number" ? String(Math.trunc(v)) : onlyDigits(v);
  if (t.length > size) throw new RangeError(`número maior que o campo (${size}): ${t}`);
  return t.padStart(size, "0");
}

const blank = (n: number) => " ".repeat(n);
const ddmmyyyy = (day: string) => `${day.slice(8, 10)}${day.slice(5, 7)}${day.slice(0, 4)}`;

function line(parts: string[]): string {
  const l = parts.join("");
  if (l.length !== 240) throw new Error(`registro com ${l.length} posições (deveria ter 240)`);
  return l;
}

export type RemessaProblem = { id: string | null; problem: string };

/** Confere empresa e pagamentos antes de gerar; lista vazia = pode gerar. */
export function checkRemessa(company: CnabCompany, payments: readonly CnabPayment[], payDay: string, today: string): RemessaProblem[] {
  const out: RemessaProblem[] = [];
  const cnpj = onlyDigits(company.cnpj);
  if (!cnpjValid(cnpj)) out.push({ id: null, problem: "CNPJ da marca inválido (Marcas)." });
  if (!company.name.trim()) out.push({ id: null, problem: "Razão social da marca em branco (Marcas)." });
  if (!company.convenio.trim()) out.push({ id: null, problem: "Código do convênio CNAB 240 em branco (Marcas)." });
  if (!/^\d{1,5}$/.test(company.agency) || !/^[0-9A-Z]?$/i.test(company.agencyDv)) out.push({ id: null, problem: "Agência da marca inválida (Marcas)." });
  if (!/^\d{1,12}$/.test(company.account) || !/^\d$/.test(company.accountDv)) out.push({ id: null, problem: "Conta da marca inválida (Marcas)." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payDay) || Number.isNaN(Date.parse(`${payDay}T00:00:00Z`))) out.push({ id: null, problem: "Data de pagamento inválida." });
  else if (payDay < today) out.push({ id: null, problem: "A data de pagamento não pode ser no passado." });
  if (payments.length === 0) out.push({ id: null, problem: "Nenhum saque para pagar." });
  const seen = new Set<string>();
  for (const p of payments) {
    if (seen.has(p.id)) out.push({ id: p.id, problem: "Saque repetido na remessa." });
    seen.add(p.id);
    if (!p.name.trim()) out.push({ id: p.id, problem: "Nome do favorecido em branco." });
    if (!validDoc(onlyDigits(p.doc))) out.push({ id: p.id, problem: "CPF/CNPJ do favorecido inválido." });
    if (!Number.isSafeInteger(p.amountCents) || p.amountCents <= 0) out.push({ id: p.id, problem: "Valor do saque precisa ser positivo." });
    const k = pixKeyOf(p.pixKey);
    if (!k) out.push({ id: p.id, problem: "Chave Pix vazia ou em formato que o banco não aceita." });
  }
  return out;
}

/**
 * Monta o arquivo (linhas de 240 posições separadas por CRLF). `nsa` = número sequencial do arquivo (cresce a cada
 * remessa da marca). Lança erro se `checkRemessa` apontar problema.
 */
export function buildRemessa(input: { company: CnabCompany; payments: readonly CnabPayment[]; payDay: string; nsa: number; now: Date; today: string }): string {
  const problems = checkRemessa(input.company, input.payments, input.payDay, input.today);
  if (problems.length) throw new Error(problems.map((p) => p.problem).join(" "));
  const c = input.company;
  const cnpj = onlyDigits(c.cnpj);
  const company = [num(c.agency, 5), alfa(c.agencyDv, 1), num(c.account, 12), num(c.accountDv, 1), blank(1)];
  const brt = new Date(input.now.getTime() - 3 * 3600_000).toISOString(); // horário de Brasília
  const lines: string[] = [];

  // Header do arquivo (tipo 0).
  lines.push(
    line([
      SICOOB_BANK, "0000", "0", blank(9), "2", num(cnpj, 14), alfa(c.convenio, 20), ...company, alfa(c.name, 30), alfa("SICOOB", 30), blank(10),
      "1", ddmmyyyy(brt.slice(0, 10)), brt.slice(11, 19).replace(/:/g, ""), num(input.nsa, 6), "087", "01600", blank(20), blank(20), blank(29),
    ]),
  );
  // Header do lote (tipo 1): crédito (C), pagamento a fornecedor (20), Pix transferência (45), layout 045.
  lines.push(
    line([
      SICOOB_BANK, "0001", "1", "C", "20", "45", "045", blank(1), "2", num(cnpj, 14), alfa(c.convenio, 20), ...company, alfa(c.name, 30), blank(40),
      blank(30), num(0, 5), blank(15), blank(20), num(0, 5), blank(3), blank(2), num(0, 2), blank(6), blank(10),
    ]),
  );
  let seq = 0;
  let total = 0;
  for (const p of input.payments) {
    const k = pixKeyOf(p.pixKey)!;
    const doc = onlyDigits(p.doc);
    total += p.amountCents;
    // Segmento A: favorecido sem banco/conta (a chave resolve), câmara 009 (Pix/SPI), data, BRL, valor, tipo de conta 01.
    lines.push(
      line([
        SICOOB_BANK, "0001", "3", num(++seq, 5), "A", "0", "00", "009", num(0, 3), num(0, 5), blank(1), num(0, 12), num(0, 1), blank(1),
        alfa(p.name, 30), alfa(p.id.replace(/-/g, "").slice(0, 20), 20), ddmmyyyy(input.payDay), "BRL", num(0, 15), num(p.amountCents, 15),
        blank(20), num(0, 8), num(0, 15), `${blank(38)}01`, blank(2), num(0, 5), blank(2), blank(3), "0", blank(10),
      ]),
    );
    // Segmento B: forma de iniciação (G100), CPF/CNPJ do favorecido e a chave (telefone, e-mail ou aleatória).
    lines.push(
      line([
        SICOOB_BANK, "0001", "3", num(++seq, 5), "B", alfa(k.kind, 3), doc.length === 14 ? "2" : "1",
        num(k.kind === "03" ? k.value : doc, 14), blank(35), blank(60), k.kind === "03" ? blank(99) : key(k.value, 99), num(0, 6), blank(8),
      ]),
    );
  }
  // Trailer do lote (tipo 5): registros do lote (header + detalhes + trailer) e soma dos valores.
  lines.push(line([SICOOB_BANK, "0001", "5", blank(9), num(seq + 2, 6), num(total, 18), num(0, 18), num(0, 6), blank(165), blank(10)]));
  // Trailer do arquivo (tipo 9).
  lines.push(line([SICOOB_BANK, "9999", "9", blank(9), num(1, 6), num(lines.length + 1, 6), num(0, 6), blank(205)]));
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Retorno SICOOB (G059): o banco devolve o mesmo arquivo com o resultado em cada segmento A (posições 231–240, até
 * 5 códigos de 2 letras). "Seu Número" (74–93) traz o saque; "Data Real"/"Valor Real" (155–177), a efetivação.
 */
export type RetornoResult = "PAID" | "SCHEDULED" | "PENDING" | "REJECTED";

export const RETORNO_CODES: Record<string, string> = {
  "00": "Crédito efetivado",
  BD: "Agendado no banco",
  PD: "Pendente de assinatura",
  BF: "Rejeitado por pendência de assinatura",
  AJ: "Registro rejeitado (estrutura do arquivo)",
  AN: "Tipo de conta do favorecido inválido",
  AP: "Data de lançamento inválida",
  PA: "Pix não efetivado",
  PC: "Conta do recebedor inválida, encerrada ou bloqueada",
  PE: "Tipo de transação não aceito na conta do recebedor",
  PG: "CPF/CNPJ do recebedor incorreto",
  PH: "Ordem rejeitada pelo banco do recebedor",
  PI: "ISPB pagador/recebedor inválido",
  PJ: "Chave Pix não cadastrada",
  PK: "QR Code inválido ou vencido",
  ZJ: "Limite de pagamentos parciais excedido",
  "01": "Saldo insuficiente na conta da empresa",
  "02": "Débito cancelado pelo pagador",
};

export type RetornoItem = {
  /** "Seu Número": id do saque sem traços, 20 primeiros caracteres. */
  ref: string;
  name: string;
  amountCents: number;
  codes: string[];
  result: RetornoResult;
  /** Data real da efetivação (AAAA-MM-DD), quando o banco informa. */
  paidDay: string | null;
  paidCents: number | null;
};

export type Retorno = { nsa: number | null; items: RetornoItem[]; problems: string[] };

export const remessaRef = (withdrawalId: string) => withdrawalId.replace(/-/g, "").slice(0, 20);

function resultOf(codes: string[]): RetornoResult {
  if (codes.includes("00")) return "PAID";
  if (codes.length && codes.every((c) => c === "BD")) return "SCHEDULED";
  if (codes.length && codes.every((c) => c === "PD" || c === "BD")) return "PENDING";
  return "REJECTED";
}

const yyyymmdd = (d: string) => (/^\d{8}$/.test(d) && d !== "00000000" ? `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}` : null);

/** Lê o arquivo de retorno; não lança: o que não der para ler vai em `problems`. */
export function parseRetorno(content: string): Retorno {
  const lines = content.split(/\r?\n/).map((l) => l.replace(/\r$/, "")).filter((l) => l.trim() !== "");
  const problems: string[] = [];
  const items: RetornoItem[] = [];
  let nsa: number | null = null;
  const at = (l: string, from: number, to: number) => l.slice(from - 1, to);
  lines.forEach((l, i) => {
    if (l.length !== 240) {
      problems.push(`Linha ${i + 1} com ${l.length} posições (deveria ter 240).`);
      return;
    }
    if (at(l, 1, 3) !== SICOOB_BANK) {
      problems.push(`Linha ${i + 1} não é do SICOOB.`);
      return;
    }
    const type = at(l, 8, 8);
    if (type === "0") {
      if (at(l, 143, 143) !== "2") problems.push("O arquivo não é de retorno (é a remessa enviada).");
      const n = at(l, 158, 163);
      nsa = /^\d{6}$/.test(n) ? Number(n) : null;
    } else if (type === "3" && at(l, 14, 14) === "A") {
      const codes = (at(l, 231, 240).match(/.{2}/g) ?? []).map((c) => c.trim()).filter(Boolean);
      const paid = at(l, 163, 177);
      items.push({
        ref: at(l, 74, 93).trim().toLowerCase(),
        name: at(l, 44, 73).trim(),
        amountCents: Number(at(l, 120, 134)) || 0,
        codes,
        result: resultOf(codes),
        paidDay: yyyymmdd(at(l, 155, 162)),
        paidCents: /^\d{15}$/.test(paid) && Number(paid) > 0 ? Number(paid) : null,
      });
    }
  });
  if (lines.length && nsa === null) problems.push("Header do arquivo não encontrado.");
  if (!items.length && !problems.length) problems.push("Nenhum pagamento no arquivo.");
  return { nsa, items, problems };
}
