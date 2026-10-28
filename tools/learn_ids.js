#!/usr/bin/env node
// Learn (v19.0): writes the ids the server accepts on a coffee's tags (internal.learn_ids() in supabase/api.sql) from
// the recognizer itself, so the two never disagree.
//   node tools/learn_ids.js           rewrite the block in supabase/api.sql
//   node tools/learn_ids.js --check   exit 1 if supabase/api.sql is out of date
const fs = require('fs'), path = require('path');
const L = require('../src/js/07-learn-engine.js');
const file = path.join(__dirname, '../supabase/api.sql');
const ids = L.knownIds();
const body = `create or replace function internal.learn_ids() returns jsonb language sql immutable as $learnids$ select '${JSON.stringify(ids).replace(/'/g, "''")}'::jsonb $learnids$;`;
const A = '-- learn ids: written by tools/learn_ids.js from the recognizer; do not edit by hand', B = '-- end of learn ids';
const sql = fs.readFileSync(file, 'utf8');
const i = sql.indexOf(A), j = sql.indexOf(B);
if (i < 0 || j < 0) { console.error('markers missing in supabase/api.sql'); process.exit(2); }
const next = sql.slice(0, i + A.length) + '\n' + body + '\n' + sql.slice(j);
if (process.argv.includes('--check')) { if (next !== sql) { console.error('supabase/api.sql learn ids are out of date: run node tools/learn_ids.js'); process.exit(1); } console.log('learn ids up to date'); }
else { fs.writeFileSync(file, next); console.log('wrote learn ids', Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, v.length]))); }
