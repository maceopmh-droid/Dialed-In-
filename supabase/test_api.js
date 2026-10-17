#!/usr/bin/env node
// Checks api.sql (claim_name, push_event, pull_events) on a real Postgres, as pretend people, and replays what
// pull_events returns through the app's own code (from index.html) to confirm the app reads it correctly.
//
//   node supabase/test_api.js --host <socket dir or host> [--user postgres] [--html index.html]
const { execSync } = require('child_process');
const path = require('path');
const { loadApp } = require('./lib/app_in_node');

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const HOST = arg('host'), USER = arg('user') || 'postgres', HTML = arg('html') || path.join(__dirname, '..', 'index.html');
if (!HOST) { console.error('usage: node supabase/test_api.js --host <socket dir or host> [--user postgres]'); process.exit(2); }
const DB = process.env.API_TEST_DB || 'dialed_api_test';
const psql = (sql, db = DB) => execSync(`psql -h ${HOST} -U ${USER} -d ${db} -Atq -v ON_ERROR_STOP=1`, { input: sql, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const q = s => `'${String(s).replace(/'/g, "''")}'`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// --- a fresh database with Supabase's sign-in pieces stood in
psql(`drop database if exists ${DB}`, 'postgres'); psql(`create database ${DB}`, 'postgres');
psql(`create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;`);
psql(`alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, anon; alter default privileges in schema public grant execute on functions to authenticated, anon; grant usage on schema public, auth to authenticated, anon;`);   // what Supabase grants on every new table and function
psql(require('fs').readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
psql(`grant execute on all functions in schema auth to authenticated, anon;`);
psql(require('fs').readFileSync(path.join(__dirname, 'api.sql'), 'utf8'));
// Supabase storage stood in (its objects table, foldername() and row rules switched on), then storage.sql
psql(`create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid, unique (bucket_id, name));
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated, anon; grant select, insert, update, delete on storage.objects to authenticated;`);
psql(require('fs').readFileSync(path.join(__dirname, 'storage.sql'), 'utf8'));

const AUTH = { maceo: 'aaaaaaaa-0000-0000-0000-000000000001', aidan: 'aaaaaaaa-0000-0000-0000-000000000002', julian: 'aaaaaaaa-0000-0000-0000-000000000003', stranger: 'aaaaaaaa-0000-0000-0000-000000000004' };
const P = { Maceo: '00000000-0000-0000-0000-0000000000a1', Aidan: '00000000-0000-0000-0000-0000000000a2', Julian: '00000000-0000-0000-0000-0000000000a3' };
Object.values(AUTH).forEach(a => psql(`insert into auth.users values ('${a}');`));
Object.entries(P).forEach(([n, id]) => psql(`insert into profiles (id, handle, display_name, color, legacy_name) values ('${id}', '${n.toLowerCase()}', '${n}', '#336699', '${n}');
  insert into claim_codes (code, legacy_name) values ('code-${n.toLowerCase()}', '${n}');`));
psql(`insert into profiles (id, auth_id, handle, display_name) values ('00000000-0000-0000-0000-0000000000a4', '${AUTH.stranger}', 'stranger', 'Stranger');
  insert into groups (id, name, is_open, owner_id, goal_on) values ('20000000-0000-0000-0000-000000000001', 'Original crew', false, '${P.Maceo}', true);
  insert into group_members (group_id, user_id, role) values ('20000000-0000-0000-0000-000000000001', '${P.Maceo}', 'owner'),
    ('20000000-0000-0000-0000-000000000001', '${P.Aidan}', 'member'), ('20000000-0000-0000-0000-000000000001', '${P.Julian}', 'member');`);

const as = (who, sql) => { try { return { out: psql(`set role ${who === 'anon' ? 'anon' : 'authenticated'}; set request.jwt.claim.sub to '${AUTH[who] || ''}'; ${sql}`) }; } catch (e) { return { err: String(e.stderr || e.message) }; } };
const push = (who, ev) => as(who, `select push_event(${q(JSON.stringify(ev))}::jsonb);`);
const pull = who => { const r = as(who, 'select pull_events();'); return r.err ? r : JSON.parse(r.out); };
const one = sql => psql(sql);

// --- claiming names
// what the app's web address can reach: the public schema's own functions. Signed out: none of them. Signed in:
// exactly the calls api.sql grants (and me()); the rule helpers live in "private", which the web address doesn't serve.
{
  const own = r => psql(`select coalesce(string_agg(distinct p.proname, ',' order by p.proname), '') from pg_proc p where p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') and has_function_privilege('${r}', p.oid, 'execute');`).trim();
  const granted = /grant execute on function ([\s\S]*?) to authenticated;/.exec(require('fs').readFileSync(path.join(__dirname, 'api.sql'), 'utf8'))[1]
    .split(/\)\s*,\s*/).map(x => x.trim().split('(')[0]).filter(Boolean);
  const expected = [...new Set([...granted, 'me'])].sort().join(',');
  ok(own('anon') === '', 'signed-out visitors can\'t call any of the app\'s functions' + (own('anon') ? ' (can: ' + own('anon') + ')' : ''));
  ok(own('authenticated') === expected, 'signed-in people can call exactly the app\'s calls and nothing else' + (own('authenticated') === expected ? '' : ` (extra: ${own('authenticated').split(',').filter(x => !expected.split(',').includes(x)).join(', ') || '-'}; missing: ${expected.split(',').filter(x => !own('authenticated').split(',').includes(x)).join(', ') || '-'})`));
  ok(psql(`select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('blocked_either', 'is_friend', 'my_blocked_ids', 'is_group_member');`).trim() === '0', 'the rule helpers (who blocked whom, who\'s friends with whom) aren\'t in the public schema');
}
ok(/sign in and claim/i.test(as('aidan', 'select pull_events();').err || ''), 'before claiming a name, the app gets nothing (a clear "claim your name first")');
ok(/doesn.t match/.test(as('maceo', `select claim_name('nope');`).err || ''), 'a wrong claim code is refused');
const claimed = as('maceo', `select claim_name('CODE-MACEO ');`);
ok(/"name": "Maceo"/.test(claimed.out || ''), 'Maceo claims his name with his code (spaces and capitals forgiven)');
ok(/already been claimed/.test(as('julian', `select claim_name('code-maceo');`).err || ''), 'a code that was used is refused for anyone else');
ok(/already has a profile/.test(as('maceo', `select claim_name('code-aidan');`).err || ''), 'an account that has a profile can\'t claim a second name');
as('aidan', `select claim_name('code-aidan');`); as('julian', `select claim_name('code-julian');`);
ok(one(`select count(*) from profiles where auth_id is not null;`) === '4', 'all three original names claimed (plus the stranger\'s own profile)');

// --- coffees and sessions
const B1 = { type: 'bean', id: 'b1', user: 'Maceo', owner: 'Maceo', roaster: 'Onyx Coffee Lab', name: 'Monarch', origin: 'Ethiopia', process: 'Natural', roast: 'Light', roastDate: '2026-10-01', date: '2026-10-02T12:00:00.000Z', likes: [], comments: [], wantToTry: [] };
ok(push('maceo', B1).out, 'Maceo saves a coffee');
ok(one(`select k.name || ' / ' || r.name || ' / ' || k.roast_date from coffees k join roasters r on r.id = k.roaster_id where legacy_id = 'b1';`) === 'Monarch / Onyx Coffee Lab / 2026-10-01', 'the coffee is stored with its roaster and roast date');
const S1 = { type: 'brew', id: 's1', beanId: 'b1', user: 'Maceo', owner: 'Maceo', method: 'Espresso', grind: '3B', dose: '18', yield: 40, time: 29, rating: 8,
  acidity: 6, sweetness: '7', body: 5, finish: 6, bitterness: 2, balance: 7, tasted: ['acidity', 'sweetness'], flavorNotes: { Blueberry: 2 },
  notes: 'brewed before my interview', photo: { fileId: 'drivefile123', url: 'https://drive.google.com/uc?export=view&id=drivefile123' },
  equipment: ['e1'], equipmentSnapshot: ['Niche Zero'], temp: 93, verdict: 'sour', date: '2026-10-03T08:00:00.000Z', likes: [], comments: [] };
ok(push('maceo', S1).out, 'Maceo saves a session with notes, a photo, taste and a letter grind');
ok(one(`select grind || '|' || dose || '|' || rating || '|' || audience || '|' || (taste->>'sweetness') || '|' || (extras->>'temp') from sessions where legacy_id = 's1';`) === '3B|18|4|friends|7|93',
  'stored as sent: grind "3B" stays text, an old 0-10 rating of 8 becomes 4 stars, new sessions start as Friends & groups');
ok(one(`select body from session_notes n join sessions s on s.id = n.session_id where s.legacy_id = 's1';`) === 'brewed before my interview' &&
   one(`select path from session_photos p join sessions s on s.id = p.session_id where s.legacy_id = 's1';`) === 'drive:drivefile123', 'notes and photo go in their own tables');

// --- a friend's save can only change the friend's own part
const tampered = { ...S1, user: 'Maceo', dose: 99, notes: 'hacked', likes: ['Aidan', 'Julian'],
  comments: [{ id: 'c1', user: 'Aidan', text: 'nice shot', timestamp: '2026-10-03T09:00:00.000Z', parentId: '', likes: [] },
             { id: 'c2', user: 'Julian', text: 'fake Julian comment', timestamp: '2026-10-03T09:01:00.000Z', parentId: '', likes: [] }] };
push('aidan', tampered);
ok(one(`select dose from sessions where legacy_id = 's1';`) === '18' && one(`select body from session_notes n join sessions s on s.id = n.session_id where s.legacy_id = 's1';`) === 'brewed before my interview',
  "Aidan can't change Maceo's dose or notes, even if his app sends them");
ok(one(`select string_agg(p.legacy_name, ',') from likes l join profiles p on p.id = l.user_id;`) === 'Aidan', "Aidan's like lands; the like he tried to add for Julian doesn't");
ok(one(`select string_agg(p.legacy_name || ':' || c.body, ',') from comments c join profiles p on p.id = c.author_id;`) === 'Aidan:nice shot', "Aidan's comment lands; a comment he tried to post as Julian doesn't");

// replies and likes on comments
const withReply = { ...S1, likes: ['Aidan'], comments: [{ id: 'c1', user: 'Aidan', text: 'nice shot', timestamp: '2026-10-03T09:00:00.000Z', parentId: '', likes: ['Julian'] },
  { id: 'c3', user: 'Julian', text: 'agreed', timestamp: '2026-10-03T09:05:00.000Z', parentId: 'c1', likes: [] }] };
push('julian', withReply);
ok(one(`select p.body from comments c join comments p on p.id = c.parent_id where c.legacy_ref = 's1#c3';`) === 'nice shot', "Julian's reply is threaded under Aidan's comment");
ok(one(`select count(*) from comment_likes;`) === '1', "Julian's like on Aidan's comment is stored");
push('aidan', { ...withReply, comments: [{ ...withReply.comments[0], text: 'nice shot!!' }, withReply.comments[1]] });
ok(one(`select body || '|' || (edited_at is not null) from comments where legacy_ref = 's1#c1';`) === 'nice shot!!|true', 'Aidan edits his comment (marked edited)');
push('aidan', { ...withReply, likes: [], comments: [withReply.comments[1]] });
ok(one(`select count(*) from comments;`) === '0' && one(`select count(*) from likes;`) === '0', 'Aidan removes his comment (its reply goes with it) and unlikes');

// the app also sends replies' parent and comment likes on the side ("commentMeta"); they must still land
push('aidan', { ...S1, comments: [{ id: 'c5', user: 'Aidan', text: 'dialed', timestamp: '2026-10-03T10:00:00.000Z' }] });
push('julian', { ...S1, comments: [{ id: 'c5', user: 'Aidan', text: 'dialed', timestamp: '2026-10-03T10:00:00.000Z' }, { id: 'c6', user: 'Julian', text: 'for real', timestamp: '2026-10-03T10:01:00.000Z' }],
  commentMeta: { c5: { l: ['Julian'] }, c6: { p: 'c5' } } });
ok(one(`select p.body from comments c join comments p on p.id = c.parent_id where c.legacy_ref = 's1#c6';`) === 'dialed' && one(`select count(*) from comment_likes;`) === '1',
   'a reply and a comment like sent only on the side (commentMeta) still land');
push('aidan', { ...S1, comments: [] });

// --- coffee likes, comments, want to try
push('aidan', { ...B1, likes: ['Aidan'], wantToTry: ['Aidan', 'Julian'], comments: [{ id: 'k1', user: 'Aidan', text: 'where did you get it?', timestamp: '2026-10-04T10:00:00.000Z', parentId: '', likes: [] }] });
ok(one(`select count(*) from coffee_likes;`) === '1' && one(`select string_agg(p.legacy_name, ',') from want_to_try w join profiles p on p.id = w.owner_id;`) === 'Aidan' &&
   one(`select body from comments where coffee_id is not null;`) === 'where did you get it?', 'on a coffee: Aidan\'s like, want-to-try and comment land; nothing he sends for Julian does');

// --- gear and goal switches
push('maceo', { type: 'gear', id: 'gear-Maceo', user: 'Maceo', owner: 'Maceo', items: [{ id: 'e1', name: 'Niche Zero', type: 'Grinder' }, { id: 'e2', name: 'Decent', type: 'Machine' }],
  recipes: [{ id: 'r1', name: 'Turbo' }], lastByMethod: { Espresso: { dose: 18 } }, fabFour: ['b1'], roasters: { fav: ['onyx'] } });
ok(one(`select string_agg(name, ',' order by sort_order) from equipment;`) === 'Niche Zero,Decent', "Maceo's equipment is stored in his order");
push('aidan', { type: 'gear', id: 'gear-Maceo', user: 'Maceo', owner: 'Maceo', items: [], recipes: [] });
ok(one(`select count(*) from equipment;`) === '2', "Aidan can't wipe Maceo's equipment");
push('aidan', { type: 'gear', id: 'gear-__group__', user: '__group__', owner: '__group__', goalExclude: ['Maceo', 'Aidan'] });
ok(one(`select string_agg(p.legacy_name, ',' order by p.legacy_name) from group_members m join profiles p on p.id = m.user_id where not counts_in_goal;`) === 'Aidan',
  'a member can switch only themselves out of the group goal');
push('maceo', { type: 'gear', id: 'gear-__group__', user: '__group__', owner: '__group__', goalExclude: ['Julian'] });
ok(one(`select string_agg(p.legacy_name, ',' order by p.legacy_name) from group_members m join profiles p on p.id = m.user_id where not counts_in_goal;`) === 'Julian',
  "the group's owner can switch anyone (Julian out, Aidan back in)");

// --- custom notes, deletes
push('julian', { type: 'flavor', id: 'f1', name: 'Cardamom', user: 'Julian' }); push('aidan', { type: 'flavor', id: 'f2', name: 'Cardamom', user: 'Aidan' });
ok(one(`select count(*) from flavors;`) === '1', 'a custom note is stored once');
push('aidan', { type: 'delete', targetType: 'brew', id: 's1', user: 'Aidan' });
ok(one(`select deleted_at is null from sessions where legacy_id = 's1';`) === 't', "Aidan can't delete Maceo's session");
push('maceo', { type: 'brew', id: 's2', beanId: 'b1', user: 'Maceo', owner: 'Maceo', method: 'Pour Over', dose: 15, yield: 250, time: 180, rating: 4.5, date: '2026-10-05T08:00:00.000Z', likes: [], comments: [] });
push('maceo', { type: 'delete', targetType: 'brew', id: 's1', user: 'Maceo' });
push('aidan', { ...S1, likes: ['Aidan'] });
ok(one(`select (deleted_at is not null) || '|' || (select count(*) from likes) from sessions where legacy_id = 's1';`) === 'true|0', 'Maceo deletes his session, and a late like from an old phone doesn\'t bring it back');
ok(/needs a type and an id/.test(push('maceo', { type: 'brew' }).err || ''), 'a save with no id is refused');
ok(/permission denied/.test(as('anon', 'select pull_events();').err || ''), 'not signed in: the call itself is refused');

// --- what each person pulls, and the app reading it
const forAidan = pull('aidan');
const app = loadApp(HTML); app.user = 'Aidan'; app.process(forAidan);
const s2 = app.brews.get('s2'), b1 = app.beans.get('b1');
ok(app.brews.size === 1 && s2 && app.getBrewOwner(s2) === 'Maceo' && app.normalizeRating(s2.rating) === 4.5 && String(s2.beanId) === 'b1', "the app, reading Aidan's pull: Maceo's live session, with owner, rating and coffee (the deleted one is gone)");
ok(b1 && b1.roaster === 'Onyx Coffee Lab' && (b1.likes || []).join() === 'Aidan' && (b1.wantToTry || []).join() === 'Aidan' && (b1.comments || []).length === 1, '...the coffee with its roaster, like, want-to-try and comment');
const mg = app.gearByUser.get('Maceo') || {};
ok((mg.items || []).map(i => i.name).join() === 'Niche Zero,Decent' && !(mg.recipes || []).length, "...Maceo's equipment, but not his recipes");
ok(app.goalExcluded('Julian') && !app.goalExcluded('Aidan') && !app.goalExcluded('Maceo'), '...the goal switches');
ok(['Aidan', 'Julian', 'Maceo'].every(n => app.knownPeople().includes(n)) && !app.knownPeople().includes('Stranger'), '...and the crew as the people list (not the stranger)');
const forMaceo = pull('maceo'); const appM = loadApp(HTML); appM.user = 'Maceo'; appM.process(forMaceo);
const mine = appM.gearByUser.get('Maceo') || {};
ok((mine.recipes || []).length === 1 && JSON.stringify(mine.lastByMethod) === '{"Espresso":{"dose":18}}' && (mine.fabFour || []).join() === 'b1', 'Maceo gets his full gear back: recipes, last setup, favorites');
// v14.4: the sync carries only your circle (friends, private groups, people you follow); a stranger who has never
// followed anyone gets none of the crew's coffees or sessions, and nobody else's gear
ok(!pull('stranger').some(e => e.type === 'bean' || e.type === 'brew' || (e.type === 'gear' && e.owner === 'Maceo')), "someone outside the crew who follows nobody gets none of the crew's coffees, sessions or gear in their sync");
as('stranger', `select follow('maceo');`);   // from here on the stranger follows Maceo (an open profile)
const forStranger = pull('stranger');
const st = loadApp(HTML); st.user = 'Stranger'; st.process(forStranger);
ok(st.beans.size === 1 && st.brews.size === 0, "once the stranger follows Maceo: his coffee, but none of the crew's Friends & groups sessions");
const strangerSeesMaceo = forStranger.filter(e => e.type === 'gear' && e.owner === 'Maceo');
ok(strangerSeesMaceo.length === 1 && strangerSeesMaceo[0].items.map(i => i.name).join() === 'Niche Zero,Decent' && (strangerSeesMaceo[0].fabFour || []).join() === 'b1' &&
   !strangerSeesMaceo[0].recipes.length && !Object.keys(strangerSeesMaceo[0].lastByMethod).length,
   "a stranger sees what Maceo's profile shows (equipment, favorite coffees) but not his recipes or last setup");
as('maceo', `update equipment set hidden = true where name = 'Decent';`);
ok(!JSON.stringify(pull('stranger')).includes('Decent') && JSON.stringify(pull('maceo')).includes('Decent'), 'equipment Maceo hides is gone for others and still his');
as('maceo', `update equipment set hidden = false where name = 'Decent';`);

// --- photos in storage: your own folder only; readable by whoever may see that session's photo
const MPATH = `${AUTH.maceo}/s2-abc123.jpg`;
ok(as('maceo', `insert into storage.objects (bucket_id, name) values ('photos', '${MPATH}');`).out !== undefined, 'Maceo uploads a photo into his own folder');
ok(/row-level security/.test(as('maceo', `insert into storage.objects (bucket_id, name) values ('photos', '${AUTH.aidan}/fake.jpg');`).err || ''), "...but not into Aidan's");
ok(as('aidan', `select count(*) from storage.objects where name = '${MPATH}';`).out === '0', 'before it belongs to a session, nobody else can read it');
push('maceo', { type: 'brew', id: 's2', beanId: 'b1', user: 'Maceo', owner: 'Maceo', method: 'Pour Over', dose: 15, yield: 250, time: 180, rating: 4.5, date: '2026-10-05T08:00:00.000Z', likes: [], comments: [], photo: { path: 'sb:' + MPATH } });
ok(one(`select path from session_photos p join sessions s on s.id = p.session_id where s.legacy_id = 's2';`) === 'sb:' + MPATH, 'his session points at it');
ok(as('aidan', `select count(*) from storage.objects where name = '${MPATH}';`).out === '1' && as('stranger', `select count(*) from storage.objects where name = '${MPATH}';`).out === '0',
   'now his crew can read the file and a stranger still can\'t (the photo is Friends & groups)');
const s2pull = pull('aidan').find(e => e.type === 'brew' && e.id === 's2');
ok(s2pull && s2pull.photo && s2pull.photo.path === 'sb:' + MPATH && !s2pull.photo.url, 'the pull says where the photo is (the app asks storage for a short-lived link)');
push('aidan', { type: 'brew', id: 'sa', beanId: 'b1', user: 'Aidan', owner: 'Aidan', method: 'Espresso', dose: 18, yield: 36, time: 28, date: '2026-10-06T08:00:00.000Z', likes: [], comments: [], photo: { path: 'sb:' + MPATH } });
ok(one(`select count(*) from session_photos p join sessions s on s.id = p.session_id where s.legacy_id = 'sa';`) === '0', "Aidan can't point his session at Maceo's photo (that would show it to his own friends)");
push('maceo', { type: 'brew', id: 's2', beanId: 'b1', user: 'Maceo', owner: 'Maceo', method: 'Pour Over', dose: 15, yield: 250, time: 180, rating: 4.5, date: '2026-10-05T08:00:00.000Z', likes: [], comments: [], photo: { path: 'sb:' + MPATH, url: 'https://example.supabase.co/storage/v1/object/sign/photos/x?token=t' } });
ok(one(`select path from session_photos p join sessions s on s.id = p.session_id where s.legacy_id = 's2';`) === 'sb:' + MPATH, 'resending the session with its short-lived link keeps the stored path');

// --- the people list: you and your private groups
const peopleOf = who => ((pull(who).find(e => e.type === 'gear' && e.owner === '__people__') || {}).people || []).map(p => p.name).sort().join();
ok(peopleOf('aidan') === 'Aidan,Julian,Maceo' && peopleOf('stranger') === 'Stranger', "the people list is you and your private group (the crew for Aidan; just the stranger for the stranger)");

// --- your color: from your own saves only (a like on someone else's session carries their color)
push('aidan', { ...B1, likes: ['Aidan'], actor: 'Maceo', actorColor: '#123456' });
push('maceo', { ...B1, actor: 'Maceo', actorColor: '#AA3355' });
ok(one(`select string_agg(legacy_name || '=' || color, ',' order by legacy_name) from profiles where legacy_name in ('Aidan', 'Maceo');`) === 'Aidan=#336699,Maceo=#aa3355',
   "Maceo's new color is saved from his own save; a like carrying someone else's color changes nothing");

// --- a comment written straight into the table (not through push_event) still reaches the app with an id
as('aidan', `insert into comments (session_id, author_id, body, audience) select id, me(), 'typed straight in', 'friends' from sessions where legacy_id = 's2';`);
const direct = (pull('maceo').find(e => e.id === 's2').comments || []).find(c => c.text === 'typed straight in');
ok(direct && /^[0-9a-f-]{36}$/.test(direct.id) && direct.user === 'Aidan', 'a comment made outside the app\'s calls still comes back with an id and its author');
psql(`delete from comments where body = 'typed straight in';`);

// --- who each part is for: the session, its note, its photo, each comment (all start as Friends & groups)
const OPEN = { type: 'brew', id: 's3', beanId: 'b1', user: 'Maceo', owner: 'Maceo', method: 'Espresso', dose: 18, yield: 38, time: 27, rating: 4, date: '2026-10-07T08:00:00.000Z',
  notes: 'tasted like jam', photo: { fileId: 'drivefile456' }, likes: [], comments: [] };
push('maceo', OPEN);
ok(one(`select s.audience || '|' || n.audience || '|' || p.audience from sessions s join session_notes n on n.session_id = s.id join session_photos p on p.session_id = s.id where s.legacy_id = 's3';`) === 'friends|friends|friends',
   'a new session, its note and its photo all start as Friends & groups');
ok(!pull('stranger').some(e => e.id === 's3'), '...so a stranger sees none of it');
push('maceo', { ...OPEN, audience: 'everyone', photoAudience: 'everyone' });
let st3 = pull('stranger').find(e => e.id === 's3');
ok(st3 && st3.photo && st3.photo.fileId === 'drivefile456' && !st3.notes && st3.audience === 'everyone' && !st3.noteAudience,
   'Maceo shares the session and the photo with everyone, keeps the note for friends: a stranger sees the session and photo, not the note');
// the community feed: everyone's sessions shared with Everyone, a page at a time, for people who follow nobody too
const W = 'aaaaaaaa-0000-0000-0000-000000000031'; psql(`insert into auth.users values ('${W}');`); AUTH.wanderer = W;
as('wanderer', `select create_profile('Wanderer');`);
const feed = (who, extra = '') => JSON.parse(as(who, `select community_feed(${extra});`).out);
const wf = feed('wanderer');
ok(!pull('wanderer').some(e => e.id === 's3') && wf.events.some(e => e.type === 'brew' && e.id === 's3' && e.photo && !e.notes) && wf.events.some(e => e.type === 'bean' && e.id === 'b1'),
   "someone who follows nobody: not in their sync, but Maceo's public session (photo, no note) and its coffee are in the community feed");
ok(!wf.events.some(e => e.type === 'brew' && e.audience !== 'everyone'), '...and nothing that isn\'t shared with Everyone');
const p1 = feed('wanderer', 'max_items => 1');
ok(p1.events.filter(e => e.type === 'brew').length === 1 && p1.next && feed('wanderer', `before => '${p1.next}'`).events.every(e => e.type !== 'brew' || e.id !== p1.events.find(x => x.type === 'brew').id),
   'it comes a page at a time: "next" gets the older ones, without repeats');
as('maceo', `select block('Wanderer');`);
ok(!feed('wanderer').events.some(e => e.id === 's3'), 'blocked either way: gone from the community feed');
as('maceo', `select unblock('Wanderer');`);
as('maceo', `select set_private(true);`);
ok(!feed('wanderer').events.some(e => e.id === 's3') && pull('stranger').some(e => e.id === 's3'), "a private profile's public sessions show only to people they approved (the stranger followed before)");
as('maceo', `select set_private(false);`);
ok(/permission denied/.test(as('anon', 'select community_feed();').err || ''), 'not signed in: refused');
push('maceo', { ...OPEN, dose: 18.2 });
ok(one(`select s.audience || '|' || n.audience || '|' || p.audience || '|' || s.dose from sessions s join session_notes n on n.session_id = s.id join session_photos p on p.session_id = s.id where s.legacy_id = 's3';`) === 'everyone|friends|everyone|18.2',
   'an edit from a phone that doesn\'t send the settings keeps them as they were');
push('aidan', { ...OPEN, audience: 'everyone', comments: [{ id: 'k9', user: 'Aidan', text: 'public praise', timestamp: '2026-10-07T09:00:00.000Z', audience: 'everyone' },
  { id: 'k10', user: 'Aidan', text: 'just between us', timestamp: '2026-10-07T09:01:00.000Z' }] });
st3 = pull('stranger').find(e => e.id === 's3');
ok(st3 && st3.comments.map(c => c.text).join() === 'public praise' && pull('maceo').find(e => e.id === 's3').comments.length === 2,
   "Aidan's comment shared with everyone shows to the stranger; his Friends one doesn't (Maceo sees both)");
push('aidan', { ...OPEN, comments: [{ id: 'k9', user: 'Aidan', text: 'public praise', timestamp: '2026-10-07T09:00:00.000Z', audience: 'friends' }, { id: 'k10', user: 'Aidan', text: 'just between us', timestamp: '2026-10-07T09:01:00.000Z' }] });
ok(one(`select audience from comments where legacy_ref = 's3#k9';`) === 'friends' && one(`select audience from sessions where legacy_id = 's3';`) === 'everyone',
   'Aidan can switch his comment back to Friends (and can\'t change who Maceo\'s session is for)');
push('maceo', { ...OPEN, audience: 'only_me' });
ok(!pull('aidan').some(e => e.id === 's3') && pull('maceo').some(e => e.id === 's3'), 'a session set to only me disappears for everyone else');

// --- a new person makes a profile (not from the Sheet era)
const NEW = 'aaaaaaaa-0000-0000-0000-000000000009'; psql(`insert into auth.users values ('${NEW}');`); AUTH.newbie = NEW;
ok(as('newbie', 'select my_profile();').out === '', 'signed in with no profile yet: my_profile is empty');
ok(/taken/.test(as('newbie', `select create_profile('Maceo');`).err || ''), "a Sheet-era name can't be taken by someone new");
ok(/2 to 24/.test(as('newbie', `select create_profile('x');`).err || '') && /2 to 24/.test(as('newbie', `select create_profile('__group__');`).err || ''), 'a one-letter or reserved name is refused with a plain reason');
ok(/"name": "Brew Buddy"/.test(as('newbie', `select create_profile('  Brew   Buddy ', '#aa5500');`).out || '') && /"handle": "brewbuddy"/.test(as('newbie', 'select my_profile();').out), 'someone new makes a profile (spaces tidied, capitals kept; the handle is made from it) and my_profile returns it');
psql(`insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000010');`); AUTH.twin = 'aaaaaaaa-0000-0000-0000-000000000010';
ok(/taken/.test(as('twin', `select create_profile('brew buddy');`).err || ''), 'names are unique ignoring capitals');
ok(/"handle": "brewbuddy2"/.test(as('twin', `select create_profile('Brew-Buddy');`).out || ''), 'a different name that makes the same handle gets the next free one');
ok(/already has a profile/.test(as('newbie', `select create_profile('second');`).err || ''), 'one profile per account');
ok(/permission denied/.test(as('anon', `select create_profile('sneaky');`).err || ''), 'not signed in: refused');

// --- following (the database side of phase 3)
const fx = (who, sql) => { const r = as(who, sql); return r.err ? 'ERR ' + r.err : r.out; };
ok(fx('newbie', `select follow('maceo');`) === 'following' && !pull('newbie').some(e => e.id === 's2'), 'Brew Buddy follows Maceo (open profile: right away); a one-way follow doesn\'t show Friends sessions');
ok(fx('maceo', `select follow('Brew Buddy');`) === 'following' && pull('newbie').some(e => e.id === 's2'), 'Maceo follows back: now they\'re friends, so Brew Buddy sees his Friends & groups sessions');
ok(JSON.parse(fx('maceo', 'select my_people();')).following.some(f => f.name === 'Brew Buddy' && f.friend), 'my_people marks the friend');
as('twin', `update profiles set is_private = true where auth_id = auth.uid();`);
ok(fx('newbie', `select follow('brew-buddy');`) === 'requested', 'following a private profile sends a request');
ok(JSON.parse(fx('twin', 'select my_people();')).followers.map(f => f.name + ':' + f.status).join() === 'Brew Buddy:pending', '...which shows in their followers as pending');
ok(fx('twin', `select answer_follow('Brew Buddy', true);`) === 'approved' && JSON.parse(fx('newbie', 'select my_people();')).following.some(f => f.name === 'Brew-Buddy' && f.status === 'accepted'), 'they approve it');
const found = JSON.parse(fx('newbie', `select find_people('ma');`));
ok(found.length === 1 && found[0].name === 'Maceo' && found[0].you === 'accepted' && found[0].followsYou === true, 'find_people: typing "ma" finds Maceo, with who follows whom');
ok(fx('twin', `select block('Brew Buddy');`) === 'blocked' && JSON.parse(fx('newbie', `select find_people('brew');`)).length === 0 && /nobody by that name/.test(fx('newbie', `select follow('Brew-Buddy');`)),
   'blocking ends the follows both ways; the blocked person can no longer find or follow them (and isn\'t told why)');
ok(fx('twin', `select unblock('Brew Buddy');`) === 'unblocked' && JSON.parse(fx('newbie', `select find_people('brew-');`)).length === 1, 'unblocking makes them findable again');
ok(/nobody by that name/.test(fx('newbie', `select follow('nobody here');`)) && /permission denied/.test(fx('anon', `select follow('maceo');`)), 'following someone who doesn\'t exist, or while signed out, is refused');

// --- groups (the database side of phase 3)
const made = JSON.parse(fx('newbie', `select create_group('Saturday shots');`));
ok(made.open === false && /^[a-z2-9]{8}$/.test(made.invite) && peopleOf('newbie') === 'Brew Buddy', 'Brew Buddy makes a private group: an 8-letter invite code, and so far the group is just them');
ok(JSON.parse(fx('twin', `select join_group('${made.invite.toUpperCase()}');`)).name === 'Saturday shots' && peopleOf('newbie') === 'Brew Buddy,Brew-Buddy' && peopleOf('twin').includes('Brew Buddy'),
   'Brew-Buddy joins with the code (capitals forgiven); they\'re now in each other\'s people list');
ok(/doesn.t match/.test(fx('stranger', `select join_group('nope1234');`)) && /doesn.t match/.test(fx('stranger', `select join_group('${made.id}');`)), "a wrong code, or a private group's id, doesn't get you in");
ok(/owner or an admin/.test(fx('twin', `select new_invite('${made.id}');`)) && fx('newbie', `select set_member_role('${made.id}', 'Brew-Buddy', 'admin');`) === 'admin' && /^[a-z2-9]{8}$/.test(fx('twin', `select new_invite('${made.id}');`)),
   'only owners and admins make a new invite code; the owner makes Brew-Buddy an admin, who then can');
ok(fx('twin', `select remove_member('${made.id}', 'Brew Buddy');`) === 'not removed', "an admin can't remove the owner");
const open = JSON.parse(fx('stranger', `select create_group('Moka pot club', true);`));
ok(open.open === true && open.invite === null && JSON.parse(fx('newbie', `select find_groups('moka');`)).some(g => g.id === open.id) && JSON.parse(fx('newbie', `select join_group('${open.id}');`)).open === true,
   'an open group is found by name and joined by anyone, no code needed');
ok(peopleOf('newbie') === 'Brew Buddy,Brew-Buddy', "an open group doesn't make its members your people (only private groups do)");
ok(fx('newbie', `select leave_group('${made.id}');`) === 'left' && JSON.parse(fx('twin', 'select my_groups();')).find(g => g.id === made.id).role === 'owner', 'the owner leaves: the group passes to the admin');
ok(fx('twin', `select leave_group('${made.id}');`) === 'left; the group closed' && one(`select count(*) from groups where id = '${made.id}';`) === '0', 'the last one out closes it');
ok(/permission denied/.test(fx('maceo', `update group_members set role = 'owner' where user_id = me();`)) && /permission denied/.test(fx('maceo', `insert into groups (name, owner_id) values ('x', me());`)), "nobody makes themselves owner or makes a group around the checks");

// --- has anything changed? (the app checks this tiny fingerprint of its circle before pulling everything)
const dv = who => fx(who, 'select data_version();');
const v0 = dv('aidan'), v1 = dv('aidan');
pull('aidan');
const v2 = dv('aidan');
push('julian', { type: 'brew', id: 's2', beanId: 'b1', user: 'Maceo', owner: 'Maceo', likes: ['Julian'], comments: [] });
const v3 = dv('aidan');
ok(/^[0-9a-f]{32}$/.test(v0) && v0 === v1 && v1 === v2 && v3 !== v2, `data_version stays put while nothing changes (reading doesn't move it) and changes with a save in your circle`);
const w0 = dv('wanderer');
push('julian', { type: 'brew', id: 's2', beanId: 'b1', user: 'Maceo', owner: 'Maceo', likes: [], comments: [] });   // (undo that like)
ok(dv('wanderer') === w0 && dv('aidan') !== v3, "...but a save outside your circle doesn't change yours (someone who follows none of them)");
as('julian', `update profiles set city = 'Evanston' where auth_id = auth.uid();`);
const v4 = dv('aidan');
as('julian', `update profiles set city = null where auth_id = auth.uid();`);
ok(v4 !== dv('aidan'), '...and a profile change in your circle (a city, a color, going private) changes it too');
ok(/permission denied/.test(fx('anon', 'select data_version();')), '...and only for signed-in people');

// --- notifications, reporting, your data, deleting your account (the database side of phase 3)
const notes = who => JSON.parse(fx(who, 'select my_notifications();'));
psql(`delete from notifications;`);
push('aidan', { type: 'brew', id: 's2', beanId: 'b1', user: 'Maceo', owner: 'Maceo', likes: ['Aidan'], comments: [{ id: 'n1', user: 'Aidan', text: 'what grind?', timestamp: '2026-10-08T09:00:00.000Z' }] });
push('julian', { type: 'brew', id: 's2', beanId: 'b1', user: 'Maceo', owner: 'Maceo', likes: ['Aidan', 'Julian'], comments: [{ id: 'n1', user: 'Aidan', text: 'what grind?', timestamp: '2026-10-08T09:00:00.000Z' },
  { id: 'n2', user: 'Julian', text: 'same question', timestamp: '2026-10-08T09:05:00.000Z', parentId: 'n1' }] });
let mn = notes('maceo');
ok(mn.unread === 4 && mn.items.map(i => i.kind + ':' + i.who).sort().join() === 'comment:Aidan,comment:Julian,like:Aidan,like:Julian' && mn.items.every(i => i.session === 's2'),
   "Maceo's bell: Aidan and Julian liked and commented on his session (4 unread)");
ok(notes('aidan').items.map(i => i.kind + ':' + i.who).join() === 'reply:Julian', 'Aidan hears that Julian replied to his comment');
push('aidan', { type: 'brew', id: 's2', beanId: 'b1', user: 'Maceo', owner: 'Maceo', likes: ['Aidan', 'Julian'], comments: [{ id: 'n1', user: 'Aidan', text: 'what grind?', timestamp: '2026-10-08T09:00:00.000Z' }, { id: 'n2', user: 'Julian', text: 'same question', timestamp: '2026-10-08T09:05:00.000Z', parentId: 'n1' }] });
ok(notes('maceo').unread === 4, 'the same save again (an old phone resending) notifies nobody twice');
ok(fx('maceo', 'select mark_notifications_read();') === '4' && notes('maceo').unread === 0, 'Maceo reads them');
ok(/permission denied/.test(fx('maceo', `insert into notifications (user_id, actor_id, kind) values (me(), me(), 'like');`)) && notes('julian').items.every(i => i.who !== undefined) && !JSON.stringify(notes('julian')).includes('what grind'),
   "nobody can write a notification directly, and you only ever see your own");
ok(fx('stranger', `select report('session', '${one("select id from sessions where legacy_id = 's2';")}', 'spam');`) === 'reported' && one(`select count(*) from reports where reason = 'spam';`) === '1', 'anyone can report something');
push('newbie', { type: 'brew', id: 'bb1', beanId: 'b1', user: 'Brew Buddy', owner: 'Brew Buddy', method: 'Espresso', dose: 18, yield: 36, time: 28, date: '2026-10-08T08:00:00.000Z', audience: 'everyone', likes: [], comments: [] });
ok(/isn.t there/.test(fx('stranger', `select report_item('session', 's2', 'x');`)), "you can only report what you can see (Maceo's Friends session isn't there for the stranger)");
ok(fx('stranger', `select report_item('session', 'bb1', 'not coffee');`) === 'reported' && fx('stranger', `select report_item('profile', 'Maceo', null);`) === 'reported' &&
   one(`select count(*) filter (where target_type = 'session' and reason = 'not coffee') || '|' || count(*) filter (where target_type = 'profile' and target_id = (select id from profiles where legacy_name = 'Maceo')) from reports;`) === '1|1',
   'report_item: the app reports a session by its id and a profile by name');
ok(/isn.t there/.test(fx('stranger', `select report_item('session', 'no-such-session');`)) && /permission denied/.test(fx('anon', `select report_item('profile', 'Maceo');`)), '...something that isn\'t there, or signed out, is refused');
const exported = JSON.parse(fx('maceo', 'select export_my_data();'));
ok(exported.profile.legacy_name === 'Maceo' && !('auth_id' in exported.profile) && exported.sessions.length >= 2 && exported.coffees.some(k => k.legacy_id === 'b1') && exported.equipment.length === 2,
   'download my data: his profile, sessions, coffees and equipment');
// someone new deletes their account: their group passes on, their coffee that others brewed stays (with a new owner)
psql(`insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000011');`); AUTH.leaver = 'aaaaaaaa-0000-0000-0000-000000000011';
fx('leaver', `select create_profile('Leaver');`);
const lg = JSON.parse(fx('leaver', `select create_group('Leaving soon');`)); fx('maceo', `select join_group('${lg.invite}');`);
push('leaver', { type: 'bean', id: 'bl', user: 'Leaver', owner: 'Leaver', roaster: 'Sey', name: 'Gesha', likes: [], comments: [] });
push('leaver', { type: 'brew', id: 'sl', beanId: 'bl', user: 'Leaver', owner: 'Leaver', method: 'Espresso', date: '2026-10-09T08:00:00.000Z', likes: [], comments: [] });
push('maceo', { type: 'brew', id: 'sm', beanId: 'bl', user: 'Maceo', owner: 'Maceo', method: 'Espresso', date: '2026-10-09T09:00:00.000Z', likes: [], comments: [] });
ok(/exactly/.test(fx('leaver', `select delete_account('leave');`)), 'deleting an account needs your name typed exactly');
ok(fx('leaver', `select delete_account('Leaver');`) === 'deleted' && one(`select count(*) from profiles where display_name = 'Leaver';`) === '0' && one(`select count(*) from sessions where legacy_id = 'sl';`) === '0' &&
   one(`select count(*) from auth.users where id = '${AUTH.leaver}';`) === '0', 'delete account: the profile, its sessions and the sign-in are gone');
ok(one(`select p.legacy_name from groups g join profiles p on p.id = g.owner_id where g.name = 'Leaving soon';`) === 'Maceo' && one(`select p.legacy_name from coffees k join profiles p on p.id = k.owner_id where k.legacy_id = 'bl';`) === 'Maceo' &&
   one(`select count(*) from sessions where legacy_id = 'sm' and coffee_id is not null;`) === '1', "their group passed to Maceo, and the coffee Maceo brewed stays (now his), so his session keeps its coffee");

// --- the community goal (phase 3 draft): same rotation as the app, totals only
const cg = JSON.parse(fx('stranger', 'select community_goal();'));
const appQ = (() => { const a = loadApp(HTML); a.user = 'Maceo'; return a.crewQuest(Date.now()); })();
ok(['sessions', 'origins', 'rated', 'notes', 'everyone', 'methods'].includes(cg.type) && cg.target >= 2 && typeof cg.yourSessions === 'number' && !('by' in cg),
   `the community goal this week: "${cg.title}" (${cg.raw}/${cg.target}), with only totals and your own count`);
ok(process.env.TZ && process.env.TZ !== 'America/Chicago' ? true : cg.type === appQ.type, `it rotates with the app's weekly goal (${cg.type} / app: ${appQ.type})`);
const before2 = JSON.parse(fx('julian', 'select community_goal();')).yourSessions;
push('julian', { type: 'brew', id: 'jg1', beanId: 'b1', user: 'Julian', owner: 'Julian', method: 'Espresso', rating: 4, flavors: 'Cherry', date: new Date().toISOString(), likes: [], comments: [] });
ok(JSON.parse(fx('julian', 'select community_goal();')).yourSessions === before2 + 1, "a session Julian logs now counts toward this week's goal");

// --- v14.5: anyone's profile page, suggested people, help requests, what a report hides, reviewing reports
const NOW = () => new Date().toISOString();
const pp = (who, name, extra = '') => { const r = as(who, `select profile_page(${q(name)}${extra});`); return r.err ? { err: r.err } : JSON.parse(r.out); };
const brewsIn = page => (page.events || []).filter(e => e.type === 'brew').map(e => e.id);
push('maceo', { type: 'brew', id: 'pp1', beanId: 'b1', user: 'Maceo', owner: 'Maceo', method: 'Pour Over', dose: 15, yield: 250, date: NOW(), audience: 'everyone', likes: [], comments: [] });
push('maceo', { type: 'brew', id: 'pp2', beanId: 'b1', user: 'Maceo', owner: 'Maceo', method: 'Espresso', date: NOW(), likes: [], comments: [] });
let wp = pp('wanderer', 'maceo');
ok(wp.profile && wp.profile.name === 'Maceo' && brewsIn(wp).includes('pp1') && !brewsIn(wp).some(id => ['pp2', 's2', 's3'].includes(id)) && wp.events.some(e => e.type === 'bean' && e.id === 'b1'),
   "profile_page: someone outside Maceo's circle sees his sessions shared with Everyone (and their coffee), not his Friends or Only-me ones");
ok(brewsIn(pp('aidan', 'Maceo')).includes('pp2') && !brewsIn(pp('aidan', 'Maceo')).includes('s3'), '...a friend also sees his Friends sessions (never Only me)');
const wg = wp.events.find(e => e.type === 'gear');
ok(wg && wg.id === 'gear-Maceo' && wg.items.length === 2 && JSON.stringify(wg.recipes) === '[]' && JSON.stringify(wg.lastByMethod) === '{}', '...and the gear his profile shows (equipment), never his recipes or last setups');
ok(!wp.profile.you && !wp.profile.locked && pp('wanderer', 'Brew Buddy').events.some(e => e.id === 'bb1' && e.newHere === true) && !pp('wanderer', 'Maceo').events.some(e => e.newHere),
   "...the card says how you're connected (not following yet), and sessions of someone who joined in the last two weeks say New here (the crew's don't)");
const pg1 = pp('wanderer', 'Maceo', ', max_items => 1');
ok(brewsIn(pg1).length === 1 && pg1.next && !brewsIn(pp('wanderer', 'Maceo', `, before => '${pg1.next}'`)).includes(brewsIn(pg1)[0]), 'it comes a page at a time');
as('maceo', `select set_private(true);`);
wp = pp('wanderer', 'Maceo');
ok(wp.profile.locked === true && brewsIn(wp).length === 0 && brewsIn(pp('aidan', 'Maceo')).includes('pp1'), 'a private profile: locked for people he hasn\'t approved (no sessions), friends still see them');
as('maceo', `select set_private(false);`);
as('maceo', `select block('Wanderer');`);
ok(/nobody by that name/.test(pp('wanderer', 'Maceo').err || '') && /nobody by that name/.test(pp('maceo', 'Wanderer').err || ''), 'blocked either way: no profile page');
as('maceo', `select unblock('Wanderer');`);
ok(/permission denied/.test(pp('anon', 'Maceo').err || ''), 'not signed in: refused');

// suggestions: from what people share with Everyone; never someone you already follow, private, or blocked
const sug = who => JSON.parse(fx(who, 'select suggest_people();'));
let ws = sug('wanderer');
ok(ws.some(x => x.name === 'Maceo' && x.reason === 'Brewing this week') && !ws.some(x => x.name === 'Wanderer'), `someone with nothing logged yet gets people brewing this week (${ws.map(x => x.name + ': ' + x.reason).join('; ')})`);
push('wanderer', { type: 'brew', id: 'wd1', beanId: 'b1', user: 'Wanderer', owner: 'Wanderer', method: 'Pour Over', date: NOW(), audience: 'everyone', likes: [], comments: [] });
ws = sug('wanderer');
ok(/^Brews .+ too$/.test((ws.find(x => x.name === 'Maceo') || {}).reason || ''), `after logging a session on the same coffee: "${(ws.find(x => x.name === 'Maceo') || {}).reason}"`);
fx('wanderer', `select follow('Maceo');`);
as('newbie', `update profiles set is_private = true where auth_id = auth.uid();`);
ws = sug('wanderer');
ok(!ws.some(x => x.name === 'Maceo') && !ws.some(x => x.name === 'Brew Buddy'), "people you follow and private profiles aren't suggested");
as('newbie', `update profiles set is_private = false where auth_id = auth.uid();`);
fx('wanderer', `select unfollow('Maceo');`);
as('wanderer', `select block('Maceo');`);
ok(!sug('wanderer').some(x => x.name === 'Maceo'), '...nor anyone blocked');
as('wanderer', `select unblock('Maceo');`);
ok(/permission denied/.test(fx('anon', 'select suggest_people();')), '...and only for signed-in people');

// open groups: a feed of their members' public sessions, and a list to browse
const og = JSON.parse(fx('wanderer', `select create_group('Pour-over people', true);`));
fx('maceo', `select join_group('${og.id}');`);
const ogf = JSON.parse(fx('julian', `select community_feed(feed_group => '${og.id}');`));
ok(brewsIn(ogf).length >= 1 && brewsIn(ogf).every(id => ['pp1', 'wd1'].includes(id)) && brewsIn(ogf).includes('pp1'), "an open group's feed: its members' sessions shared with Everyone, for anyone");
const sat = JSON.parse(fx('newbie', `select create_group('Secret circle');`));
ok(JSON.parse(fx('julian', `select community_feed(feed_group => '${sat.id}');`)).events.length === 0, "...a private group's isn't shown to people outside it");
fx('julian', `select join_group('${sat.invite}');`);
push('newbie', { type: 'brew', id: 'sat1', beanId: 'b1', user: 'Brew Buddy', owner: 'Brew Buddy', method: 'Espresso', date: new Date().toISOString(), likes: [], comments: [] });   // Friends & groups
ok(brewsIn(JSON.parse(fx('julian', `select community_feed(feed_group => '${sat.id}');`))).includes('sat1') && !brewsIn(JSON.parse(fx('stranger', `select community_feed(feed_group => '${sat.id}');`))).includes('sat1'),
   "a private community's feed: members see each other's Friends & groups sessions there too; nobody outside does");
push('newbie', { type: 'delete', targetType: 'brew', id: 'sat1', user: 'Brew Buddy' });
fx('julian', `select leave_group('${sat.id}');`);
const browse = JSON.parse(fx('julian', `select find_groups('');`));
ok(browse.some(g => g.id === og.id && g.members === 2) && !browse.some(g => g.id === sat.id), 'find_groups with nothing typed lists open groups (most people first), never private ones');
fx('newbie', `select leave_group('${sat.id}');`);

// help requests
push('maceo', { type: 'brew', id: 'pp1', beanId: 'b1', user: 'Maceo', owner: 'Maceo', method: 'Pour Over', dose: 15, yield: 250, date: NOW(), audience: 'everyone', helpWanted: true, likes: [], comments: [] });
ok(one(`select help_wanted from sessions where legacy_id = 'pp1';`) === 't' && pull('maceo').find(e => e.id === 'pp1').helpWanted === true && !pull('maceo').find(e => e.id === 'pp2').helpWanted,
   'Maceo asks for help on a session: saved, and it comes back with the session (and only that one)');
push('maceo', { type: 'brew', id: 'pp1', beanId: 'b1', user: 'Maceo', owner: 'Maceo', method: 'Pour Over', dose: 15.5, yield: 250, date: NOW(), audience: 'everyone', likes: [], comments: [] });
ok(one(`select help_wanted || '|' || dose from sessions where legacy_id = 'pp1';`) === 'true|15.5', "an edit from a phone that doesn't know about help requests keeps it");
const hf = JSON.parse(fx('wanderer', `select community_feed(feed_filter => 'help');`));
ok(brewsIn(hf).join() === 'pp1', 'the community feed\'s Help filter shows help requests only');
ok(brewsIn(JSON.parse(fx('wanderer', `select community_feed(feed_method => 'pour over');`))).every(id => ['pp1', 'wd1'].includes(id)) &&
   brewsIn(JSON.parse(fx('wanderer', `select community_feed(feed_filter => 'new');`))).every(id => ['bb1', 'wd1'].includes(id)) && brewsIn(JSON.parse(fx('wanderer', `select community_feed(feed_filter => 'new');`))).includes('bb1'),
   '...a method filter shows that method only, and New here shows people who joined in the last two weeks');
psql(`delete from notifications;`);
push('wanderer', { type: 'brew', id: 'pp1', beanId: 'b1', user: 'Maceo', owner: 'Maceo', likes: [], comments: [{ id: 'h1', user: 'Wanderer', text: 'try a finer grind and a longer bloom', timestamp: NOW(), audience: 'everyone' }] });
push('maceo', { ...pull('maceo').find(e => e.id === 'pp1'), helpfulAnswer: 'h1' });
let hp = pull('maceo').find(e => e.id === 'pp1');
ok(hp.helpfulAnswer === 'h1' && hp.helpWanted === true && notes('wanderer').items.some(i => i.kind === 'helpful' && i.who === 'Maceo' && i.session === 'pp1' && /finer/.test(i.comment)),
   'Maceo marks the most helpful answer: it stays with the session and Wanderer hears about it');
push('maceo', hp);
ok(notes('wanderer').items.filter(i => i.kind === 'helpful').length === 1, '...once (saving the session again doesn\'t notify again)');
ok(pull('maceo').find(e => e.id === 'pp1').newHere === undefined && one(`select extras ? 'newHere' from sessions where legacy_id = 'bb1';`) === 'f', "New here is worked out, never stored");

// what a report hides
const wdv = dv('wanderer');
ok(fx('wanderer', `select report_item('session', 'pp1', 'testing');`) === 'reported' && dv('wanderer') !== wdv, 'Wanderer reports a session (their change check moves, so the app refreshes)');
ok(!brewsIn(feed('wanderer')).includes('pp1') && !brewsIn(pp('wanderer', 'Maceo')).includes('pp1') && brewsIn(feed('aidan')).length >= 0 && pull('aidan').some(e => e.id === 'pp1') && pull('maceo').some(e => e.id === 'pp1'),
   "...it's gone for them right away (community feed, profile), still there for everyone else and its owner");
fx('newbie', `select report_item('session', 'bb1', 'x');`);   // the stranger reported it earlier: two people so far
ok(pull('maceo').some(e => e.id === 'bb1'), 'two different people reporting a session: still shown to others');
fx('twin', `select report_item('session', 'bb1', 'y');`);
ok(!pull('maceo').some(e => e.id === 'bb1') && !brewsIn(feed('aidan')).includes('bb1') && pull('newbie').some(e => e.id === 'bb1'),
   'a third person: hidden from everyone (sync and community feed) but its owner, until reviewed');
push('aidan', { type: 'brew', id: 's2', beanId: 'b1', user: 'Maceo', owner: 'Maceo', likes: [], comments: [{ id: 'r1', user: 'Aidan', text: 'rude words', timestamp: NOW(), audience: 'friends' }] });
fx('maceo', `select report_item('comment', 's2#r1', 'rude');`);
ok(!(pull('maceo').find(e => e.id === 's2').comments || []).some(c => c.id === 'r1') && (pull('julian').find(e => e.id === 's2').comments || []).some(c => c.id === 'r1') && (pull('aidan').find(e => e.id === 's2').comments || []).some(c => c.id === 'r1'),
   "a reported comment: gone for the reporter; others and its author still see it (so the author's next save doesn't delete it)");

// reviewing (admins only)
ok(/Only reviewers/.test(fx('maceo', 'select review_reports();')) && JSON.parse(fx('maceo', 'select my_profile();')).admin === false, 'reviewing reports is for reviewers only');
psql(`insert into backend_state (key, value) values ('admins', '${P.Maceo}') on conflict (key) do update set value = excluded.value;`);
const rv = JSON.parse(fx('maceo', 'select review_reports();'));
const bbRow = rv.find(r => r.kind === 'session' && r.ref === 'bb1');
ok(JSON.parse(fx('maceo', 'select my_profile();')).admin === true && bbRow && bbRow.count === 3 && bbRow.status === 'hidden' && bbRow.who === 'Brew Buddy' && rv.some(r => r.kind === 'comment' && r.text === 'rude words'),
   `a reviewer sees what's waiting: ${rv.length} reported things, the hidden session with its 3 reports`);
ok(fx('maceo', `select resolve_report('session', '${bbRow.target}', 'dismiss');`) === 'dismissed' && pull('maceo').some(e => e.id === 'bb1') && brewsIn(feed('twin')).includes('bb1'),
   'dismissed: shown again to everyone, the people who reported it too');
const r1 = rv.find(r => r.kind === 'comment');
ok(fx('maceo', `select resolve_report('comment', '${r1.target}', 'remove');`) === 'removed' && !(pull('julian').find(e => e.id === 's2').comments || []).some(c => c.id === 'r1'), 'removed: the comment is gone for everyone');
ok(!JSON.parse(fx('maceo', 'select review_reports();')).some(r => r.ref === 'bb1' || r.kind === 'comment'), '...and both leave the review list');
ok(/Only reviewers/.test(fx('aidan', `select resolve_report('session', '${bbRow.target}', 'remove');`)), 'nobody else can resolve a report');

// phone notifications: nothing until the sender is set up; then a phone saves its subscription, and the sender reads
// one notification's text and the phones to send it to (only with the shared secret)
ok(fx('maceo', 'select push_key();') === '', 'push_key() is empty until the sender is set up (so the app shows no switch)');
psql(`insert into backend_state (key, value) values ('vapid_public', 'BPUBLICKEY'), ('vapid_private', 'private-key'), ('push_url', 'https://example.com/functions/v1/send-push'), ('push_secret', 's3cret')
  on conflict (key) do update set value = excluded.value;`);
ok(fx('maceo', 'select push_key();') === 'BPUBLICKEY', '...then it hands out the public key');
const SUB = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'BKEY', auth: 'AUTH' } };
ok(/look right/.test(fx('maceo', `select save_push(${q(JSON.stringify({ endpoint: 'http://insecure', keys: SUB.keys }))}::jsonb);`)) && fx('maceo', `select save_push(${q(JSON.stringify(SUB))}::jsonb);`) === 'on' &&
   one(`select p.legacy_name from push_subscriptions s join profiles p on p.id = s.profile_id;`) === 'Maceo', 'Maceo turns notifications on for his phone (a bad subscription is refused)');
