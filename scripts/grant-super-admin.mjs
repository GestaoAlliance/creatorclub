// Dá o papel SUPER_ADMIN (global) a pessoas que já têm usuário no Supabase Auth.
// Nunca cria nem altera senha: a senha vive só no Auth. Pode rodar de novo sem duplicar nada.
//
// Uso: DATABASE_URL=... node scripts/grant-super-admin.mjs "email@x.com:Nome" ["outro@y.com:Nome"]
import pg from "pg";

/** @param {pg.Client} client @param {{ email: string; name: string }} person */
export async function grantSuperAdmin(client, { email, name }) {
  await client.query("BEGIN");
  try {
    const found = await client.query(
      "SELECT id::text AS id FROM auth.users WHERE lower(email) = lower($1)",
      [email],
    );
    if (found.rowCount !== 1) {
      throw new Error(`Usuário do Auth não encontrado: ${email}. Crie primeiro no painel do Supabase.`);
    }
    const userId = found.rows[0].id;
    const created = await client.query(
      `INSERT INTO "User" (id, email, name, "updatedAt") VALUES ($1, lower($2), $3, now())
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [userId, email, name],
    );
    const granted = await client.query(
      `INSERT INTO "RoleGrant" (id, "userId", "brandId", role)
       SELECT gen_random_uuid()::text, $1, NULL, 'SUPER_ADMIN'
       WHERE NOT EXISTS (
         SELECT 1 FROM "RoleGrant" WHERE "userId" = $1 AND "brandId" IS NULL AND role = 'SUPER_ADMIN'
       ) RETURNING id`,
      [userId],
    );
    if (granted.rowCount) {
      await client.query(
        `INSERT INTO "AuditLog" (id, "actorType", action, entity, "entityId", after)
         VALUES (gen_random_uuid()::text, 'SYSTEM', 'role.grant', 'User', $1,
                 jsonb_build_object('role', 'SUPER_ADMIN', 'brandId', NULL, 'via', 'grant-super-admin'))`,
        [userId],
      );
    }
    await client.query("COMMIT");
    return { userId, userCreated: created.rowCount === 1, granted: granted.rowCount === 1 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const people = process.argv.slice(2).map((arg) => {
    const [email, name] = arg.split(":");
    if (!email || !name) throw new Error(`Formato: "email:Nome" (recebido: ${arg})`);
    return { email: email.trim(), name: name.trim() };
  });
  if (!people.length) throw new Error('Informe ao menos um "email:Nome".');
  const client = new pg.Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const person of people) {
      const result = await grantSuperAdmin(client, person);
      console.log(`${person.email}: ${result.granted ? "SUPER_ADMIN concedido" : "já era SUPER_ADMIN"}`);
    }
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
