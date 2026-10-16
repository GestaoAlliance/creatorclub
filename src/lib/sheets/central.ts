import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  CENTRAL_COLUMNS,
  CENTRAL_ID_HEADER,
  CENTRAL_OUT_ONLY,
  CENTRAL_TABS,
  centralTab,
  cleanInstagram,
  dayKey,
  formatDoc,
  normHeader,
  onlyDigits,
  parseCityState,
  parseSheetDay,
  parseYesNo,
  sheetDay,
  sheetText,
  tabForCategories,
  yesNo,
  type CentralField,
  type CentralTab,
} from "@/domain";
import { normalizeEmail } from "@/lib/auth/rules";
import { FAKE_EMAIL_DOMAIN } from "@/lib/import/legacy";
import { addressOf, formatAddress, zipFromText } from "@/lib/shipments/address";

/**
 * Central de creators sincronizada com o sistema (D-SHEETSYNC), nos dois sentidos, por um script na própria planilha.
 * Entrada: cada edição feita na planilha chega com a hora da edição; por campo, vale a alteração mais recente (a hora
 * de cada campo do sistema vem do gatilho `stamp_synced_fields`; sem carimbo, a última alteração da linha).
 * Saída: a cada volta o script recebe as creators que mudaram no sistema e reescreve as colunas delas.
 * Dinheiro não muda pela planilha: cupom diferente vira aviso para a Ana confirmar em Cupons.
 */

export class SheetError extends Error {}

export type CentralPushRow = {
  tab: string;
  row: number;
  /** Valores da linha, pelo título da coluna. */
  values: Record<string, unknown>;
  /** Títulos das colunas editadas (só elas contam como alteração). */
  edited: string[];
  /** Hora da edição na planilha (ISO). */
  editedAt: string;
};

export type CentralPushResult = { tab: string; row: number; id: string | null; applied: string[] };

const SHEET = "central";
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Campo do sistema que guarda cada coluna (para comparar a hora da alteração). */
const STAMP: Partial<Record<CentralField, { entity: "CreatorAccount" | "Creator"; field: string }>> = {
  name: { entity: "CreatorAccount", field: "name" },
  phone: { entity: "CreatorAccount", field: "phone" },
  cpf: { entity: "CreatorAccount", field: "cpf" },
  cnpj: { entity: "CreatorAccount", field: "cnpj" },
  instagram: { entity: "CreatorAccount", field: "instagram" },
  pixKey: { entity: "CreatorAccount", field: "pixKey" },
  email: { entity: "CreatorAccount", field: "email" },
  address: { entity: "CreatorAccount", field: "addrStreet" },
  cityState: { entity: "CreatorAccount", field: "addrCity" },
  contractStart: { entity: "Creator", field: "contractStart" },
  contractEnd: { entity: "Creator", field: "contractEnd" },
  couponRegistered: { entity: "Creator", field: "couponRegistered" },
  followsOnInstagram: { entity: "Creator", field: "followsOnInstagram" },
  inGroup: { entity: "Creator", field: "inGroup" },
  contractSigned: { entity: "Creator", field: "contractSigned" },
  tagged: { entity: "Creator", field: "tagged" },
  ugcFolderUrl: { entity: "Creator", field: "ugcFolderUrl" },
  ugcOrder: { entity: "Creator", field: "ugcOrder" },
  ugcVideoStatus: { entity: "Creator", field: "ugcVideoStatus" },
  notes: { entity: "Creator", field: "notes" },
};