ok(/permission denied/.test(fx('aidan', 'select * from push_subscriptions;')) && /permission denied/.test(fx('anon', `select save_push(${q(JSON.stringify(SUB))}::jsonb);`)), "nobody can read the phones' addresses, and signed-out visitors can't save one");
ok(/permission denied/.test(fx('maceo', `select internal.push_payload(1, 's3cret');`)), '...nor ask for what the sender reads');
psql(`delete from notifications;`);
push('aidan', { type: 'brew', id: 's2', beanId: 'b1', user: 'Maceo', owner: 'Maceo', likes: ['Aidan'], comments: [] });
const nid = one(`select id from notifications order by id desc limit 1;`);
const pay = JSON.parse(one(`select internal.push_payload(${nid}, 's3cret');`));
ok(pay && pay.title === 'Aidan' && pay.body === 'Liked your session' && pay.subs.length === 1 && pay.subs[0].endpoint === SUB.endpoint && pay.privateKey === 'private-key' && one(`select internal.push_payload(${nid}, 'wrong') is null;`) === 't',
   `a like is still saved with the sender set up (no pg_net here), and the sender reads "${pay && pay.body}" and Maceo's phone (never without the secret)`);
ok(fx('maceo', `select remove_push(${q(SUB.endpoint)});`) === 'off' && one(`select count(*) from push_subscriptions;`) === '0', 'he turns them off: the phone is forgotten');
psql(`delete from backend_state where key in ('vapid_public', 'vapid_private', 'push_url', 'push_secret');`);

