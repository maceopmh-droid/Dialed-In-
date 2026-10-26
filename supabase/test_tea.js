#!/usr/bin/env node
// Checks tea on the backend (v17.0) on a real Postgres, as pretend people: a coffee item can be a tea (kind 'tea' with
// its type), it saves and comes back as a tea, a save from a version before tea leaves it a tea, a coffee reads exactly
// as before, tea sessions keep their leaf / water / temperature / steeps, the shared list of coffees keeps teas apart,
// and an espresso machine's picker never lists teas. Made-up data only.
//
//   node supabase/test_tea.js --host <socket dir or host> [--user postgres]
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const HOST = arg('host'), USER = arg('user') || 'postgres';
if (!HOST) { console.error('usage: node supabase/test_tea.js --host <socket dir or host> [--user postgres]'); process.exit(2); }
const DB = process.env.TEA_TEST_DB || 'dialed_tea_test';
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

const AUTH = { maceo: 'aaaaaaaa-0000-0000-0000-000000000001', aidan: 'aaaaaaaa-0000-0000-0000-000000000002' };
const P = { Maceo: '00000000-0000-0000-0000-0000000000a1', Aidan: '00000000-0000-0000-0000-0000000000a2' };
Object.entries(P).forEach(([n, id]) => psql(`insert into auth.users values ('${AUTH[n.toLowerCase()]}');
  insert into profiles (id, auth_id, handle, display_name, color, legacy_name) values ('${id}', '${AUTH[n.toLowerCase()]}', '${n.toLowerCase()}', '${n}', '#336699', ${q(n)});`));
psql(`insert into follows (follower, followee, status) values ('${P.Maceo}', '${P.Aidan}', 'accepted'), ('${P.Aidan}', '${P.Maceo}', 'accepted');`);
const as = (who, sql) => { try { return { out: psql(`set role authenticated; set request.jwt.claim.sub to '${AUTH[who]}'; ${sql}`) }; } catch (e) { return { err: String(e.stderr || e.message) }; } };
const call = (who, sql) => { const r = as(who, sql); if (r.err) return { err: r.err }; if (!r.out) return null; try { return JSON.parse(r.out); } catch (e) { return r.out; } };
const push = (who, ev) => as(who, `select push_event(${q(JSON.stringify(ev))}::jsonb);`);
const pull = who => call(who, 'select pull_events();');
const one = sql => psql(sql);
const beanIn = (events, id) => (events || []).find(e => e && e.type === 'bean' && String(e.id) === id);
const brewIn = (events, id) => (events || []).find(e => e && e.type === 'brew' && String(e.id) === id);

// a tea and a coffee, as the app saves them
let r = push('maceo', { type: 'bean', id: 't-longjing', kind: 'tea', teaType: 'Green', name: 'Long Jing', roaster: 'Mountain Leaf Tea Co.', origin: 'Zhejiang, China', variety: 'Longjing #43', process: 'Pan-fired', roast: '', user: 'Maceo', owner: 'Maceo' });
ok(!r.err, `a tea saves (${(r.err || 'ok').split('\n')[0]})`);
push('maceo', { type: 'bean', id: 'b-alch', name: 'Alchemy', roaster: 'Deeper Roots Coffee', origin: 'Ethiopia', roast: 'Light', user: 'Maceo', owner: 'Maceo' });
ok(one(`select kind || '|' || tea_type || '|' || name || '|' || roaster_text || '|' || coalesce(roast, 'none') from coffees where legacy_id = 't-longjing'`) === 'tea|Green|Long Jing|Mountain Leaf Tea Co.|none',
   'it is stored as a tea, type Green, under its company, with no roast');
ok(one(`select kind || '|' || coalesce(tea_type, 'none') from coffees where legacy_id = 'b-alch'`) === 'coffee|none', 'a coffee is a coffee (the default)');
let ev = pull('aidan');
const tea = beanIn(ev, 't-longjing'), cof = beanIn(ev, 'b-alch');
ok(tea && tea.kind === 'tea' && tea.teaType === 'Green' && tea.name === 'Long Jing' && tea.variety === 'Longjing #43', `a friend gets it back as a tea (${tea && JSON.stringify({ kind: tea.kind, teaType: tea.teaType })})`);
ok(cof && !('kind' in cof) && !('teaType' in cof), 'a coffee comes back exactly as before (no kind, no tea type)');

