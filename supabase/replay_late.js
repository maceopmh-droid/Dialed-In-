#!/usr/bin/env node
// After the move to accounts: carry over Sheet saves the tables don't have yet (a phone that hadn't updated, or a save
// made between the last nightly rebuild and the move).
//
//   node supabase/replay_late.js --psql "psql <database url>" (--live <Apps Script URL> | --rows rows.json) [--since <ISO time>] [--dry-run]
//
// Every import records exactly which Sheet saves it built the tables from (backend_imported, by content, so phone
// clocks don't matter). Each save in the Sheet that isn't among them, and hasn't been carried over before, is applied
// through push_event as each person whose part of the record it changed (supabase/lib/replay.js), so it follows the
// same rules as a save from the app. Saves by someone who hasn't signed in and claimed their name yet are left for a
// later run. --since only narrows it further (saves after that time). Running it again never applies a save twice.
const fs = require('fs');
const { execSync } = require('child_process');
const { planReplay } = require('./lib/replay');
const { contentKey } = require('./import_v9');
const { fetchSheet } = require('./lib/sheet');

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const PSQL = arg('psql'), LIVE = arg('live'), ROWS = arg('rows'), DRY = process.argv.includes('--dry-run');
if (!PSQL || (!LIVE && !ROWS)) { console.error('usage: node supabase/replay_late.js --psql "psql <db>" (--live URL | --rows rows.json) [--since ISO] [--dry-run]'); process.exit(2); }
const sql = s => execSync(`${PSQL} -Atq -v ON_ERROR_STOP=1`, { input: s, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const list = s => (s ? s.split('\n').filter(Boolean) : []);

(async () => {
  let events;
  if (ROWS) events = JSON.parse(fs.readFileSync(ROWS, 'utf8')).filter(r => typeof r[6] === 'string' && r[6][0] === '{').map(r => { try { return JSON.parse(r[6]); } catch (e) { return null; } }).filter(Boolean);
  else events = await fetchSheet(LIVE);
  const imported = new Set(list(sql(`select event_key from backend_imported;`)));
  if (!imported.size) { console.error('Nothing records what the tables were built from (run the import or the nightly check first), so nothing can count as new.'); process.exit(2); }
  const done = new Set(list(sql(`select substr(key, 6) from backend_state where key like 'late:%';`)));
  const after = Date.parse(arg('since') || '') || 0;
  const people = Object.fromEntries(list(sql(`select lower(legacy_name) || '=' || auth_id from profiles where legacy_name is not null and auth_id is not null;`)).map(x => x.split('=')));
  const plan = planReplay(events, e => !imported.has(contentKey(e)) && (!after || (Date.parse(e.eventAt || e.date) || 0) > after));
  const tally = { applied: 0, already: 0, waiting: {} };
  for (const { event, people: who } of plan) {
    const k = contentKey(event);
    if (done.has(k)) { tally.already++; continue; }
    const missing = who.filter(n => !people[n.toLowerCase()]);
    if (missing.length) { missing.forEach(n => { tally.waiting[n] = (tally.waiting[n] || 0) + 1; }); continue; }   // try again after they claim their name
    if (DRY) { console.log(`would apply ${event.type} ${event.id} as ${who.join(', ') || '(nobody: nothing changed)'}`); continue; }
    const pushes = who.map(n => `set dialed.replay = 'on'; set role authenticated; set request.jwt.claim.sub to '${people[n.toLowerCase()]}'; select push_event(${q(JSON.stringify(event))}::jsonb); reset role;`).join('\n');   // (v14.6: not held by the speed limits)
    sql(`begin;\n${pushes}\ninsert into backend_state (key, value) values ('late:${k}', now()::text) on conflict (key) do nothing;\ncommit;`);
    done.add(k);
    tally.applied++;
  }
  console.log(`saves in the Sheet the tables don't have: ${plan.length}; applied now: ${tally.applied}; applied before: ${tally.already}; waiting for someone to claim their name: ${JSON.stringify(tally.waiting)}`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
