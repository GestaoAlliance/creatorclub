# Backup do banco (P1, D-BACKUP)

## O que é copiado

- **Creator Club (banco novo):** todo dia às 3h17 (horário de São Paulo), pelo GitHub Actions
  (`.github/workflows/backup.yml` → `scripts/backup.sh`). Esquemas `public` (todos os dados do app), `auth` (logins) e
  `storage` (índice dos arquivos).
- **App antigo (`creator-hub`):** só quando alguém roda à mão (Actions → "Backup do banco" → Run workflow → alvo
  `app-antigo`). Esquemas `public` e `auth`.
- **Não entra:** os arquivos em si do Storage (PDFs das NFs e recibos) e os segredos do Vault.

Cada cópia é cifrada (AES-256, `gpg`) com a senha `BACKUP_PASSPHRASE` e fica **90 dias** nos artefatos da execução.
Sem a senha o arquivo não abre. A senha fica nos segredos do GitHub e com o responsável, **fora deste repositório**.
Cópia que precisa durar mais (ex.: a do app antigo): baixar e guardar no Drive da empresa.

## Segredos no GitHub (Settings → Secrets and variables → Actions)

| Segredo | O que é |
|---|---|
| `BACKUP_DATABASE_URL` | Conexão do banco novo, *session pooler* (porta 5432), a mesma do `DIRECT_URL` da Vercel |
| `BACKUP_OLD_DATABASE_URL` | Conexão do `creator-hub` (Supabase → Connect → Session pooler) |
| `BACKUP_PASSPHRASE` | Senha da cifra, 32 caracteres ou mais (`openssl rand -base64 36`) |

Se a senha mudar, as cópias antigas continuam abrindo só com a senha antiga.

## Como restaurar

1. Baixar o artefato (Actions → execução → Artifacts) e descompactar: sai `<alvo>-<data>.dump.gpg`.
2. Abrir com a senha:
   `gpg --pinentry-mode loopback --decrypt --output banco.dump <alvo>-<data>.dump.gpg`
3. Conferir o conteúdo: `pg_restore --list banco.dump | less`
4. Restaurar num **banco novo** (nunca por cima do que está no ar sem decidir antes). A extensão `btree_gist` precisa
   existir antes, senão as travas `EXCLUDE` (taxas sem sobreposição) não voltam:
   ```
   psql "$DESTINO" -c 'CREATE EXTENSION IF NOT EXISTS btree_gist'
   pg_restore --no-owner --no-privileges --schema=public -d "$DESTINO" banco.dump
   ```
   Num projeto Supabase novo, os logins voltam com
   `pg_restore --no-owner --no-privileges --data-only --schema=auth --table=users --table=identities -d "$DESTINO" banco.dump`.
   O aviso `schema "public" already exists` pode ser ignorado.
5. Conferir: `SELECT count(*) FROM "_prisma_migrations"` e as contagens de `Creator`, `LedgerEntry` e `Withdrawal`
   iguais às do dia da cópia.

Testado em 2026-10-10 com o banco local: copiar → cifrar → abrir → restaurar devolveu as mesmas 39 tabelas, os 10
gatilhos e as 277 travas/chaves; senha errada não abre.

## Cuidados

- O GitHub desliga agendamentos de repositório público depois de 60 dias sem commits: se o projeto parar, rodar à mão
  ou reativar em Actions.
- Execução com falha aparece em vermelho em Actions (e o GitHub manda e-mail para quem configurou).
