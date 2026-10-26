#!/usr/bin/env node
// Checks a coffee's picture on the backend (v17.4) on a real Postgres, as pretend people: the color and the photo the
// owner picks are saved on the coffee and come back to friends; a save from a version before pictures (no "cover") and
// someone else's like leave it as it was; a photo has to be in the saver's own folder; odd values are dropped; removing
// the photo keeps the color. Made-up data only.
//
//   node supabase/test_cover.js --host <socket dir or host> [--user postgres]
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const HOST = arg('host'), USER = arg('user') || 'postgres';
if (!HOST) { console.error('usage: node supabase/test_cover.js --host <socket dir or host> [--user postgres]'); process.exit(2); }
const DB = process.env.COVER_TEST_DB || 'dialed_cover_test';
const psql = (sql, db = DB) => execSync(`psql -h ${HOST} -U ${USER} -d ${db} -Atq -v ON_ERROR_STOP=1`, { input: sql, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const q = s => `'${String(s).replace(/'/g, "''")}'`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

psql(`drop database if exists ${DB}`, 'postgres'); psql(`create database ${DB}`, 'postgres');
psql(`create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;`);
psql(`alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, anon; alter default privileges in schema public grant execute on functions to authenticated, anon; grant usage on schema public to authenticated, anon;`);
psql(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
psql(`grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;`);
psql(fs.readFileSync(path.join(__dirname, 'api.sql'), 'utf8'));
psql(fs.readFileSync(path.join(__dirname, 'api.sql'), 'utf8'));   // (api.sql runs again on every release: it must be safe twice)

const AUTH = { maceo: 'aaaaaaaa-0000-0000-0000-000000000001', aidan: 'aaaaaaaa-0000-0000-0000-000000000002' };
const P = { Maceo: '00000000-0000-0000-0000-0000000000a1', Aidan: '00000000-0000-0000-0000-0000000000a2' };
Object.entries(P).forEach(([n, id]) => psql(`insert into auth.users values ('${AUTH[n.toLowerCase()]}');
  insert into profiles (id, auth_id, handle, display_name, color, legacy_name) values ('${id}', '${AUTH[n.toLowerCase()]}', '${n.toLowerCase()}', '${n}', '#336699', ${q(n)});`));
psql(`insert into follows (follower, followee, status) values ('${P.Maceo}', '${P.Aidan}', 'accepted'), ('${P.Aidan}', '${P.Maceo}', 'accepted');`);
const as = (who, sql) => { try { return { out: psql(`set role authenticated; set request.jwt.claim.sub to '${AUTH[who]}'; ${sql}`) }; } catch (e) { return { err: String(e.stderr || e.message) }; } };
const call = (who, sql) => { const r = as(who, sql); if (r.err) return { err: r.err }; if (!r.out) return null; try { return JSON.parse(r.out); } catch (e) { return r.out; } };
const push = (who, ev) => as(who, `select push_event(${q(JSON.stringify(ev))}::jsonb);`);
const pull = who => call(who, 'select pull_events();');
const cover = id => { const v = psql(`select coalesce(cover::text, 'null') from coffees where legacy_id = ${q(id)}`); return v === 'null' ? null : JSON.parse(v); };
const beanIn = (events, id) => (events || []).find(e => e && e.type === 'bean' && String(e.id) === id);
const myPhoto = `${AUTH.maceo}/c0123456789abcdef01.jpg`, theirPhoto = `${AUTH.aidan}/c0123456789abcdef02.jpg`;
const base = { type: 'bean', id: 'b-pic', name: 'Picture Perfect', roaster: 'Cover Test Roasters', origin: 'Ethiopia', roast: 'Light', user: 'Maceo', owner: 'Maceo' };

// a new coffee with a color
let r = push('maceo', { ...base, cover: { hue: 215, tone: 60 } });
ok(!r.err, `a coffee with a picture color saves (${(r.err || 'ok').split('\n')[0]})`);
ok(JSON.stringify(cover('b-pic')) === '{"hue":215,"tone":60}', `the color is kept on the coffee (${JSON.stringify(cover('b-pic'))})`);
let got = beanIn(pull('aidan'), 'b-pic');
ok(got && got.cover && got.cover.hue === 215 && got.cover.tone === 60, `a friend reads the same picture (${got && JSON.stringify(got.cover)})`);
// a photo in your own folder
push('maceo', { ...base, cover: { hue: 40, tone: 72, photo: myPhoto } });
ok(JSON.stringify(cover('b-pic')) === JSON.stringify({ hue: 40, tone: 72, photo: myPhoto }), 'a photo in your own folder is saved with its color');
got = beanIn(pull('aidan'), 'b-pic');
ok(got && got.cover && got.cover.photo === myPhoto, 'a friend gets the photo too');
// an older version's save (no "cover") leaves it; someone else's like leaves it
push('maceo', { ...base, likes: [] });
ok(cover('b-pic') && cover('b-pic').photo === myPhoto, 'a save from a version before pictures (no "cover") leaves the picture as it was');
push('aidan', { ...base, likes: ['Aidan'], cover: { hue: 1, tone: 1 } });
ok(cover('b-pic') && cover('b-pic').hue === 40 && cover('b-pic').photo === myPhoto, "someone else's save (a like) doesn't change the picture");
ok(psql(`select count(*) from coffee_likes l join coffees k on k.id = l.coffee_id where k.legacy_id = 'b-pic'`) === '1', '(the like itself counts)');
// a photo in someone else's folder, or an odd path, is dropped; odd numbers are dropped
push('maceo', { ...base, id: 'b-pic2', cover: { hue: 10, tone: 50, photo: theirPhoto } });
ok(cover('b-pic2') && !('photo' in cover('b-pic2')) && cover('b-pic2').hue === 10, "a photo in someone else's folder is never saved (the color is)");
push('maceo', { ...base, id: 'b-pic3', cover: { hue: 'red', tone: 500, photo: `${AUTH.maceo}/../x.jpg` } });
ok(cover('b-pic3') === null, `odd values are dropped (${JSON.stringify(cover('b-pic3'))})`);
push('maceo', { ...base, id: 'b-pic4', cover: { hue: 359.6, tone: 99.7 } });
ok(JSON.stringify(cover('b-pic4')) === '{"hue":0,"tone":100}', `colors are whole numbers, all the way round (${JSON.stringify(cover('b-pic4'))})`);
push('maceo', { ...base, id: 'b-pic5', cover: 'blue' });
ok(cover('b-pic5') === null, 'a picture that is not a {hue, tone, photo} is dropped');
// removing the photo keeps the color
push('maceo', { ...base, cover: { hue: 40, tone: 72 } });
ok(JSON.stringify(cover('b-pic')) === '{"hue":40,"tone":72}', 'removing the photo keeps the color');
// a coffee without a picture reads as before (no "cover" key)
push('maceo', { type: 'bean', id: 'b-plain', name: 'Plain', roaster: 'R', user: 'Maceo', owner: 'Maceo' });
got = beanIn(pull('aidan'), 'b-plain');
ok(got && !('cover' in got), 'a coffee without a picture comes back exactly as before (no "cover")');
// the change shows up in the data version (so phones download it)
const v1 = call('aidan', 'select data_version();');
push('maceo', { ...base, cover: { hue: 120, tone: 60 } });
const v2 = call('aidan', 'select data_version();');
ok(v1 !== v2, 'changing a picture moves the data version (phones fetch it)');

psql(`drop database if exists ${DB}`, 'postgres');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