const CREATOR_SELECT = {
  id: true,
  brandId: true,
  categories: true,
  status: true,
  updatedAt: true,
  contractStart: true,
  contractEnd: true,
  contractSigned: true,
  couponRegistered: true,
  followsOnInstagram: true,
  inGroup: true,
  tagged: true,
  ugcFolderUrl: true,
  ugcOrder: true,
  ugcVideoStatus: true,
  notes: true,
  account: {
    select: {
      id: true,
      userId: true,
      name: true,
      email: true,
      phone: true,
      cpf: true,
      cnpj: true,
      pixKey: true,
      instagram: true,
      addrZip: true,
      addrStreet: true,
      addrNumber: true,
      addrComplement: true,
      addrDistrict: true,
      addrCity: true,
      addrState: true,
      updatedAt: true,
    },
  },
  couponAssignments: { where: { validTo: null }, orderBy: { validFrom: "desc" }, take: 1, select: { createdAt: true, confirmedAt: true, coupon: { select: { code: true } } } },
  shipments: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, shippedAt: true, trackingCode: true, updatedAt: true } },
} as const;

async function brandOf(prisma: PrismaClient, slug: string) {
  const brand = await prisma.brand.findUnique({ where: { slug: slug.toLowerCase() }, select: { id: true, archivedAt: true } });
  if (!brand || brand.archivedAt) throw new SheetError("Marca não encontrada.");
  return brand.id;
}

/** Valores da linha pelo campo (títulos normalizados). */
function byField(values: Record<string, unknown>): Partial<Record<CentralField, unknown>> {
  const out: Partial<Record<CentralField, unknown>> = {};
  for (const [h, v] of Object.entries(values)) {
    const f = CENTRAL_COLUMNS[normHeader(h)];
    if (f) out[f] = v;
  }
  return out;
}

async function issue(prisma: PrismaClient | Tx, brandId: string, tab: string, row: number, message: string, now: Date) {
  await prisma.sheetSyncIssue.upsert({
    where: { brandId_sheet_tab_row_message: { brandId, sheet: SHEET, tab, row, message } },
    create: { brandId, sheet: SHEET, tab, row, message, seenAt: now },
    update: { seenAt: now },
  });
}

/** Creator da linha: pela coluna de ligação; sem ela, pelo CPF, e-mail ou cupom (nessa ordem). */
async function findCreator(prisma: PrismaClient, brandId: string, f: Partial<Record<CentralField, unknown>>) {
  const id = sheetText(f.id, 64);
  if (id) {
    const c = await prisma.creator.findFirst({ where: { id, brandId }, select: { id: true } });
    if (c) return c.id;
  }
  const cpf = onlyDigits(f.cpf);
  if (cpf.length === 11) {
    const c = await prisma.creator.findFirst({ where: { brandId, account: { cpf: { in: [cpf, formatDoc(cpf)] } } }, select: { id: true } });
    if (c) return c.id;
  }
  const email = normalizeEmail(sheetText(f.email) ?? "");
  if (email) {
    const c = await prisma.creator.findFirst({ where: { brandId, account: { email } }, select: { id: true } });
    if (c) return c.id;
  }
  const code = sheetText(f.coupon)?.toUpperCase();
  if (code) {
    const c = await prisma.creator.findFirst({ where: { brandId, couponAssignments: { some: { validTo: null, coupon: { code } } } }, select: { id: true } });
    if (c) return c.id;
  }
  return null;
}

/** Creator nova vinda da planilha (linha sem ligação e sem par no sistema). */
async function createFromRow(prisma: PrismaClient, brandId: string, tab: CentralTab, f: Partial<Record<CentralField, unknown>>, at: Date) {
  const name = sheetText(f.name, 120);
  if (!name) return null;
  const email = normalizeEmail(sheetText(f.email) ?? "");
  return prisma.$transaction(async (tx) => {
    await markSheet(tx, at);
    const existing = email ? await tx.creatorAccount.findUnique({ where: { email }, select: { id: true } }) : null;
    const account =
      existing ??
      (await tx.creatorAccount.create({
        data: { name, email: email || `central-${randomUUID()}${FAKE_EMAIL_DOMAIN}` },
        select: { id: true },
      }));
    const c = await tx.creator.create({
      data: { brandId, accountId: account.id, categories: [CENTRAL_TABS[tab]], status: "ACTIVE", activatedAt: at, source: "central" },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: { brandId, actorType: "SYSTEM", actorId: "sheet:central", action: "sheet.creator", entity: "Creator", entityId: c.id, after: { name, tab } },
    });
    return c.id;
  });
}

