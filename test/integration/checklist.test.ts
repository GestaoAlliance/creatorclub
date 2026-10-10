import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { updateChecklist } from "@/lib/creators/contract";
import { creatorProfile } from "@/lib/creators/profile";
import { staffHome } from "@/lib/staff/home";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "GESTAO" | "PAGAMENTO" | "ENVIO", brandId: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

const empty = { start: null, end: null, contractSigned: null, couponRegistered: null, followsOnInstagram: null, inGroup: null, tagged: null, note: null };
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe("contrato e checklist (D-CHECKLIST, banco real)", () => {
  it("fim vazio = início + 6 meses (UGC 3); grava o checklist e a auditoria", async () => {
    const a = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", a.brand.id);
    expect(await updateChecklist(prisma, gestao, a.creator.id, { ...empty, start: "2026-10-05", contractSigned: true, inGroup: false, note: "  @ não   encontrado " })).toEqual({ end: "2027-04-05" });
    const p = await creatorProfile(prisma, gestao, a.creator.id);
    expect(p.contract).toMatchObject({ start: "2026-10-05", end: "2027-04-05", contractSigned: true, inGroup: false, tagged: null, note: "@ não encontrado" });
    expect(await prisma.auditLog.count({ where: { action: "creator.checklist", entityId: a.creator.id } })).toBe(1);

    await prisma.creator.update({ where: { id: a.creator.id }, data: { categories: ["UGC"] } });
    expect(await updateChecklist(prisma, gestao, a.creator.id, { ...empty, start: "2026-11-30" })).toEqual({ end: "2027-02-28" });
    expect(await updateChecklist(prisma, gestao, a.creator.id, { ...empty, start: "2026-10-01", end: "2026-12-31" })).toEqual({ end: "2026-12-31" });
  });

  it("recusa: sem permissão, data inválida, fim antes do início; trava do banco", async () => {
    const a = await seedBrand(prisma);
    await expect(updateChecklist(prisma, await userWith("PAGAMENTO", a.brand.id), a.creator.id, empty)).rejects.toThrow(/permissão/);
    const gestao = await userWith("GESTAO", a.brand.id);
    await expect(updateChecklist(prisma, gestao, a.creator.id, { ...empty, start: "05/10/2026" })).rejects.toThrow(/Data inválida/);
    await expect(updateChecklist(prisma, gestao, a.creator.id, { ...empty, start: "2026-10-05", end: "2026-10-05" })).rejects.toThrow(/depois do início/);
    await expectDbError(
      prisma.creator.update({ where: { id: a.creator.id }, data: { contractStart: new Date("2026-10-05"), contractEnd: new Date("2026-10-01") } }),
      /Creator_contract_period/,
    );
  });

  it("Início da equipe conta contratos vencendo (30 dias) e vencidos; desligada não conta", async () => {
    const a = await seedBrand(prisma);
    const gestao = await userWith("GESTAO", a.brand.id);
    const mk = async (end: string, status: "ACTIVE" | "DEACTIVATED" = "ACTIVE") => {
      const acc = await prisma.creatorAccount.create({ data: { name: "X", email: `${randomUUID()}@x.com` } });
      await prisma.creator.create({ data: { brandId: a.brand.id, accountId: acc.id, categories: [], status, contractStart: new Date("2026-01-01"), contractEnd: new Date(end) } });
    };
    await mk(day(10));
    await mk(day(29));
    await mk(day(60));
    await mk(day(-3));
    await mk(day(-3), "DEACTIVATED");
    const h = await staffHome(prisma, gestao);
    expect(h.creators).toMatchObject({ contractsExpiring: 2, contractsExpired: 1 });
  });
});
