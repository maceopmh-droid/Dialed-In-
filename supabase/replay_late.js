#!/usr/bin/env node
// After the move to accounts: carry over saves that still reached the Sheet (a phone that hadn't updated yet).
//
//   node supabase/replay_late.js --psql "psql <database url>" (--live <Apps Script URL> | --rows rows.json) [--since <ISO time>] [--dry-run]
//
// Each Sheet save made after the move (--since, or the cutover_at the move recorded) is applied through push_event as
// each person whose part of the record it changed (supabase/lib/replay.js), so it follows exactly the same rules as a
// save from the app. Saves by someone who hasn't signed in and claimed their name yet are left for a later run.
// Each applied save is remembered, so running this again never applies one twice.
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { planReplay } = require('./lib/replay');

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const PSQL = arg('psql'), LIVE = arg('live'), ROWS = arg('rows'), DRY = process.argv.includes('--dry-run');
if (!PSQL || (!LIVE && !ROWS)) { console.error('usage: node supabase/replay_late.js --psql "psql <db>" (--live URL | --rows rows.json) [--since ISO] [--dry-run]'); process.exit(2); }
const sql = s => execSync(`${PSQL} -Atq -v ON_ERROR_STOP=1`, { input: s, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const canon = v => Array.isArray(v) ? v.map(canon) : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const keyOf = e => crypto.createHash('md5').update(JSON.stringify(canon(e))).digest('hex');

(async () => {
  let events;
  if (ROWS) events = JSON.parse(fs.readFileSync(ROWS, 'utf8')).filter(r => typeof r[6] === 'string' && r[6][0] === '{').map(r => { try { return JSON.parse(r[6]); } catch (e) { return null; } }).filter(Boolean);
  else { const res = await fetch(LIVE + (LIVE.includes('?') ? '&' : '?') + 'v=2&since=0&t=' + Date.now()); const body = await res.json(); events = Array.isArray(body) ? body : (body.events || []); }
  const since = arg('since') || sql(`select value from backend_state where key = 'cutover_at';`);
  if (!since) { console.error('No --since and no cutover_at recorded: nothing counts as late yet.'); process.exit(2); }
  const people = Object.fromEntries(sql(`select coalesce(string_agg(lower(legacy_name) || '=' || auth_id, ','), '') from profiles where legacy_name is not null and auth_id is not null;`).split(',').filter(Boolean).map(x => x.split('=')));
  const done = new Set(sql(`select coalesce(string_agg(substr(key, 6), ','), '') from backend_state where key like 'late:%';`).split(',').filter(Boolean));
  const plan = planReplay(events, since);
  const tally = { applied: 0, already: 0, waiting: {} };
  for (const { event, people: who } of plan) {
    const k = keyOf(event);
    if (done.has(k)) { tally.already++; continue; }
    const missing = who.filter(n => !people[n.toLowerCase()]);
    if (missing.length) { missing.forEach(n => { tally.waiting[n] = (tally.waiting[n] || 0) + 1; }); continue; }   // try again after they claim their name
    if (DRY) { console.log(`would apply ${event.type} ${event.id} as ${who.join(', ')}`); continue; }
    const pushes = who.map(n => `set role authenticated; set request.jwt.claim.sub to '${people[n.toLowerCase()]}'; select push_event(${q(JSON.stringify(event))}::jsonb); reset role;`).join('\n');
    sql(`begin;\n${pushes}\ninsert into backend_state (key, value) values ('late:${k}', now()::text) on conflict (key) do nothing;\ncommit;`);
    tally.applied++;
  }
  console.log(`saves in the Sheet after ${since}: ${plan.length}; applied now: ${tally.applied}; applied before: ${tally.already}; waiting for someone to claim their name: ${JSON.stringify(tally.waiting)}`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
