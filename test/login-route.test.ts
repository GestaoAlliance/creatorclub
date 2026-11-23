import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const signInWithPassword = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({ auth: { signInWithPassword } }) }));
const { POST } = await import("@/app/entrar/login/route");

const post = (fields: Record<string, string>) => {
  const body = new URLSearchParams(fields);
  return POST(new NextRequest("https://creatorclub.app.br/entrar/login", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } }));
};

describe("login por formulário comum (D-SAVEPASSWORD)", () => {
  it("deu certo: nova página (303) no destino pedido, que o navegador usa para oferecer salvar a senha", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: null });
    const r = await post({ email: " Fatima@Teste.com ", password: "segredo123", next: "/admin/envios" });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("https://creatorclub.app.br/admin/envios");
    expect(signInWithPassword).toHaveBeenLastCalledWith({ email: "fatima@teste.com", password: "segredo123" });
  });

  it("senha errada: volta para /entrar com a mensagem única e o e-mail preenchido", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials", status: 400, code: "invalid_credentials" } });
    const r = await post({ email: "ana@teste.com", password: "errada", next: "/portal/botanika" });
    const to = new URL(r.headers.get("location")!);
    expect(r.status).toBe(303);
    expect(to.pathname).toBe("/entrar");
    expect(to.searchParams.get("erro")).toBe("senha");
    expect(to.searchParams.get("email")).toBe("ana@teste.com");
    expect(to.searchParams.get("next")).toBe("/portal/botanika");
  });

  it("nunca manda para outro site depois de entrar", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: null });
    const r = await post({ email: "ana@teste.com", password: "segredo123", next: "//golpe.com/x" });
    expect(new URL(r.headers.get("location")!).host).toBe("creatorclub.app.br");
  });

  it("sem e-mail ou senha: avisa sem chamar o Supabase", async () => {
    signInWithPassword.mockClear();
    const r = await post({ email: "", password: "" });
    expect(new URL(r.headers.get("location")!).searchParams.get("erro")).toBe("vazio");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("serviço de login fora do ar (cota estourada ou sem resposta): avisa que não é a senha (D-AUTHDOWN)", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: "exceed_egress_quota", status: 402 } });
    const quota = new URL((await post({ email: "ana@teste.com", password: "certa12345" })).headers.get("location")!);
    expect(quota.searchParams.get("erro")).toBe("fora");
    signInWithPassword.mockRejectedValueOnce(new TypeError("fetch failed"));
    const net = new URL((await post({ email: "ana@teste.com", password: "certa12345" })).headers.get("location")!);
    expect(net.searchParams.get("erro")).toBe("fora");
  });
});
