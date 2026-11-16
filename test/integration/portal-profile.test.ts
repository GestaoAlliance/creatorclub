import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { actionQueue } from "@/lib/actions/queue";
import type { PortalContext } from "@/lib/portal/context";
import { portalProfile, requestDataFix, updateMyBirthDate, updateMyInstagram } from "@/lib/portal/profile";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
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
});