// a version from before tea likes or comments on it (its save has no "kind"): it stays a tea
r = push('maceo', { type: 'bean', id: 't-longjing', name: 'Long Jing', roaster: 'Mountain Leaf Tea Co.', origin: 'Zhejiang, China', variety: 'Longjing #43', process: 'Pan-fired', roast: 'Light', likes: ['Maceo'], user: 'Maceo', owner: 'Maceo' });
ok(one(`select kind || '|' || tea_type from coffees where legacy_id = 't-longjing'`) === 'tea|Green', 'a save from a version before tea (no "kind") leaves it a tea, type kept');
// the owner turns it into a coffee and back (a wrong pick fixed)
push('maceo', { type: 'bean', id: 't-longjing', kind: 'coffee', name: 'Long Jing', roaster: 'Mountain Leaf Tea Co.', user: 'Maceo', owner: 'Maceo' });
ok(one(`select kind || '|' || coalesce(tea_type, 'none') from coffees where legacy_id = 't-longjing'`) === 'coffee|none', 'switched to coffee by its owner: a coffee, no tea type');
push('maceo', { type: 'bean', id: 't-longjing', kind: 'tea', teaType: 'Green', name: 'Long Jing', roaster: 'Mountain Leaf Tea Co.', origin: 'Zhejiang, China', variety: 'Longjing #43', process: 'Pan-fired', user: 'Maceo', owner: 'Maceo' });
ok(one(`select kind || '|' || tea_type from coffees where legacy_id = 't-longjing'`) === 'tea|Green', '...and back to a tea');
// someone else can't change it
push('aidan', { type: 'bean', id: 't-longjing', kind: 'coffee', name: 'Hacked', roaster: 'X', user: 'Maceo', owner: 'Maceo' });
ok(one(`select kind || '|' || name from coffees where legacy_id = 't-longjing'`) === 'tea|Long Jing', 'someone else can\'t change it into a coffee (or rename it)');
// types: only the seven, written the app's way
const types = JSON.parse(one(`select jsonb_build_array(internal.tea_type('green'), internal.tea_type(' OOLONG '), internal.tea_type('pu-erh'), internal.tea_type('Matcha'), internal.tea_type('herbal'), internal.tea_type('rooibos'), internal.tea_type(''), internal.tea_type(null))`));
ok(JSON.stringify(types) === JSON.stringify(['Green', 'Oolong', 'Pu-erh', 'Matcha', 'Herbal', null, null, null]), `tea types: the eight, written the app's way (rooibos is herbal's job, not its own type: ${JSON.stringify(types)})`);

// v17.1: your own blend (no brand) and what's in it, a shelf tea linked by id
r = push('maceo', { type: 'bean', id: 't-blend', kind: 'tea', teaType: 'Herbal', blend: true, name: 'Garden Immunity', roaster: '', ingredients: [{ name: ' Lemon balm ', ref: '' }, { name: 'Echinacea root' }, { name: 'Lemon Ginger', ref: 't-pukka' }, { name: '' }, 'junk'], user: 'Maceo', owner: 'Maceo' });
ok(!r.err, `a blend saves (${(r.err || 'ok').split('\n')[0]})`);
ok(one(`select kind || '|' || tea_type || '|' || coalesce(roaster_text, 'none') || '|' || tea::text from coffees where legacy_id = 't-blend'`) === 'tea|Herbal|none|{"blend": true, "ingredients": [{"name": "Lemon balm"}, {"name": "Echinacea root"}, {"ref": "t-pukka", "name": "Lemon Ginger"}]}',
   'stored as an herbal tea with no brand: the blend flag and three ingredients (blank ones dropped, names trimmed, the shelf tea\'s id kept)');