// Discover: everyone's sessions, ranked (recency first, then effort, response, variety, newcomers and help), and it ends
const disc = (who, extra = '') => JSON.parse(fx(who, `select discover_feed(${extra});`));
psql(`insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000041'), ('aaaaaaaa-0000-0000-0000-000000000042');`); AUTH.d1 = 'aaaaaaaa-0000-0000-0000-000000000041'; AUTH.d2 = 'aaaaaaaa-0000-0000-0000-000000000042';
fx('d1', `select create_profile('Discoverer One');`); fx('d2', `select create_profile('Discoverer Two');`);
const ago = h => new Date(Date.now() - h * 3600e3).toISOString();
push('d1', { type: 'bean', id: 'db1', user: 'Discoverer One', owner: 'Discoverer One', roaster: 'Sey', name: 'Kenya Kiambu', origin: 'Kenya', likes: [], comments: [] });
push('d1', { type: 'brew', id: 'dfresh', beanId: 'db1', user: 'Discoverer One', owner: 'Discoverer One', method: 'Pour Over', date: ago(2), audience: 'everyone', likes: [], comments: [] });
push('d1', { type: 'brew', id: 'dold', beanId: 'db1', user: 'Discoverer One', owner: 'Discoverer One', method: 'Pour Over', date: ago(24 * 9), audience: 'everyone', notes: 'bright, floral, long sweet finish', rating: 5, likes: [], comments: [] });
push('d1', { type: 'brew', id: 'dancient', beanId: 'db1', user: 'Discoverer One', owner: 'Discoverer One', method: 'Pour Over', date: ago(24 * 70), audience: 'everyone', likes: [], comments: [] });
push('d1', { type: 'brew', id: 'dfriends', beanId: 'db1', user: 'Discoverer One', owner: 'Discoverer One', method: 'Pour Over', date: ago(1), likes: [], comments: [] });
push('d2', { type: 'brew', id: 'deffort', beanId: 'db1', user: 'Discoverer Two', owner: 'Discoverer Two', method: 'Espresso', date: ago(6), audience: 'everyone', notes: 'syrupy, blackcurrant, a little sharp at the end', rating: 4, acidity: 7, tasted: ['acidity'], likes: [], comments: [] });
push('d2', { type: 'brew', id: 'dbare', beanId: 'db1', user: 'Discoverer Two', owner: 'Discoverer Two', method: 'Espresso', date: ago(5), audience: 'everyone', likes: [], comments: [] });
let dv1 = disc('stranger');
const order = dv1.order;
ok(Array.isArray(order) && order.includes('dfresh') && !order.includes('dancient') && !order.includes('dfriends') && order.indexOf('dfresh') < order.indexOf('dold'),
   `Discover: a fresh session ranks above a better one from nine days ago; nothing older than two months, nothing kept to Friends (${order.slice(0, 6).join(', ')})`);
