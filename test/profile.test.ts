import { describe, expect, it } from "vitest";
import { channelHandle, cleanProfile, profileAnswers, validateSignup } from "@/domain";

describe("perfil opcional (M4.3, D-PROFILEFIELDS)", () => {
  it("limpa e confere: nichos só da lista, canal sem endereço, mídia kit https", () => {
    const r = cleanProfile({ professionalId: " CRN-3  12345 ", niches: "Fitness|Inventado|Maternidade", youtube: "https://www.youtube.com/@maria.fit", kwai: "@maria", allergies: " lactose ", mediaKitUrl: "drive.google.com/x" });
    expect(r).toEqual({ ok: true, value: { professionalId: "CRN-3 12345", niches: ["Fitness", "Maternidade"], youtube: "maria.fit", kwai: "maria", allergies: "lactose", mediaKitUrl: "https://drive.google.com/x" } });
    expect(cleanProfile({ niches: ["Moda", "Fitness"] })).toMatchObject({ ok: true, value: { niches: ["Fitness", "Moda"], youtube: null, mediaKitUrl: null } });
    expect(cleanProfile({ mediaKitUrl: "javascript:alert(1)" })).toEqual({ ok: false, errors: { mediaKitUrl: "Cole o link completo (https://…)." } });
    expect(cleanProfile({ mediaKitUrl: "http://site.com" })).toMatchObject({ ok: false });
    expect(cleanProfile({ youtube: "meu canal!" })).toMatchObject({ ok: false, errors: { youtube: expect.any(String) } });
    expect(channelHandle("https://youtube.com/channel/UCabc?x=1")).toBe("UCabc");
  });

  it("no cadastro do site: tudo opcional; vai para a conta e para as respostas que a Ana lê", () => {
    const base = {
      fullName: "Maria", cpf: "529.982.247-25", email: "m@x.com", phone: "(11) 91234-5678", instagram: "maria", coupon: "MARIA", payoutAs: "Pessoa física (CPF)", birthDate: "1995-03-15",
      addrZip: "01310-100", addrStreet: "Av", addrNumber: "1", addrDistrict: "B", addrCity: "São Paulo", addrState: "SP",
    };
    expect(validateSignup(base).ok).toBe(true);
    const r = validateSignup({ ...base, niches: "Nutrição", professionalId: "CRN 1", allergies: "glúten" });
    expect(r.ok && r.account.profile).toMatchObject({ niches: ["Nutrição"], professionalId: "CRN 1", allergies: "glúten" });
    expect(r.ok && r.answers["Nicho do seu conteúdo:"]).toBe("Nutrição");
    expect(validateSignup({ ...base, mediaKitUrl: "ftp://x" })).toMatchObject({ ok: false, errors: { mediaKitUrl: expect.any(String) } });
    expect(profileAnswers({ professionalId: null, niches: [], youtube: "c", kwai: null, allergies: null, mediaKitUrl: null })).toEqual({ "Canal do YouTube:": "@c" });
  });
});

describe("TikTok Shop no cadastro (pedido da Vanessa)", () => {
  it("Sim/Não opcional; vira sim, não ou vazio na conta e entra nas respostas", async () => {
    const { validateSignup } = await import("@/domain");
    const base = {
      fullName: "Maria Exemplo", cpf: "529.982.247-25", email: "m@x.com", phone: "(11) 91234-5678", instagram: "maria", coupon: "MARIA", payoutAs: "Pessoa física (CPF)", birthDate: "1995-03-15",
      addrZip: "01310-100", addrStreet: "Av. Paulista", addrNumber: "1000", addrDistrict: "Bela Vista", addrCity: "São Paulo", addrState: "SP",
    };
    const yes = validateSignup({ ...base, tiktok: "maria.tt", tiktokShop: "Sim" });
    expect(yes).toMatchObject({ ok: true, account: { tiktokShop: true }, answers: { "Tem TikTok Shop ativo?": "Sim" } });
    expect(validateSignup({ ...base, tiktokShop: "Não" })).toMatchObject({ ok: true, account: { tiktokShop: false } });
    expect(validateSignup(base)).toMatchObject({ ok: true, account: { tiktokShop: null } });
    expect(validateSignup({ ...base, tiktokShop: "talvez" })).toMatchObject({ ok: false, errors: { tiktokShop: expect.any(String) } });
  });
});
