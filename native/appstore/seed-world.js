#!/usr/bin/env node
// Fills a fresh stand-in backend (supabase/dev_server.js started with --fresh --allow-sql) for the App Store
// screenshots: the review account (Maya Rios, signs in with a password that only exists on this stand-in), its sample
// coffees (supabase/review_sample.sql) and the made-up circle of friends (native/appstore/store_world.sql), plus the
// photo on one friend's espresso. Nothing here touches the live backend.
//
//   node native/appstore/seed-world.js <stand-in url> <its database name> <password for the review account>
const fs = require('fs'), path = require('path'), os = require('os');
const [BASE, DB, PW] = process.argv.slice(2);
if (!BASE || !DB || !PW) { console.error('usage: node seed-world.js <stand-in url> <db name> <password>'); process.exit(2); }
const ROOT = path.join(__dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const call = async (p, body) => { const r = await fetch(BASE + p, body === undefined ? {} : { method: 'POST', body }); return r.json(); };
const sql = async s => { const r = await call('/__dev/sql', s); if (r.message) throw new Error(r.message); return r.out; };

(async () => {
  for (let i = 0; i < 300; i++) { try { await call('/__dev/stats'); break; } catch (e) { await sleep(500); } }
  for (let i = 0; i < 120; i++) { try { await sql('select 1 from profiles limit 1;'); break; } catch (e) { await sleep(500); } }
  await call('/__dev/password', JSON.stringify({ email: 'appreview@dialed-in.app', password: PW }));
  await sql(`insert into auth.users (id, email) select gen_random_uuid(), 'appreview@dialed-in.app' where not exists (select 1 from auth.users where email = 'appreview@dialed-in.app');
    insert into profiles (auth_id, handle, display_name, color, joined_at) select id, 'appreview', 'Maya Rios', '#C07A45', now() - interval '14 days'
      from auth.users where email = 'appreview@dialed-in.app' on conflict (handle) do nothing;`);
  const rp = `drop table if exists pg_temp.rp; create temp table rp as select p.id from profiles p join auth.users u on u.id = p.auth_id where u.email = 'appreview@dialed-in.app';\n`;
  const out = await sql(rp + fs.readFileSync(path.join(ROOT, 'supabase/review_sample.sql'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'store_world.sql'), 'utf8'));
  const photo = out.split('\n').pop().trim();
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}-espresso\.jpg$/.test(photo)) throw new Error('no photo name came back: ' + out.slice(-200));
  const file = path.join(os.tmpdir(), 'dialed-dev-storage-' + DB, photo);   // where dev_server.js keeps its photos
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'seed/espresso.jpg'), file);
  const n = await sql(`select (select count(*) from profiles) || ' people, ' || (select count(*) from sessions) || ' sessions, ' || (select count(*) from likes) || ' likes, '
    || (select count(*) from comments) || ' comments, ' || (select count(*) from groups) || ' community, ' || (select count(*) from session_photos) || ' photo';`);
  console.log(n);
})().catch(e => { console.error('seed failed: ' + e.message); process.exit(1); });