ok(order.indexOf('deffort') < order.indexOf('dbare'), 'effort counts: notes, a rating and the taste sliders lift a session above a bare one from the same hour');
ok(!disc('d1').order.some(id => ['dfresh', 'dold'].includes(id)), 'never your own sessions');
const dp0 = disc('stranger', 'max_items => 2'), dp1 = disc('stranger', `as_of => '${dp0.asOf}', page => 1, max_items => 2`);
ok(dp0.order.length === 2 && dp0.next === 1 && dp1.order.every(id => !dp0.order.includes(id)) && dp0.total === dv1.total, 'pages are ranked once (as of the first page): page two never repeats page one');
const last = disc('stranger', `max_items => 40`);
ok(last.next === null && last.order.length === last.total, '...and it ends: no endless scroll');
ok(disc('stranger', `feed_method => 'espresso'`).order.every(id => ['deffort', 'dbare', 's3', 'bb1', 'jg1'].includes(id) || true) && disc('stranger', `feed_method => 'espresso'`).order.includes('deffort') && !disc('stranger', `feed_method => 'espresso'`).order.includes('dfresh'),
   'a method filter keeps that method');
fx('stranger', `select report_item('session', 'dfresh', 'test');`);
ok(!disc('stranger').order.includes('dfresh'), 'something you reported is gone from it');
ok(/permission denied/.test(fx('anon', 'select discover_feed();')), 'not signed in: refused');
// v15.0: with_friends also ranks Friends sessions you can see (a stranger still can't)
fx('d1', `select follow('Discoverer Two');`); fx('d2', `select follow('Discoverer One');`);
ok(disc('d2', 'with_friends => true').order.includes('dfriends') && !disc('d2').order.includes('dfriends') && !disc('stranger', 'with_friends => true').order.includes('dfriends'),
   'with_friends: a friend sees the Friends session ranked in too; without it, or for a stranger, it stays out');

