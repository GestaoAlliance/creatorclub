/**
 * Endereço de entrega da creator (D-SHIPADDR). Regra pura: valida e normaliza o que a creator digita no portal.
 * CEP só com 8 dígitos e UF de 2 letras também são travas no banco (`CreatorAccount_addr_zip`, `_addr_state_uf`).
 */

export class AddressError extends Error {}

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO",
  "RR", "SC", "SP", "SE", "TO",
] as const;

export type Address = {
  zip: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
};

export type AddressInput = { zip: string; street: string; number: string; complement?: string; district: string; city: string; state: string };

const clean = (v: string | undefined, max: number) => (v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export function normalizeAddress(input: AddressInput): Address {
  const zip = (input.zip ?? "").replace(/\D/g, "");
  if (zip.length !== 8) throw new AddressError("CEP precisa ter 8 números.");
  const state = clean(input.state, 2).toUpperCase();
  if (!(UFS as readonly string[]).includes(state)) throw new AddressError("Escolha o estado (UF).");
  const street = clean(input.street, 160);
  const number = clean(input.number, 20);
  const district = clean(input.district, 80);
  const city = clean(input.city, 80);
  if (!street) throw new AddressError("Informe a rua.");
  if (!number) throw new AddressError("Informe o número (ou \"s/n\").");
  if (!district) throw new AddressError("Informe o bairro.");
  if (!city) throw new AddressError("Informe a cidade.");
  const complement = clean(input.complement, 80) || null;
  return { zip, street, number, complement, district, city, state };
}

/** Endereço da conta (colunas `addr*`) ou null se incompleto. */
export function addressOf(a: {
  addrZip: string | null;
  addrStreet: string | null;
  addrNumber: string | null;
  addrComplement: string | null;
  addrDistrict: string | null;
  addrCity: string | null;
  addrState: string | null;
}): Address | null {
  if (!a.addrZip || !a.addrStreet || !a.addrNumber || !a.addrDistrict || !a.addrCity || !a.addrState) return null;
  return { zip: a.addrZip, street: a.addrStreet, number: a.addrNumber, complement: a.addrComplement, district: a.addrDistrict, city: a.addrCity, state: a.addrState };
}

/** Cópia do endereço num envio: estruturado, ou o texto livre de um envio importado das planilhas (D-SHIPIMPORT). */
export type ShipmentAddress = Address | { raw: string };

export function formatAddress(a: ShipmentAddress): string[] {
  if ("raw" in a) return [a.raw];
  const zip = `${a.zip.slice(0, 5)}-${a.zip.slice(5)}`;
  return [`${a.street}, ${a.number}${a.complement ? ` — ${a.complement}` : ""}`, `${a.district} · ${a.city}/${a.state}`, `CEP ${zip}`];
}

export const addressColumns = (a: Address) => ({
  addrZip: a.zip,
  addrStreet: a.street,
  addrNumber: a.number,
  addrComplement: a.complement,
  addrDistrict: a.district,
  addrCity: a.city,
  addrState: a.state,
});
