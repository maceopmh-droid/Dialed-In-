#!/usr/bin/env node
// Learn (v19.0): tags every coffee with what kind of coffee it is, using the app's own recognizer (LearnEngine), for
// Learn's community numbers. Coffees saved by older app versions (or before Learn) have no tags until this runs.
//
//   node supabase/learn_tags.js --psql "psql <database url>" [--dry-run]
//
// Writes only rows whose tags actually change, and never touches updated_at (it feeds data_version(), and phones read
// the bag themselves, so they don't need these). Tags from a newer recognizer than this one are left alone. Keeps each
// person's "Keep as typed" answers. The logs are public: it prints counts only, never names or coffee text.
const { execSync } = require('child_process');
const L = require('../src/js/07-learn-engine.js');

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const PSQL = arg('psql'), DRY = process.argv.includes('--dry-run');
if (!PSQL) { console.error('usage: node supabase/learn_tags.js --psql "psql <db>" [--dry-run]'); process.exit(2); }
// (a failed command's error would carry the connection string, password and all: the public log only ever gets this)
const sql = s => { try { return execSync(`${PSQL} -Atq -v ON_ERROR_STOP=1`, { input: s, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch (e) { const why = String((e && e.stderr) || '').split('\n').find(l => /ERROR|FATAL/.test(l)) || 'the database call failed'; console.error(`Learn tags: ${why.replace(/postgres(ql)?:\/\/\S+/g, '<database>').slice(0, 200)}`); process.exit(1); } };
const q = s => `'${String(s).replace(/'/g, "''")}'`;
// key order doesn't matter when comparing
const strip = v => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== undefined).map(([k, x]) => [k, strip(x)])) : v;
const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(y => [y, x[y]])) : x);

const rows = JSON.parse(sql(`select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'tea_type', tea_type, 'origin', origin, 'process', process, 'variety', variety, 'roast', roast, 'learn', learn)), '[]') from coffees where deleted_at is null;`) || '[]');
let same = 0, newer = 0, tea = 0; const changes = [];
rows.forEach(r => {
  const keep = r.learn && r.learn.keep && typeof r.learn.keep === 'object' ? r.learn.keep : null;
  if (r.learn && Number(r.learn.v) > L.VERSION) { newer++; return; }
  const want = r.kind === 'tea' ? null : strip(L.store({ origin: r.origin, process: r.process, variety: r.variety, roast: r.roast, learnKeep: keep }));
  if (r.kind === 'tea') tea++;
  // the server copy is stored after the server's own check (internal.learn_ok); compare like with like
  if (canon(want) === canon(r.learn)) { same++; return; }
  changes.push([r.id, want]);
});
let checked = 0;
if (changes.length && !DRY) {
  for (let i = 0; i < changes.length; i += 200) {
    const part = changes.slice(i, i + 200);
    sql(`begin; ${part.map(([id, t]) => `update coffees set learn = ${t ? `internal.learn_ok(${q(JSON.stringify(t))}::jsonb)` : 'null'} where id = ${q(id)};`).join('\n')} commit;`);
  }
  // after the check, everything that should have tags has them
  checked = Number(sql(`select count(*) from coffees where deleted_at is null and kind = 'coffee' and learn is null;`));
}
console.log(`Learn tags (recognizer v${L.VERSION}): ${rows.length} coffees, ${changes.length} ${DRY ? 'would change' : 'changed'}, ${same} already right, ${tea} teas, ${newer} from a newer recognizer left alone${changes.length && !DRY ? `; untagged coffees left: ${checked}` : ''}.`);