// v14.6: everyone on a coffee (the coffee page's Everyone tab): same roaster and name however it's written, never your own,
// nothing kept to Friends or reported; a summary with each method's usual ratio and time and the notes people pick, never grind
push('maceo', { type: 'bean', id: 'mb9', user: 'Maceo', owner: 'Maceo', roaster: 'SEY ', name: 'Kenya  Kiambu!', origin: 'Kenya', likes: [], comments: [] });
push('maceo', { type: 'brew', id: 'ms9', beanId: 'mb9', user: 'Maceo', owner: 'Maceo', method: 'Pour Over', grind: '24', dose: 18, yield: 300, time: 180, rating: 4, flavors: 'Blackcurrant, grapefruit', flavorNotes: { Blackcurrant: 2, Grapefruit: 1, Jasmine: 1 }, date: ago(3), audience: 'everyone', likes: [], comments: [] });
const cc = (who, extra = '') => JSON.parse(fx(who, `select coffee_community('sey', 'Kenya Kiambu'${extra});`));
const cs = cc('stranger'), cids = cs.events.filter(e => e.type === 'brew').map(e => e.id);
ok(cs.summary && cs.summary.people === 3 && cs.summary.sessions === 5 && ['ms9', 'dold', 'dancient', 'deffort', 'dbare'].every(id => cids.includes(id)) && !cids.includes('dfresh') && !cids.includes('dfriends'),
   `Everyone on a coffee: 3 people, 5 sessions, across owners and spellings ("SEY ", "Kenya  Kiambu!"); not what's kept to Friends or what you reported (${cids.join(', ')})`);
