/**
 * Planilhas da equipe sincronizadas com o sistema (D-SHEETSYNC). Regras puras: como cada coluna da planilha vira um
 * campo do sistema e volta para a planilha. A leitura das colunas é pelo título (sem acento, maiúsculas), então a
 * ordem das colunas pode mudar e colunas novas são ignoradas.
 */

export type CentralField =
  | "id"
  | "name"
  | "phone"
  | "coupon"
  | "cpf"
  | "cnpj"
  | "instagram"
  | "pixKey"
  | "email"
  | "address"
  | "cityState"
  | "contractStart"
  | "contractEnd"
  | "lastShipment"
  | "lastTracking"
  | "couponRegistered"
  | "followsOnInstagram"
  | "inGroup"
  | "contractSigned"
  | "tagged"
  | "ugcFolderUrl"
  | "ugcOrder"
  | "ugcVideoStatus"
  | "notes";

/** Título da coluna sem acento, em maiúsculas e com espaços simples ("Seguimos no insta?" → "SEGUIMOS NO INSTA?"). */
export function normHeader(h: string): string {
  return h.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** Coluna da Central → campo. O título da coluna de ligação é escrito pelo script na primeira vez. */
export const CENTRAL_ID_HEADER = "ID CREATOR CLUB";
export const CENTRAL_COLUMNS: Record<string, CentralField> = {
  [CENTRAL_ID_HEADER]: "id",
  "NOME COMPLETO": "name",
  WHATSAPP: "phone",
  CUPOM: "coupon",
  CPF: "cpf",
  CNPJ: "cnpj",
  INSTAGRAM: "instagram",
  "CHAVE PIX": "pixKey",
  "E-MAIL": "email",
  ENDERECO: "address",
  "CIDADE/ES": "cityState",
  "DATA DE INICIO": "contractStart",
  "FINAL DO CONTRATO": "contractEnd",
  "ULTIMO PEDIDO": "lastShipment",
  "CODIGO DE RASTREIO": "lastTracking",
  "CUPOM CAD.": "couponRegistered",
  "SEGUIMOS NO INSTA?": "followsOnInstagram",
  GRUPO: "inGroup",
  "CONTRATO ASS.": "contractSigned",
  ETIQUETADA: "tagged",
  PASTA: "ugcFolderUrl",
  "PEDIDO:": "ugcOrder",
  "VIDEOS FEITOS?": "ugcVideoStatus",
  OBS: "notes",
};

/** Colunas que só o sistema escreve (a edição delas na planilha é desfeita na próxima volta). */
export const CENTRAL_OUT_ONLY: readonly CentralField[] = ["id", "lastShipment", "lastTracking"];

/** Abas da Central e o tipo de creator de cada uma. */
export const CENTRAL_TABS = { CREATORS: "INFLUENCER", PRESCRITORES: "PRESCRITOR", UGC: "UGC" } as const;
export type CentralTab = keyof typeof CENTRAL_TABS;

/** Aba pelo nome ("UGC`S" → UGC); outras abas (ex.: Prospecção Hunter) não são sincronizadas. */
export function centralTab(name: string): CentralTab | null {
  const n = normHeader(name).replace(/[^A-Z]/g, "");
  if (n === "CREATORS") return "CREATORS";
  if (n === "PRESCRITORES") return "PRESCRITORES";
  if (n === "UGC" || n === "UGCS") return "UGC";
  return null;
}

/** Aba onde entra uma creator nova do sistema: prescritor, depois influencer, depois UGC. */
export function tabForCategories(categories: readonly string[]): CentralTab {
  if (categories.includes("PRESCRITOR")) return "PRESCRITORES";
  if (categories.includes("INFLUENCER") || !categories.includes("UGC")) return "CREATORS";
  return "UGC";
}

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v)).replace(/\s+/g, " ").trim();

/** "Sim"/"Não" (e variações) → booleano; vazio ou outra coisa → nulo (não informado). */
export function parseYesNo(v: unknown): boolean | null {
  const t = normHeader(text(v));
  if (["SIM", "S", "OK", "X", "TRUE", "VERDADEIRO"].includes(t)) return true;
  if (["NAO", "N", "FALSE", "FALSO"].includes(t)) return false;
  return null;
}
export const yesNo = (b: boolean | null) => (b === null ? "" : b ? "Sim" : "Não");

/** Data da planilha ("2026-10-05", "05/10/2026", "5/10/26") → "2026-10-05"; inválida → nulo. */
export function parseSheetDay(v: unknown): string | null {
  const t = text(v);
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  const day = `${year}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day ? null : day;
}
/** "2026-10-05" → "05/10/2026". */
export const sheetDay = (day: string | null) => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : "");

/** "Betim/MG", "Betim - MG", "Betim, MG" → cidade e UF. Sem UF reconhecível: só a cidade. */
export function parseCityState(v: unknown): { city: string | null; state: string | null } {
  const t = text(v);
  if (!t) return { city: null, state: null };
  const m = t.match(/^(.*?)[\s]*[/,-][\s]*([A-Za-z]{2})$/);
  return m ? { city: m[1]!.trim() || null, state: m[2]!.toUpperCase() } : { city: t, state: null };
}

/** @ do Instagram sem o @ e sem o link. */
export function cleanInstagram(v: unknown): string | null {
  const t = text(v).replace(/^.*instagram\.com\//i, "").replace(/[/?#].*$/, "").replace(/^@+/, "").trim();
  return t || null;
}

export const onlyDigits = (v: unknown) => text(v).replace(/\D/g, "");
/** CPF e CNPJ com pontuação na planilha. */
export function formatDoc(d: string | null): string {
  if (!d) return "";
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

/** Texto livre limpo (nulo quando vazio). */
export const sheetText = (v: unknown, max = 300) => text(v).slice(0, max) || null;
