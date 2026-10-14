import { describe, expect, it } from "vitest";
import { instagramUrl, linkifyText, whatsappChatUrl } from "@/domain";

describe("links das redes e do WhatsApp", () => {
  it("Instagram a partir do que a pessoa escreveu", () => {
    expect(instagramUrl("@paulafcastro")).toBe("https://instagram.com/paulafcastro");
    expect(instagramUrl("pedro.lage_")).toBe("https://instagram.com/pedro.lage_");
    expect(instagramUrl("https://www.instagram.com/oikeylla/?hl=pt")).toBe("https://instagram.com/oikeylla");
    expect(instagramUrl("não tenho")).toBeNull();
    expect(instagramUrl("")).toBeNull();
  });

  it("WhatsApp com DDI 55 quando falta", () => {
    expect(whatsappChatUrl("31992763023")).toBe("https://wa.me/5531992763023");
    expect(whatsappChatUrl("(31) 97570-8679")).toBe("https://wa.me/5531975708679");
    expect(whatsappChatUrl("+55 11 3333-4444")).toBe("https://wa.me/551133334444");
    expect(whatsappChatUrl("123")).toBeNull();
  });

  it("links nas respostas viram clicáveis, sem pegar a pontuação do fim", () => {
    expect(linkifyText("Meu TikTok: https://tiktok.com/@ana. Valeu")).toEqual([
      { text: "Meu TikTok: " },
      { text: "https://tiktok.com/@ana", href: "https://tiktok.com/@ana" },
      { text: ". Valeu" },
    ]);
    expect(linkifyText("canal www.youtube.com/ana")).toEqual([{ text: "canal " }, { text: "www.youtube.com/ana", href: "https://www.youtube.com/ana" }]);
    expect(linkifyText("sem link")).toEqual([{ text: "sem link" }]);
  });
});
