import type { PrismaClient } from "@/generated/prisma/client";

// Desfazer o que a Central mandou ao sistema (D-SHEETREADONLY): a primeira ligação mandou a planilha inteira como
// "editada agora" e trocou dados mais novos do sistema. Volta, campo a campo, o valor da cópia de segurança, só onde a
// última alteração do campo ainda é a da planilha (o que a equipe mudou depois fica).

/** Campo da auditoria ("sheet.apply" → fields) → colunas de cada tabela. */
const UNDO: Record<string, { entity: "CreatorAccount" | "Creator"; columns: string[] }> = {
  name: { entity: "CreatorAccount", columns: ["name"] },
  phone: { entity: "CreatorAccount", columns: ["phone"] },
  cpf: { entity: "CreatorAccount", columns: ["cpf"] },
  cnpj: { entity: "CreatorAccount", columns: ["cnpj"] },
  instagram: { entity: "CreatorAccount", columns: ["instagram"] },
  pixKey: { entity: "CreatorAccount", columns: ["pixKey"] },
  email: { entity: "CreatorAccount", columns: ["email"] },
  address: { entity: "CreatorAccount", columns: ["addrStreet", "addrNumber", "addrComplement", "addrDistrict", "addrZip"] },
  cityState: { entity: "CreatorAccount", columns: ["addrCity", "addrState"] },
  contractStart: { entity: "Creator", columns: ["contractStart"] },
  contractEnd: { entity: "Creator", columns: ["contractEnd"] },
  couponRegistered: { entity: "Creator", columns: ["couponRegistered"] },
  followsOnInstagram: { entity: "Creator", columns: ["followsOnInstagram"] },
  inGroup: { entity: "Creator", columns: ["inGroup"] },
  contractSigned: { entity: "Creator", columns: ["contractSigned"] },
  tagged: { entity: "Creator", columns: ["tagged"] },
  ugcFolderUrl: { entity: "Creator", columns: ["ugcFolderUrl"] },
  ugcOrder: { entity: "Creator", columns: ["ugcOrder"] },
  ugcVideoStatus: { entity: "Creator", columns: ["ugcVideoStatus"] },
  notes: { entity: "Creator", columns: ["notes"] },
};

const DATES = new Set(["contractStart", "contractEnd"]);

/** Linha da cópia de segurança: valores antigos da creator e da conta (só as colunas acima). */
export type UndoSnapshot = { creatorId: string; creator: Record<string, unknown>; account: Record<string, unknown> };

export type UndoReport = { creators: number; fields: number; keptNewer: number; keptSheet: number; notInBackup: number; createdBySheet: number; failed: number };

/**
 * Volta os campos que a planilha mudou desde `since`. Com `apply` falso só conta (nada muda). Com `sheetEditedAt`
 * (hora real da última edição da planilha), fica o valor da planilha onde o sistema não mudou depois dela.
 */
export async function undoSheetChanges(
  prisma: PrismaClient,
  slug: string,
  since: Date,
  snapshot: UndoSnapshot[],
  apply: boolean,
  sheetEditedAt?: Date,
): Promise<UndoReport> {
  const brand = await prisma.brand.findUnique({ where: { slug }, select: { id: true } });
  if (!brand) throw new Error("Marca não encontrada.");
  const logs = await prisma.auditLog.findMany({
    where: { brandId: brand.id, actorId: "sheet:central", createdAt: { gte: since }, action: { in: ["sheet.apply", "sheet.creator"] } },
    select: { action: true, entityId: true, after: true },
  });
  const old = new Map(snapshot.map((s) => [s.creatorId, s]));
  const touched = new Map<string, Set<string>>();
  let createdBySheet = 0;
  for (const l of logs) {
    if (l.action === "sheet.creator") {
      createdBySheet++;
      continue;
    }
    const fields = ((l.after ?? {}) as { fields?: string[] }).fields ?? [];
    const set = touched.get(l.entityId) ?? new Set<string>();
    for (const f of fields) if (UNDO[f]) set.add(f);
    touched.set(l.entityId, set);
  }

  const report: UndoReport = { creators: 0, fields: 0, keptNewer: 0, keptSheet: 0, notInBackup: 0, createdBySheet, failed: 0 };
  for (const [creatorId, fields] of touched) {
    const before = old.get(creatorId);
    if (!before) {
      report.notInBackup += fields.size;
      continue;
    }
    const c = await prisma.creator.findUnique({ where: { id: creatorId }, select: { id: true, accountId: true } });
    if (!c) continue;
    const stamps = await prisma.fieldStamp.findMany({
      where: { OR: [{ entity: "Creator", entityId: c.id }, { entity: "CreatorAccount", entityId: c.accountId }] },
      select: { entity: true, field: true, source: true },
    });
    const creator: Record<string, unknown> = {};
    const account: Record<string, unknown> = {};
    const undone: string[] = [];
    for (const f of fields) {
      const u = UNDO[f];
      if (!u) continue;
      // Só volta se a última alteração do campo ainda é da planilha.
      if (stamps.find((s) => s.entity === u.entity && s.field === u.columns[0])?.source !== "SHEET") {
        report.keptNewer++;
        continue;
      }
      const src = u.entity === "Creator" ? before.creator : before.account;
      // A planilha era mais nova que a última mudança do sistema (a hora real da última edição da planilha): fica.
      const systemAt = typeof src.updatedAt === "string" ? new Date(src.updatedAt) : null;
      if (sheetEditedAt && systemAt && systemAt <= sheetEditedAt) {
        report.keptSheet++;
        continue;
      }
      const target = u.entity === "Creator" ? creator : account;
      for (const col of u.columns) {
        const v = src[col] ?? null;
        target[col] = DATES.has(col) && typeof v === "string" ? new Date(v) : v;
      }
      undone.push(f);
    }
    if (!undone.length) continue;
    if (!apply) {
      report.creators++;
      report.fields += undone.length;
      continue;
    }
    try {
      await prisma.$transaction(async (tx) => {
        if (Object.keys(account).length) await tx.creatorAccount.update({ where: { id: c.accountId }, data: account });
        if (Object.keys(creator).length) await tx.creator.update({ where: { id: c.id }, data: creator });
        await tx.auditLog.create({
          data: { brandId: brand.id, actorType: "SYSTEM", actorId: "sheet:undo", action: "sheet.undo", entity: "Creator", entityId: c.id, after: { fields: undone } },
        });
      });
      report.creators++;
      report.fields += undone.length;
    } catch (error) {
      // Ex.: o e-mail antigo já é de outra conta. Fica como está e entra na contagem.
      console.error("sheets.undo", creatorId, error);
      report.failed += undone.length;
    }
  }
  return report;
}
