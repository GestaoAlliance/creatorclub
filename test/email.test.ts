import { describe, expect, it } from "vitest";
import { creatorInviteEmail, escapeHtml, staffInviteEmail } from "@/domain";

const expiresAt = new Date("2026-10-17T15:00:00Z");

describe("e-mails do sistema (D-EMAIL)", () => {
  it("convite da creator: assunto com a marca, primeiro nome, link no botão e no texto, validade", () => {
    const e = creatorInviteEmail({ name: "  Maria  Exemplo ", brandName: "Botanika", link: "https://app.exemplo/convite/abc", expiresAt });
    expect(e.subject).toBe("Seu acesso ao Creator Club Botanika");
    expect(e.html).toContain("Oi, Maria!");
    expect(e.html).toContain('href="https://app.exemplo/convite/abc"');
    expect(e.text).toContain("https://app.exemplo/convite/abc");
    expect(e.text).toContain("vale até 17/10/2026");
  });

  it("nada do banco entra no HTML sem escapar", () => {
    expect(escapeHtml(`<b>"a"&'b'</b>`)).toBe("&lt;b&gt;&quot;a&quot;&amp;&#39;b&#39;&lt;/b&gt;");
    const e = creatorInviteEmail({ name: "<script>x</script>", brandName: "A&B", link: 'https://x/"><img', expiresAt });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("Creator Club A&amp;B");
    expect(e.html).not.toContain('"><img');
  });

  it("convite da equipe: papel e marca; super admin sem marca", () => {
    const e = staffInviteEmail({ name: "João Exemplo", roleLabel: "Gestão", brandName: "Botanika", link: "https://x/c/1", expiresAt });
    expect(e.subject).toBe("Convite para a equipe do Creator Club");
    expect(e.text).toContain("como Gestão da Botanika.");
    expect(staffInviteEmail({ name: "A", roleLabel: "Super admin", brandName: null, link: "https://x", expiresAt }).text).toContain("como Super admin.");
  });
});

describe("e-mail de nova senha (M4.4b, D-ACCESS)", () => {
  it("assunto com a marca, botão com o link e aviso de 1 hora; nome escapado", async () => {
    const { passwordResetEmail } = await import("@/domain");
    const e = passwordResetEmail({ name: "Ana <b>Silva</b>", brandName: "Botanika", link: "https://x.test/auth/confirm?t=1" });
    expect(e.subject).toBe("Nova senha do Creator Club Botanika");
    expect(e.html).toContain('href="https://x.test/auth/confirm?t=1"');
    expect(e.html).not.toContain("<b>Silva");
    expect(e.text).toContain("vale por 1 hora");
  });
});