/** Marca a transação como vinda da planilha, com a hora da edição (o gatilho carimba os campos com ela). */
async function markSheet(tx: Tx, at: Date) {
  await tx.$queryRaw`SELECT set_config('app.sync_source', 'SHEET', true), set_config('app.sync_at', ${at.toISOString().replace("T", " ").replace("Z", "")}, true)`;
}

/** Recebe as linhas editadas na planilha e aplica, campo a campo, o que for mais novo que o sistema. */
export async function pushCentral(prisma: PrismaClient, slug: string, rows: CentralPushRow[], now = new Date()): Promise<CentralPushResult[]> {
  const brandId = await brandOf(prisma, slug);
  const results: CentralPushResult[] = [];
  for (const r of rows.slice(0, 500)) {
    const tab = centralTab(r.tab);
    const at = new Date(r.editedAt);
    if (!tab || !Number.isInteger(r.row) || Number.isNaN(at.getTime())) continue;
    const f = byField(r.values ?? {});
    const edited = new Set((r.edited ?? []).map((h) => CENTRAL_COLUMNS[normHeader(h)]).filter((x): x is CentralField => !!x && !CENTRAL_OUT_ONLY.includes(x)));
    if (!sheetText(f.name)) {
      results.push({ tab: r.tab, row: r.row, id: null, applied: [] });
      continue;
    }
    let id = await findCreator(prisma, brandId, f);
    let created = false;
    if (!id) {
      id = await createFromRow(prisma, brandId, tab, f, at);
      created = true;
      for (const k of Object.keys(f) as CentralField[]) if (!CENTRAL_OUT_ONLY.includes(k)) edited.add(k);
    }
    if (!id) continue;
    const applied = await applyRow(prisma, brandId, id, r.tab, r.row, f, edited, at, created, now);
    results.push({ tab: r.tab, row: r.row, id, applied });
  }
  await prisma.sheetSync.upsert({ where: { brandId_sheet: { brandId, sheet: SHEET } }, create: { brandId, sheet: SHEET, lastPushAt: now }, update: { lastPushAt: now } });
  return results;
}

