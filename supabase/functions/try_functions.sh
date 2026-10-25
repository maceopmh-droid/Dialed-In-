#!/bin/bash
# Runs the two machine functions (v16.9, the Shot Logger) for real: Deno, the files exactly as deployed, postgres.js
# from npm, against a Postgres with schema.sql and api.sql loaded. For the checks workflow (GitHub has Deno and npm;
# the build kit's machine doesn't). Made-up data only; prints only answers and status codes.
#
#   PGHOST=localhost PGUSER=postgres bash supabase/functions/try_functions.sh
set -u
cd "$(dirname "$0")/../.."
DB=dialed_fn_try; fails=0; RUNNER_TEMP_DIR="${RUNNER_TEMP:-/tmp}/dialed-fn"; mkdir -p "$RUNNER_TEMP_DIR"
ok() { if [ "$1" = "0" ]; then echo "PASS $2"; else echo "FAIL $2"; fails=$((fails + 1)); fi; }
q() { psql -d "$DB" -Atq -v ON_ERROR_STOP=1 "$@"; }
psql -d postgres -Atq -c "drop database if exists $DB" -c "create database $DB" >/dev/null
q <<'SQL'
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
grant usage on schema public to authenticated, anon; grant usage on schema auth to authenticated, anon;
SQL
PGOPTIONS='-c client_min_messages=warning' q -f supabase/schema.sql -f supabase/api.sql >/dev/null || { echo "FAIL loading the database"; exit 1; }
q -c "insert into profiles (handle, display_name, legacy_name) values ('maceo', 'Maceo', 'Maceo');
      insert into coffees (legacy_id, owner_id, roaster_text, name) select 'b-shant', id, 'Deeper Roots Coffee', 'Shantawene' from profiles where handle = 'maceo';" >/dev/null
COFFEE=$(q -c "select id from coffees where legacy_id = 'b-shant'")
TOKEN=$(q -c "select internal.add_machine((select id from profiles where handle = 'maceo'), 'Test Gaggia')")
echo "::add-mask::$TOKEN"
SHOT="$RUNNER_TEMP_DIR/shot.json"
python3 - "$COFFEE" "$SHOT" <<'PY'
import json, sys, datetime
s = json.load(open('supabase/fixtures/shot-example.json')); s['coffee_id'] = sys.argv[1]
t = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=3)
s['started_at'] = t.strftime('%Y-%m-%dT%H:%M:%SZ'); s['ended_at'] = (t + datetime.timedelta(seconds=29)).strftime('%Y-%m-%dT%H:%M:%SZ')
json.dump(s, open(sys.argv[2], 'w'))
post = dict(s, status='post', rating={'stars': 4, 'taste': {'sweetness': 7}}); json.dump(post, open(sys.argv[2] + '.post', 'w'))
PY
export SUPABASE_DB_URL="postgresql://${PGUSER:-postgres}@${PGHOST:-localhost}:${PGPORT:-5432}/$DB"
start() { deno run --quiet --allow-net --allow-env --allow-read "supabase/functions/$1/index.ts" > "$RUNNER_TEMP_DIR/$1.log" 2>&1 & PID=$!;
  for _ in $(seq 1 120); do curl -s -o /dev/null http://127.0.0.1:8000/ && return 0; sleep 0.5; done; echo "FAIL $1 didn't start"; cat "$RUNNER_TEMP_DIR/$1.log"; return 1; }
stop() { kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; }

start shot-inbox || exit 1
out=$(curl -s -X POST http://127.0.0.1:8000/ -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data @"$SHOT" -w ' %{http_code}')
echo "$out" | grep -q '"state":"draft"' && echo "$out" | grep -q ' 200$'; ok $? "shot-inbox under Deno: the example shot is saved as a draft (${out##* })"
[ "$(q -c "select state || ':' || jsonb_array_length(payload->'samples'->'t_s') from shots")" = "draft:147" ]; ok $? "the database holds the draft with all 147 points"
out=$(curl -s -X POST http://127.0.0.1:8000/ -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data @"$SHOT.post" -w ' %{http_code}')
echo "$out" | grep -q '"state":"posted"'; ok $? "the same shot again with a rating and status post: posted (${out##* })"
[ "$(q -c "select count(*) || ':' || max(rating) || ':' || max(grind) from sessions where legacy_id like 'shot\_%'")" = "1:4:12D" ]; ok $? "one session, 4 stars, grind 12D"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8000/ -H 'Authorization: Bearer 0000000000000000000000000000000000000000000000000000000000000000' --data @"$SHOT")
[ "$code" = "401" ]; ok $? "a wrong token: $code (401 expected)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8000/ -H "Authorization: Bearer $TOKEN" --data '{"v":1}')
[ "$code" = "422" ]; ok $? "bad data: $code (422 expected)"
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/)
[ "$code" = "405" ]; ok $? "GET: $code (405 expected)"
stop

start machine-sync || exit 1
out=$(curl -s http://127.0.0.1:8000/ -H "Authorization: Bearer $TOKEN" -w ' %{http_code}')
echo "$out" | grep -q '"name":"Shantawene"' && echo "$out" | grep -q '"grind":"12D"' && echo "$out" | grep -q ' 200$'; ok $? "machine-sync under Deno: the coffee and the owner's last shot (${out##* })"
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/ -H 'Authorization: Bearer 0000000000000000000000000000000000000000000000000000000000000000')
[ "$code" = "401" ]; ok $? "machine-sync with a wrong token: $code (401 expected)"
stop

psql -d postgres -Atq -c "drop database if exists $DB" >/dev/null
[ $fails -eq 0 ] && echo "all machine function checks passed" || echo "$fails machine function checks FAILED"
exit $fails