let bl = beanIn(pull('aidan'), 't-blend');
ok(bl && bl.blend === true && bl.roaster === '' && JSON.stringify(bl.ingredients) === '[{"name":"Lemon balm"},{"name":"Echinacea root"},{"ref":"t-pukka","name":"Lemon Ginger"}]', `a friend gets it back as your blend, with what's in it (${bl && JSON.stringify({ blend: bl.blend, ing: bl.ingredients })})`);
push('maceo', { type: 'bean', id: 't-blend', kind: 'tea', teaType: 'Herbal', name: 'Garden Immunity', roaster: 'Unknown Brand', likes: [], user: 'Maceo', owner: 'Maceo' });
ok(one(`select jsonb_array_length(tea->'ingredients')::text || '|' || (tea->>'blend') from coffees where legacy_id = 't-blend'`) === '3|true', 'a save from v17.0 (no "ingredients") leaves the blend and its ingredients alone');
push('maceo', { type: 'bean', id: 't-blend', kind: 'tea', teaType: 'Herbal', name: 'Garden Immunity', roaster: '', ingredients: [], user: 'Maceo', owner: 'Maceo' });
ok(one(`select coalesce(tea::text, 'none') from coffees where legacy_id = 't-blend'`) === 'none', 'clearing it (not a blend, nothing listed) leaves nothing behind');
push('maceo', { type: 'bean', id: 't-many', kind: 'tea', name: 'Many', roaster: 'X', ingredients: Array.from({ length: 30 }, (_, i) => ({ name: 'x'.repeat(100) + i })), user: 'Maceo', owner: 'Maceo' });
ok(one(`select jsonb_array_length(tea->'ingredients')::text || '|' || max(char_length(e->>'name'))::text from coffees, jsonb_array_elements(tea->'ingredients') e where legacy_id = 't-many' group by tea`) === '20|60', 'at most 20 ingredients, 60 letters each');
push('maceo', { type: 'bean', id: 't-blend2', kind: 'tea', teaType: 'Herbal', blend: true, name: 'Long Jing Garden', roaster: '', ingredients: [{ name: 'Mint' }], user: 'Maceo', owner: 'Maceo' });
ok(!(call('aidan', `select coffee_catalog('long jing garden', 8);`) || []).some(x => x.name === 'Long Jing Garden'), 'someone\'s own blend never shows up in the shared list of coffees and teas');
ok(!('ingredients' in (beanIn(pull('aidan'), 'b-alch') || {})) && !('blend' in (beanIn(pull('aidan'), 'b-alch') || {})), 'a coffee still comes back exactly as before (no blend, no ingredients)');
push('maceo', { type: 'bean', id: 't-odd', kind: 'tea', teaType: 'Hot chocolate', name: 'Mystery', roaster: 'Somewhere', user: 'Maceo', owner: 'Maceo' });
ok(one(`select kind || '|' || coalesce(tea_type, 'none') from coffees where legacy_id = 't-odd'`) === 'tea|none', 'a type that isn\'t a tea type is dropped (the tea is kept)');
push('maceo', { type: 'bean', id: 't-noname', kind: 'tea', name: '', roaster: 'Somewhere', user: 'Maceo', owner: 'Maceo' });
ok(one(`select name from coffees where legacy_id = 't-noname'`) === 'Tea', 'a tea saved with no name is called "Tea" (a coffee is called "Coffee")');

// a tea session: leaf, water, temperature, steep time and every steep come back
r = push('maceo', { type: 'brew', id: '1762000000001', beanId: 't-longjing', method: 'Gongfu', grind: '', dose: 5, yield: 100, time: 15, temp: 80, steeps: [15, 20, 25, 35], rating: 4.5,
  acidity: 3, sweetness: 7, body: 6, finish: 8, balance: 7, bitterness: 2, tasted: ['acidity', 'sweetness', 'finish'], flavors: 'Chestnut,Sweet pea', user: 'Maceo', owner: 'Maceo', audience: 'friends', date: '2026-10-24T15:00:00Z' });
ok(!r.err, `a tea session saves (${(r.err || 'ok').split('\n')[0]})`);
const s = brewIn(pull('aidan'), '1762000000001');
ok(s && s.method === 'Gongfu' && s.dose === 5 && s.yield === 100 && s.time === 15 && s.temp === 80 && JSON.stringify(s.steeps) === '[15,20,25,35]' && s.rating === 4.5,
   `it comes back with leaf, water, temperature and every steep (${s && JSON.stringify({ method: s.method, dose: s.dose, yield: s.yield, time: s.time, temp: s.temp, steeps: s.steeps })})`);