async function applyRow(
  prisma: PrismaClient,
  brandId: string,
  creatorId: string,
  tab: string,
  row: number,
  f: Partial<Record<CentralField, unknown>>,
  edited: Set<CentralField>,
  at: Date,
  created: boolean,
  now: Date,
): Promise<string[]> {
  const c = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId }, select: CREATOR_SELECT });
  const stamps = await prisma.fieldStamp.findMany({
    where: { OR: [{ entity: "Creator", entityId: c.id }, { entity: "CreatorAccount", entityId: c.account.id }] },
    select: { entity: true, field: true, changedAt: true },
  });
  const stampOf = (entity: string, field: string) =>
    stamps.find((s) => s.entity === entity && s.field === field)?.changedAt ?? (entity === "Creator" ? c.updatedAt : c.account.updatedAt);
  // Só vale a edição mais nova que a última alteração do mesmo campo no sistema.
  const newer = (k: CentralField) => {
    const s = STAMP[k];
    return !!s && edited.has(k) && (created || at > stampOf(s.entity, s.field));
  };

  const account: Record<string, unknown> = {};
  const creator: Record<string, unknown> = {};
  const applied: string[] = [];
  const set = (target: Record<string, unknown>, key: string, value: unknown, current: unknown, label: string) => {
    if ((value ?? null) === (current ?? null)) return;
    target[key] = value;
    applied.push(label);
  };

  if (newer("name")) {
    const v = sheetText(f.name, 120);
    if (v) set(account, "name", v, c.account.name, "name");
  }
  if (newer("phone")) set(account, "phone", sheetText(f.phone, 40), c.account.phone, "phone");
  if (newer("cpf")) {
    const d = onlyDigits(f.cpf);
    if (d && d.length !== 11) await issue(prisma, brandId, tab, row, `CPF "${sheetText(f.cpf)}" inválido: não foi aplicado.`, now);
    else set(account, "cpf", d || null, c.account.cpf ? onlyDigits(c.account.cpf) : null, "cpf");
  }
  if (newer("cnpj")) {
    const d = onlyDigits(f.cnpj);
    if (d && d.length !== 14) await issue(prisma, brandId, tab, row, `CNPJ "${sheetText(f.cnpj)}" inválido: não foi aplicado.`, now);
    else set(account, "cnpj", d || null, c.account.cnpj ? onlyDigits(c.account.cnpj) : null, "cnpj");
  }
  if (newer("instagram")) set(account, "instagram", cleanInstagram(f.instagram), c.account.instagram, "instagram");
  if (newer("pixKey")) set(account, "pixKey", sheetText(f.pixKey, 140), c.account.pixKey, "pixKey");
  if (newer("email")) {
    const email = normalizeEmail(sheetText(f.email) ?? "");
    if (email && email !== c.account.email) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) await issue(prisma, brandId, tab, row, `E-mail "${email}" inválido: não foi aplicado.`, now);
      else if (c.account.userId) await issue(prisma, brandId, tab, row, `E-mail novo (${email}) não aplicado: a creator já entra no portal com o e-mail atual.`, now);
      else if (await prisma.creatorAccount.findUnique({ where: { email }, select: { id: true } }))
        await issue(prisma, brandId, tab, row, `E-mail ${email} já é de outra creator: não foi aplicado.`, now);
      else set(account, "email", email, c.account.email, "email");
    }
  }
  if (newer("address")) {
    const text = sheetText(f.address, 300);
    const current = addressOf(c.account) ? formatAddress(addressOf(c.account)!).join(", ") : c.account.addrStreet;
    if ((text ?? null) !== (current ?? null)) {
      // Endereço em texto vira "endereço informado" (D-ADDRINFORMED): a creator confirma em campos no portal.
      Object.assign(account, { addrStreet: text, addrNumber: null, addrComplement: null, addrDistrict: null, addrZip: zipFromText(text) });
      applied.push("address");
    }
  }
  if (newer("cityState")) {
    const { city, state } = parseCityState(f.cityState);
    if (city !== c.account.addrCity || state !== c.account.addrState) {
      Object.assign(account, { addrCity: city, addrState: state });
      applied.push("cityState");
    }
  }
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  for (const k of ["contractStart", "contractEnd"] as const) {
    if (!newer(k)) continue;
    const v = parseSheetDay(f[k]);
    if (f[k] && !v) await issue(prisma, brandId, tab, row, `Data "${sheetText(f[k])}" inválida: não foi aplicada.`, now);
    else if (v !== day(c[k])) {
      creator[k] = v ? new Date(`${v}T00:00:00Z`) : null;
      applied.push(k);
    }
  }
  for (const k of ["couponRegistered", "followsOnInstagram", "inGroup", "contractSigned", "tagged"] as const)
    if (newer(k)) set(creator, k, parseYesNo(f[k]), c[k], k);
  for (const k of ["ugcFolderUrl", "ugcOrder", "ugcVideoStatus", "notes"] as const) if (newer(k)) set(creator, k, sheetText(f[k], 500), c[k], k);

  // Dinheiro (cupom, dona, taxa) não muda pela planilha: vira aviso para a Ana confirmar em Cupons.
  const code = sheetText(f.coupon, 40)?.toUpperCase().replace(/\s+/g, "") ?? null;
  const current = c.couponAssignments[0]?.coupon.code ?? null;
  if (code && code !== current && (created || edited.has("coupon")))
    await issue(prisma, brandId, tab, row, `Cupom ${code} na planilha${current ? ` (no sistema: ${current})` : ""}: confirme a dona em Cupons.`, now);

  if (Object.keys(account).length || Object.keys(creator).length) {
    await prisma.$transaction(async (tx) => {
      await markSheet(tx, at);
      if (Object.keys(account).length) await tx.creatorAccount.update({ where: { id: c.account.id }, data: account });
      if (Object.keys(creator).length) await tx.creator.update({ where: { id: c.id }, data: creator });
      await tx.auditLog.create({
        data: { brandId, actorType: "SYSTEM", actorId: "sheet:central", action: "sheet.apply", entity: "Creator", entityId: c.id, after: { tab, row, fields: applied, editedAt: at.toISOString() } },
      });
    });
  }
  return applied;
}