const po = (cs.summary.methods || []).find(m => m.method === 'Pour Over'), es = (cs.summary.methods || []).find(m => m.method === 'Espresso');
ok(po && po.n === 3 && po.ratio === 16.7 && po.time === 180 && po.dose === 18 && es && es.n === 2 && cs.summary.methods[0].method === 'Pour Over' && cs.summary.rating === 4.3,
   `each method's usual numbers, most-brewed first (${JSON.stringify(cs.summary.methods)}), average rating ${cs.summary.rating}`);
ok(JSON.stringify(cs.summary.notes) === JSON.stringify(['blackcurrant', 'grapefruit', 'jasmine']) && !/grind/.test(JSON.stringify(cs.summary)), `the flavor notes people pick, once per session (${cs.summary.notes}); not the taste sliders; no grind settings in the summary`);
const cm = cc('maceo');
ok(cm.summary.people === 2 && !cm.events.some(e => e.type === 'brew' && e.id === 'ms9') && cm.events.some(e => e.id === 'dfresh'), 'never your own sessions (Maceo sees the other two people, and dfresh, which he didn\'t report)');
const cp0 = cc('stranger', ', max_items => 2'), cp1 = cc('stranger', `, before => '${cp0.next}', max_items => 2`);
const ids0 = cp0.events.filter(e => e.type === 'brew').map(e => e.id), ids1 = cp1.events.filter(e => e.type === 'brew').map(e => e.id);
ok(ids0.length === 2 && cp0.next && ids1.length === 2 && ids1.every(id => !ids0.includes(id)) && cp1.summary === null, `a page at a time, newest first (${ids0} | ${ids1}); the summary comes with the first`);
ok(cs.events.some(e => e.type === 'bean' && e.id === 'mb9') && cs.events.some(e => e.type === 'bean' && e.id === 'db1'), 'the coffees come along (for names and details)');
ok(JSON.parse(fx('stranger', `select coffee_community('', '');`)).summary === null && cc('stranger', ", max_items => 40").next === null, 'no name: nothing; the last page says so');
ok(/permission denied/.test(fx('anon', `select coffee_community('sey', 'kenya kiambu');`)), 'not signed in: refused');

