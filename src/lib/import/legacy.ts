import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeCouponCode, parseDecimalToCents } from "@/domain";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/permissions";
import { parseCsv } from "./csv";

/**
 * Importação das creators do app antigo (`creator-hub`, tabela Creator exportada em CSV), D-IMPORT.
 * Só as linhas da marca escolhida (pelo `legacyId` da marca). Cria conta, participação, cupom (sem tipo), dona e
 * taxa "a confirmar" (D-RATEIMPORT), preservando os IDs antigos. Rodar de novo **não sobrescreve** nada: só lista
 * as diferenças entre o arquivo e o que está no banco (para a conferência do corte, E9).
 */

export const FAKE_EMAIL_DOMAIN = "@import.creatorclub";

export type ImportReport = {
  rowsInFile: number;
  rowsForBrand: number;
  created: { accounts: number; creators: number; coupons: number; assignments: number; policies: number };
  unchanged: number;
  differences: Array<{ legacyId: string; name: string; field: string; file: string; current: string }>;
  fakeEmails: Array<{ legacyId: string; name: string }>;
  errors: Array<{ legacyId: string; error: string }>;
};

/** "0.15" → 1500 pontos-base, sem Float. */
export function rateToBps(rate: string): number {
  return parseDecimalToCents(rate) * 100;
}

const s = (v: string | undefined) => (v ?? "").trim();
const orNull = (v: string | undefined) => s(v) || null;

function legacyDate(row: Record<string, string>): Date {
  const raw = s(row.approvedAt) || s(row.createdAt);
  const d = new Date(raw.includes("T") || raw.endsWith("Z") ? raw : `${raw.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`data inválida: "${raw}"`);
  return d;
}

export async function importLegacyCreators(
  prisma: PrismaClient,
  actor: Actor | null,
  input: { brandId: string; csv: string },
): Promise<ImportReport> {
  if (!actor || !can(actor.grants, "integrations.manage", input.brandId)) throw new Error("Sem permissão.");
  const brand = await prisma.brand.findUnique({ where: { id: input.brandId } });
  if (!brand?.legacyId) throw new Error("Marca sem ID do app antigo.");

  const rows = parseCsv(input.csv);
  if (rows.length && !("couponCode" in rows[0]! && "commissionRate" in rows[0]! && "brandId" in rows[0]!)) {
    throw new Error("Arquivo não parece a exportação da tabela Creator do app antigo.");
  }
  const mine = rows.filter((r) => s(r.brandId) === brand.legacyId);
  const report: ImportReport = {
    rowsInFile: rows.length,
    rowsForBrand: mine.length,
    created: { accounts: 0, creators: 0, coupons: 0, assignments: 0, policies: 0 },
    unchanged: 0,
    differences: [],
    fakeEmails: [],
    errors: [],
  };

  for (const row of mine) {
    const legacyId = s(row.id);
    const name = s(row.name);
    try {
      const email = s(row.email).toLowerCase();
      if (!legacyId || !name || !email) throw new Error("linha sem id, nome ou e-mail");
      const accountLegacyId = s(row.accountId) || legacyId;
      const code = s(row.couponCode) ? normalizeCouponCode(row.couponCode!) : null;
      const rateBps = rateToBps(s(row.commissionRate));
      const discountBps = s(row.couponDiscountRate) ? rateToBps(s(row.couponDiscountRate)) : null;
      const since = legacyDate(row);
      if (email.endsWith(FAKE_EMAIL_DOMAIN)) report.fakeEmails.push({ legacyId, name });

      const outcome = await prisma.$transaction(async (tx) => {
        const created = { accounts: 0, creators: 0, coupons: 0, assignments: 0, policies: 0 };
        const diffs: ImportReport["differences"] = [];
        let account = await tx.creatorAccount.findUnique({ where: { legacyId: accountLegacyId } });
        if (!account) {
          const sameEmail = await tx.creatorAccount.findUnique({ where: { email } });
          if (sameEmail) throw new Error(`e-mail já usado por outra conta (${sameEmail.name})`);
          account = await tx.creatorAccount.create({
            data: { legacyId: accountLegacyId, name, email, phone: orNull(row.phone), cpf: orNull(row.cpf), pixKey: orNull(row.pixKey) },
          });
          created.accounts++;
        } else {
          const compare: Array<[string, string, string | null]> = [
            ["nome", name, account.name],
            ["e-mail", email, account.email],
            ["telefone", s(row.phone), account.phone],
            ["CPF", s(row.cpf), account.cpf],
            ["Pix", s(row.pixKey), account.pixKey],
          ];
          for (const [field, file, current] of compare) if (file !== (current ?? "")) diffs.push({ legacyId, name, field, file, current: current ?? "" });
        }

        let creator = await tx.creator.findUnique({ where: { brandId_legacyId: { brandId: brand.id, legacyId } } });
        if (!creator) {
          creator = await tx.creator.create({
            data: {
              brandId: brand.id,
              accountId: account.id,
              legacyId,
              source: "legacy_import",
              status: s(row.status) === "APPROVED" ? "ACTIVE" : "INACTIVE",
              activatedAt: since,
              categories: [],
            },
          });
          created.creators++;
        }

        const policy = await tx.commissionPolicy.findFirst({ where: { creatorId: creator.id }, orderBy: { validFrom: "desc" } });
        if (!policy) {
          await tx.commissionPolicy.create({ data: { brandId: brand.id, creatorId: creator.id, rateBps, validFrom: since } });
          created.policies++;
        } else if (policy.rateBps !== rateBps) {
          diffs.push({ legacyId, name, field: "taxa", file: `${rateBps / 100}%`, current: `${policy.rateBps / 100}%` });
        }

        if (code) {
          let coupon = await tx.coupon.findUnique({ where: { brandId_code: { brandId: brand.id, code } } });
          if (!coupon) {
            coupon = await tx.coupon.create({
              data: { brandId: brand.id, code, discountBps, shopifyId: orNull(row.shopifyDiscountId), legacyId },
            });
            created.coupons++;
          }
          const owner = await tx.couponAssignment.findFirst({ where: { couponId: coupon.id, validTo: null } });
          if (!owner) {
            await tx.couponAssignment.create({ data: { brandId: brand.id, couponId: coupon.id, creatorId: creator.id, validFrom: since } });
            created.assignments++;
          } else if (owner.creatorId !== creator.id) {
            diffs.push({ legacyId, name, field: "dona do cupom", file: code, current: "outra creator" });
          }
        }
        return { created, diffs };
      });

      for (const k of Object.keys(report.created) as Array<keyof ImportReport["created"]>) report.created[k] += outcome.created[k];
      report.differences.push(...outcome.diffs);
      if (Object.values(outcome.created).every((n) => n === 0) && outcome.diffs.length === 0) report.unchanged++;
    } catch (error) {
      report.errors.push({ legacyId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  await prisma.auditLog.create({
    data: {
      brandId: brand.id,
      actorType: "USER",
      actorId: actor.userId,
      action: "import.legacy",
      entity: "Brand",
      entityId: brand.id,
      after: {
        rowsForBrand: report.rowsForBrand,
        created: report.created,
        unchanged: report.unchanged,
        differences: report.differences.length,
        errors: report.errors.length,
      },
    },
  });
  return report;
}
