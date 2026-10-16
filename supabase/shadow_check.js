#!/usr/bin/env node
// Phase 1 nightly check of the shadow backend.
//
//   node supabase/shadow_check.js --psql "psql <database url>" --html index.html [--live <Apps Script URL> | --live-file events.json] [--no-rebuild]
//
// 1. Reads the archive (sheet_archive: every Sheet row Apps Script has copied over).
// 2. With --live, downloads the live Sheet (the public read: <url>?v=2&since=0) and checks that every live event
//    is in the archive. Events are compared by their content, field order ignored.
// 3. Rebuilds the content tables (profiles, claim codes, follows and the archive are left alone) from the live Sheet
//    when it's given, since that reflects rows deleted by hand; otherwise from the archive.
// 4. Runs the parity check: the app replaying the same events must end up with exactly what the tables hold.
// Exits 1 if anything is missing or different, so a scheduled run shows up red.
const { execSync } = require('child_process');
const { buildImport } = require('./import_v9');
const { runParity, report } = require('./parity');

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
    let body;
    if (LIVE_FILE) body = JSON.parse(require('fs').readFileSync(LIVE_FILE, 'utf8'));
    else { const res = await fetch(LIVE + (LIVE.includes('?') ? '&' : '?') + 'v=2&since=0&t=' + Date.now()); body = await res.json(); }
    liveEvents = Array.isArray(body) ? body : (body.events || []);
    const have = new Set(archive.map(([, json]) => key(JSON.parse(json))));
    const missing = liveEvents.filter(e => !have.has(key(e)));
    const liveKeys = new Set(liveEvents.map(key));
    const extra = archive.filter(([, json]) => !liveKeys.has(key(JSON.parse(json))));
    console.log(`live Sheet: ${liveEvents.length} events; missing from the archive: ${missing.length}; in the archive but not the Sheet (rows deleted by hand): ${extra.length}`);
    if (missing.length) { ok = false; console.log('  missing, e.g.', missing.slice(0, 5).map(e => `${e.type} ${e.id}`).join(' | ')); }
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
