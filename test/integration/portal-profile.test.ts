import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { actionQueue } from "@/lib/actions/queue";
import type { PortalContext } from "@/lib/portal/context";
import { portalProfile, requestDataFix, updateMyBirthDate, updateMyInstagram, updateMyPersonal } from "@/lib/portal/profile";
import { loadActor } from "@/lib/auth/actor";
import { creatorTimeline } from "@/lib/creators/timeline";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();

/** CNPJ válido e novo a cada teste (o banco de teste é compartilhado). */
function newCnpj(): string {
  const d = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const calc = (w: number[]) => { const r = w.reduce((a, x, i) => a + x * d[i]!, 0) % 11; return r < 2 ? 0 : 11 - r; };
  d.push(calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  d.push(calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  return d.join("");
}
afterAll(() => prisma.$disconnect());

describe("Meu cadastro no portal (D-PORTALPROFILE, D-DATAFIX, banco real)", () => {
  it("mostra os dados mascarados, muda o permitido e o pedido de correção vira tarefa da Gestão", async () => {
    const { brand, creator, account } = await seedBrand(prisma);
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { cpf: "12345678901", pixKey: "minha@chave.com", instagram: "antigo" } });
    const ctx = { creatorId: creator.id, brand: { id: brand.id, slug: brand.slug }, viewAs: null, ugcOnly: false } as unknown as PortalContext;
    const view = { ...ctx, viewAs: { userId: "x" } } as PortalContext;

    let p = await portalProfile(prisma, ctx);
    expect(p.cpf).toBe("•••.456.789-••");
    expect(p.pix).toBe("min•••com");
    expect(p.completeness.missing).toEqual(expect.arrayContaining(["endereço", "TikTok", "aniversário"]));

    await expect(updateMyInstagram(prisma, view, "u", "nova")).rejects.toThrow(/Visualização/);
    await expect(updateMyInstagram(prisma, ctx, "u", "com espaço!")).rejects.toThrow(/Instagram/);
    expect(await updateMyInstagram(prisma, ctx, "u", "https://instagram.com/@Nova.Perfil/")).toBe("Nova.Perfil");
    await updateMyBirthDate(prisma, ctx, "u", "1995-03-10");
    await updateMyBirthDate(prisma, ctx, "u", "10/04/1995"); // corrige: não fica só no primeiro
    p = await portalProfile(prisma, ctx);
    expect(p).toMatchObject({ instagram: "Nova.Perfil", birthDate: "1995-04-10" });
    expect(await prisma.auditLog.count({ where: { entityId: account.id, action: { in: ["creator.instagram", "creator.birthdate"] } } })).toBe(3);

    await expect(requestDataFix(prisma, view, "u", "PHONE", "telefone novo")).rejects.toThrow(/Visualização/);
    await expect(requestDataFix(prisma, ctx, "u", "PIX", "x")).rejects.toThrow(/Escolha/);
    await expect(requestDataFix(prisma, ctx, "u", "PHONE", "  a ")).rejects.toThrow(/Conte/);
    await requestDataFix(prisma, ctx, "u", "PHONE", "meu  telefone novo é 11 99999-0000");
    const fix = await prisma.dataFixRequest.findFirstOrThrow({ where: { creatorId: creator.id } });
    expect(fix.message).toBe("meu telefone novo é 11 99999-0000");
    const task = (await actionQueue(prisma, brand.id)).find((t) => t.key === `FIX_DATA:${fix.id}`);
    expect(task).toMatchObject({ kind: "FIX_DATA", owner: "GESTAO" });
    expect(task!.detail).toMatch(/corrigir o telefone: "meu telefone novo/);
    p = await portalProfile(prisma, ctx);
    expect(p.fixes).toEqual([expect.objectContaining({ label: "o telefone", done: false })]);
    const uid = randomUUID();
    await prisma.user.create({ data: { id: uid, email: `${uid}@x.com`, name: "Ana" } });
    await prisma.actionDone.create({ data: { brandId: brand.id, creatorId: creator.id, key: `FIX_DATA:${fix.id}`, doneById: uid } });
    expect((await portalProfile(prisma, ctx)).fixes[0]!.done).toBe(true);
    // A trava do "Feito" aceita todos os tipos da fila (antes recusava aniversário, sem post, acesso e contrato sem assinar).
    for (const k of ["BIRTHDAY", "NO_POST", "ACCESS", "UNSIGNED"]) await prisma.actionDone.create({ data: { brandId: brand.id, creatorId: creator.id, key: `${k}:${creator.id}:x`, doneById: uid } });
    await expectDbError(prisma.actionDone.create({ data: { brandId: brand.id, creatorId: creator.id, key: "PIX:x", doneById: uid } }), /ActionDone_key_format/);

    // Travas do banco: campo e texto válidos; só inserção.
    await expectDbError(prisma.dataFixRequest.create({ data: { brandId: brand.id, creatorId: creator.id, field: "PIX", message: "abc", createdById: "u" } }), /DataFixRequest_valid/);
    await expectDbError(prisma.dataFixRequest.create({ data: { brandId: brand.id, creatorId: creator.id, field: "NAME", message: " a ", createdById: "u" } }), /DataFixRequest_valid/);
    await expectDbError(prisma.dataFixRequest.update({ where: { id: fix.id }, data: { message: "outro" } }), /DataFixRequest é somente inserção/);
    await expectDbError(prisma.dataFixRequest.delete({ where: { id: fix.id } }), /DataFixRequest é somente inserção/);
  });

  it("D-SELFEDIT: ela muda nome, telefone, e-mail (com o login), CPF e CNPJ na hora; a ficha mostra no histórico", async () => {
    const { brand, creator, account } = await seedBrand(prisma);
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email: account.email, name: "C" } });
    await prisma.creatorAccount.update({ where: { id: account.id }, data: { userId } });
    const cnpj = newCnpj();
    const ctx = { creatorId: creator.id, brand: { id: brand.id, slug: brand.slug }, viewAs: null, ugcOnly: false } as unknown as PortalContext;
    const logins: [string, string][] = [];
    const login = async (id: string, email: string) => void logins.push([id, email]);

    await expect(updateMyPersonal(prisma, { ...ctx, viewAs: { userId: "x" } } as PortalContext, userId, "name", "Maria Souza", login)).rejects.toThrow(/Visualização/);
    await expect(updateMyPersonal(prisma, ctx, userId, "cpf", "123.456.789-00", login)).rejects.toThrow(/CPF inválido/);
    await expect(updateMyPersonal(prisma, ctx, userId, "phone", "123", login)).rejects.toThrow(/DDD/);
    await expect(updateMyPersonal(prisma, ctx, userId, "pix", "x", login)).rejects.toThrow(/Escolha/);
    expect(await updateMyPersonal(prisma, ctx, userId, "name", "  Maria   Souza ", login)).toBe("Maria Souza");
    expect(await updateMyPersonal(prisma, ctx, userId, "phone", "+55 11 98888-7777", login)).toBe("(11) 98888-7777");
    expect(await updateMyPersonal(prisma, ctx, userId, "cnpj", `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`, login)).toBe(cnpj);
    const email = `nova-${randomUUID()}@x.com`;
    await updateMyPersonal(prisma, ctx, userId, "email", email.toUpperCase(), login);
    expect(logins).toEqual([[userId, email]]);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({ email });
    expect(await prisma.creatorAccount.findUniqueOrThrow({ where: { id: account.id } })).toMatchObject({ name: "Maria Souza", phone: "(11) 98888-7777", cnpj, email });
    // E-mail de outra pessoa não.
    const other = await prisma.creatorAccount.create({ data: { name: "Outra", email: `outra-${randomUUID()}@x.com` } });
    await expect(updateMyPersonal(prisma, ctx, userId, "email", other.email, login)).rejects.toThrow(/outra pessoa/);

    const gid = randomUUID();
    await prisma.user.create({ data: { id: gid, email: `${gid}@x.com`, name: "G", roleGrants: { create: { role: "GESTAO", brandId: brand.id } } } });
    const tl = await creatorTimeline(prisma, (await loadActor(prisma, gid))!, creator.id);
    expect(tl.filter((e) => e.title.endsWith("pelo portal")).map((e) => e.title)).toEqual(expect.arrayContaining(["Mudou o nome pelo portal", "Mudou o CNPJ pelo portal", "Mudou o e-mail (e o login) pelo portal"]));
    expect(tl.find((e) => e.title === "Mudou o CNPJ pelo portal")!.detail).toBe(`vazio → ${cnpj}`);
  });
});