ok(s && !s.grind && s.acidity === 3 && JSON.stringify(s.tasted) === '["acidity","sweetness","finish"]', 'no grind; its taste (astringency in the acidity slot) and the sliders tasted');
ok(one(`select (coffee_id is not null)::text || '|' || (extras ? 'steeps')::text from sessions where legacy_id = '1762000000001'`) === 'true|true', 'linked to the tea; the steeps kept with the session');
// v17.1: a cup of several things, simmered (minutes): what went in, with amounts, comes back as saved
r = push('maceo', { type: 'brew', id: '1762000000002', beanId: 't-blend', method: 'Simmered', grind: '', dose: 3, yield: 400, time: 12, timeUnit: 'm', milk: 0, rating: 4,
  mix: [{ name: 'Lemon Ginger', amount: 1, unit: 'bag', ref: 't-pukka' }, { name: 'Lemon balm', amount: 2, unit: 'g' }, { name: 'Echinacea root', amount: 1, unit: 'g' }, { name: 'Honey', amount: 1, unit: 'tsp' }],
  user: 'Maceo', owner: 'Maceo', audience: 'friends', date: '2026-10-25T20:00:00Z' });
ok(!r.err, `a simmered blend saves (${(r.err || 'ok').split('\n')[0]})`);
const s2 = brewIn(pull('aidan'), '1762000000002');
ok(s2 && s2.method === 'Simmered' && s2.time === 12 && s2.timeUnit === 'm' && Array.isArray(s2.mix) && s2.mix.length === 4 && s2.mix[0].unit === 'bag' && s2.mix[1].amount === 2 && s2.mix[3].name === 'Honey',
   `it comes back with every thing in the cup and its amount, timed in minutes (${s2 && JSON.stringify({ m: s2.method, t: s2.time, u: s2.timeUnit, mix: s2.mix })})`);

// the shared list of coffees (typing a new one suggests ones people logged): teas carry their kind and never merge with coffees
push('aidan', { type: 'bean', id: 't-longjing-a', kind: 'tea', teaType: 'Green', name: 'Long Jing', roaster: 'Mountain Leaf Tea Co.', user: 'Aidan', owner: 'Aidan' });
push('aidan', { type: 'bean', id: 'b-longjing-a', name: 'Long Jing', roaster: 'Mountain Leaf Tea Co.', user: 'Aidan', owner: 'Aidan' });   // (someone logged it as a coffee)
const cat = call('aidan', `select coffee_catalog('long jing', 8);`);
const teaRow = (cat || []).find(x => x.kind === 'tea'), cofRow = (cat || []).find(x => x.kind === 'coffee');
ok(teaRow && teaRow.people === 2 && teaRow.teaType === 'Green' && cofRow && cofRow.people === 1, `"long jing": the tea (2 people, Green) and the coffee record kept apart (${JSON.stringify(cat)})`);

// an espresso machine's picker lists coffees only
const tok = one(`select internal.add_machine('${P.Maceo}', 'Maceo''s Gaggia');`);
const ms = JSON.parse(one(`select internal.machine_sync(${q(tok)});`));
ok(ms.status === 200 && ms.coffees.some(c => c.name === 'Alchemy') && !ms.coffees.some(c => /Long Jing|Mystery/.test(c.name)), `the machine's coffee list has Alchemy and no teas (${ms.coffees.map(c => c.name).join(', ')})`);

// Download my data has the tea's kind
const ex = call('maceo', 'select export_my_data();');
ok(ex && JSON.stringify(ex).includes('"kind": "tea"') || JSON.stringify(ex).includes('"kind":"tea"'), 'Download my data includes that it\'s a tea');

psql(`drop database if exists ${DB}`, 'postgres');
console.log(fails ? `${fails} tea checks FAILED` : 'all tea checks passed');
process.exit(fails ? 1 : 0);
