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
const DB = 'dialed_api_test';
const psql = (sql, db = DB) => execSync(`psql -h ${HOST} -U ${USER} -d ${db} -Atq -v ON_ERROR_STOP=1`, { input: sql, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const q = s => `'${String(s).replace(/'/g, "''")}'`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// --- a fresh database with Supabase's sign-in pieces stood in
psql(`drop database if exists ${DB}`, 'postgres'); psql(`create database ${DB}`, 'postgres');
psql(`create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;`);
psql(require('fs').readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
psql(`grant usage on schema public, auth to authenticated, anon; grant select, insert, update, delete on all tables in schema public to authenticated;
      grant execute on all functions in schema public, auth to authenticated, anon;`);
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
const forStranger = pull('stranger');
const st = loadApp(HTML); st.user = 'Stranger'; st.process(forStranger);
ok(st.beans.size === 1 && st.brews.size === 0, "a stranger sees the coffee (a shared fact) but none of the crew's Friends & groups sessions");
const strangerSeesMaceo = forStranger.filter(e => e.type === 'gear' && e.owner === 'Maceo');
ok(strangerSeesMaceo.length === 1 && strangerSeesMaceo[0].items.map(i => i.name).join() === 'Niche Zero,Decent' && !strangerSeesMaceo[0].recipes.length && !Object.keys(strangerSeesMaceo[0].lastByMethod).length,
   "a stranger sees Maceo's equipment (it's on his profile) but not his recipes or last setup");
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

// --- your color: from your own saves only (a like on someone else's session carries their color)
push('aidan', { ...B1, likes: ['Aidan'], actor: 'Maceo', actorColor: '#123456' });
push('maceo', { ...B1, actor: 'Maceo', actorColor: '#AA3355' });
ok(one(`select string_agg(legacy_name || '=' || color, ',' order by legacy_name) from profiles where legacy_name in ('Aidan', 'Maceo');`) === 'Aidan=#336699,Maceo=#aa3355',
   "Maceo's new color is saved from his own save; a like carrying someone else's color changes nothing");

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

// round trip: what the app pulls, pushed back unchanged by its owner, changes nothing
const STATE = `select md5(string_agg(t::text, '' order by t::text)) from (select s.legacy_id, method, grind, dose, yield, time_s, rating, taste, tasted, flavor_notes, extras, equipment, master, brewed_at, n.body, p.path,
  (select count(*) from likes l where l.session_id = s.id), (select count(*) from comments c where c.session_id = s.id) from sessions s
  left join session_notes n on n.session_id = s.id left join session_photos p on p.session_id = s.id) t;`;
const before = one(STATE);
pull('maceo').filter(e => e.type === 'brew').forEach(e => push('maceo', e));
const after = one(STATE);
ok(before === after, 'pushing back exactly what was pulled changes nothing (the app can resend safely)');

console.log(fails ? `${fails} API checks FAILED` : 'all API checks passed');
process.exit(fails ? 1 : 0);