export type CentralPullRow = { id: string; tab: CentralTab; append: boolean; values: Record<string, string> };

/** Linha da planilha com os dados atuais do sistema (só as colunas que o sistema sabe preencher). */
function rowOf(c: Awaited<ReturnType<typeof loadForPull>>[number]): CentralPullRow {
  const a = c.account;
  const structured = addressOf(a);
  const ship = c.shipments[0];
  const values: Record<string, string> = {
    [CENTRAL_ID_HEADER]: c.id,
    "NOME COMPLETO": a.name,
    WHATSAPP: a.phone ?? "",
    CUPOM: c.couponAssignments[0]?.coupon.code ?? "",
    CPF: formatDoc(a.cpf ? onlyDigits(a.cpf) : null),
    CNPJ: formatDoc(a.cnpj ? onlyDigits(a.cnpj) : null),
    INSTAGRAM: a.instagram ? `@${a.instagram}` : "",
    "CHAVE PIX": a.pixKey ?? "",
    "E-MAIL": a.email.endsWith(FAKE_EMAIL_DOMAIN) ? "" : a.email,
    "ENDEREÇO": structured ? formatAddress(structured).join(", ") : (a.addrStreet ?? ""),
    "CIDADE/ES": [a.addrCity, a.addrState].filter(Boolean).join("/"),
    // Datas do contrato são colunas de dia (meia-noite UTC): sem fuso.
    "DATA DE INÍCIO": sheetDay(c.contractStart ? c.contractStart.toISOString().slice(0, 10) : null),
    "FINAL DO CONTRATO": sheetDay(c.contractEnd ? c.contractEnd.toISOString().slice(0, 10) : null),
    "ÚLTIMO PEDIDO": ship ? sheetDay(dayKey(ship.shippedAt ?? ship.createdAt)) : "Sem pedido",
    "CÓDIGO DE RASTREIO": ship?.trackingCode ?? "",
    "CUPOM CAD.": yesNo(c.couponRegistered),
    "Seguimos no insta?": yesNo(c.followsOnInstagram),
    GRUPO: yesNo(c.inGroup),
    "CONTRATO ASS.": yesNo(c.contractSigned),
    ETIQUETADA: yesNo(c.tagged),
    PASTA: c.ugcFolderUrl ?? "",
    "PEDIDO:": c.ugcOrder ?? "",
    "VÍDEOS FEITOS?": c.ugcVideoStatus ?? "",
    OBS: c.notes ?? "",
  };
  return { id: c.id, tab: tabForCategories(c.categories), append: c.status !== "DEACTIVATED", values };
}

function loadForPull(prisma: PrismaClient, brandId: string) {
  return prisma.creator.findMany({ where: { brandId }, orderBy: { createdAt: "asc" }, select: CREATOR_SELECT });
}

/** Creators que mudaram no sistema desde a última volta (todas, sem data). */
export async function pullCentral(prisma: PrismaClient, slug: string, since: Date | null, now = new Date()): Promise<{ now: string; rows: CentralPullRow[] }> {
  const brandId = await brandOf(prisma, slug);
  const creators = await loadForPull(prisma, brandId);
  const changed = since
    ? creators.filter((c) => {
        const times = [c.updatedAt, c.account.updatedAt, c.couponAssignments[0]?.createdAt, c.couponAssignments[0]?.confirmedAt, c.shipments[0]?.updatedAt];
        return times.some((t) => t && t > since);
      })
    : creators;
  await prisma.sheetSync.upsert({ where: { brandId_sheet: { brandId, sheet: SHEET } }, create: { brandId, sheet: SHEET, lastPullAt: now }, update: { lastPullAt: now } });
  return { now: now.toISOString(), rows: changed.map(rowOf) };
}

