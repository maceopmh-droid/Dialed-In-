#!/usr/bin/env node
// The parity check: does the new database hold exactly the history the app has today?
//
//   node supabase/parity.js --html index.html --rows rows.json --psql "psql -h HOST -U USER -d DB"
//
// 1. The app replays the Sheet (rows.json) the normal way.
// 2. The database's tables are turned back into Sheet-style events and the app replays those too.
// 3. Every coffee, session, comment, like, note, photo, piece of equipment, custom note and goal switch is
//    compared field by field. Prints only ids and field names (never anyone's notes), and exits 1 on any difference.
const fs = require('fs');
const { execSync } = require('child_process');
const { loadApp } = require('./lib/app_in_node');

// events from Sheet rows (column G, index 6)
const eventsFromRows = rows => rows.map(r => Array.isArray(r) ? r[6] : null).filter(x => typeof x === 'string' && x[0] === '{')
  .map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean);

// returns { compared, diffs, known }; `events` is what the app gets from the Sheet today. The other side is the
// database's tables turned back into events, or `eventsB` when given (e.g. what pull_events returned to someone).
function runParity({ html, events, psql, knownHistory = false, eventsB = null, viewer = null }) {
const HTML = html;
const sql = s => { if (eventsB) return []; const t = execSync(`${psql} -Atq -v ON_ERROR_STOP=1`, { input: s, encoding: 'utf8', maxBuffer: 1 << 28 }).trim(); return t ? JSON.parse(t) : []; };

// ---- 1. today
const A = loadApp(HTML); A.user = ''; A.process(events);

// ---- 2. from the database back to events
const people = new Map(sql(`select coalesce(json_agg(json_build_object('id', id, 'name', legacy_name)), '[]') from profiles;`).map(p => [p.id, p.name]));
const name = id => people.get(id) || '';
const comments = sql(`select coalesce(json_agg(c order by c.created_at, c.legacy_ref), '[]') from (select c.id, c.legacy_ref, c.session_id, c.coffee_id, c.author_id, c.body, c.created_at,
  (select legacy_ref from comments p where p.id = c.parent_id) as parent_ref,
  coalesce((select json_agg(l.user_id) from comment_likes l where l.comment_id = c.id), '[]') as likes from comments c) c;`);
const cmtsFor = (col, id) => comments.filter(c => c[col] === id).map(c => ({ id: c.legacy_ref.split('#').slice(1).join('#'), user: name(c.author_id), text: c.body,
  timestamp: c.created_at, parentId: c.parent_ref ? c.parent_ref.split('#').slice(1).join('#') : '', likes: c.likes.map(name) }));
const ev = [];
sql(`select coalesce(json_agg(k), '[]') from (select k.*, coalesce(k.roaster_text, r.name) as roaster_name,
  coalesce((select json_agg(user_id) from coffee_likes l where l.coffee_id = k.id), '[]') as likes from coffees k left join roasters r on r.id = k.roaster_id) k;`).forEach(k => {
  ev.push({ type: 'bean', id: k.legacy_id, user: name(k.owner_id), owner: name(k.owner_id), roaster: k.roaster_name || '', name: k.name, origin: k.origin || '', process: k.process || '',
    variety: k.variety || '', roast: k.roast || '', roastDate: k.roast_date || '', date: k.created_at, eventAt: k.updated_at, likes: k.likes.map(name), comments: cmtsFor('coffee_id', k.id) });
});
const want = sql(`select coalesce(json_agg(json_build_object('owner_id', w.owner_id, 'legacy', k.legacy_id)), '[]') from want_to_try w join coffees k on k.id = w.coffee_id;`);
ev.filter(e => e.type === 'bean').forEach(b => { b.wantToTry = want.filter(w => w.legacy === b.id).map(w => name(w.owner_id)); });
const coffeeLegacy = new Map(sql(`select coalesce(json_agg(json_build_object('id', id, 'legacy', legacy_id)), '[]') from coffees;`).map(x => [x.id, x.legacy]));
sql(`select coalesce(json_agg(s), '[]') from (select s.*, n.body as notes, p.path as photo_path,
  coalesce((select json_agg(user_id) from likes l where l.session_id = s.id), '[]') as likes
  from sessions s left join session_notes n on n.session_id = s.id left join session_photos p on p.session_id = s.id) s;`).forEach(s => {
  const photo = s.photo_path ? (s.photo_path.startsWith('drive:') ? { fileId: s.photo_path.slice(6), url: `https://drive.google.com/uc?export=view&id=${s.photo_path.slice(6)}` } : { url: s.photo_path }) : null;
  ev.push({ ...(s.extras || {}), ...(s.taste || {}), type: 'brew', id: s.legacy_id, beanId: coffeeLegacy.get(s.coffee_id) || (s.extras || {}).beanId || '', user: name(s.owner_id), owner: name(s.owner_id),
    method: s.method || '', grind: s.grind ?? '', dose: s.dose ?? '', yield: s.yield ?? '', time: s.time_s ?? '', rating: s.rating ?? '', tasted: s.tasted || [], flavorNotes: s.flavor_notes || undefined,
    notes: s.notes || '', photo, likes: s.likes.map(name), comments: cmtsFor('session_id', s.id), equipment: (s.equipment || {}).ids || [], equipmentSnapshot: (s.equipment || {}).snapshot || [],
    isMaster: Boolean(s.master && s.master.isMaster), masterProfile: (s.master && s.master.profile) || null, date: s.brewed_at, eventAt: s.updated_at });
});
const equip = sql(`select coalesce(json_agg(e order by e.sort_order, e.created_at), '[]') from equipment e;`);
sql(`select coalesce(json_agg(g), '[]') from profile_gear g;`).forEach(g => {
  const who = name(g.profile_id);
  ev.push({ type: 'gear', id: `gear-${who}`, user: who, owner: who, items: equip.filter(e => e.owner_id === g.profile_id).map(e => ({ id: e.legacy_id, name: e.name, type: e.type })),
    lastByMethod: g.last_by_method || {}, recipes: g.recipes || [], fabFour: (g.favorites || {}).fabFour || [], roasters: g.roaster_prefs || {}, date: '2026-01-01T00:00:00Z', eventAt: '2026-01-01T00:00:00Z' });
});
const excl = sql(`select coalesce(json_agg(user_id), '[]') from group_members where not counts_in_goal;`).map(name);
ev.push({ type: 'gear', id: 'gear-__group__', user: '__group__', owner: '__group__', items: [], lastByMethod: {}, goalExclude: excl, date: '2026-01-01T00:00:00Z', eventAt: '2026-01-01T00:00:00Z' });
sql(`select coalesce(json_agg(f), '[]') from flavors f;`).forEach(f => ev.push({ type: 'flavor', id: f.id, name: f.name, user: name(f.created_by), date: f.created_at, eventAt: f.created_at }));
const B = loadApp(HTML); B.user = ''; B.process(eventsB || ev);

// ---- 3. compare
const diffs = [];
// the database keeps object fields in its own order, so objects are compared with their keys sorted
const canon = v => Array.isArray(v) ? v.map(canon) : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const J = v => JSON.stringify(canon(v));
const n = v => { if (v === '' || v === null || v === undefined) return null; const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? x : String(v); };
const t = (app, v) => app.toTime(v) || null;
const set = a => JSON.stringify([...new Set((a || []).map(String))].sort());
const details = [];   // the two values behind each difference, for debugging
const same = (what, id, field, a, b) => { if (J(a) !== J(b)) { diffs.push(`${what} ${id}: ${field}`); details.push({ what, id, field, sheet: canon(a), db: canon(b) }); } };
const cm = (app, list) => JSON.stringify((list || []).map(c => [String(c.id), c.user, String(c.text || '').slice(0, 2000) || '…', t(app, c.timestamp), String(c.parentId || ''), set(c.likes)]).sort());

same('people', '-', 'list', [...A.knownPeople()].sort(), [...B.knownPeople()].sort());
same('coffees', '-', 'count', A.beans.size, B.beans.size);
A.beans.forEach((a, id) => {
  const b = B.beans.get(id); if (!b) { diffs.push(`coffee ${id}: missing`); return; }
  ['roaster', 'name', 'origin', 'process', 'variety', 'roast'].forEach(f => same('coffee', id, f, String(a[f] || '').trim(), String(b[f] || '').trim()));
  same('coffee', id, 'owner', a.owner || a.user, b.owner || b.user);
  same('coffee', id, 'roastDate', String(a.roastDate || '').slice(0, 10), String(b.roastDate || '').slice(0, 10));
  same('coffee', id, 'date', t(A, a.date), t(B, b.date));
  same('coffee', id, 'likes', set(a.likes), set(b.likes));
  same('coffee', id, 'comments', cm(A, a.comments), cm(B, b.comments));
  same('coffee', id, 'wantToTry', set(a.wantToTry), set(b.wantToTry));
});
// want-to-try works per coffee (all bags of the same roaster + name), so it's compared per coffee group
const wantByGroup = app => { const m = {}; app.beans.forEach(b => { const k = app.beanGroupKey(b); m[k] = [...new Set([...(m[k] || []), ...(b.wantToTry || [])])].sort(); }); return m; };
same('want to try', '-', 'by coffee', wantByGroup(A), wantByGroup(B));
same('sessions', '-', 'count', A.brews.size, B.brews.size);
A.brews.forEach((a, id) => {
  const b = B.brews.get(id); if (!b) { diffs.push(`session ${id}: missing`); return; }
  same('session', id, 'owner', A.getBrewOwner(a), B.getBrewOwner(b));
  same('session', id, 'coffee', String(a.beanId || ''), String(b.beanId || ''));
  ['method'].forEach(f => same('session', id, f, String(a[f] || ''), String(b[f] || '')));
  ['grind', 'dose', 'yield', 'time', 'acidity', 'sweetness', 'body', 'finish', 'balance', 'bitterness', 'temp'].forEach(f => same('session', id, f, n(a[f]), n(b[f])));
  same('session', id, 'rating', A.normalizeRating(a.rating), B.normalizeRating(b.rating));
  same('session', id, 'date', t(A, a.date), t(B, b.date));
  same('session', id, 'notes', A.getBrewNotes(a), B.getBrewNotes(b));
  same('session', id, 'photo', (A.normalizePhoto(a.photo) || {}).fileId || (A.normalizePhoto(a.photo) || {}).url || null, (B.normalizePhoto(b.photo) || {}).fileId || (B.normalizePhoto(b.photo) || {}).url || null);
  same('session', id, 'tasted', a.tasted || [], b.tasted || []);
  same('session', id, 'flavorNotes', a.flavorNotes || null, b.flavorNotes || null);
  same('session', id, 'likes', set(a.likes), set(b.likes));
  same('session', id, 'comments', cm(A, a.comments), cm(B, b.comments));
  same('session', id, 'equipment', [a.equipment || [], a.equipmentSnapshot || []], [b.equipment || [], b.equipmentSnapshot || []]);
  same('session', id, 'master', [Boolean(a.isMaster), a.masterProfile || null], [Boolean(b.isMaster), b.masterProfile || null]);
  ['verdict', 'brewer', 'recipeName', 'flavors'].forEach(f => same('session', id, f, a[f] ?? null, b[f] ?? null));
});
const gearOf = (app, who) => { const g = app.gearByUser.get(who) || {}; return [(g.items || []).map(i => [String(i.id), i.name, i.type]), g.recipes || [], g.lastByMethod || {}, g.fabFour || [], g.roasters || {}]; };
// seen as `viewer`, other people's gear is only their equipment (recipes and settings are private)
A.knownPeople().forEach(p => viewer && p !== viewer ? same('gear', p, 'equipment', gearOf(A, p)[0], gearOf(B, p)[0]) : same('gear', p, 'record', gearOf(A, p), gearOf(B, p)));
A.knownPeople().forEach(p => same('goal switch', p, 'counts', A.goalExcluded(p), B.goalExcluded(p)));
same('custom notes', '-', 'names', [...A.customFlavors.values()].map(f => f.name).sort(), [...B.customFlavors.values()].map(f => f.name).sort());
same('achievements', '-', 'levels', A.achievementLevelsByUser || {}, B.achievementLevelsByUser || {});
if (process.env.PARITY_DEBUG) { const a = A.achievementLevelsByUser || {}, b = B.achievementLevelsByUser || {}; Object.keys({ ...a, ...b }).forEach(u => Object.keys({ ...(a[u] || {}), ...(b[u] || {}) }).forEach(k => { if (J((a[u] || {})[k]) !== J((b[u] || {})[k])) console.log('  level', u, k, J((a[u] || {})[k]), '->', J((b[u] || {})[k])); })); }

// Before v14.2 the app counted "comments written" and "likes received" only when they appeared in a later version
// of a record, so records sent once with everything on them (as the tables do) counted nothing. v14.2 counts what's
// on a record when it first appears. --known-history only matters when checking against an older index.html.
const KNOWN = knownHistory ? diffs.filter(d => d.startsWith('achievements')) : [];
KNOWN.forEach(d => diffs.splice(diffs.indexOf(d), 1));
return { compared: `${A.beans.size} coffees, ${A.brews.size} sessions, ${A.knownPeople().length} people`, diffs, details, known: KNOWN };
}

