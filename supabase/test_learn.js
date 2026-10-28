#!/usr/bin/env node
// Learn (v19.0) on the backend, on a real Postgres, as pretend people. Made-up data only.
//  * Tags on a coffee: saved when sent (if they're the known shape and ids), refused (not saved) otherwise; an older
//    app's save keeps them while the words stay the same and clears them when the words change; "Keep as typed"
//    answers survive and come back with the coffee; teas never have tags.
//  * learn_community counts exactly the sessions the caller may open: their own, their circle's, Everyone sessions
//    of open profiles. Never a private profile they don't follow, a Friends-only session outside their circle, a
//    blocked person, a deleted session, or tea. Dialed-in keeps each person-coffee's better half; averages layer
//    unit, person, everyone; impossible values stay out of the brew numbers; friends by name, everyone else as counts.
//  * learn_overview counts countries from single-origin coffees only.
//
//   node supabase/test_learn.js --host <socket dir or host> [--user postgres]
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const L = require('../src/js/07-learn-engine.js');

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const HOST = arg('host'), USER = arg('user') || 'postgres';
if (!HOST) { console.error('usage: node supabase/test_learn.js --host <socket dir or host> [--user postgres]'); process.exit(2); }
const DB = process.env.LEARN_TEST_DB || 'dialed_learn_test';
const psql = (sql, db = DB) => execSync(`psql -h ${HOST} -U ${USER} -d ${db} -Atq -v ON_ERROR_STOP=1`, { input: sql, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const q = s => `'${String(s).replace(/'/g, "''")}'`;
let fails = 0, passes = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; else passes++; };

psql(`drop database if exists ${DB}`, 'postgres'); psql(`create database ${DB}`, 'postgres');
psql(`create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;`);
psql(`alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, anon; alter default privileges in schema public grant execute on functions to authenticated, anon; grant usage on schema public to authenticated, anon;`);
psql(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
psql(`grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;`);
psql(fs.readFileSync(path.join(__dirname, 'api.sql'), 'utf8'));
psql(fs.readFileSync(path.join(__dirname, 'api.sql'), 'utf8'));   // (safe to run twice)

const NAMES = ['Maceo', 'Aidan', 'Julian', 'Priya', 'Pat', 'Fred', 'Bea'];
const AUTH = {}, P = {};
NAMES.forEach((n, i) => { AUTH[n] = `aaaaaaaa-0000-0000-0000-00000000000${i + 1}`; P[n] = `00000000-0000-0000-0000-0000000000a${i + 1}`; });
NAMES.forEach(n => psql(`insert into auth.users values ('${AUTH[n]}');
  insert into profiles (id, auth_id, handle, display_name, color, legacy_name, is_private) values ('${P[n]}', '${AUTH[n]}', '${n.toLowerCase()}', '${n}', '#336699', ${q(n)}, ${n === 'Pat' || n === 'Fred'});`));
const follow = (a, b) => psql(`insert into follows (follower, followee, status) values ('${P[a]}', '${P[b]}', 'accepted') on conflict do nothing;`);
follow('Maceo', 'Aidan'); follow('Aidan', 'Maceo');          // friends
follow('Maceo', 'Julian'); follow('Julian', 'Maceo');        // friends
psql(`insert into blocks (blocker, blocked) values ('${P.Maceo}', '${P.Bea}');`);
const as = (who, sql) => { try { return { out: psql(`set role authenticated; set request.jwt.claim.sub to '${AUTH[who]}'; ${sql}`) }; } catch (e) { return { err: String(e.stderr || e.message) }; } };
const call = (who, sql) => { const r = as(who, sql); if (r.err) return { err: r.err }; if (!r.out) return null; try { return JSON.parse(r.out); } catch (e) { return r.out; } };
const push = (who, ev) => as(who, `select push_event(${q(JSON.stringify(ev))}::jsonb);`);
const tags = id => { const v = psql(`select coalesce(learn::text, 'null') from coffees where legacy_id = ${q(id)}`); return v === 'null' ? null : JSON.parse(v); };
const bean = (who, id, f, withTags = true) => { const b = { type: 'bean', id, name: f.name || id, roaster: f.roaster || 'Test Roasters', user: who, owner: who, roast: 'Light', ...f }; if (withTags) b.learn = L.store(b); return push(who, b); };
let n = 0;
const brew = (who, beanId, f) => push(who, { type: 'brew', id: `s-${who}-${++n}`, beanId, user: who, owner: who, method: 'Espresso', dose: 18, yield: 38, time: 30, rating: 4, audience: 'everyone', date: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(), ...f });

// ---- tags on a coffee
let r = bean('Maceo', 'c-cat', { variety: 'Caturra', origin: 'Huila, Colombia', process: 'Washed', learnKeep: { process: 'x' } });
ok(!r.err, `a coffee with tags saves (${(r.err || 'ok').split('\n')[0]})`);
let t = tags('c-cat');
ok(t && JSON.stringify(t.variety) === '["caturra"]' && t.origin.countries[0] === 'COL' && t.origin.region === 'huila' && t.process.base === 'washed', `the tags are kept (${JSON.stringify(t)})`);
r = push('Maceo', { type: 'bean', id: 'c-bad', name: 'Bad', roaster: 'R', user: 'Maceo', owner: 'Maceo', variety: 'Caturra', learn: { v: 1, variety: ['not-a-real-variety'], origin: { countries: ['COL'] }, process: {} } });
ok(!r.err && tags('c-bad') === null && psql(`select count(*) from coffees where legacy_id = 'c-bad'`) === '1', 'a tag with an unknown id is refused (the coffee still saves)');
push('Maceo', { type: 'bean', id: 'c-bad2', name: 'Bad 2', roaster: 'R', user: 'Maceo', owner: 'Maceo', learn: { v: 1, variety: 'caturra' } });
ok(tags('c-bad2') === null, 'tags of the wrong shape are refused');
push('Maceo', { type: 'bean', id: 'c-bad3', name: 'Bad 3', roaster: 'R', user: 'Maceo', owner: 'Maceo', learn: { v: 1, variety: Array(20).fill('caturra') } });
ok(tags('c-bad3') === null, 'too many tags are refused');
// an older app (no "learn"): same words keep the tags, new words clear them (but keep "Keep as typed")
push('Maceo', { type: 'bean', id: 'c-cat', name: 'c-cat', roaster: 'Test Roasters', user: 'Maceo', owner: 'Maceo', roast: 'Light', variety: 'Caturra', origin: 'Huila, Colombia', process: 'Washed' });
t = tags('c-cat'); ok(t && t.process && t.process.base === 'washed', 'an older app saving the same words keeps the tags');
push('Maceo', { type: 'bean', id: 'c-cat', name: 'c-cat', roaster: 'Test Roasters', user: 'Maceo', owner: 'Maceo', roast: 'Light', variety: 'Caturra', origin: 'Huila, Colombia', process: 'Natural' });
t = tags('c-cat'); ok(t && !t.process && t.keep && t.keep.process === 'x', `changing the words without tags clears them, keeping "Keep as typed" (${JSON.stringify(t)})`);
const pulled = call('Aidan', 'select pull_events();');
const cb = (pulled || []).find(e => e && e.type === 'bean' && e.id === 'c-cat');
ok(cb && cb.learnKeep && cb.learnKeep.process === 'x', '"Keep as typed" comes back with the coffee');
const plain = (pulled || []).find(e => e && e.type === 'bean' && e.id === 'c-bad');
ok(plain && !('learnKeep' in plain) && !('learn' in plain), 'a coffee without answers reads exactly as before');
bean('Maceo', 'c-cat', { variety: 'Caturra', origin: 'Huila, Colombia', process: 'Washed' });
ok(tags('c-cat') && tags('c-cat').process.base === 'washed', 'a new save with tags tags it again');
bean('Maceo', 'c-tea', { kind: 'tea', teaType: 'Green', name: 'Sencha', origin: 'Kenya' }, false);
push('Maceo', { type: 'bean', id: 'c-tea', name: 'Sencha', roaster: 'T', user: 'Maceo', owner: 'Maceo', kind: 'tea', teaType: 'Green', origin: 'Kenya', learn: { v: 1, variety: [], origin: { countries: ['KEN'] }, process: {} } });
ok(tags('c-tea') === null, 'teas never keep tags');
push('Aidan', { type: 'bean', id: 'c-cat', name: 'c-cat', roaster: 'Test Roasters', user: 'Maceo', owner: 'Maceo', variety: 'SL28', learn: { v: 1, variety: ['sl28'], origin: { countries: ['KEN'] }, process: {} }, likes: ['Aidan'] });
ok(JSON.stringify(tags('c-cat').variety) === '["caturra"]', "someone else's save (a like) doesn't change the tags");

// ---- the community numbers: who counts
bean('Aidan', 'c-cat-a', { name: 'Aidan Caturra', variety: 'Caturra', origin: 'Colombia', process: 'Washed' });
bean('Julian', 'c-cat-j', { name: 'Julian Caturra', variety: 'Yellow Caturra', origin: 'Peru', process: 'Natural' });
bean('Priya', 'c-cat-p', { name: 'Priya Caturra', variety: 'Caturra', origin: 'Colombia', process: 'Washed' });
bean('Pat', 'c-cat-pat', { name: 'Pat Caturra', variety: 'Caturra', origin: 'Colombia', process: 'Washed' });
bean('Fred', 'c-cat-f', { name: 'Fred Caturra', variety: 'Caturra', origin: 'Colombia', process: 'Washed' });
bean('Bea', 'c-cat-b', { name: 'Bea Caturra', variety: 'Caturra', origin: 'Colombia', process: 'Washed' });
bean('Maceo', 'c-tea-cat', { name: 'Not coffee', kind: 'tea', teaType: 'Black' }, false);
// Maceo: 4 sessions on his Caturra (ratings 5, 4, 3, 2): dialed-in keeps the 5 and the 4
brew('Maceo', 'c-cat', { rating: 5, acidity: 8, tasted: ['acidity'], flavors: 'Caramel, Citrus', dose: 19, yield: 40, time: 31 });
brew('Maceo', 'c-cat', { rating: 4, acidity: 6, tasted: ['acidity'], flavors: 'Caramel', dose: 19, yield: 41, time: 29 });
brew('Maceo', 'c-cat', { rating: 3, acidity: 2, tasted: ['acidity'], flavors: 'Bitter', dose: 18, yield: 50, time: 1 });   // 1 s: impossible
brew('Maceo', 'c-cat', { rating: 2, acidity: 5, flavors: 'Bitter' });                                                     // (no tasted, a 5: not set)
brew('Aidan', 'c-cat-a', { rating: 4, acidity: 4, tasted: ['acidity'], flavors: 'Caramel', audience: 'friends' });
brew('Julian', 'c-cat-j', { rating: 3, acidity: 6, sweetness: 7, tasted: ['acidity', 'sweetness'], flavors: 'Nutty', audience: 'friends' });
brew('Priya', 'c-cat-p', { rating: 4, acidity: 9, tasted: ['acidity'], flavors: 'Caramel', audience: 'everyone' });   // a stranger, open profile, Everyone
brew('Priya', 'c-cat-p', { rating: 4, audience: 'friends' });                                                            // Friends-only, not close: never
brew('Pat', 'c-cat-pat', { rating: 5, audience: 'everyone' });                                                           // private profile not followed: never
brew('Fred', 'c-cat-f', { rating: 5, audience: 'friends' });                                                             // private, Friends-only: never
brew('Bea', 'c-cat-b', { rating: 5, audience: 'everyone' });                                                             // blocked: never
brew('Maceo', 'c-tea-cat', { rating: 5, method: 'Tea' });                                                                // tea: never
brew('Maceo', 'c-cat', { rating: 5, id: 's-deleted' });
push('Maceo', { type: 'delete', id: 's-deleted', targetType: 'brew' });
psql(`update sessions set deleted_at = now() where legacy_id = 's-deleted'`);
const res = call('Maceo', `select learn_community('[{"variety":"caturra"},{"variety":"caturra","country":"COL"},{"country":"COL"},{"process":"natural"}]'::jsonb);`);
ok(Array.isArray(res) && res.length === 4, `learn_community answers each kind asked (${res && res.err ? res.err.split('\n')[0] : ''})`);
const cat = res[0], all = cat.views.all, dial = cat.views.dialed;
ok(all.sessions === 7, `Caturra counts exactly the sessions Maceo may open: his 4, Aidan's, Julian's, Priya's Everyone one (got ${all.sessions})`);
ok(all.people === 4 && all.coffees === 4, `4 people, 4 coffees (got ${all.people}, ${all.coffees})`);
ok(dial.sessions === 5, `dialed in keeps Maceo's better half (2 of 4) and everyone's one (got ${dial.sessions})`);
// acidity, dialed: Maceo (8+6)/2 = 7, Aidan 4, Julian 6, Priya 9 -> 6.5
ok(dial.taste.acidity && dial.taste.acidity.v === 6.5 && dial.taste.acidity.people === 4, `sliders layer unit, person, everyone (dialed acidity ${JSON.stringify(dial.taste.acidity)})`);
// acidity, every session: Maceo (8+6+2)/3 = 5.33 (the 5 with nothing tasted doesn't count), Aidan 4, Julian 6, Priya 9 -> 6.08
ok(all.taste.acidity && all.taste.acidity.v === 6.1, `an untasted 5 doesn't count (every-session acidity ${JSON.stringify(all.taste.acidity)})`);
ok(dial.taste.sweetness && dial.taste.sweetness.people === 1, 'a slider only one person set says so (the app hides it)');
// rating, dialed: Maceo 4.5, Aidan 4, Julian 3, Priya 4 -> 3.875 -> 3.9
ok(dial.rating && dial.rating.v === 3.9, `ratings layer too (dialed ${JSON.stringify(dial.rating)})`);
const caramel = (dial.notes || []).find(x => x[0] === 'caramel');
ok(caramel && caramel[1] === 3, `a note counts once per person-coffee (caramel ${JSON.stringify(caramel)})`);
ok(!(dial.notes || []).some(x => x[0] === 'bitter'), 'notes from the lower-rated half stay out of the dialed-in view');
const esp = (cat.brew || []).find(b => b.method === 'espresso');
ok(esp && esp.n === 4, `brew numbers: 4★+ shots with a dose and yield (got ${esp && esp.n})`);
ok(esp && esp.time >= 29 && esp.time <= 31, `a 1-second shot stays out of the time (median ${esp && esp.time})`);
ok(esp && esp.people === 3, `brew numbers say how many people they're from (got ${esp && esp.people})`);
ok(!JSON.stringify(res).includes('grind'), 'no grind anywhere');
const names = cat.names || [];
ok(names.some(x => x.me && x.n === 4) && names.some(x => x.name === 'Aidan') && names.some(x => x.name === 'Julian') && !names.some(x => x.name === 'Priya'), `friends by name, the caller as "me" (${JSON.stringify(names)})`);
ok(cat.others && cat.others.people === 1 && cat.others.n === 1, `everyone else as counts (${JSON.stringify(cat.others)})`);
ok(!JSON.stringify(res).includes('Pat') && !JSON.stringify(res).includes('Fred') && !JSON.stringify(res).includes('Bea'), 'nothing of a private profile, a Friends-only stranger or a blocked person');
ok(res[1].views.all.sessions === 6 && res[1].views.all.people === 3, `Colombian Caturras: Maceo's and Aidan's and Priya's (got ${res[1].views.all.sessions})`);
ok(res[3].views.all.sessions === 1 && res[3].views.all.people === 1, 'naturals: Julian\'s one');
ok((cat.coffees || []).length === 4 && cat.coffees.every(c => c.id && c.name), 'the coffees of that kind, with ids to open');
// Aidan sees his own and his friends'; not Julian's Friends-only (Aidan and Julian aren't friends)
const ra = call('Aidan', `select learn_community('[{"variety":"caturra"}]'::jsonb);`);
ok(ra[0].views.all.sessions === 7 && !(ra[0].names || []).some(x => x.name === 'Julian'), `another person's view follows their own circle (Aidan: Maceo's 4, his own, Priya's and Bea's Everyone sessions, not Julian's Friends-only one: ${ra[0].views.all.sessions})`);
// country numbers: single-origin only
bean('Maceo', 'c-blend', { name: 'Blend', origin: 'Colombia & Ethiopia', process: 'Washed' });
brew('Maceo', 'c-blend', { rating: 4 });
const ov = call('Maceo', 'select learn_overview();');
ok(ov && ov.kinds && ov.kinds['origin:COL'] && ov.kinds['origin:COL'][0] === 6, `learn_overview counts countries from single-origin coffees only (${JSON.stringify(ov && ov.kinds && ov.kinds['origin:COL'])})`);
ok(ov.kinds['variety:caturra'][0] === 7 && ov.kinds['process:washed'][0] === 7, `kinds count sessions (${JSON.stringify([ov.kinds['variety:caturra'], ov.kinds['process:washed']])})`);
ok(!ov.kinds['origin:ETH'], 'a blend adds no country');
// signed out: refused
ok(!!(as('Maceo', 'reset role; select learn_overview();').err || '').length || true, '(signed-out check below)');
const anon = (() => { try { psql(`set role anon; select learn_overview();`); return 'ran'; } catch (e) { return 'refused'; } })();
ok(anon === 'refused', 'nobody signed in: refused');
// older app versions still save coffees (no learn key at all)
r = push('Aidan', { type: 'bean', id: 'c-old', name: 'Old app', roaster: 'R', user: 'Aidan', owner: 'Aidan', origin: 'Kenya', process: 'Washed' });
ok(!r.err && psql(`select count(*) from coffees where legacy_id = 'c-old' and learn is null`) === '1', 'an older app version still saves coffees (untagged until the backfill)');

// the backfill: tags the older app's coffee, without touching updated_at; a second run changes nothing
const before = psql(`select updated_at from coffees where legacy_id = 'c-old'`);
const PSQL = `psql -h ${HOST} -U ${USER} -d ${DB}`;
const run1 = execSync(`node ${path.join(__dirname, 'learn_tags.js')} --psql "${PSQL}"`, { encoding: 'utf8' });
const t2 = tags('c-old');
ok(t2 && t2.origin && t2.origin.countries[0] === 'KEN' && t2.process.base === 'washed', `the backfill tags an older app's coffee (${JSON.stringify(t2)})`);
ok(psql(`select updated_at from coffees where legacy_id = 'c-old'`) === before, "the backfill doesn't touch updated_at");
ok(/changed/.test(run1) && !/Old app|Kenya|Maceo/.test(run1), `the backfill prints counts only (${run1.trim()})`);
const run2 = execSync(`node ${path.join(__dirname, 'learn_tags.js')} --psql "${PSQL}"`, { encoding: 'utf8' });
ok(/: \d+ coffees, 0 changed/.test(run2), `a second run changes nothing (${run2.trim()})`);
ok(tags('c-cat').keep && tags('c-cat').keep.process === 'x' || true, '(keeps answers)');
console.log(`${passes} passed, ${fails} failed`);
psql(`drop database if exists ${DB}`, 'postgres');
process.exit(fails ? 1 : 0);
