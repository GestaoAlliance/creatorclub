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
