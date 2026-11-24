import { describe, expect, it } from "vitest";
import { matchSigners, otherBrandDocument } from "@/lib/autentique/legacy-import";

const botanika = { name: "Botanika", slug: "botanika" };
const verme = { name: "VermeFree", slug: "vermefree" };
const revita = { name: "Revita Derma", slug: "revita-derma" };

describe("filtro de marca dos contratos antigos (D-LEGACYCONTRACT)", () => {
  it("documento que cita outra marca fica de fora; o da própria marca ou sem marca entra", () => {
    expect(otherBrandDocument("Lorena Caires Carvalho_Prescritor_VermeFree.docx", botanika, [verme, revita])).toBe(true);
    expect(otherBrandDocument("Contrato CPF Kit - Revita Derma", botanika, [verme, revita])).toBe(true);
    expect(otherBrandDocument("Clesiane Barbosa - Contrato influenciadores botanika.docx", botanika, [verme, revita])).toBe(false);
    expect(otherBrandDocument("Contrato Fernanda Esteves", botanika, [verme, revita])).toBe(false);
    expect(otherBrandDocument("Juliana - Influencer VermeFree.docx", verme, [botanika, revita])).toBe(false);
    expect(otherBrandDocument("Contrato revitaderma - Ana", botanika, [verme, revita])).toBe(true);
  });

  it("liga pelo e-mail sem diferença de maiúsculas e cai para o nome", () => {
    const people = [{ id: "a", email: "ana@x.com", name: "Ana Souza" }, { id: "b", email: "bia@x.com", name: "Beatriz Lima" }];
    expect(matchSigners([{ name: "", email: "ANA@x.com" }], people)).toMatchObject({ status: "MATCHED", creatorId: "a", matchedBy: "EMAIL" });
    expect(matchSigners([{ name: "beatriz  lima", email: "outro@y.com" }], people)).toMatchObject({ status: "MATCHED", creatorId: "b", matchedBy: "NAME" });
    expect(matchSigners([{ name: "", email: "z@y.com" }], people).status).toBe("UNMATCHED");
  });
});

describe("contrato antigo vale com a creator e a marca (D-LEGACYCONTRACT)", () => {
  it("e-mail da marca: domínio da loja ou a conta do Autentique", async () => {
    const { brandEmail } = await import("@/lib/autentique/legacy-import");
    expect(brandEmail("financeiro@botanikabrasil.com.br", "https://botanikabrasil.com.br", null)).toBe(true);
    expect(brandEmail("creators.botanikabrasil@gmail.com", "https://botanikabrasil.com.br", "creators.botanikabrasil@gmail.com")).toBe(true);
    expect(brandEmail("contadorguilherme@gmail.com", "https://botanikabrasil.com.br", "creators.botanikabrasil@gmail.com")).toBe(false);
  });

  it("creator e marca assinaram: vale, mesmo com o contador aguardando e e-mail com falha", async () => {
    const { legacySigned } = await import("@/lib/autentique/legacy-import");
    const isCreator = (e: string) => e === "aninha@gmail.com";
    const isBrand = (e: string) => e.endsWith("@botanikabrasil.com.br");
    const anna = [
      { email: "aninha@gmail.com", signedAt: "2026-07-17 15:55:00" },
      { email: "financeiro@botanikabrasil.com.br", signedAt: "2026-10-23 10:01:00" },
      { email: "contadorguilherme@gmail.com", signedAt: null },
      { email: "df16@gtconbtasil.com.br", signedAt: null },
    ];
    expect(legacySigned(anna, isCreator, isBrand)).toEqual({ ok: true, signedAt: "2026-10-23 10:01:00" });
    expect(legacySigned(anna.map((s) => (s.email.includes("financeiro") ? { ...s, signedAt: null } : s)), isCreator, isBrand).ok).toBe(false); // falta a marca
    expect(legacySigned(anna.map((s) => (s.email.startsWith("aninha") ? { ...s, signedAt: null } : s)), isCreator, isBrand).ok).toBe(false); // falta a creator
    expect(legacySigned([{ email: "aninha@gmail.com", signedAt: "2026-07-17 15:55:00" }], isCreator, isBrand).ok).toBe(true); // sem ninguém da marca
  });
});

describe("contrato assinado pelo domínio de outra marca (D-LEGACYCONTRACT)", () => {
  it("financeiro da Botanika na conta da VermeFree: é da Botanika", async () => {
    const { signerOfOtherBrand } = await import("@/lib/autentique/legacy-import");
    const vf = { storeUrl: "https://vermefree.com.br" };
    const others = [{ storeUrl: "https://botanikabrasil.com.br" }, { storeUrl: "https://revitaderma.com.br" }];
    expect(signerOfOtherBrand(["gredessiree@gmail.com", "financeiro@botanikabrasil.com.br", "contadorguilherme@gmail.com"], vf, others)).toBe(true);
    expect(signerOfOtherBrand(["luli@gmail.com"], vf, others)).toBe(false);
    expect(signerOfOtherBrand(["x@vermefree.com.br", "financeiro@botanikabrasil.com.br"], vf, others)).toBe(false);
  });
});

describe("contrato da marca em conta de outra marca (D-LEGACYCROSS)", () => {
  it("só entra o que é claramente da marca: nome (inclusive 'BT' da Botanika) ou domínio de quem assinou", async () => {
    const { ownDocument } = await import("@/lib/autentique/legacy-import");
    const bk = { name: "Botanika", slug: "botanika", storeUrl: "https://botanikabrasil.com.br" };
    const sig = (email: string) => ({ email, action: { name: "SIGN" } });
    expect(ownDocument({ name: "Contrato Prescritor BT", signatures: [sig("a@gmail.com")] }, bk)).toBe(true);
    expect(ownDocument({ name: "Contrato Prescritor Raquel", signatures: [sig("financeiro@botanikabrasil.com.br")] }, bk)).toBe(true);
    expect(ownDocument({ name: "Contrato UGC - Luli.docx (1)", signatures: [sig("luli@gmail.com")] }, bk)).toBe(false);
    expect(ownDocument({ name: "Contrato Abtu", signatures: [sig("a@gmail.com")] }, bk)).toBe(false); // "bt" só como palavra
  });
});
