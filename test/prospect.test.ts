import { describe, expect, it } from "vitest";
import { fillProspectMessage, needsFollowUp, parseHandles, prospectHandle, prospectMessages, sheetProspectStatus } from "@/domain";

describe("prospecção (U6, D-PROSPECT)", () => {
  it("@ guardado em minúsculas, sem @, a partir de link ou texto", () => {
    expect(prospectHandle("@CamilaSchiavo__")).toBe("camilaschiavo__");
    expect(prospectHandle("https://instagram.com/Gabi.Reis/")).toBe("gabi.reis");
    expect(prospectHandle("não tenho")).toBeNull();
  });

  it("vários @ colados: um por linha ou com vírgula; repetidos e inválidos separados", () => {
    expect(parseHandles("@ana\nbia, @ANA\n\n???  carla_x")).toEqual({ handles: ["ana", "bia", "carla_x"], invalid: ["???"] });
  });

  it("follow up depois de 3 dias em 1ª mensagem ou Forms enviado", () => {
    const now = new Date("2026-10-23T12:00:00Z");
    const at = (d: number) => new Date(now.getTime() - d * 86_400_000);
    expect(needsFollowUp({ status: "FIRST_MESSAGE", statusAt: at(3) }, now)).toBe(true);
    expect(needsFollowUp({ status: "FORM_SENT", statusAt: at(4) }, now)).toBe(true);
    expect(needsFollowUp({ status: "FIRST_MESSAGE", statusAt: at(2) }, now)).toBe(false);
    expect(needsFollowUp({ status: "FOLLOW_UP", statusAt: at(10) }, now)).toBe(false);
    expect(needsFollowUp({ status: "SIGNED_UP", statusAt: at(10) }, now)).toBe(false);
  });

  it("situações da planilha", () => {
    expect(sheetProspectStatus("1ª mensagem", "")).toBe("FIRST_MESSAGE");
    expect(sheetProspectStatus("Follow up ", "")).toBe("FOLLOW_UP");
    expect(sheetProspectStatus("Forms enviado", "")).toBe("FORM_SENT");
    expect(sheetProspectStatus("Forms enviado", "Sim")).toBe("SIGNED_UP");
    expect(sheetProspectStatus("Prop. recusada", "")).toBe("DECLINED");
    expect(sheetProspectStatus("Prop recusada", "")).toBe("DECLINED");
    expect(sheetProspectStatus("", "")).toBe("FIRST_MESSAGE");
  });

  it("mensagens prontas: padrão por marca, troca de quem manda, link, desconto e comissão", () => {
    const b = prospectMessages({ slug: "botanika", prospectFirstMessage: null, prospectProposalMessage: null });
    expect(b.custom).toBe(false);
    expect(b.proposal).toContain("1 suplemento para dar início");
    const other = prospectMessages({ slug: "revita-derma", prospectFirstMessage: null, prospectProposalMessage: null });
    expect(other.proposal).not.toMatch(/suplement/i);
    const text = fillProspectMessage(`${b.first}\n${b.proposal}`, { me: "Ana Gestão", brand: "Botanika", link: "https://cc/i/ana", discountBps: 500, commissionBps: 1500 });
    expect(text).toContain("Sou a Ana, da Botanika.");
    expect(text).toContain("com 5% de desconto");
    expect(text).toContain("15% de comissão");
    expect(text).toContain("https://cc/i/ana");
    expect(prospectMessages({ slug: "botanika", prospectFirstMessage: "Oi!", prospectProposalMessage: null })).toMatchObject({ first: "Oi!", custom: true });
  });
});
