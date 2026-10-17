-- App Store screenshots only: a made-up circle of friends and a community around the review account (Maya Rios), so
-- the screenshots can show the Feed, likes, comments, a community and a help request. Every person, roaster and coffee
-- here is invented. It runs on the screenshot machine's own stand-in database (supabase/dev_server.js, thrown away
-- after the run), never on the live one, so nobody real ever sees these people.
-- Expects the review account's profile in a temp table rp(id), and supabase/review_sample.sql already loaded.
-- Ends by printing the photo's storage name, so the runner can put the picture file there.

set client_min_messages = warning;
drop table if exists pg_temp.w_people, pg_temp.w_coffees, pg_temp.w_sessions, pg_temp.w_likes, pg_temp.w_comments;

-- (handle, name, color, a friend of Maya's: they follow each other)
create temp table w_people (handle text, name text, color text, friend boolean, joined_ago int);
insert into w_people values
  ('nina',   'Nina Alvarez', '#D9668B', true,  60),
  ('theo',   'Theo Park',    '#5B8DEF', true,  75),
  ('jonah',  'Jonah Reyes',  '#4FA37A', true,  40),
  ('priya',  'Priya Shah',   '#9B7BE0', true,  52),
  ('sam',    'Sam Okafor',   '#E0A23B', true,  12),
  ('lena',   'Lena Fischer', '#3FA7B5', false, 90),
  ('marcus', 'Marcus Chen',  '#C85A3C', false, 33),
  ('ava',    'Ava Brooks',   '#7C8A99', false, 21),
  ('eli',    'Eli Navarro',  '#B4884B', false, 28);

insert into auth.users (id, email) select gen_random_uuid(), handle || '@people.example' from w_people on conflict (email) do nothing;
insert into profiles (auth_id, handle, display_name, color, joined_at)
select u.id, p.handle, p.name, p.color, now() - make_interval(days => p.joined_ago)
from w_people p join auth.users u on u.email = p.handle || '@people.example'
on conflict (handle) do nothing;

-- Maya and her friends follow each other; everyone else in the circle follows each other too
insert into follows (follower, followee)
select rp.id, f.id from rp, profiles f join w_people p on p.handle = f.handle where p.friend
union all select f.id, rp.id from rp, profiles f join w_people p on p.handle = f.handle where p.friend
union all select a.id, b.id from profiles a join w_people pa on pa.handle = a.handle, profiles b join w_people pb on pb.handle = b.handle where a.id <> b.id
on conflict do nothing;

-- the roasters (made up), so each gets a page with everyone's coffees from it
insert into roasters (name, location)
select n, l from (values ('Quiet Hour Roasters', 'Portland, OR'), ('Field Lantern Coffee', 'Denver, CO'), ('Alder Street Roasting', 'Chicago, IL')) v(n, l)
where not exists (select 1 from roasters r where r.name = v.n);

create temp table w_coffees (lid text, owner text, name text, roaster text, origin text, process text, variety text, roast text, roasted_ago int, added_ago int);
insert into w_coffees values
  ('world-c1', 'nina',   'Sidama Natural',     'Field Lantern Coffee',  'Ethiopia',   'Natural', 'Heirloom',      'Light',        9,  5),
  ('world-c2', 'theo',   'Boquete Gesha',      'Quiet Hour Roasters',   'Panama',     'Washed',  'Gesha',         'Light',        10, 4),
  ('world-c3', 'jonah',  'Huila Pink Bourbon', 'Field Lantern Coffee',  'Colombia',   'Natural', 'Pink Bourbon',  'Medium-Light', 15, 7),
  ('world-c4', 'priya',  'Kayanza Natural',    'Alder Street Roasting', 'Burundi',    'Natural', 'Red Bourbon',   'Light',        8,  3),
  ('world-c5', 'sam',    'Cerrado Mineiro',    'Quiet Hour Roasters',   'Brazil',     'Natural', 'Yellow Catuai', 'Medium',       14, 6),
  ('world-c6', 'lena',   'Guji Hambela',       'Quiet Hour Roasters',   'Ethiopia',   'Washed',  'Heirloom',      'Light',        20, 9),
  ('world-c7', 'marcus', 'Antigua Bourbon',    'Alder Street Roasting', 'Guatemala',  'Washed',  'Bourbon',       'Medium',       18, 8),
  ('world-c8', 'ava',    'Tarrazú Honey',      'Field Lantern Coffee',  'Costa Rica', 'Honey',   'Caturra',       'Light',        11, 5),
  ('world-c9', 'eli',    'Yirgacheffe Washed', 'Alder Street Roasting', 'Ethiopia',   'Washed',  'Heirloom',      'Light',        13, 6);

insert into coffees (legacy_id, owner_id, roaster_text, name, origin, process, variety, roast, roast_date, created_at)
select c.lid, pr.id, c.roaster, c.name, c.origin, c.process, c.variety, c.roast, (now() - make_interval(days => c.roasted_ago))::date, now() - make_interval(days => c.added_ago)
from w_coffees c join profiles pr on pr.handle = c.owner
on conflict (legacy_id) do nothing;
-- every coffee from these roasters (Maya's too) points at its roaster
update coffees c set roaster_id = r.id from roasters r where r.name = c.roaster_text and c.roaster_id is null;

-- taste sliders 1-10: acidity, sweetness, body, finish, bitterness, complexity (stored as "balance")
create temp table w_sessions (lid text, owner text, cof text, method text, grind text, dose numeric, yld numeric, t numeric, rating numeric,
  taste int[], notes jsonb, words text, extras jsonb, ago numeric, aud audience, help boolean);
insert into w_sessions values
  ('world-s1',  'nina',   'world-c1', 'Espresso',     '12',  18, 40,  30,  5,   '{6,9,6,8,2,8}', '{"Cherry": 3, "Floral": 2, "Berry": 2, "Honey": 1}',
     'Finally got to try this one and wow. So sweet and so easy to drink. Buying another bag before they sell out.', '{}', 0.1, 'everyone', false),
  ('world-s2',  'nina',   'world-c1', 'Espresso',     '13',  18, 42,  26,  4,   '{8,7,5,7,2,7}', '{"Cherry": 2, "Lemon": 1}',
     'Close. A little bright, so one step finer next time.', '{}', 1.3, 'friends', false),
  ('world-s3',  'theo',   'world-c2', 'Pour Over',    '22',  15, 250, 195, 4.5, '{8,8,4,9,1,9}', '{"Jasmine": 3, "Bergamot": 2, "Peach": 2}',
     'Tastes like jasmine tea. Easily the best pour over I''ve made this month.', '{"brewer": "V60", "temp": 94}', 0.45, 'everyone', false),
  ('world-s4',  'jonah',  'world-c3', 'Espresso',     '9',   18, 38,  29,  4,   '{5,8,7,7,3,7}', '{"Cherry": 2, "Milk chocolate": 2, "Caramel": 1}',
     'Cherry and chocolate. Pulled it a touch shorter than usual and it worked.', '{}', 0.8, 'friends', false),
  ('world-s5',  'priya',  'world-c4', 'AeroPress',    '14',  15, 230, 110, 4,   '{7,8,5,7,2,7}', '{"Strawberry": 3, "Cacao": 1}',
     'Strawberry jam, and it gets better as it cools.', '{"inverted": true}', 1.0, 'everyone', false),
  ('world-s6',  'sam',    'world-c5', 'Espresso',     '6',   18, 36,  19,  2.5, '{8,3,3,3,4,3}', '{"Sour": 3, "Thin": 2}',
     'Shots keep running fast and sour, about 19 s for 36 g. New grinder, so I''m a bit lost. What should I change first?', '{}', 0.3, 'everyone', true),
  ('world-s7',  'lena',   'world-c6', 'Espresso',     '2.5', 18, 40,  29,  4.5, '{7,8,6,8,2,8}', '{"Jasmine": 2, "Bergamot": 2, "Lemon": 1}',
     'Bright but sweet. Love this one as espresso.', '{}', 0.6, 'friends', false),
  ('world-s8',  'marcus', 'world-c7', 'French Press', '28',  30, 500, 240, 4,   '{4,7,8,6,3,6}', '{"Dark chocolate": 2, "Hazelnut": 2}',
     'Heavy, chocolatey, perfect with breakfast.', '{}', 1.5, 'friends', false),
  ('world-s9',  'ava',    'world-c8', 'Pour Over',    '20',  20, 320, 200, 4,   '{6,8,5,7,2,7}', '{"Honey": 3, "Orange": 1}',
     'Honey sweetness all the way through.', '{"brewer": "Kalita Wave", "temp": 95}', 2.1, 'friends', false),
  ('world-s10', 'eli',    'world-c9', 'Pour Over',    '21',  18, 300, 190, 4.5, '{8,7,4,8,1,8}', '{"Lemon": 2, "Jasmine": 2, "Black tea": 1}',
     'Super clean. Lemon and jasmine, like a good iced tea.', '{"brewer": "Chemex", "temp": 95}', 2.6, 'friends', false),
  ('world-s11', 'theo',   'world-c2', 'Espresso',     '10',  18, 40,  31,  4,   '{7,7,5,7,2,7}', '{"Jasmine": 2, "Peach": 1}',
     'Floral as espresso too, but I like it more as a pour over.', '{}', 2.9, 'friends', false),
  ('world-s12', 'jonah',  'world-c3', 'Espresso',     '10',  18, 38,  33,  3.5, '{4,6,7,6,5,5}', '{"Dark chocolate": 2, "Bitter": 1}',
     'A bit bitter. Going coarser.', '{}', 3.4, 'friends', false);

insert into sessions (legacy_id, owner_id, coffee_id, audience, help_wanted, method, grind, dose, yield, time_s, rating, taste, tasted, flavor_notes, extras, brewed_at)
select s.lid, pr.id, (select id from coffees where legacy_id = s.cof), s.aud, s.help, s.method, s.grind, s.dose, s.yld, s.t, s.rating,
       jsonb_build_object('acidity', s.taste[1], 'sweetness', s.taste[2], 'body', s.taste[3], 'finish', s.taste[4], 'bitterness', s.taste[5], 'balance', s.taste[6]),
       '{acidity,sweetness,body,finish,bitterness,balance}'::text[], s.notes,
       s.extras || jsonb_build_object('flavors', (select string_agg(k, ',' order by (s.notes->>k)::int desc, k) from jsonb_object_keys(s.notes) k)),
       now() - make_interval(secs => s.ago * 86400)
from w_sessions s join profiles pr on pr.handle = s.owner
on conflict (legacy_id) do nothing;

insert into session_notes (session_id, body, audience)
select x.id, s.words, case when s.aud = 'everyone' then 'everyone'::item_audience else 'friends'::item_audience end
from w_sessions s join sessions x on x.legacy_id = s.lid
on conflict (session_id) do nothing;

-- likes ('maya' is the review account)
create temp table w_likes (lid text, who text[]);
insert into w_likes values
  ('world-s1', '{maya,theo,priya,jonah,sam,lena,marcus,ava,eli}'),
  ('world-s3', '{maya,nina,jonah,lena,eli}'),
  ('world-s4', '{nina,theo,priya}'),
  ('world-s5', '{maya,nina,theo,ava}'),
  ('world-s6', '{lena,theo}'),
  ('world-s7', '{maya,nina,eli}'),
  ('world-s8', '{ava,jonah}'),
  ('world-s9', '{marcus,lena,priya}'),
  ('world-s10', '{lena,theo,ava}');
insert into likes (session_id, user_id, created_at)
select x.id, case when w = 'maya' then (select id from rp) else (select id from profiles where handle = w) end, now() - interval '1 hour'
from w_likes l join sessions x on x.legacy_id = l.lid, unnest(l.who) w
on conflict do nothing;

-- comments: (ref, session, author, reply to, words, minutes ago, most helpful)
create temp table w_comments (ref text, lid text, who text, parent text, body text, mins int, helpful boolean);
insert into w_comments values
  ('world-k1', 'world-s1', 'theo',  null,       'That crema is unreal.', 130, false),
  ('world-k2', 'world-s1', 'priya', null,       'Adding this to my list. Is it as fruity as it sounds?', 115, false),
  ('world-k3', 'world-s1', 'nina',  'world-k2', 'Even more. Like cherry pie.', 104, false),
  ('world-k4', 'world-s1', 'jonah', null,       'Field Lantern never misses.', 90, false),
  ('world-k5', 'world-s6', 'lena',  null,       'Grind finer first, a few steps at a time, until 36 g takes 25 to 30 s. Then taste again.', 400, true),
  ('world-k6', 'world-s6', 'theo',  null,       'Same thing happened with my new grinder. Finer fixed it.', 380, false),
  ('world-k7', 'world-s6', 'sam',   'world-k5', 'Went finer and it''s so much sweeter. Thank you!', 200, false),
  ('world-k8', 'world-s3', 'jonah', null,       'Jasmine tea is exactly it.', 500, false),
  ('world-k9', 'world-s3', 'maya',  null,       'Need to try this one.', 460, false),
  ('world-k10', 'world-s5', 'nina', null,       'Strawberry jam?! Okay, I''m in.', 900, false);
insert into comments (legacy_ref, session_id, author_id, body, audience, most_helpful, created_at)
select c.ref, x.id, case when c.who = 'maya' then (select id from rp) else (select id from profiles where handle = c.who) end, c.body,
       case when x.audience = 'everyone' then 'everyone'::item_audience else 'friends'::item_audience end, c.helpful, now() - make_interval(mins => c.mins)
from w_comments c join sessions x on x.legacy_id = c.lid
on conflict (legacy_ref) do nothing;
update comments k set parent_id = p.id from w_comments c, comments p where k.legacy_ref = c.ref and c.parent is not null and p.legacy_ref = c.parent;

-- a community (private, so it has its own weekly goal and monthly awards): everyone here but Nina and Sam, so its feed
-- opens on a different session from the Feed and Help screenshots
insert into groups (name, is_open, owner_id, invite_code, goal_on, awards_on, created_at)
select 'Home Barista Club', false, (select id from profiles where handle = 'theo'), 'homebarista-club', true, true, now() - interval '40 days'
where not exists (select 1 from groups where name = 'Home Barista Club');
insert into group_members (group_id, user_id, role, joined_at)
select g.id, m.id, case when m.handle = 'theo' then 'owner' else 'member' end, now() - interval '30 days'
from groups g, (select id, handle from profiles where handle in (select handle from w_people where handle not in ('nina', 'sam')) union all select id, 'maya' from rp) m
where g.name = 'Home Barista Club'
on conflict do nothing;

-- the photo on Nina's espresso (the file goes into the stand-in's storage folder under this name)
insert into storage.objects (bucket_id, name, owner)
select 'photos', u.id::text || '/' || x.id::text || '-espresso.jpg', u.id
from sessions x join profiles pr on pr.id = x.owner_id join auth.users u on u.id = pr.auth_id where x.legacy_id = 'world-s1'
on conflict (bucket_id, name) do nothing;
insert into session_photos (session_id, path, audience)
select x.id, 'sb:' || o.name, 'everyone' from sessions x join storage.objects o on o.name like '%/' || x.id::text || '-espresso.jpg' where x.legacy_id = 'world-s1'
on conflict (session_id) do nothing;

select o.name from storage.objects o join sessions x on o.name like '%/' || x.id::text || '-espresso.jpg' where x.legacy_id = 'world-s1';
