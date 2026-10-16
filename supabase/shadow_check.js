#!/usr/bin/env node
// Phase 1 nightly check of the shadow backend.
//
//   node supabase/shadow_check.js --psql "psql <database url>" --html index.html [--live <Apps Script URL> | --live-file events.json] [--no-rebuild]
//
// 1. Reads the archive (sheet_archive: every Sheet save this check has ever seen, kept as it was).
// 2. With --live, downloads the live Sheet (the public read: <url>?v=2&since=0) and adds every live event the archive
//    doesn't have yet. Events are compared by their content, field order ignored.
// 3. Rebuilds the content tables (profiles, claim codes, follows and the archive are left alone) from the live Sheet
//    when it's given, since that reflects rows deleted by hand; otherwise from the archive.
// 4. Runs the parity check: the app replaying the same events must end up with exactly what the tables hold.
// Exits 1 if anything is missing or different, so a scheduled run shows up red.
const { execSync } = require('child_process');
const { buildImport, eventKey } = require('./import_v9');
const { runParity, report } = require('./parity');
const { fetchSheet } = require('./lib/sheet');

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const PSQL = arg('psql'), HTML = arg('html'), LIVE = arg('live'), LIVE_FILE = arg('live-file');
if (!PSQL || !HTML) { console.error('usage: node supabase/shadow_check.js --psql "psql <db>" --html index.html [--live URL] [--no-rebuild]'); process.exit(2); }
const sql = (s, json = true) => { const t = execSync(`${PSQL} -Atq -v ON_ERROR_STOP=1`, { input: s, encoding: 'utf8', maxBuffer: 1 << 28 }).trim(); return json ? (t ? JSON.parse(t) : []) : t; };
const canon = v => Array.isArray(v) ? v.map(canon) : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const key = e => JSON.stringify(canon(e));

(async () => {
  let ok = true;
  // 1. the archive, as Sheet-style rows
  const archive = sql(`select coalesce(json_agg(json_build_array(logged_at, payload::text) order by row_no nulls last, received_at), '[]') from sheet_archive;`);
  const rows = archive.map(([logged, json]) => [logged, '', '', '', '', '', json]);
  console.log(`archive: ${rows.length} rows`);

  // 2. the live Sheet vs the archive
  let liveEvents = null;
  if (LIVE || LIVE_FILE) {
    if (LIVE_FILE) { const body = JSON.parse(require('fs').readFileSync(LIVE_FILE, 'utf8')); liveEvents = Array.isArray(body) ? body : (body.events || []); }
    else liveEvents = await fetchSheet(LIVE);
    const have = new Set(archive.map(([, json]) => key(JSON.parse(json))));
    const missing = liveEvents.filter(e => !have.has(key(e)));
    const liveKeys = new Set(liveEvents.map(key));
    const extra = archive.filter(([, json]) => !liveKeys.has(key(JSON.parse(json))));
    console.log(`live Sheet: ${liveEvents.length} events; new to the archive: ${missing.length}; in the archive but not the Sheet (rows deleted by hand): ${extra.length}`);
    if (missing.length) {   // keep them, as the Sheet has them (position in the Sheet, and the time it was saved)
      const pos = new Map(liveEvents.map((e, i) => [e, i + 1]));
      const q = v => `'${String(v).replace(/'/g, "''")}'`;
      const add = missing.map(e => { const json = JSON.stringify(e); return `(${q(eventKey(json))}, ${pos.get(e)}, ${q(e.eventAt || e.date || '')}, ${q(json)}::jsonb)`; });
      for (let i = 0; i < add.length; i += 300) sql(`insert into sheet_archive (event_key, row_no, logged_at, payload) values ${add.slice(i, i + 300).join(', ')} on conflict (event_key) do nothing;`, false);
      const now = sql(`select count(*) from sheet_archive;`, false);
      console.log(`  added; the archive has ${now} rows now`);
    }
  }

  // after the move to accounts the app writes to the tables directly: they must never be rebuilt from the Sheet again
  const cutover = sql(`select value from backend_state where key = 'cutover_at';`, false);
  if (cutover) {
    console.log(`moved to accounts on ${cutover}: the tables are the source of truth now, so they're not rebuilt or compared with the Sheet.`);
    console.log('(saves that still reach the Sheet from a phone that hasn\'t updated: node supabase/replay_late.js)');
    console.log(ok ? 'shadow backend: OK' : 'shadow backend: PROBLEMS (see above)');
    process.exit(ok ? 0 : 1);
  }

  // 3. rebuild the content tables from the archive
  if (!process.argv.includes('--no-rebuild')) {
    const source = liveEvents ? liveEvents.map(e => ['', '', '', '', '', '', JSON.stringify(e)]) : rows;
    const { sql: rebuild, summary } = buildImport({ html: HTML, rows: source, mode: 'rebuild' });
    sql(rebuild, false);
    console.log('rebuilt:', JSON.stringify(summary.counts));
  }

  // 4. parity
  const events = liveEvents || rows.map(r => JSON.parse(r[6]));
  if (!report(runParity({ html: HTML, events, psql: PSQL, knownHistory: false }))) ok = false;
  console.log(ok ? 'shadow backend: OK' : 'shadow backend: PROBLEMS (see above)');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
