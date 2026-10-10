#!/usr/bin/env bash
# Cópia cifrada do banco (P1, D-BACKUP). Usado pelo GitHub Actions (.github/workflows/backup.yml); roda local também.
# Uso: BACKUP_DATABASE_URL=... BACKUP_PASSPHRASE=... scripts/backup.sh <nome> <pasta-de-saída> [esquemas...]
# Sem esquemas: public, auth e storage (dados do app, logins e o índice dos arquivos; os PDFs em si ficam no Storage).
set -euo pipefail

name="${1:?nome da cópia}"
out="${2:?pasta de saída}"
shift 2
schemas=("$@")
[ ${#schemas[@]} -gt 0 ] || schemas=(public auth storage)

: "${BACKUP_DATABASE_URL:?falta BACKUP_DATABASE_URL}"
: "${BACKUP_PASSPHRASE:?falta BACKUP_PASSPHRASE}"
if [ ${#BACKUP_PASSPHRASE} -lt 32 ]; then echo "BACKUP_PASSPHRASE precisa de 32 caracteres ou mais." >&2; exit 1; fi

mkdir -p "$out"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
stamp="$(date -u +%Y-%m-%dT%H%MZ)"
file="$out/$name-$stamp.dump.gpg"

args=()
for s in "${schemas[@]}"; do args+=("--schema=$s"); done
pg_dump "$BACKUP_DATABASE_URL" --format=custom --no-owner --no-privileges "${args[@]}" --file "$tmp/db.dump"

# A cópia precisa abrir antes de ser guardada.
pg_restore --list "$tmp/db.dump" > "$tmp/list.txt"
tables="$(grep -c " TABLE DATA " "$tmp/list.txt" || true)"
[ "$tables" -gt 0 ] || { echo "Cópia sem dados de tabela: algo deu errado." >&2; exit 1; }

gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 \
  --output "$file" "$tmp/db.dump" 3<<<"$BACKUP_PASSPHRASE"

echo "Cópia: $(basename "$file") · $tables tabelas com dados · $(du -h "$file" | cut -f1) · esquemas: ${schemas[*]}"