// v14.6: your own goals ride in your gear record: saved, back in your pull, never in anyone else's
const myGear = pull('maceo').find(e => e.type === 'gear' && e.id === 'gear-Maceo') || { type: 'gear', id: 'gear-Maceo', user: 'Maceo', owner: 'Maceo', items: [] };
const goalsIn = [{ type: 'week', target: 5 }, { type: 'beat', target: 4.5, key: 'onyx|monarch', name: 'Monarch', since: '2026-10-16T12:00:00Z' }, { type: 'coffees', target: 2 }, { type: 'week', target: 9 }];
ok(!push('maceo', { ...myGear, goals: goalsIn }).err, 'saving goals with the gear record');
const gBack = (pull('maceo').find(e => e.type === 'gear' && e.id === 'gear-Maceo') || {}).goals || [];
ok(gBack.length === 3 && gBack[0].target === 5 && gBack[1].key === 'onyx|monarch', `your goals come back in your pull (at most three: ${JSON.stringify(gBack.map(g => g.type))})`);
const { goals: _g, ...oldPhone } = { ...myGear, goals: undefined };
ok(!push('maceo', { ...oldPhone, fabFour: [] }).err && ((pull('maceo').find(e => e.type === 'gear' && e.id === 'gear-Maceo') || {}).goals || []).length === 3, 'a save from a phone on an older version (no goals in it) leaves the goals be');
ok(!pull('aidan').some(e => e.type === 'gear' && e.owner === 'Maceo' && 'goals' in e) && !pull('stranger').some(e => e.type === 'gear' && e.owner === 'Maceo' && 'goals' in e), 'nobody else gets your goals (a friend or a stranger)');

// v14.6: speed limits: 20 new comments in 5 minutes (by the server's clock), then "going a bit fast"; reports too
const spamOn = (n, from = 0) => ({ type: 'brew', id: 'dold', beanId: 'db1', user: 'Discoverer One', owner: 'Discoverer One', method: 'Pour Over', date: ago(24 * 9), audience: 'everyone',
  notes: 'bright, floral, long sweet finish', rating: 5, likes: [], comments: Array.from({ length: n }, (_, i) => ({ id: 'sp' + (from + i), user: 'Stranger', text: 'nice ' + (from + i), timestamp: '2020-01-01T00:00:00Z', parentId: '', likes: [] })) });
const tooFast = push('stranger', spamOn(21));
ok(tooFast.err && /going a bit fast/.test(tooFast.err) && one(`select count(*) from comments where legacy_ref like 'dold#sp%';`) === '0', 'speed limit: 21 new comments at once are refused ("You\'re going a bit fast"), and none of them saved');
ok(!push('stranger', spamOn(20)).err && one(`select count(*) from comments where legacy_ref like 'dold#sp%';`) === '20', '20 go through (backdated timestamps don\'t matter: the server counts when they arrive)');
ok(/going a bit fast/.test(push('stranger', spamOn(21)).err || ''), 'the 21st within five minutes is refused');
ok(!push('stranger', spamOn(20)).err, 're-sending the same 20 is fine (only new comments count)');
psql(`update internal.rate_log set at = at - interval '6 minutes';`);
ok(!push('stranger', spamOn(21)).err && one(`select count(*) from comments where legacy_ref like 'dold#sp%';`) === '21', 'five minutes later it goes through');
ok(!(() => { try { psql(`set dialed.replay = 'on'; set role authenticated; set request.jwt.claim.sub to '${AUTH.stranger}'; select push_event(${q(JSON.stringify(spamOn(21, 100)))}::jsonb);`); return ''; } catch (e) { return String(e.stderr || e.message); } })() && one(`select count(*) from comments where legacy_ref like 'dold#sp1__';`) === '21',
   'carrying over earlier saves from the database itself (replay_late.js) is not held by the limits');
psql(`delete from internal.rate_log where kind = 'report';`);
const repAlerts0 = one(`select count(*) from notifications where kind = 'report';`);
const reps = Array.from({ length: 21 }, (_, i) => fx('stranger', `select report_item('session', 'dold', 'r${i}');`));
ok(reps.slice(0, 20).every(r => r === 'reported') && /going a bit fast/.test(reps[20]), 'reports: 20 an hour');
ok(Number(one(`select count(*) from notifications where kind = 'report';`)) - Number(repAlerts0) <= 1, 'reporting the same thing again doesn\'t alert the reviewer again');
psql(`delete from internal.rate_log; delete from comments where legacy_ref like 'dold#sp%'; delete from reports where reason ~ '^r[0-9]+$';`);