function report({ compared, diffs, known }) {
  if (known.length) console.log('known, history-derived (not a data difference):', known.join(' | '));
  console.log(`compared ${compared}`);
  if (!diffs.length) { console.log('parity: the database holds exactly what the app has today'); return true; }
  const by = {}; diffs.forEach(d => { const k = d.replace(/ [^ ]+: /, ': '); by[k] = (by[k] || 0) + 1; });
  console.log(`${diffs.length} DIFFERENCES`); Object.entries(by).forEach(([k, c]) => console.log(`  ${c} x ${k}`)); console.log('  e.g.', diffs.slice(0, 5).join(' | '));
  return false;
}

module.exports = { runParity, report, eventsFromRows };

if (require.main === module) {
  const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
  const HTML = arg('html'), ROWS = arg('rows'), PSQL = arg('psql');
  if (!HTML || !ROWS || !PSQL) { console.error('usage: node supabase/parity.js --html index.html --rows rows.json --psql "psql -h HOST -U USER -d DB" [--known-history]'); process.exit(2); }
  const ok = report(runParity({ html: HTML, events: eventsFromRows(JSON.parse(fs.readFileSync(ROWS, 'utf8'))), psql: PSQL, knownHistory: process.argv.includes('--known-history') }));
  process.exit(ok ? 0 : 1);
}
