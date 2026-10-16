#!/bin/bash
# Finds the Supabase database for the GitHub workflows and puts its connection string in DB_URL (in $GITHUB_ENV when
# there is one). GitHub's machines have no IPv6, so it goes through Supabase's session pooler, whose address depends
# on the project's region: it tries each one. Needs SUPABASE_DB_URL, or SUPABASE_DB_PASSWORD (+ PROJECT_REF).
# Prints nothing secret (GitHub also hides secret values in its logs).
set -u
REF=${PROJECT_REF:-glombusdjwlrgjihnylk}
out_env() { if [ -n "${GITHUB_ENV:-}" ]; then echo "DB_URL=$1" >> "$GITHUB_ENV"; else echo "$1"; fi; }
try() { PGCONNECT_TIMEOUT=10 psql "$1" -Atqc 'select current_user' 2>&1 | tail -1; }
if [ -n "${SUPABASE_DB_URL:-}" ] && [ "$(try "$SUPABASE_DB_URL")" = "postgres" ]; then echo "using SUPABASE_DB_URL" >&2; out_env "$SUPABASE_DB_URL"; exit 0; fi
if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then echo "No SUPABASE_DB_PASSWORD (or working SUPABASE_DB_URL) secret yet." >&2; exit 3; fi
for p in aws-0 aws-1; do for r in us-east-2 us-east-1 us-west-1 us-west-2 ca-central-1 sa-east-1 eu-west-1 eu-west-2 eu-west-3 eu-central-1 eu-central-2 eu-north-1 ap-south-1 ap-southeast-1 ap-southeast-2 ap-northeast-1 ap-northeast-2; do
  h="$p-$r.pooler.supabase.com"
  url="postgresql://postgres.$REF:$SUPABASE_DB_PASSWORD@$h:5432/postgres"
  res=$(try "$url")
  if [ "$res" = "postgres" ]; then echo "database found through $h" >&2; out_env "$url"; exit 0; fi
  echo "  $h: $(echo "$res" | sed 's/.*FATAL: *//' | cut -c1-80)" >&2
done; done
echo "Couldn't reach the database (is the password right?)." >&2
exit 1
