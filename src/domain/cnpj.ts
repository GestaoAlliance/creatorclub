/**
 * Cadastro PJ (D-PJADDR, reunião de 2026-10-27; respostas do responsável em 2026-10-28): quem informa CNPJ escolhe o
 * regime tributário; para empresa que não é MEI, o endereço de entrega dos produtos precisa ser o do CNPJ (evita
 * retenção da mercadoria). MEI pode receber em outro endereço. O endereço do CNPJ vem dos dados públicos da Receita.
 */

export const TAX_REGIMES = { MEI: "MEI", SIMPLES: "Simples Nacional (ME/EPP)", OUTRO: "Lucro Presumido ou Real" } as const;
export type TaxRegime = keyof typeof TAX_REGIMES;

export function isTaxRegime(v: unknown): v is TaxRegime {
  return typeof v === "string" && Object.hasOwn(TAX_REGIMES, v);
}

export type CnpjAddress = { zip: string; street: string; number: string; complement: string | null; district: string; city: string; state: string };
export type CnpjInfo = { legalName: string; mei: boolean | null; active: boolean; address: CnpjAddress };

/** Precisa entregar no endereço do CNPJ? (CNPJ válido e regime que não é MEI; sem regime não se cobra.) */
export function mustShipToCnpj(cnpj: string | null | undefined, regime: string | null | undefined): boolean {
  return (cnpj ?? "").replace(/\D/g, "").length === 14 && isTaxRegime(regime) && regime !== "MEI";
}

const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** Resposta da BrasilAPI (`/api/cnpj/v1/{cnpj}`) → dados que o cadastro usa; null se faltar o essencial. */
export function parseCnpjLookup(json: unknown): CnpjInfo | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const zip = text(j.cep).replace(/\D/g, "");
  const legalName = text(j.razao_social);
  if (!legalName || zip.length !== 8) return null;
  const kind = text(j.descricao_tipo_de_logradouro);
  const street = text(j.logradouro);
  return {
    legalName,
    mei: typeof j.opcao_pelo_mei === "boolean" ? j.opcao_pelo_mei : null,
    active: !text(j.descricao_situacao_cadastral) || text(j.descricao_situacao_cadastral).toUpperCase() === "ATIVA",
    address: {
      zip,
      street: kind && !street.toUpperCase().startsWith(kind.toUpperCase()) ? `${kind} ${street}` : street,
      number: text(j.numero) || "S/N",
      complement: text(j.complemento) || null,
      district: text(j.bairro),
      city: text(j.municipio),
      state: text(j.uf).toUpperCase(),
    },
  };
}

const num = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^0+(?=\d)/, "");

/** Mesmo endereço: CEP e número iguais (rua e bairro mudam de grafia entre a Receita e o Correios). */
export function sameShipAddress(a: { zip: string; number: string }, b: { zip: string; number: string }): boolean {
  return a.zip.replace(/\D/g, "") === b.zip.replace(/\D/g, "") && num(a.number) === num(b.number);
}

/** "Rua X, 10 — sala 2, Centro, Cidade/UF, CEP 00000-000" para mostrar na mensagem de erro. */
export function cnpjAddressLine(a: CnpjAddress): string {
  return `${a.street}, ${a.number}${a.complement ? ` — ${a.complement}` : ""}, ${a.district}, ${a.city}/${a.state}, CEP ${a.zip.slice(0, 5)}-${a.zip.slice(5)}`;
}
