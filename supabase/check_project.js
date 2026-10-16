#!/usr/bin/env node
// Checks a real Supabase project after loading (or changing) the database: the privacy rules are on everywhere,
// signed-out visitors get nothing, the app's calls exist, photo storage is private.
//
//   DB_URL=<connection string> PROJECT_URL=<https://….supabase.co> PUBLISHABLE_KEY=<sb_publishable_…> node supabase/check_project.js
//
// Prints only check names, counts and yes/no answers (it runs in GitHub's public logs). Exits 1 if anything is wrong.
const { execSync } = require('child_process');
const { DB_URL, PROJECT_URL, PUBLISHABLE_KEY } = process.env;
if (!DB_URL || !PROJECT_URL || !PUBLISHABLE_KEY) { console.error('set DB_URL, PROJECT_URL and PUBLISHABLE_KEY'); process.exit(2); }
const one = s => execSync(`psql "$DB_URL" -Atq -v ON_ERROR_STOP=1`, { input: s, encoding: 'utf8', env: process.env }).trim();
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

(async () => {
  const noRls = one(`select coalesce(string_agg(tablename, ', ' order by tablename), '') from pg_tables where schemaname = 'public' and not rowsecurity;`);
  ok(!noRls, `every table has its privacy rules switched on${noRls ? ' (not: ' + noRls + ')' : ''}`);
  const tables = Number(one(`select count(*) from pg_tables where schemaname = 'public';`));
  ok(tables >= 20, `the tables are there (${tables})`);
  const fns = ['pull_events()', 'push_event(jsonb)', 'claim_name(text)', 'create_profile(text,text)', 'data_version()', 'my_profile()'];
  fns.forEach(f => ok(one(`select has_function_privilege('authenticated', 'public.${f}', 'execute');`) === 't', `signed-in people can call ${f.split('(')[0]}`));
  const callable = r => one(`select coalesce(string_agg(distinct p.proname, ',' order by p.proname), '') from pg_proc p where p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') and has_function_privilege('${r}', p.oid, 'execute');`);
  const anonCalls = callable('anon');
  ok(!anonCalls, `signed-out visitors can't call any of the app's functions${anonCalls ? ' (can: ' + anonCalls + ')' : ''}`);
  const granted = /grant execute on function ([\s\S]*?) to authenticated;/.exec(require('fs').readFileSync(require('path').join(__dirname, 'api.sql'), 'utf8'))[1]
    .split(/\)\s*,\s*/).map(x => x.trim().split('(')[0]).filter(Boolean);
  const expected = [...new Set([...granted, 'me'])].sort(), have = callable('authenticated').split(',').filter(Boolean);
  const extra = have.filter(x => !expected.includes(x)), missing = expected.filter(x => !have.includes(x));
  ok(!extra.length && !missing.length, `signed-in people can call exactly the app's ${expected.length} calls${extra.length ? '; also: ' + extra.join(', ') : ''}${missing.length ? '; missing: ' + missing.join(', ') : ''}`);
  ok(one(`select count(*) from pg_namespace where nspname = 'private';`) === '1', "the privacy rules' helpers live in their own schema");
  const exposed = one(`select coalesce(current_setting('pgrst.db_schemas', true), '') || '|' || coalesce((select array_to_string(rolconfig, ';') from pg_roles where rolname = 'authenticator'), '');`);
  console.log(`(served to the app: ${exposed.replace(/\|/, ' | ') || 'Supabase default'}; GraphQL extension: ${one(`select count(*) from pg_extension where extname = 'pg_graphql';`) === '1' ? 'on' : 'off'})`);
  ok(!/\b(private|internal)\b/.test(exposed), "the web address doesn't serve the private or internal schemas");
  ok(one(`select coalesce((select public::text from storage.buckets where id = 'photos'), 'missing');`) === 'false', 'the photo bucket exists and is private');
  ok(Number(one(`select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'photos\\_%';`)) === 4, 'the four photo rules are in place');
  const moved = one(`select coalesce((select value from backend_state where key = 'cutover_at'), '');`);
  console.log(moved ? `(moved to accounts on ${moved}: the app writes here directly)` : '(not moved to accounts yet: the Sheet is still in charge)');

  // from the outside, the way a phone talks to it, signed out
  const h = { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
  const base = PROJECT_URL.replace(/\/+$/, '');
  const settings = await fetch(base + '/auth/v1/settings', { headers: h });
  const st = settings.ok ? await settings.json() : {};
  ok(settings.ok && st.external && st.external.email === true, `email sign-in is on (${settings.status})`);
  const pe = await fetch(base + '/rest/v1/rpc/pull_events', { method: 'POST', headers: h, body: '{}' });
  const peBody = await pe.json().catch(() => ({}));
  ok(!pe.ok && peBody.code === '42501', `signed out, the app's sync call is refused by the database (${pe.status} ${peBody.code || ''})`);
  for (const t of ['profiles', 'sessions', 'session_notes', 'claim_codes', 'sheet_archive', 'notifications']) {
    const r = await fetch(base + `/rest/v1/${t}?select=*&limit=1`, { headers: h });
    const body = await r.json().catch(() => null);
    ok(!r.ok || (Array.isArray(body) && body.length === 0), `signed out, ${t} gives nothing (${r.status})`);
  }
  const sp = await fetch(base + '/storage/v1/object/list/photos', { method: 'POST', headers: h, body: JSON.stringify({ prefix: '' }) });
  const spBody = await sp.json().catch(() => null);
  ok(!sp.ok || (Array.isArray(spBody) && spBody.length === 0), `signed out, the photo bucket lists nothing (${sp.status})`);
  console.log(fails ? `${fails} project checks FAILED` : 'all project checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
