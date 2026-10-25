#!/usr/bin/env node
// Makes an espresso machine for someone (v16.9, the Shot Logger) until linking a machine from the app is designed.
// The machine's token is written to a file only you can read, never printed (GitHub's logs are public, and a token
// lets anyone send shots as that person). Only its hash is kept in the database.
//
//   node supabase/make_machine.js --owner Maceo --name "Maceo's Gaggia" --out ~/.dialed-machine-token [--test] [--replace]
//        (--host <socket dir or host> [--user postgres] [--db dialed_dev]) or DB_URL=<connection string>
//   --test     a test machine (the desktop simulator): the shots it posts are "Only me", so friends never see them
//   --replace  unlink this person's earlier machine of the same name first (its old token stops working)
//
// Then: curl -X POST <project>/functions/v1/shot-inbox -H "Authorization: Bearer $(cat ~/.dialed-machine-token)" \
//         -H 'Content-Type: application/json' --data @supabase/fixtures/shot-example.json   (with a real coffee_id)
const { execFileSync } = require('child_process');
const fs = require('fs');

const arg = (k, d = null) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const owner = arg('owner'), name = arg('name', 'Espresso machine'), out = arg('out');
const test = process.argv.includes('--test'), replace = process.argv.includes('--replace');
if (!owner || !out) { console.error('usage: node supabase/make_machine.js --owner <name> --name <machine name> --out <file>'); process.exit(2); }
const conn = process.env.DB_URL ? [process.env.DB_URL] : ['-h', arg('host', '/var/lib/postgresql/sock'), '-U', arg('user', 'postgres'), '-d', arg('db', 'dialed_dev')];
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const who = `(select id from profiles where lower(coalesce(legacy_name, display_name)) = lower(${q(owner)}))`;
const sql = (replace ? `update machines set revoked_at = now() where owner_id = ${who} and name = ${q(name)} and revoked_at is null;\n` : '')
  + `select internal.add_machine(${who}, ${q(name)});`;
let token = '';
try { token = execFileSync('psql', [...conn, '-Atq', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
catch (e) { console.error('Couldn\'t make the machine:', String(e.stderr || e.message).split('\n').find(l => /ERROR/.test(l)) || 'unknown error'); process.exit(1); }
if (!/^[0-9a-f]{64}$/.test(token)) { console.error('Couldn\'t make the machine (no token came back).'); process.exit(1); }
// (the token goes to psql on stdin, never on a command line or in a log)
if (test) execFileSync('psql', [...conn, '-Atq', '-v', 'ON_ERROR_STOP=1'], { input: `update machines set test = true where token_hash = internal.token_hash(${q(token)});`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
fs.writeFileSync(out, token + '\n', { mode: 0o600 });
console.log(`Made ${test ? 'the test machine ' : ''}"${name}" for ${owner}${replace ? ' (any earlier one of that name is unlinked)' : ''}. Its token is in ${out} (only you can read it).`);
