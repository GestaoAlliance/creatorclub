import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { actorFromBearer, checkAuthorize, issueCode, registerClient, revokeAll, tokenGrant } from "@/lib/mcp/oauth";
import { handleRpc } from "@/lib/mcp/server";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

const CB = "https://claude.ai/api/mcp/auth_callback";
const verifier = "v".repeat(20) + randomUUID();
const challenge = createHash("sha256").update(verifier).digest("base64url");

async function user(role: "GESTAO" | "SUPER_ADMIN", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

describe("conector do Creator Club no Claude (M3.4b, D-MCP, banco real)", () => {
  it("cadastro, permitir, chave com PKCE, perguntas só da marca dela, renovação e desconectar", async () => {
    const a = await seedBrand(prisma);
    const b = await seedBrand(prisma);
    const ana = await user("GESTAO", a.brand.id);

    await expect(registerClient(prisma, { redirect_uris: ["https://malicioso.com/cb"] })).rejects.toThrow(/não permitido/);
    const client = await registerClient(prisma, { redirect_uris: [CB], client_name: "Claude" });
    const q = { response_type: "code", client_id: client.client_id, redirect_uri: CB, code_challenge: challenge, code_challenge_method: "S256", state: "xyz" };
    await expect(checkAuthorize(prisma, { ...q, redirect_uri: "https://claude.ai/outro" })).rejects.toThrow(/não confere/);
    await expect(checkAuthorize(prisma, { ...q, code_challenge_method: "plain" })).rejects.toThrow(/PKCE/);
    const req = await checkAuthorize(prisma, q);
    expect(req).toMatchObject({ clientName: "Claude", state: "xyz" });

    // Creator (sem papel na equipe) não conecta.
    await expect(issueCode(prisma, { userId: "c", grants: [], creatorIds: { x: "y" } }, req)).rejects.toThrow(/equipe/);
    const code = await issueCode(prisma, ana, req);
    await expect(tokenGrant(prisma, { grant_type: "authorization_code", code, code_verifier: "errado".repeat(8), client_id: client.client_id })).rejects.toThrow(/PKCE/);
    const t = await tokenGrant(prisma, { grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id, redirect_uri: CB });
    expect(t).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
    await expect(tokenGrant(prisma, { grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id })).rejects.toThrow(/inválido|usado/);

    const who = await actorFromBearer(prisma, `Bearer ${t.access_token}`);
    expect(who?.userId).toBe(ana.userId);
    expect(await actorFromBearer(prisma, "Bearer qualquer")).toBeNull();
    expect(await actorFromBearer(prisma, `Bearer ${t.refresh_token}`)).toBeNull(); // renovação não abre o conector

    // MCP: initialize, lista de ferramentas, pergunta na marca dela; outra marca negada.
    const init = (await handleRpc(prisma, who!, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })) as { result: { protocolVersion: string } };
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(await handleRpc(prisma, who!, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    const list = (await handleRpc(prisma, who!, { jsonrpc: "2.0", id: 2, method: "tools/list" })) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((x) => x.name)).toContain("resumo_vendas");
    const call = (name: string, args: Record<string, unknown>) =>
      handleRpc(prisma, who!, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } }) as Promise<{ result: { content: { text: string }[]; isError?: boolean } }>;
    const mine = await call("resumo_vendas", { periodo: "30" });
    expect(mine.result.isError).toBeUndefined();
    expect(JSON.parse(mine.result.content[0]!.text)).toMatchObject({ marca: a.brand.name, vendas_com_cupom: expect.any(Object) });
    const other = await call("resumo_vendas", { marca: b.brand.name });
    expect(other.result).toMatchObject({ isError: true });
    expect(other.result.content[0]!.text).toMatch(/não encontrada entre as suas/);
    const ficha = await call("ficha_creator", { creator_id: a.creator.id });
    const fichaText = ficha.result.content[0]!.text;
    expect(JSON.parse(fichaText)).toMatchObject({ marca: a.brand.name });
    expect(fichaText).not.toMatch(/cpf|cnpj|pix|email|telefone|phone/i);
    expect((await call("ficha_creator", { creator_id: b.creator.id })).result.isError).toBe(true);

    // Renovação troca a chave; a antiga não vale mais.
    const t2 = await tokenGrant(prisma, { grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: client.client_id });
    await expect(tokenGrant(prisma, { grant_type: "refresh_token", refresh_token: t.refresh_token })).rejects.toThrow(/inválida|usada/);
    expect((await actorFromBearer(prisma, `Bearer ${t2.access_token}`))?.userId).toBe(ana.userId);

    // Desconectar cancela tudo; pessoa removida da equipe também perde o acesso.
    expect(await revokeAll(prisma, ana.userId)).toBeGreaterThanOrEqual(2);
    expect(await actorFromBearer(prisma, `Bearer ${t2.access_token}`)).toBeNull();
    const sa = await user("SUPER_ADMIN", null);
    const c2 = await issueCode(prisma, sa, req);
    const t3 = await tokenGrant(prisma, { grant_type: "authorization_code", code: c2, code_verifier: verifier, client_id: client.client_id });
    await prisma.user.update({ where: { id: sa.userId }, data: { disabledAt: new Date() } });
    expect(await actorFromBearer(prisma, `Bearer ${t3.access_token}`)).toBeNull();
  });
});
