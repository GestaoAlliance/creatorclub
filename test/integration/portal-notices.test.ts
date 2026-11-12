import { afterAll, describe, expect, it } from "vitest";
import { ackNotice, markAllRead, unreadCount } from "@/lib/notifications/notify";
import type { PortalContext } from "@/lib/portal/context";
import { portalNoticesBoard } from "@/lib/portal/notices-board";
import { seedBrand, testClient } from "./fixtures";

const prisma = testClient();
afterAll(() => prisma.$disconnect());
const T = (s: string) => new Date(s);

describe("Avisos no portal (D-PORTALNOTICES, banco real)", () => {
  it("o que pede ação, recado da equipe fixado até Entendi, resumo do mês e lidos", async () => {
    const { brand, creator } = await seedBrand(prisma);
    const other = await seedBrand(prisma);
    const ctx = { creatorId: creator.id, brand: { id: brand.id, slug: brand.slug, name: brand.name }, viewAs: null, ugcOnly: true } as unknown as PortalContext;
    const note = (kind: string, key: string, createdAt: string) => ({ brandId: brand.id, creatorId: creator.id, kind, dedupeKey: key, title: `t ${key}`, body: "b", createdAt: T(createdAt) });
    await prisma.notification.createMany({
      data: [
        note("COMMISSION_RELEASED", "c1", "2026-11-01T12:00:00Z"),
        note("WITHDRAWAL_PAID", "w1", "2026-11-10T12:00:00Z"),
        note("TEAM_MESSAGE", "team-message:1", "2026-11-11T12:00:00Z"),
        note("SHIPPED", "s-old", "2026-10-01T12:00:00Z"),
      ],
    });
    await prisma.kitGrant.create({ data: { brandId: brand.id, creatorId: creator.id, kind: "MONTHLY", month: "2026-10", status: "PENDING", products: 2, salesCents: 100_000 } });

    const b = await portalNoticesBoard(prisma, ctx, T("2026-11-12T15:00:00Z"));
    expect(b.pinned.map((n) => n.title)).toEqual(["t team-message:1"]);
    expect(b.actions.map((a) => a.id)).toEqual(["kit"]); // só UGC: sem saque
    expect(b.actions[0]!.href).toBe(`/portal/${brand.slug}/envios`);
    expect(b.list.map((n) => n.title)).toEqual(["t w1", "t c1", "t s-old"]);
    expect(b.newCount).toBe(4);
    expect(b.summary).toBe("1 comissão liberada, 1 saque pago e 1 recado da equipe");

    // Abrir marca tudo como lido, menos o recado da equipe; "Entendi" marca só ele (e só dela).
    await markAllRead(prisma, ctx, T("2026-11-12T15:00:00Z"));
    expect(await unreadCount(prisma, ctx)).toBe(1);
    const team = (await prisma.notification.findFirstOrThrow({ where: { creatorId: creator.id, kind: "TEAM_MESSAGE" } })).id;
    expect(await ackNotice(prisma, { ...ctx, viewAs: { userId: "x" } } as unknown as PortalContext, team)).toBe(0);
    expect(await ackNotice(prisma, { ...ctx, creatorId: other.creator.id, brand: { id: other.brand.id } } as unknown as PortalContext, team)).toBe(0);
    expect(await ackNotice(prisma, ctx, team)).toBe(1);
    expect(await unreadCount(prisma, ctx)).toBe(0);
    expect((await portalNoticesBoard(prisma, ctx, T("2026-11-12T16:00:00Z"))).pinned).toEqual([]);
  });
});