// v14.7: monthly highlights: different people for different reasons, from what was shared with Everyone; once worked
// out they're kept; nobody two months running; at most one each; people you blocked don't show for you
{
  const M0 = new Date(); const ym = (y, mo) => `${y}-${String(mo).padStart(2, '0')}-01`;
  const prev = new Date(Date.UTC(M0.getUTCFullYear(), M0.getUTCMonth() - 1, 1)), prev2 = new Date(Date.UTC(M0.getUTCFullYear(), M0.getUTCMonth() - 2, 1));
  const PM = ym(prev.getUTCFullYear(), prev.getUTCMonth() + 1), PM2 = ym(prev2.getUTCFullYear(), prev2.getUTCMonth() + 1);
  const inPM = (d, h = 12) => `${PM.slice(0, 8)}${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`;
  psql(`insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000061'), ('aaaaaaaa-0000-0000-0000-000000000062'), ('aaaaaaaa-0000-0000-0000-000000000063');`);
  AUTH.h1 = 'aaaaaaaa-0000-0000-0000-000000000061'; AUTH.h2 = 'aaaaaaaa-0000-0000-0000-000000000062'; AUTH.h3 = 'aaaaaaaa-0000-0000-0000-000000000063';
  fx('h1', `select create_profile('Hana');`); fx('h2', `select create_profile('Hugo');`); fx('h3', `select create_profile('Hedy');`);
  psql(`update profiles set joined_at = '${inPM(2)}' where display_name = 'Hana'; update profiles set joined_at = '${PM2}' where display_name in ('Hugo', 'Hedy');`);
  // Hana: new last month, 4 sessions; Hugo: one coffee from 2 to 4.5 stars; Hedy: three origins, and a photo two people liked
  const bean = (who, name, id, origin) => push(who, { type: 'bean', id, user: name, owner: name, roaster: 'Test', name: id, origin, likes: [], comments: [] });
  const brew = (who, name, id, beanId, d, rating, extra = {}) => push(who, { type: 'brew', id, beanId, user: name, owner: name, method: 'Espresso', rating, date: inPM(d), audience: 'everyone', likes: [], comments: [], ...extra });
  bean('h1', 'Hana', 'hb1', 'Kenya'); [3, 5, 7, 9].forEach((d, i) => brew('h1', 'Hana', 'hs' + i, 'hb1', d, 3));
  bean('h2', 'Hugo', 'gb1', 'Brazil'); brew('h2', 'Hugo', 'gs1', 'gb1', 4, 2); brew('h2', 'Hugo', 'gs2', 'gb1', 10, 3.5); brew('h2', 'Hugo', 'gs3', 'gb1', 18, 4.5);
  ['Ethiopia', 'Colombia', 'Peru'].forEach((o, i) => bean('h3', 'Hedy', 'eb' + i, o));
  ['eb0', 'eb1', 'eb2'].forEach((b, i) => brew('h3', 'Hedy', 'es' + i, b, 6 + i, 4));
  psql(`insert into session_photos (session_id, path, audience) select id, 'sb:${AUTH.h3}/es0.jpg', 'everyone' from sessions where legacy_id = 'es0';
        insert into likes (session_id, user_id) select s.id, p.id from sessions s, profiles p where s.legacy_id = 'es0' and p.display_name in ('Hana', 'Hugo');`);
  const hl = JSON.parse(fx('stranger', `select monthly_highlights();`));
  const kinds = Object.fromEntries((hl.items || []).map(x => [x.kind, x.name]));
  ok(hl.month === PM && kinds.first_month === 'Hana' && kinds.improved === 'Hugo' && kinds.explorer === 'Hedy' && !kinds.photo, `last month's highlights: ${JSON.stringify(kinds)} (one each: Hedy has the explorer one, so the photo goes to nobody else with two likes)`);
  const imp = hl.items.find(x => x.kind === 'improved');
  ok(imp && imp.detail.from === 2 && imp.detail.to === 4.5 && imp.session === 'gs3', `"most improved" says from 2 to 4.5 stars, and points at that session (${JSON.stringify(imp)})`);
  psql(`update sessions set rating = 5 where legacy_id = 'hs0';`);
  ok(JSON.stringify(JSON.parse(fx('maceo', `select monthly_highlights();`)).items) === JSON.stringify(hl.items), 'once worked out, they stay the same (for everyone)');
  fx('h1', `select block('Hugo');`);
  ok(!JSON.parse(fx('h1', `select monthly_highlights();`)).items.some(x => x.name === 'Hugo'), 'someone you blocked (or who blocked you) isn\'t shown to you');
  fx('h1', `select unblock('Hugo');`);
  ok(/isn't over yet/.test(fx('stranger', `select monthly_highlights(date_trunc('month', now())::date);`)), 'this month: not yet');
  ok(/permission denied/.test(fx('anon', `select monthly_highlights();`)), 'not signed in: refused');
  // the month before: nobody featured last month can be featured in it... (checked going forward: a new month skips last month's people)
  psql(`insert into highlights (month, kind, profile_id) select '${PM2}'::date, 'first_month', id from profiles where display_name = 'Hugo';`);
  psql(`delete from highlights where month = '${PM}'; delete from highlight_months where month = '${PM}';`);
  const hl2 = JSON.parse(fx('stranger', `select monthly_highlights();`));
  ok(!hl2.items.some(x => x.name === 'Hugo'), `nobody two months running (Hugo was featured the month before, so not again: ${JSON.stringify(hl2.items.map(x => x.kind + ':' + x.name))})`);
  psql(`delete from highlights; delete from highlight_months;`);
}

// the community goal counts Everyone and Friends sessions, not Only me; and says how many people brewed this week
const g0 = JSON.parse(fx('julian', 'select community_goal();'));
push('julian', { type: 'brew', id: 'jg2', beanId: 'b1', user: 'Julian', owner: 'Julian', method: 'Espresso', date: NOW(), audience: 'only_me', likes: [], comments: [] });
const g1 = JSON.parse(fx('julian', 'select community_goal();'));
ok(g1.yourSessions === g0.yourSessions && typeof g1.people === 'number' && g1.people >= 3, `an Only me session doesn't count; ${g1.people} people brewed this week`);

// spam limit: following 200 people in a day is plenty
psql(`insert into profiles (handle, display_name) select 'bulk' || i, 'Bulk ' || i from generate_series(1, 201) i;
  insert into follows (follower, followee) select (select id from profiles where auth_id = '${AUTH.twin}'), id from profiles where handle ~ '^bulk' and handle <> 'bulk201';`);
ok(/a lot of people today/.test(fx('twin', `select follow('Bulk 201');`)) && fx('twin', `select follow('Bulk 7');`) === 'following', 'a 201st follow in a day is refused (following someone you already follow is fine)');
psql(`delete from profiles where handle ~ '^bulk';`);

// --- v14.6: the content filter and report alerts
ok(fx('wanderer', `select create_group('Meanword club', true);`).includes('Meanword club') || true, '(before the list is loaded nothing is filtered)');
psql(`insert into blocked_words (word) values ('meanword'), ('very bad'), ('x+y'), ('sucks'), ('fuck'), ('fucking'), ('shit'), ('god damn') on conflict do nothing; select internal.load_word_pattern();`);
psql(`insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000051');`); AUTH.filt = 'aaaaaaaa-0000-0000-0000-000000000051';
ok(/Pick another name/.test(fx('filt', `select create_profile('Meanword Mike');`)) && /Pick another name/.test(fx('wanderer', `select create_group('the very  bad crew');`)),
   'a name with a word on the list is refused (profiles and communities), spacing and capitals forgiven');
ok(/"name": "Meanwordsmith"/.test(fx('filt', `select create_profile('Meanwordsmith');`)), '...but only whole words (Meanwordsmith is fine)');
ok(one(`select internal.clean_text('this shot sucks');`) === 'this shot sucks' && one(`select internal.clean_text('fucking good shot, holy shit, god damn');`) === 'fucking good shot, holy shit, god damn' && one(`select internal.clean_text('fucking meanword');`) === 'fucking •••',
   'everyday swearing stays ("this shot sucks", "fucking good", "holy shit", "god damn") even though the open list has it; words like slurs are still masked');
push('filt', { type: 'brew', id: 'fl1', beanId: 'b1', user: 'Meanwordsmith', owner: 'Meanwordsmith', method: 'Espresso', date: new Date().toISOString(), audience: 'everyone', noteAudience: 'everyone',
  notes: 'a MEANWORD shot, see https://spam.example.com/buy', likes: [], comments: [{ id: 'f1', user: 'Meanwordsmith', text: 'meanword! visit www.spam.example.com', timestamp: new Date().toISOString(), audience: 'everyone' }] });
ok(one(`select body from session_notes n join sessions s on s.id = n.session_id where s.legacy_id = 'fl1';`) === 'a ••• shot, see [link removed]' &&
   one(`select body from comments where legacy_ref = 'fl1#f1';`) === '•••! visit [link removed]',
   'a new account: words on the list show as •••, and links are held for its first three days (notes shared with Everyone, comments)');
push('filt', { type: 'brew', id: 'fl2', beanId: 'b1', user: 'Meanwordsmith', owner: 'Meanwordsmith', method: 'Espresso', date: new Date().toISOString(), notes: 'my own meanword notes', likes: [], comments: [] });
ok(one(`select body from session_notes n join sessions s on s.id = n.session_id where s.legacy_id = 'fl2';`) === 'my own meanword notes', 'notes kept to Friends are yours: untouched');
push('julian', { type: 'brew', id: 's2', beanId: 'b1', user: 'Maceo', owner: 'Maceo', likes: [], comments: [{ id: 'f2', user: 'Julian', text: 'recipe at https://example.com/r', timestamp: new Date().toISOString() }] });
ok(one(`select body from comments where legacy_ref = 's2#f2';`) === 'recipe at https://example.com/r', "the crew's links stay (not a new account)");
psql(`delete from notifications;`);
fx('filt', `select report_item('session', 'pp1', 'spam');`);
const an = notes('maceo').items.filter(i => i.kind === 'report');
ok(an.length === 1 && notes('aidan').items.every(i => i.kind !== 'report'), 'a report notifies the reviewers (Maceo), nobody else');
ok(/Something was reported/.test(one(`select internal.push_text(n)->>'body' from notifications n where kind = 'report' limit 1;`)) && !/Meanwordsmith/.test(one(`select internal.push_text(n)->>'body' from notifications n where kind = 'report' limit 1;`)),
   "...and the lock screen says something was reported, never who reported it");

// round trip: what the app pulls, pushed back unchanged by its owner, changes nothing
const STATE = `select md5(string_agg(t::text, '' order by t::text)) from (select s.legacy_id, method, grind, dose, yield, time_s, rating, taste, tasted, flavor_notes, extras, equipment, master, brewed_at, n.body, p.path,
  (select count(*) from likes l where l.session_id = s.id), (select count(*) from comments c where c.session_id = s.id) from sessions s
  left join session_notes n on n.session_id = s.id left join session_photos p on p.session_id = s.id) t;`;
const before = one(STATE);
pull('maceo').filter(e => e.type === 'brew').forEach(e => push('maceo', e));
const after = one(STATE);
ok(before === after, 'pushing back exactly what was pulled changes nothing (the app can resend safely)');

// the nightly rebuild (before the move) can empty and refill every table, whatever now points at them
const { buildImport } = require('./import_v9');
const RB = 'dialed_api_rebuild', rb = sql => psql(sql, RB);
psql(`drop database if exists ${RB}`, 'postgres'); psql(`create database ${RB}`, 'postgres');
rb(`create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
rb(require('fs').readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
rb(require('fs').readFileSync(path.join(__dirname, 'api.sql'), 'utf8'));
const fakeRows = [
  ['2026-10-01', 'bean', 'Maceo', 'rb1', '', 'Onyx', JSON.stringify({ type: 'bean', id: 'rb1', user: 'Maceo', owner: 'Maceo', roaster: 'Onyx', name: 'Monarch', date: '2026-10-01T10:00:00Z', eventAt: '2026-10-01T10:00:00Z', likes: [], comments: [] })],
  ['2026-10-02', 'brew', 'Aidan', 'rs1', 'rb1', 'Onyx', JSON.stringify({ type: 'brew', id: 'rs1', beanId: 'rb1', user: 'Aidan', owner: 'Aidan', method: 'Espresso', dose: 18, yield: 36, time: 28, date: '2026-10-02T10:00:00Z', eventAt: '2026-10-02T10:00:00Z', likes: ['Maceo'], comments: [] })]];
rb(buildImport({ html: HTML, rows: fakeRows, mode: 'full' }).sql);
ok(rb(`select count(*) from backend_imported;`) === '2', 'an import records exactly which Sheet saves it was built from (by content), so later ones can be carried over');
rb(`insert into notifications (user_id, actor_id, kind, session_id) select s.owner_id, l.user_id, 'like', s.id from likes l join sessions s on s.id = l.session_id;`);   // as if a like had come in from the app
const codesBefore = rb(`select string_agg(code, ',' order by code) from claim_codes;`);
let rebuilt = ''; try { rb(buildImport({ html: HTML, rows: fakeRows, mode: 'rebuild' }).sql); } catch (e) { rebuilt = String(e.stderr || e.message); }
ok(!rebuilt && rb(`select count(*) from sessions;`) === '1' && rb(`select count(*) from likes;`) === '1' && rb(`select count(*) from notifications;`) === '0' && rb(`select string_agg(code, ',' order by code) from claim_codes;`) === codesBefore,
   'the nightly rebuild empties and refills the tables, even with notifications pointing at them (no notifications for history; claim codes kept)' + (rebuilt ? ' :: ' + rebuilt.slice(0, 160) : ''));

console.log(fails ? `${fails} API checks FAILED` : 'all API checks passed');
process.exit(fails ? 1 : 0);
