#!/usr/bin/env node
// Checks the Shot Logger's backend (v16.9) on a real Postgres: the two machine functions' web side
// (functions/_shared/machine_http.mjs, the same code Supabase runs) calling api.sql's internal.shot_inbox and
// internal.machine_sync, and the app's calls (my_shots, post_shot, shot_later, dismiss_shot, shot_for_session), as
// pretend people. Made-up data only. The contract it checks: claude/shot-logger-app-handoff.md (the project docs).
//
//   node supabase/test_shots.js --host <socket dir or host> [--user postgres]
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const HOST = arg('host'), USER = arg('user') || 'postgres';
if (!HOST) { console.error('usage: node supabase/test_shots.js --host <socket dir or host> [--user postgres]'); process.exit(2); }
const DB = process.env.SHOTS_TEST_DB || 'dialed_shots_test';
const psql = (sql, db = DB) => execSync(`psql -h ${HOST} -U ${USER} -d ${db} -Atq -v ON_ERROR_STOP=1`, { input: sql, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const q = s => `'${String(s).replace(/'/g, "''")}'`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'shot-example.json'), 'utf8'));

// --- a fresh database with Supabase's sign-in pieces stood in (as in test_api.js)
psql(`drop database if exists ${DB}`, 'postgres'); psql(`create database ${DB}`, 'postgres');
psql(`create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;`);
psql(`alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, anon; alter default privileges in schema public grant execute on functions to authenticated, anon; grant usage on schema public to authenticated, anon;`);
psql(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
psql(`grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;`);
psql(fs.readFileSync(path.join(__dirname, 'api.sql'), 'utf8'));

const AUTH = { maceo: 'aaaaaaaa-0000-0000-0000-000000000001', aidan: 'aaaaaaaa-0000-0000-0000-000000000002', julian: 'aaaaaaaa-0000-0000-0000-000000000003', stranger: 'aaaaaaaa-0000-0000-0000-000000000004' };
const P = { Maceo: '00000000-0000-0000-0000-0000000000a1', Aidan: '00000000-0000-0000-0000-0000000000a2', Julian: '00000000-0000-0000-0000-0000000000a3', Stranger: '00000000-0000-0000-0000-0000000000a4' };
Object.entries(P).forEach(([n, id]) => psql(`insert into auth.users values ('${AUTH[n.toLowerCase()]}');
  insert into profiles (id, auth_id, handle, display_name, color, legacy_name) values ('${id}', '${AUTH[n.toLowerCase()]}', '${n.toLowerCase()}', '${n}', '#336699', ${n === 'Stranger' ? 'null' : q(n)});`));
psql(`insert into groups (id, name, is_open, owner_id, goal_on) values ('20000000-0000-0000-0000-000000000001', 'Original crew', false, '${P.Maceo}', true);
  insert into group_members (group_id, user_id, role) values ('20000000-0000-0000-0000-000000000001', '${P.Maceo}', 'owner'),
    ('20000000-0000-0000-0000-000000000001', '${P.Aidan}', 'member'), ('20000000-0000-0000-0000-000000000001', '${P.Julian}', 'member');`);

const as = (who, sql) => { try { return { out: psql(`set role authenticated; set request.jwt.claim.sub to '${AUTH[who]}'; ${sql}`) }; } catch (e) { return { err: String(e.stderr || e.message) }; } };
const call = (who, sql) => { const r = as(who, sql); if (r.err) return { err: r.err }; if (!r.out) return null; try { return JSON.parse(r.out); } catch (e) { return r.out; } };   // (text answers come back as text)
const push = (who, ev) => as(who, `select push_event(${q(JSON.stringify(ev))}::jsonb);`);
const pull = who => call(who, 'select pull_events();');
const brewsIn = (events, id) => (events || []).filter(e => e && e.type === 'brew' && String(e.id) === id);
const one = sql => psql(sql);
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

// the coffees: Maceo's Shantawene, Aidan's own record of the same coffee, Aidan's Alchemy (Maceo brews it too),
// a coffee Maceo deleted, and a machine for each of Maceo and Aidan
const bean = (who, id, name, roaster) => push(who.toLowerCase(), { type: 'bean', id, name, roaster, origin: 'Ethiopia', user: who, owner: who });
bean('Maceo', 'b-shant', 'Shantawene', 'Deeper Roots Coffee');
bean('Aidan', 'b-shant-a', 'Shantawene', 'Deeper Roots Coffee');
bean('Aidan', 'b-alch', 'Alchemy', 'Deeper Roots Coffee');
bean('Maceo', 'b-gone', 'Old Bag', 'Somewhere');
push('maceo', { type: 'delete', id: 'b-gone', targetType: 'bean', user: 'Maceo' });
psql(`update coffees set deleted_at = now() where legacy_id = 'b-gone';`);   // (however the app deletes it)
const COF = Object.fromEntries(['b-shant', 'b-shant-a', 'b-alch', 'b-gone'].map(k => [k, one(`select id from coffees where legacy_id = '${k}'`)]));
const brew = (who, id, beanId, extra) => { const r = push(who.toLowerCase(), { type: 'brew', id, beanId, method: 'Espresso', user: who, owner: who, audience: 'friends', ...extra }); if (r.err) ok(false, `setup: ${who}'s session ${id} saves (${r.err.split('\n')[0]})`); };
brew('Maceo', '1761000000001', 'b-shant', { grind: '11D', dose: 18, yield: 38, time: 31, rating: 3.5, date: '2026-10-20T14:00:00Z' });
brew('Maceo', '1761000000002', 'b-alch', { grind: '10E', dose: 18, yield: 40, time: 27, rating: 4, date: '2026-10-21T14:00:00Z' });
brew('Aidan', '1761000000003', 'b-shant-a', { grind: '3B', dose: 19, yield: 41, time: 33, rating: 4, date: '2026-10-23T14:00:00Z' });   // later than Maceo's
psql(`update profile_gear set last_by_method = '{"Espresso": ["eq-gaggia", "eq-sette"]}' where profile_id = '${P.Maceo}';
  insert into profile_gear (profile_id, last_by_method) select '${P.Maceo}', '{"Espresso": ["eq-gaggia", "eq-sette"]}' where not exists (select 1 from profile_gear where profile_id = '${P.Maceo}');
  insert into equipment (legacy_id, owner_id, type, name) values ('eq-gaggia', '${P.Maceo}', 'Machine', 'Gaggia Classic E24'), ('eq-sette', '${P.Maceo}', 'Grinder', 'Baratza Sette 270Wi');`);
const TOKEN = one(`select internal.add_machine('${P.Maceo}', 'Maceo''s Gaggia');`);
const TOKEN_AIDAN = one(`select internal.add_machine('${P.Aidan}', 'Aidan''s Gaggia');`);
ok(/^[0-9a-f]{64}$/.test(TOKEN) && TOKEN !== TOKEN_AIDAN, 'a machine gets a long random token (64 hex characters), different for each machine');
ok(one(`select count(*) from machines where token_hash = '${TOKEN}'`) === '0' && one(`select count(*) from machines where token_hash = internal.token_hash('${TOKEN}')`) === '1',
   'the database keeps only the token\'s hash, never the token');

(async () => {
  const mh = await import(path.join(__dirname, 'functions', '_shared', 'machine_http.mjs'));
  const db = async (kind, token, shot) => JSON.parse(psql(kind === 'inbox' ? `select internal.shot_inbox(${q(token)}, ${q(JSON.stringify(shot))}::jsonb);` : `select internal.machine_sync(${q(token)});`));
  const send = async (token, body, o = {}) => {
    const h = { 'Content-Type': 'application/json', ...(o.headers || {}) };
    if (token) h.Authorization = 'Bearer ' + token;
    const res = await mh.shotInbox(new Request('http://x/functions/v1/shot-inbox', { method: o.method || 'POST', headers: h, body: (o.method || 'POST') === 'GET' ? undefined : (o.raw !== undefined ? o.raw : JSON.stringify(body)) }), db);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const sync = async (token, method = 'GET') => {
    const res = await mh.machineSync(new Request('http://x/functions/v1/machine-sync', { method, headers: token ? { Authorization: 'Bearer ' + token } : {} }), db);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const now = Date.now();
  const shotOf = (id, extra = {}) => ({ ...JSON.parse(JSON.stringify(EXAMPLE)), shot_id: id, coffee_id: COF['b-shant'], started_at: iso(now - 4 * 60e3), ended_at: iso(now - 4 * 60e3 + 29e3), ...extra });
  const S1 = '6f1d2c3a-8b4e-4c1a-9d2f-0a7b5e9c1f30';
  const sessionsOf = who => one(`select count(*) from sessions where owner_id = '${P[who]}' and deleted_at is null`);
  const before = { maceo: sessionsOf('Maceo'), dvMaceo: call('maceo', 'select data_version();'), dvAidan: call('aidan', 'select data_version();') };

  // ---------------------------------------------------------------- 1. the example shot, as a draft
  let r = await send(TOKEN, shotOf(S1));
  ok(r.status === 200 && r.body.ok === true && r.body.shot_id === S1 && r.body.state === 'draft', `the example shot arrives as a draft: 200 ${JSON.stringify(r.body)}`);
  const row = one(`select state || '|' || brewed_at::text || '|' || sends || '|' || (payload->'samples'->'t_s' ->> 146) from shots where id = '${S1}'`).split('|');
  ok(row[0] === 'draft' && new Date(row[1]).getTime() === new Date(iso(now - 4 * 60e3)).getTime() && row[2] === '1' && row[3] === '29.1', `stored once, brewed when it started (not when it arrived), every curve point kept (${row.join(' · ')})`);
  ok(sessionsOf('Maceo') === before.maceo && !brewsIn(pull('maceo'), 'shot_' + S1).length, 'a draft isn\'t a session: not in the sessions, not in Maceo\'s own sync');
  let mine = call('maceo', 'select my_shots();');
  const d0 = mine && mine.drafts && mine.drafts[0];
  ok(mine && mine.count === 1 && d0 && d0.id === S1 && d0.coffee === 'Shantawene' && d0.beanId === 'b-shant' && d0.grind === '12D' && d0.machine === 'Maceo\'s Gaggia' && d0.asked === false
     && d0.shot.samples.pressure_bar.length === 147 && d0.shot.phases.length === 4, `Maceo's Drafts: the shot with its coffee (the app's id), grind as the app writes it ("12D"), machine and curves (${d0 && JSON.stringify({ coffee: d0.coffee, beanId: d0.beanId, grind: d0.grind, machine: d0.machine })})`);
  ok(call('maceo', 'select data_version();') !== before.dvMaceo, 'a new draft changes Maceo\'s change check, so his app looks for it');
  ok(call('aidan', 'select data_version();') === before.dvAidan, '...but not Aidan\'s (a draft is Maceo\'s alone)');

  // ---------------------------------------------------------------- 2. nobody else can read it
  ok(call('aidan', 'select my_shots();').count === 0 && call('julian', 'select my_shots();').count === 0 && call('stranger', 'select my_shots();').count === 0, 'Aidan, Julian and a stranger see no drafts (only their own, and they have none)');
  ok(!brewsIn(pull('aidan'), 'shot_' + S1).length, 'the draft isn\'t in Aidan\'s sync (Maceo\'s friend, same private group)');
  for (const t of ['shots', 'machines']) ok(/permission denied/.test(as('aidan', `select * from ${t} limit 1;`).err || ''), `signed in, the ${t} table can't be read directly (only through the calls)`);
  ok(/permission denied/.test(as('maceo', `select * from shots limit 1;`).err || ''), '...not even by the owner (the calls only give what they should)');
  ok(call('aidan', `select shot_for_session('shot_${S1}');`) === null, 'Aidan can\'t read Maceo\'s shot by its id');
  ok(/isn't yours/.test(as('aidan', `select post_shot('${S1}');`).err || ''), 'Aidan can\'t post Maceo\'s shot');
  call('aidan', `select dismiss_shot('${S1}');`); call('aidan', `select shot_later('${S1}');`);
  ok(one(`select state || '|' || (asked_at is null) from shots where id = '${S1}'`) === 'draft|true', '...or delete it, or mark it as answered');
  for (const f of ['shot_inbox(text, jsonb)', 'machine_sync(text)', 'add_machine(uuid, text)', 'shot_post(uuid)', 'machine_for(text)'])
    ok(one(`select has_function_privilege('authenticated', 'internal.${f}', 'execute')`) === 'f', `signed-in people can't run internal.${f.split('(')[0]} (it acts as a machine's owner)`);

  // ---------------------------------------------------------------- 3. rated on the machine and posted: the same shot, sent again
  const rating = { stars: 4, taste: { acidity: 6, sweetness: 7, body: 6, finish: 7, bitterness: 3 } };
  r = await send(TOKEN, shotOf(S1, { status: 'post', rating }));
  ok(r.status === 200 && r.body.state === 'posted', `the re-send with a rating and status "post" posts it: ${JSON.stringify(r.body)}`);
  const sess = JSON.parse(one(`select to_jsonb(s) from sessions s where legacy_id = 'shot_${S1}'`) || 'null');
  ok(one(`select count(*) from sessions where legacy_id = 'shot_${S1}'`) === '1' && one(`select count(*) from shots where id = '${S1}'`) === '1', 'one shot, one session (app id "shot_<shot id>")');
  ok(sess && sess.method === 'Espresso' && sess.grind === '12D' && Number(sess.dose) === 18 && Number(sess.yield) === 36.4 && Number(sess.time_s) === 29.1, `the session has the shot's numbers (${sess && [sess.method, sess.grind, sess.dose, sess.yield, sess.time_s].join(', ')})`);
  ok(sess && Number(sess.rating) === 4 && sess.taste && sess.taste.acidity === 6 && sess.taste.bitterness === 3 && !('complexity' in sess.taste) && sess.tasted.length === 5,
     `the machine's stars and five sliders; complexity stays empty (${sess && JSON.stringify(sess.taste)})`);
  ok(sess && new Date(sess.brewed_at).getTime() === new Date(iso(now - 4 * 60e3)).getTime(), 'brewed when the shot started');
  ok(sess && sess.extras && sess.extras.temp === 93 && sess.extras.machineRecipe === 'Flat 9 bar' && sess.extras.peakBar === 9 && sess.extras.shotId === S1 && sess.extras.targetYield === 36 && sess.extras.machine === 'Maceo\'s Gaggia',
     `extras: temperature, recipe, peak pressure, target yield, the machine and the shot (${sess && JSON.stringify(sess.extras)})`);
  ok(sess && !('samples' in (sess.extras || {})) && !('phases' in (sess.extras || {})), 'the curves stay with the shot, not the session');
  ok(sess && sess.audience === 'friends', `who sees it: where Maceo's last session was set (${sess && sess.audience})`);
  ok(sess && JSON.stringify(sess.equipment) === JSON.stringify({ ids: ['eq-gaggia', 'eq-sette'], snapshot: ['Gaggia Classic E24', 'Baratza Sette 270Wi'] }), `his usual espresso gear, as the app fills in a new session (${sess && JSON.stringify(sess.equipment)})`);
  const aidanSees = brewsIn(pull('aidan'), 'shot_' + S1)[0];
  ok(aidanSees && aidanSees.user === 'Maceo' && aidanSees.beanId === 'b-shant' && Number(aidanSees.rating) === 4 && aidanSees.grind === '12D', 'once posted, it\'s a normal session: Aidan (a friend) sees it in his sync, on Maceo\'s Shantawene');
  ok(call('maceo', 'select my_shots();').count === 0, 'and it\'s gone from Maceo\'s Drafts');
  ok(one(`select count(*) from notifications where actor_id = '${P.Maceo}' and kind = 'friend_session'`) === '2', 'his friends hear about it like any new session (Aidan and Julian)');

  // ---------------------------------------------------------------- 4. sends never make a second session, and never go backwards
  r = await send(TOKEN, shotOf(S1, { status: 'post', rating }));
  ok(r.status === 200 && r.body.state === 'posted' && one(`select count(*) from sessions where legacy_id = 'shot_${S1}'`) === '1', 'the same post again (a retry): still one session');
  r = await send(TOKEN, shotOf(S1));   // a draft retry that was stuck in the machine's queue
  ok(r.status === 200 && r.body.state === 'posted' && one(`select state || '|' || (payload->'rating'->>'stars') from shots where id = '${S1}'`) === 'posted|4', 'a stale draft retry after posting changes nothing (still posted, rating kept)');
  ok(one(`select sends from shots where id = '${S1}'`) === '4', 'every send is counted on the one row');
  // Maceo edits the session in the app (4.5 stars and a note); the machine sends the shot again with other numbers
  const edited = brewsIn(pull('maceo'), 'shot_' + S1)[0];
  const ed = push('maceo', { ...edited, rating: 4.5, notes: 'Juicy, a little thin at the end' });
  ok(!ed.err, `Maceo's edit in the app saves (${(ed.err || '').split('\n')[0]})`);
  r = await send(TOKEN, shotOf(S1, { status: 'post', dose_g: 18.5, rating: { stars: 2, taste: { acidity: 9 } } }));
  const after = JSON.parse(one(`select jsonb_build_object('rating', rating, 'dose', dose, 'acid', taste->'acidity', 'note', (select body from session_notes where session_id = s.id)) from sessions s where legacy_id = 'shot_${S1}'`));
  ok(r.status === 200 && Number(after.rating) === 4.5 && after.acid === 6 && after.note === 'Juicy, a little thin at the end' && Number(after.dose) === 18.5,
     `a later machine send updates the machine's numbers but never the person's tasting (${JSON.stringify(after)})`);

  // ---------------------------------------------------------------- 5. bad tokens, wrong coffees, bad data
  r = await send('f'.repeat(64), shotOf('11111111-1111-4111-8111-111111111111'));
  ok(r.status === 401 && r.body.ok === false && /Unknown machine/.test(r.body.error), `a wrong token: 401 (${r.body.error})`);
  r = await send(null, shotOf('11111111-1111-4111-8111-111111111111'));
  ok(r.status === 401 && /Missing machine token/.test(r.body.error), 'no token at all: 401');
  r = await send('short', shotOf('11111111-1111-4111-8111-111111111111'));
  ok(r.status === 401, 'a token that isn\'t even the right shape: 401');
  r = await send(TOKEN, shotOf('22222222-2222-4222-8222-222222222222', { coffee_id: '33333333-3333-4333-8333-333333333333' }));
  ok(r.status === 422 && /coffee/.test(r.body.error) && one(`select count(*) from shots where id = '22222222-2222-4222-8222-222222222222'`) === '0', `a coffee that doesn't exist: 422, nothing saved (${r.body.error})`);
  r = await send(TOKEN, shotOf('22222222-2222-4222-8222-222222222222', { coffee_id: COF['b-gone'] }));
  ok(r.status === 422 && /coffee/.test(r.body.error), 'a deleted coffee: 422');
  r = await send(TOKEN, shotOf('22222222-2222-4222-8222-222222222223', { coffee_id: COF['b-alch'] }));
  ok(r.status === 200, 'someone else\'s coffee he brews (Aidan\'s Alchemy) is fine, as in the app');
  const big = shotOf('44444444-4444-4444-8444-444444444444'); big.notes = 'x'.repeat(300000);
  r = await send(TOKEN, big);
  ok(r.status === 422 && /too big/.test(r.body.error) && one(`select count(*) from shots where id = '44444444-4444-4444-8444-444444444444'`) === '0', `an oversized body (over 256 KB): 422, nothing saved (${r.body.error})`);
  r = await send(TOKEN, null, { raw: JSON.stringify(big), headers: { 'Content-Length': '0' } });
  ok(r.status === 422 && /too big/.test(r.body.error), '...even when it doesn\'t say how big it is (it stops reading at 256 KB)');
  r = await send(TOKEN, null, { raw: '{"v": 1, "shot_id": ' });
  ok(r.status === 422 && /isn't JSON/.test(r.body.error), 'a body that isn\'t JSON: 422');
  r = await send(TOKEN, null, { method: 'GET' });
  ok(r.status === 405, 'GET on the inbox: 405');
  const bad = [
    ['an unknown version', { v: 2 }, /version/],
    ['a shot_id that isn\'t a UUID', { shot_id: 'shot-1' }, /shot_id/],
    ['a status that isn\'t draft or post', { status: 'done' }, /status/],
    ['a start time in the future', { started_at: iso(now + 3600e3) }, /future/],
    ['a start time that isn\'t a time', { started_at: 'yesterday' }, /started_at/],
    ['a method other than Espresso', { method: 'Pour Over' }, /Espresso/],
    ['a dose of 400 g', { dose_g: 400 }, /dose_g/],
    ['a time that isn\'t a number', { time_s: '29.1' }, /time_s/],
    ['curves of different lengths', { samples: { ...EXAMPLE.samples, flow_gs: EXAMPLE.samples.flow_gs.slice(1) } }, /flow_gs/],
    ['time going backwards', { samples: { ...EXAMPLE.samples, t_s: [...EXAMPLE.samples.t_s].reverse() } }, /t_s/],
    ['a curve this version doesn\'t know', { samples: { ...EXAMPLE.samples, rpm: EXAMPLE.samples.t_s } }, /doesn't know/],
    ['6 stars', { status: 'post', rating: { stars: 6 } }, /stars/],
    ['a slider at 11', { rating: { stars: 4, taste: { acidity: 11 } } }, /1 to 10/],
    ['a complexity slider (the machine doesn\'t ask it)', { rating: { stars: 4, taste: { complexity: 5 } } }, /doesn't know/],
    ['a phase ending before it starts', { phases: [{ name: 'Soak', start_s: 9, end_s: 3 }] }, /phase/],
  ];
  for (const [label, extra, re] of bad) {
    const id = '55555555-5555-4555-8555-' + String(bad.findIndex(b => b[0] === label)).padStart(12, '0');
    r = await send(TOKEN, shotOf(id, extra));
    ok(r.status === 422 && re.test(r.body.error) && one(`select count(*) from shots where id = '${id}'`) === '0', `${label}: 422 "${r.body && r.body.error}"`);
  }
  r = await send(TOKEN, shotOf('66666666-6666-4666-8666-666666666666', { dose_g: null, yield_g: null, grind: null, rating: null }));
  ok(r.status === 200, 'a shot with dose, yield and grind empty (skipped dose screen, no scale) is still saved');
  psql(`update machines set revoked_at = now() where owner_id = '${P.Aidan}'`);
  r = await send(TOKEN_AIDAN, shotOf('77777777-7777-4777-8777-777777777777'));
  ok(r.status === 401, 'an unlinked machine\'s token stops working: 401');
  psql(`update machines set revoked_at = null where owner_id = '${P.Aidan}'`);
  r = await send(TOKEN_AIDAN, shotOf(S1, { status: 'post' }));
  ok(r.status === 422 && /someone else/.test(r.body.error) && one(`select count(*) from sessions where legacy_id = 'shot_${S1}' and owner_id = '${P.Aidan}'`) === '0', `another person's machine sending Maceo's shot_id: 422 (${r.body.error})`);
  r = await send(TOKEN_AIDAN, { ...shotOf('88888888-8888-4888-8888-888888888888', { coffee_id: COF['b-shant-a'] }), user_id: P.Maceo, owner: 'Maceo' });
  ok(r.status === 200 && one(`select owner_id from shots where id = '88888888-8888-4888-8888-888888888888'`) === P.Aidan, 'a user id in the body is ignored: the token alone says whose shot it is');

  // ---------------------------------------------------------------- 6. a late arrival (the machine was offline)
  const LATE = '99999999-9999-4999-8999-999999999999', lateAt = now - 3 * 864e5;
  const notesBefore = one(`select count(*) from notifications where kind = 'friend_session'`);
  r = await send(TOKEN, shotOf(LATE, { started_at: iso(lateAt), ended_at: iso(lateAt + 29e3), status: 'post', rating: { stars: 3 } }));
  const lateRow = one(`select s.brewed_at::text || '|' || x.brewed_at::text from shots s join sessions x on x.id = s.session_id where s.id = '${LATE}'`).split('|');
  ok(r.status === 200 && new Date(lateRow[0]).getTime() === new Date(iso(lateAt)).getTime() && new Date(lateRow[1]).getTime() === new Date(iso(lateAt)).getTime(),
     `a shot three days late is dated when it was brewed, the shot and its session (${lateRow[0]})`);
  ok(one(`select count(*) from notifications where kind = 'friend_session'`) === notesBefore, '...and isn\'t news to friends (history, like any session brewed days ago)');
  r = await send(TOKEN, shotOf('aaaaaaaa-1111-4111-8111-000000000001', { started_at: iso(now - 70 * 864e5) }));
  ok(r.status === 422 && /60 days/.test(r.body.error), 'a shot more than 60 days old: 422');

  // ---------------------------------------------------------------- 7. the app: the popup, Post as is, Later, Drafts, delete
  const S2 = 'bbbbbbbb-2222-4222-8222-000000000002', S3 = 'bbbbbbbb-3333-4333-8333-000000000003', S4 = 'bbbbbbbb-4444-4444-8444-000000000004', S5 = 'bbbbbbbb-5555-4555-8555-000000000005';
  for (const [id, mins] of [[S2, 30], [S3, 20], [S4, 10]]) await send(TOKEN, shotOf(id, { started_at: iso(now - mins * 60e3), ended_at: iso(now - mins * 60e3 + 29e3) }));
  mine = call('maceo', 'select my_shots();');
  const order = mine.drafts.map(d => d.id).filter(id => [S2, S3, S4].includes(id));
  ok(order.join() === [S4, S3, S2].join() && mine.drafts.every((d, i) => !i || new Date(mine.drafts[i - 1].brewedAt) >= new Date(d.brewedAt)), `Drafts come newest first (${mine.count} in all)`);
  ok(call('maceo', `select shot_later('${S4}');`) === 'later' && call('maceo', 'select my_shots();').drafts.find(d => d.id === S4).asked === true, '"Later" keeps it in Drafts, marked as answered (the popup won\'t ask again)');
  ok(call('maceo', `select post_shot('${S3}');`) === 'shot_' + S3, '"Post as is" posts it and gives its app id');
  const asIs = JSON.parse(one(`select jsonb_build_object('rating', rating, 'taste', taste, 'tasted', tasted, 'dose', dose) from sessions where legacy_id = 'shot_${S3}'`));
  ok(asIs.rating === null && asIs.taste === null && asIs.tasted.length === 0 && Number(asIs.dose) === 18, `...with the machine's numbers only: no stars, no tasting (${JSON.stringify(asIs)})`);
  ok(call('maceo', `select post_shot('${S3}');`) === 'shot_' + S3 && one(`select count(*) from sessions where legacy_id = 'shot_${S3}'`) === '1', 'posting it twice is harmless');
  ok(call('maceo', `select dismiss_shot('${S2}');`) === 'deleted' && !call('maceo', 'select my_shots();').drafts.some(d => d.id === S2), 'a draft can be deleted (gone from Drafts)');
  r = await send(TOKEN, shotOf(S2, { started_at: iso(now - 30 * 60e3), ended_at: iso(now - 30 * 60e3 + 29e3) }));
  ok(r.status === 200 && one(`select state from shots where id = '${S2}'`) === 'dismissed', 'a late draft retry doesn\'t bring a deleted draft back');
  r = await send(TOKEN, shotOf(S2, { status: 'post', rating: { stars: 4 }, started_at: iso(now - 30 * 60e3), ended_at: iso(now - 30 * 60e3 + 29e3) }));
  ok(r.status === 200 && r.body.state === 'posted', '...but posting it on the machine (on purpose) does');
  // "Taste and rate": the app saves the session with the shot's app id, and the shot is posted, linked to it
  await send(TOKEN, shotOf(S5, { started_at: iso(now - 5 * 60e3), ended_at: iso(now - 5 * 60e3 + 29e3) }));
  const saved = push('maceo', { type: 'brew', id: 'shot_' + S5, beanId: 'b-shant', method: 'Espresso', grind: '12D', dose: 18, yield: 36.4, time: 29.1, rating: 4, acidity: 6, sweetness: 8, tasted: ['acidity', 'sweetness'],
    notes: 'Stone fruit', user: 'Maceo', owner: 'Maceo', date: iso(now - 5 * 60e3), shotId: S5, temp: 93 });
  const linked = one(`select s.state || '|' || (s.session_id = x.id) from shots s join sessions x on x.legacy_id = 'shot_${S5}' where s.id = '${S5}'`);
  ok(!saved.err && linked === 'posted|true', `"Taste and rate": the app's save posts the draft and links it (${linked || saved.err})`);
  r = await send(TOKEN, shotOf(S5, { status: 'post', rating: { stars: 1 }, started_at: iso(now - 5 * 60e3), ended_at: iso(now - 5 * 60e3 + 29e3) }));
  ok(one(`select count(*) || '|' || max(rating) from sessions where legacy_id = 'shot_${S5}'`) === '1|4', '...and a machine post afterwards neither duplicates it nor overwrites the stars');
  ok(call('maceo', `select shot_for_session('shot_${S5}');`).shot.samples.t_s.length === 147, 'the shot page can get the curves of Maceo\'s posted shot');
  ok(call('aidan', `select shot_for_session('shot_${S5}');`) === null, '...and nobody else can');
  // nobody can save a session with someone else's shot id
  const S6 = 'bbbbbbbb-6666-4666-8666-000000000006';
  await send(TOKEN, shotOf(S6));
  push('aidan', { type: 'brew', id: 'shot_' + S6, beanId: 'b-shant-a', method: 'Espresso', dose: 18, user: 'Aidan', owner: 'Aidan', date: iso(now) });
  ok(one(`select count(*) from sessions where legacy_id = 'shot_${S6}'`) === '0' && one(`select state from shots where id = '${S6}'`) === 'draft', 'Aidan can\'t take Maceo\'s shot id for a session of his own');
  r = await send(TOKEN, shotOf(S6, { status: 'post' }));
  ok(r.status === 200 && one(`select owner_id from sessions where legacy_id = 'shot_${S6}'`) === P.Maceo, '...so Maceo\'s machine can still post it as his');

  // ---------------------------------------------------------------- 8. what the machine reads
  let sy = await sync(TOKEN);
  const list = (sy.body && sy.body.coffees) || [];
  ok(sy.status === 200 && sy.body.ok && sy.body.owner === 'Maceo' && sy.body.machine.name === 'Maceo\'s Gaggia', `machine-sync: 200, the machine and its owner (${sy.body && sy.body.owner})`);
  const shant = list.find(c => c.name === 'Shantawene'), alch = list.find(c => c.name === 'Alchemy');
  ok(list.filter(c => c.name === 'Shantawene').length === 1 && shant && shant.id === COF['b-shant'], 'each coffee once (Maceo\'s own record of Shantawene, not Aidan\'s copy too)');
  ok(alch && alch.id === COF['b-alch'] && !list.some(c => c.name === 'Old Bag'), 'coffees he has brewed are on his shelf (Aidan\'s Alchemy); deleted ones aren\'t');
  ok(list[0] && list[0].name === 'Shantawene', `most recently brewed first (${list.map(c => c.name).join(', ')})`);
  // (his latest espresso on it is the machine shot whose dose a later send made 18.5, in part 4)
  ok(shant && shant.last && shant.last.grind === '12D' && Number(shant.last.dose_g) === 18.5 && Number(shant.last.yield_g) === 36.4 && !list.some(c => c.last && c.last.grind === '3B'),
     `the last shot is his own (grind 12D), never Aidan's later one (3B) (${JSON.stringify(shant && shant.last)})`);
  ok(alch && alch.last && alch.last.grind === '10E', 'the last shot on Alchemy: his hand-logged one (10E)');
  ok(Object.keys(shant || {}).sort().join() === 'id,last,name,roaster' && shant.roaster === 'Deeper Roots Coffee', 'each coffee: id, name, roaster and last');
  sy = await sync('f'.repeat(64));
  ok(sy.status === 401 && sy.body.ok === false, 'machine-sync with a wrong token: 401');
  sy = await sync(TOKEN, 'POST');
  ok(sy.status === 405, 'machine-sync with POST: 405');
  ok(one(`select last_seen_at > now() - interval '1 minute' from machines where token_hash = internal.token_hash('${TOKEN}')`) === 't', 'the machine\'s last-seen time is kept');

  // ---------------------------------------------------------------- 9. grind text, your data, leaving
  const g = JSON.parse(one(`select jsonb_build_array(internal.shot_grind('12.0D'), internal.shot_grind('12.5D'), internal.shot_grind('12.0'), internal.shot_grind('8H'), internal.shot_grind(''), internal.shot_grind(null), internal.shot_grind('12.00e'))`));
  ok(JSON.stringify(g) === JSON.stringify(['12D', '12.5D', '12', '8H', null, null, '12e']), `grind text: 12.0D → 12D, 12.5D stays, 12.0 → 12, 8H stays (${JSON.stringify(g)})`);
  const ex = call('maceo', 'select export_my_data();');
  ok(ex && ex.machines.length === 1 && ex.machines[0].name === 'Maceo\'s Gaggia' && !JSON.stringify(ex.machines).includes('token') && ex.shots.length >= 8 && ex.shots[0].shot.samples,
     `Download my data includes his machine (never its token) and every shot (${ex && ex.shots.length})`);
  // too many sends
  let limited = null;
  for (let i = 0; i < 120 && !limited; i++) { const x = await send(TOKEN, shotOf(S5, { status: 'post', started_at: iso(now - 5 * 60e3), ended_at: iso(now - 5 * 60e3 + 29e3) })); if (x.status !== 200) limited = x; }
  ok(limited && limited.status === 422 && /Too many sends/.test(limited.body.error), `a machine sending far too fast is held back: 422 (${limited && limited.body.error})`);
  psql(`delete from internal.rate_log where kind = 'shot'`);
  // leaving: the account goes, its machines and shots with it
  ok(call('aidan', `select delete_account('Aidan');`) === 'deleted' && one(`select count(*) from machines where owner_id = '${P.Aidan}'`) === '0' && one(`select count(*) from shots where owner_id = '${P.Aidan}'`) === '0', 'deleting an account deletes its machines and shots');
  r = await send(TOKEN_AIDAN, shotOf('cccccccc-1111-4111-8111-000000000001'));
  ok(r.status === 401, '...and its machine\'s token stops working');

  psql(`drop database if exists ${DB}`, 'postgres');
  console.log(fails ? `${fails} shot checks FAILED` : 'all shot checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
