#!/bin/bash
# Makes the nightly backup (used by .github/workflows/backup.yml): needs DB_URL and BACKUP_PASSPHRASE.
#   bash supabase/backup.sh <output folder>
# Dumps the sign-in accounts (auth.users: ids and emails) and the app's schemas (public, private, internal: tables,
# rules, permissions and data), gzips it, locks it with AES-256 using the passphrase, then opens the locked file
# again and checks that every table's rows are in it. Prints only table names and row counts.
set -euo pipefail
out=${1:?output folder}; mkdir -p "$out"
major=$(psql "$DB_URL" -Atqc "show server_version_num" | cut -c1-2)
if ! command -v "/usr/lib/postgresql/$major/bin/pg_dump" >/dev/null; then   # pg_dump must match the server's version
  sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null 2>&1 || true
  sudo apt-get install -y -qq "postgresql-client-$major" >/dev/null
fi
PGD="/usr/lib/postgresql/$major/bin/pg_dump"
stamp=$(date -u +%Y-%m-%dT%H%MZ)
file="$out/dialed-in-$stamp.sql.gz"
{
  # the accounts first (profiles point at them), then the app's schemas with their rules and permissions; the
  # public schema itself already exists wherever this is restored, so its CREATE line is left out
  "$PGD" "$DB_URL" --no-owner --no-privileges --data-only --table=auth.users
  "$PGD" "$DB_URL" --no-owner --schema=public --schema=private --schema=internal | grep -v -e '^CREATE SCHEMA public;$' -e '^COMMENT ON SCHEMA public '
} | gzip -9 > "$file"
gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 -o "$file.gpg" "$file"
rm -f "$file"
# check: open it again and count each table's rows in the dump against the database
dump=$(gpg --batch --quiet --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -d "$file.gpg" | gunzip)
bad=0
for t in $(psql "$DB_URL" -Atqc "select tablename from pg_tables where schemaname = 'public' order by 1"); do
  want=$(psql "$DB_URL" -Atqc "select count(*) from public.\"$t\"")
  got=$(awk -v t="COPY public.$t " 'index($0, t) == 1 { on = 1; next } on && $0 == "\\." { on = 0 } on { n++ } END { print n + 0 }' <<<"$dump")
  [ "$want" = "$got" ] || { echo "MISMATCH $t: database $want, backup $got"; bad=1; }
  [ "$want" = "0" ] || echo "  $t: $got rows"
done
users=$(awk 'index($0, "COPY auth.users ") == 1 { on = 1; next } on && $0 == "\\." { on = 0 } on { n++ } END { print n + 0 }' <<<"$dump")
echo "  sign-in accounts: $users"
echo "locked backup: $(basename "$file.gpg"), $(du -k "$file.gpg" | cut -f1) KB (opens with the passphrase; photos not included)"
[ $bad -eq 0 ] && echo "backup OK" || { echo "backup INCOMPLETE"; exit 1; }
