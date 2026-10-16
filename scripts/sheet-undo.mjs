// Desfazer o que a Central mandou ao sistema (D-SHEETREADONLY). Usado pelo workflow "Desfazer planilha":
// lê os valores antigos das creators da marca na cópia de segurança restaurada (OLD_DATABASE_URL) e manda para
// POST /api/sheets/<marca>/central/desfazer. Imprime só contagens (o repositório é público: nada de dado pessoal).
// Uso: OLD_DATABASE_URL=... APP_URL=... FORMS_SECRET=... node scripts/sheet-undo.mjs <marca> <desde ISO> <aplicar: sim|nao> [planilha editada em ISO]
import pg from "pg";

const [marca, since, aplicar, sheetEditedAt] = process.argv.slice(2);
if (!marca || !since || !["sim", "nao"].includes(aplicar)) throw new Error("uso: <marca> <desde ISO> <sim|nao>");
const { OLD_DATABASE_URL, APP_URL, FORMS_SECRET } = process.env;
if (!OLD_DATABASE_URL || !APP_URL || !FORMS_SECRET) throw new Error("faltam OLD_DATABASE_URL, APP_URL ou FORMS_SECRET");

const client = new pg.Client({ connectionString: OLD_DATABASE_URL });
await client.connect();
const { rows } = await client.query(
  `SELECT c.id, c."updatedAt" AS "cUpdatedAt", a."updatedAt" AS "aUpdatedAt", c."contractStart", c."contractEnd", c."couponRegistered", c."followsOnInstagram", c."inGroup",
          c."contractSigned", c.tagged, c."ugcFolderUrl", c."ugcOrder", c."ugcVideoStatus", c.notes,
          a.name, a.phone, a.cpf, a.cnpj, a.instagram, a."pixKey", a.email, a."addrStreet", a."addrNumber",
          a."addrComplement", a."addrDistrict", a."addrZip", a."addrCity", a."addrState"
     FROM "Creator" c JOIN "CreatorAccount" a ON a.id = c."accountId" JOIN "Brand" b ON b.id = c."brandId"
    WHERE b.slug = $1`,
  [marca],
);
await client.end();

const CREATOR = ["contractStart", "contractEnd", "couponRegistered", "followsOnInstagram", "inGroup", "contractSigned", "tagged", "ugcFolderUrl", "ugcOrder", "ugcVideoStatus", "notes"];
const pick = (r, keys) => Object.fromEntries(keys.map((k) => [k, r[k] instanceof Date ? r[k].toISOString() : (r[k] ?? null)]));
const OWN = ["id", "cUpdatedAt", "aUpdatedAt"];
const snapshot = rows.map((r) => ({
  creatorId: r.id,
  creator: { ...pick(r, CREATOR), updatedAt: r.cUpdatedAt.toISOString() },
  account: { ...pick(r, Object.keys(r).filter((k) => !OWN.includes(k) && !CREATOR.includes(k))), updatedAt: r.aUpdatedAt.toISOString() },
}));
console.log(`Cópia de segurança: ${snapshot.length} creators da marca ${marca}.`);

const res = await fetch(`${APP_URL.replace(/\/$/, "")}/api/sheets/${marca}/central/desfazer`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${FORMS_SECRET}` },
  body: JSON.stringify({ since, apply: aplicar === "sim", snapshot, sheetEditedAt: sheetEditedAt || undefined }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok || !body.ok) throw new Error(`O app respondeu ${res.status}: ${body.error ?? "?"}`);
console.log(
  [
    body.applied ? "APLICADO." : "SÓ CONFERÊNCIA (nada mudou).",
    `Creators com campos a voltar: ${body.creators}`,
    `Campos que voltam ao valor antigo: ${body.fields}`,
    `Campos mantidos (a equipe mudou depois da planilha): ${body.keptNewer}`,
    `Campos mantidos com o valor da planilha (planilha mais nova que o sistema): ${body.keptSheet}`,
    `Campos sem valor na cópia: ${body.notInBackup}`,
    `Campos que não deu para voltar (ex.: e-mail já de outra conta): ${body.failed}`,
    `Creators criadas pela planilha (não mexidas): ${body.createdBySheet}`,
  ].join("\n"),
);
