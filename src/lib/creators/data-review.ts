import type { PrismaClient } from "@/generated/prisma/client";
import { DATA_REVIEW_LABEL, nameKey, nameProblems } from "@/domain";
import { FAKE_EMAIL_DOMAIN } from "@/lib/import/legacy";

export type DataReviewRow = {
  id: string;
  name: string;
  status: string;
  reasons: string[];
  coupons: string[];
  email: string | null;
  orders: number;
  hasLedger: boolean;
  /** Outras creators com o mesmo nome (ou o mesmo CPF) na marca. */
  twins: { id: string; name: string; why: "mesmo nome" | "mesmo CPF" }[];
};

/** Creators da marca com sinais de cadastro errado ou repetido (só leitura). */
export async function dataReview(prisma: PrismaClient, brandId: string): Promise<DataReviewRow[]> {
  const creators = await prisma.creator.findMany({
    where: { brandId },
    orderBy: { account: { name: "asc" } },
    select: {
      id: true,
      status: true,
      source: true,
      account: { select: { name: true, email: true, cpf: true } },
      couponAssignments: { where: { validTo: null }, select: { coupon: { select: { code: true } } } },
      _count: { select: { attributions: true, ledgerEntries: true } },
    },
  });
  const byKey = new Map<string, typeof creators>();
  const byCpf = new Map<string, typeof creators>();
  for (const c of creators) {
    const k = nameKey(c.account.name);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), c]);
    const cpf = (c.account.cpf ?? "").replace(/\D/g, "");
    if (cpf.length === 11) byCpf.set(cpf, [...(byCpf.get(cpf) ?? []), c]);
  }
  const rows: DataReviewRow[] = [];
  for (const c of creators) {
    const reasons: string[] = nameProblems(c.account.name).map((p) => DATA_REVIEW_LABEL[p]);
    const cpf = (c.account.cpf ?? "").replace(/\D/g, "");
    const twins = [
      ...(byKey.get(nameKey(c.account.name)) ?? []).map((o) => ({ o, why: "mesmo nome" as const })),
      ...(cpf.length === 11 ? (byCpf.get(cpf) ?? []) : []).map((o) => ({ o, why: "mesmo CPF" as const })),
    ].filter((t, i, all) => t.o.id !== c.id && all.findIndex((x) => x.o.id === t.o.id) === i);
    if (twins.length) reasons.push(DATA_REVIEW_LABEL.repetida);
    if (c.source === "central") reasons.push(DATA_REVIEW_LABEL.planilha);
    if (!reasons.length) continue;
    rows.push({
      id: c.id,
      name: c.account.name,
      status: c.status,
      reasons,
      coupons: c.couponAssignments.map((a) => a.coupon.code),
      email: c.account.email.endsWith(FAKE_EMAIL_DOMAIN) ? null : c.account.email,
      orders: c._count.attributions,
      hasLedger: c._count.ledgerEntries > 0,
      twins: twins.map((t) => ({ id: t.o.id, name: t.o.account.name, why: t.why })),
    });
  }
  return rows;
}