/** Situação das planilhas da marca e os avisos dos últimos 30 dias (tela Sync). */
export async function sheetSyncStatus(prisma: PrismaClient, brandId: string, now = new Date()) {
  const [syncs, issues] = await Promise.all([
    prisma.sheetSync.findMany({ where: { brandId }, orderBy: { sheet: "asc" } }),
    prisma.sheetSyncIssue.findMany({ where: { brandId, seenAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, orderBy: { seenAt: "desc" }, take: 50 }),
  ]);
  return { syncs, issues };
}

/** Linha lida da planilha (só leitura, D-SHEETREADONLY): valores pelo título da coluna, como aparecem na tela. */
export type CentralReadRow = { tab: string; row: number; values: Record<string, unknown> };
export type CentralReadResult = { rows: number; matched: number; unmatched: number; applied: number; baseline: boolean };

const YES_NO: readonly CentralField[] = ["couponRegistered", "followsOnInstagram", "inGroup", "contractSigned", "tagged"];

/**
 * Lê a Central inteira (D-SHEETREADONLY): o sistema nunca escreve na planilha. A célula que mudou desde a leitura
 * anterior conta como editada agora e entra se for mais nova que a última alteração do mesmo campo no sistema.
 * A primeira leitura (e a primeira vez de cada creator) só registra o ponto de partida. Linha sem creator no sistema
 * (CPF, e-mail ou cupom) vira aviso; texto fora de Sim/Não no checklist é ignorado.
 */
export async function readCentral(prisma: PrismaClient, slug: string, rows: CentralReadRow[], now = new Date()): Promise<CentralReadResult> {
  const brandId = await brandOf(prisma, slug);
  const sync = await prisma.sheetSync.findUnique({ where: { brandId_sheet: { brandId, sheet: SHEET } }, select: { snapshot: true } });
  const before = (sync?.snapshot ?? null) as Record<string, Record<string, string>> | null;
  const next: Record<string, Record<string, string>> = {};
  const result: CentralReadResult = { rows: 0, matched: 0, unmatched: 0, applied: 0, baseline: !before };
  for (const r of rows.slice(0, 2000)) {
    const tab = centralTab(r.tab);
    if (!tab || !Number.isInteger(r.row)) continue;
    const f = byField(r.values ?? {});
    delete f.id;
    const name = sheetText(f.name, 120);
    if (!name) continue;
    result.rows++;
    const id = await findCreator(prisma, brandId, f);
    if (!id) {
      result.unmatched++;
      await issue(prisma, brandId, r.tab, r.row, `${name}: não achei a creator no sistema (CPF, e-mail ou cupom). A linha não foi lida.`, now);
      continue;
    }
    result.matched++;
    const cur: Record<string, string> = {};
    for (const [k, v] of Object.entries(f) as [CentralField, unknown][]) if (!CENTRAL_OUT_ONLY.includes(k)) cur[k] = sheetText(v, 500) ?? "";
    const prev = before?.[id];
    next[id] = cur;
    if (!prev) continue;
    const edited = new Set<CentralField>();
    for (const k of Object.keys(cur) as CentralField[]) {
      if (cur[k] === (prev[k] ?? "")) continue;
      if (YES_NO.includes(k) && cur[k] && parseYesNo(cur[k]) === null) continue;
      edited.add(k);
    }
    if (!edited.size) continue;
    const applied = await applyRow(prisma, brandId, id, r.tab, r.row, f, edited, now, false, now);
    if (applied.length) result.applied++;
  }
  await prisma.sheetSync.upsert({
    where: { brandId_sheet: { brandId, sheet: SHEET } },
    create: { brandId, sheet: SHEET, lastPushAt: now, snapshot: next },
    update: { lastPushAt: now, snapshot: next },
  });
  return result;
}
