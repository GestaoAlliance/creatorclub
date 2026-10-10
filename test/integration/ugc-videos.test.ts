import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { loadActor } from "@/lib/auth/actor";
import { creatorProfile, listCreators } from "@/lib/creators/profile";
import { addUgcVideo, removeUgcVideo, setUgcVideoGoal } from "@/lib/creators/ugc";
import { expectDbError, seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());

async function userWith(role: "SUPER_ADMIN" | "GESTAO" | "PAGAMENTO", brandId: string | null) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email: `${id}@x.com`, name: role, roleGrants: { create: { role, brandId } } } });
  return (await loadActor(prisma, id))!;
}

/** UGC com contrato de 01/09 a 01/12/2026. */
async function ugc() {
  const a = await seedBrand(prisma);
  await prisma.creator.update({
    where: { id: a.creator.id },
    data: { categories: ["UGC"], contractStart: new Date("2026-09-01T00:00:00Z"), contractEnd: new Date("2026-12-01T00:00:00Z") },
  });
  return a;
}

const now = new Date("2026-10-10T15:00:00Z");

describe("vídeos da UGC no ciclo do contrato (D-UGCVIDEOS, banco real)", () => {
  it("registra, conta no ciclo, retira e muda a meta; aparece na ficha e na lista", async () => {
    const a = await ugc();
    const g = await userWith("GESTAO", a.brand.id);
    const add = (url: string, day: string, product = "") => addUgcVideo(prisma, g, { creatorId: a.creator.id, url, day, product }, now);

    const v1 = await add("https://drive.google.com/file/d/1", "2026-09-10", " Ômega  3 ");
    await add("https://drive.google.com/file/d/2", "2026-10-10");
    await add("https://drive.google.com/file/d/0", "2026-08-20"); // antes do ciclo: não conta
    await expect(add("https://drive.google.com/file/d/1", "2026-09-11")).rejects.toThrow(/já está registrado/);
    await expect(add("https://x.com/3", "2026-10-11")).rejects.toThrow(/futuro/);
    await expect(add("drive.google.com/x", "2026-10-01")).rejects.toThrow(/link/);
    await expect(add("https://x.com/4", "2026-13-01")).rejects.toThrow(/Data inválida/);

    expect(await prisma.ugcVideo.findUniqueOrThrow({ where: { id: v1 } })).toMatchObject({ product: "Ômega 3", createdById: g.userId });
    let p = await creatorProfile(prisma, g, a.creator.id);
    expect(p.ugcCycle).toMatchObject({ count: 2, outside: 1, goal: 9, start: "2026-09-01", end: "2026-12-01" });
    expect(p.ugcVideos.map((v) => v.day)).toEqual(["2026-10-10", "2026-09-10", "2026-08-20"]);

    await setUgcVideoGoal(prisma, g, a.creator.id, 2);
    await expect(setUgcVideoGoal(prisma, g, a.creator.id, 0)).rejects.toThrow(/de 1 a 100/);
    const row = (await listCreators(prisma, g, a.brand.id)).find((r) => r.id === a.creator.id)!;
    expect(row.ugcCycle).toMatchObject({ count: 2, goal: 2, status: "DONE" });

    await removeUgcVideo(prisma, g, v1);
    await removeUgcVideo(prisma, g, v1); // de novo: nada muda
    p = await creatorProfile(prisma, g, a.creator.id);
    expect(p.ugcCycle).toMatchObject({ count: 1, status: "OPEN" });
    expect(p.ugcVideos).toHaveLength(2);
    // Retirado, o mesmo link pode ser registrado de novo.
    await add("https://drive.google.com/file/d/1", "2026-09-12");
    expect(await prisma.ugcVideo.count({ where: { creatorId: a.creator.id } })).toBe(4);
    expect(await prisma.auditLog.count({ where: { brandId: a.brand.id, action: { startsWith: "ugc." } } })).toBe(6);
  });

  it("só quem edita creators, só UGC, desligada não recebe vídeo; não UGC fica fora", async () => {
    const a = await ugc();
    const input = { creatorId: a.creator.id, url: "https://x.com/v", day: "2026-10-01", product: "" };
    await expect(addUgcVideo(prisma, await userWith("PAGAMENTO", a.brand.id), input, now)).rejects.toThrow(/Sem permissão/);
    await expect(setUgcVideoGoal(prisma, await userWith("GESTAO", (await seedBrand(prisma)).brand.id), a.creator.id, 5)).rejects.toThrow(/Sem permissão/);
    const sa = await userWith("SUPER_ADMIN", null);
    await prisma.creator.update({ where: { id: a.creator.id }, data: { status: "DEACTIVATED" } });
    await expect(addUgcVideo(prisma, sa, input, now)).rejects.toThrow(/desligada/);

    const b = await seedBrand(prisma);
    await expect(addUgcVideo(prisma, sa, { ...input, creatorId: b.creator.id }, now)).rejects.toThrow(/tipo UGC/);
    expect((await creatorProfile(prisma, sa, b.creator.id)).ugcCycle).toBeNull();
  });

  it("travas do banco pelo nome", async () => {
    const a = await ugc();
    const base = { brandId: a.brand.id, creatorId: a.creator.id, deliveredOn: new Date("2026-10-01T00:00:00Z"), createdById: "x" };
    await expectDbError(prisma.creator.update({ where: { id: a.creator.id }, data: { ugcVideoGoal: 0 } }), /Creator_ugc_video_goal/);
    await expectDbError(prisma.ugcVideo.create({ data: { ...base, url: "ftp://x" } }), /UgcVideo_values/);
    await expectDbError(prisma.ugcVideo.create({ data: { ...base, url: "https://x.com/a", removedAt: new Date() } }), /UgcVideo_values/);
    const v = await prisma.ugcVideo.create({ data: { ...base, url: "https://x.com/a" } });
    await expectDbError(prisma.ugcVideo.create({ data: { ...base, url: "https://x.com/a" } }), /UgcVideo_url_once/);
    await expectDbError(prisma.ugcVideo.update({ where: { id: v.id }, data: { url: "https://x.com/b" } }), /UgcVideo_only_remove/);
    await expectDbError(prisma.ugcVideo.delete({ where: { id: v.id } }), /UgcVideo_only_remove/);
    await prisma.ugcVideo.update({ where: { id: v.id }, data: { removedAt: new Date(), removedById: "x" } });
    await expectDbError(prisma.ugcVideo.update({ where: { id: v.id }, data: { removedById: "y" } }), /UgcVideo_only_remove/);
  });
});
