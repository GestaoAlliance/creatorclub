/**
 * Conferência da nota fiscal do saque (D-NFCHECK). Lê o texto do DANFSe (NFS-e padrão nacional) e confere:
 * tomadora = CNPJ da marca, valor do serviço = valor do saque, emissor = CNPJ da creator, código de serviço 17.06 e
 * chave de acesso (50 dígitos) nunca usada antes (essa última no banco). Campo que não dá para ler não bloqueia: o
 * pedido entra marcado "conferir a nota" para o Pagamento. Campo lido e diferente bloqueia o pedido com o motivo.
 */

export type NfseFields = {
  accessKey: string | null;
  issuerDoc: string | null;
  takerDoc: string | null;
  serviceCode: string | null;
  amountCents: number | null;
};

const digits = (s: string) => s.replace(/\D/g, "");

/** Valor da linha logo depois do rótulo (o DANFSe põe rótulo e valor em linhas seguidas). */
function after(lines: string[], label: RegExp): string | null {
  const i = lines.findIndex((l) => label.test(l));
  return i >= 0 && i + 1 < lines.length ? lines[i + 1]!.trim() : null;
}

function brlToCents(s: string | null): number | null {
  const m = s?.match(/R\$\s*([\d.]+,\d{2})/);
  return m ? Number(m[1]!.replace(/\./g, "").replace(",", "")) : null;
}

function doc(s: string | null): string | null {
  const d = s ? digits(s) : "";
  return d.length === 14 || d.length === 11 ? d : null;
}

export function parseNfseText(text: string): NfseFields {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const key = text.match(/(?<!\d)\d{50}(?!\d)/);
  const code = after(lines, /^SERVIÇO PRESTADO/i)?.match(/^(\d{2}\.\d{2}(?:\.\d{2})?)/);
  return {
    accessKey: key ? key[0] : null,
    issuerDoc: doc(after(lines, /^PRESTADOR \/ FORNECEDOR/i)),
    takerDoc: doc(after(lines, /^TOMADOR \/ ADQUIRENTE/i)),
    serviceCode: code ? code[1]! : null,
    amountCents: brlToCents(after(lines, /VALOR DA OPERAÇÃO \/ SERVIÇO/i)),
  };
}

/** CNPJ/CPF de quem emitiu, gravado na chave de acesso (posições 10 a 23). */
export function issuerFromAccessKey(key: string): string {
  const d = key.slice(9, 23);
  return d.startsWith("000") ? d.slice(3) : d; // CPF vem com zeros à esquerda
}

export type NfCheck = { status: "OK" | "MANUAL"; problems: string[]; fields: NfseFields; issuerDoc: string | null };

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function checkNf(
  fields: NfseFields,
  expected: { takerDoc: string | null; takerName?: string; amountCents: number; issuerDoc: string | null },
): NfCheck {
  const problems: string[] = [];
  let missing = false;
  const issuer = fields.issuerDoc ?? (fields.accessKey ? issuerFromAccessKey(fields.accessKey) : null);
  const taker = expected.takerDoc ? digits(expected.takerDoc) : null;

  if (!fields.accessKey) missing = true;
  if (!fields.takerDoc || !taker) missing = true;
  else if (fields.takerDoc !== taker) problems.push(`A tomadora da nota precisa ser a ${expected.takerName ?? "marca"} (CNPJ no portal). Emita a nota para o CNPJ certo.`);
  if (fields.amountCents === null) missing = true;
  else if (fields.amountCents !== expected.amountCents)
    problems.push(`O valor da nota é ${brl(fields.amountCents)}; o saque é de ${brl(expected.amountCents)}. Emita a nota com o valor total do saque.`);
  if (!issuer) missing = true;
  else if (expected.issuerDoc && digits(expected.issuerDoc) !== issuer) problems.push("A nota foi emitida por um CNPJ diferente do seu cadastro. Fale com a equipe.");
  if (!fields.serviceCode) missing = true;
  else if (!fields.serviceCode.startsWith("17.06")) problems.push("O código do serviço precisa ser 17.06 (propaganda e publicidade), como nas instruções da nota.");

  return { status: missing ? "MANUAL" : "OK", problems, fields, issuerDoc: issuer };
}
