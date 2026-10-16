-- The App Review account's own sample coffees and sessions (all Only me, so nobody else ever sees them), so Apple's
-- reviewer finds a working app: a profile with a palate, coffee pages with a flavor shape and dial-in curves, and the
-- next-shot coach with something to say. Also what the App Store screenshots show (no real person's data).
-- Expects a temp table rp(id) holding the review profile's id. Safe to run again: it puts the samples back as written
-- here (dates count back from now), and leaves anything else on the account alone.

set client_min_messages = warning;
drop table if exists pg_temp.review_coffees, pg_temp.review_sessions;
create temp table review_coffees (lid text, name text, origin text, process text, roast text, roasted_ago int, added_ago int);
insert into review_coffees values
  ('review-c1', 'Ethiopia Guji',   'Ethiopia', 'Washed',  'Light',  24, 13),
  ('review-c2', 'Colombia Huila',  'Colombia', 'Natural', 'Medium', 20, 6),
  ('review-c3', 'Kenya Nyeri',     'Kenya',    'Washed',  'Light',  12, 3);

insert into coffees (legacy_id, owner_id, roaster_text, name, origin, process, roast, roast_date, created_at)
select c.lid, rp.id, 'Sample Roasters', c.name, c.origin, c.process, c.roast, (now() - make_interval(days => c.roasted_ago))::date, now() - make_interval(days => c.added_ago)
from rp, review_coffees c
on conflict (legacy_id) do update set owner_id = excluded.owner_id, roaster_text = excluded.roaster_text, name = excluded.name, origin = excluded.origin,
  process = excluded.process, roast = excluded.roast, roast_date = excluded.roast_date, created_at = excluded.created_at, updated_at = now(), deleted_at = null;

-- taste sliders 1-10 in the order acidity, sweetness, body, finish, bitterness, complexity (stored as "balance")
create temp table review_sessions (lid text, cof text, method text, grind text, dose numeric, yld numeric, t numeric, rating numeric,
  taste int[], notes jsonb, words text, extras jsonb, ago numeric);
insert into review_sessions values
  ('review-s1',  'review-c1', 'Espresso',     '12', 18, 44, 22,  2.5, '{9,3,3,4,2,3}', '{"Sour": 3, "Lemon": 2, "Thin": 2}',
     'Ran fast and tastes sour. Going finer next time.', '{}', 12.4),
  ('review-s2',  'review-c1', 'Espresso',     '10', 18, 40, 27,  3.5, '{7,5,5,6,3,5}', '{"Lemon": 2, "Jasmine": 1, "Honey": 1}',
     'Better. Still a little sharp at times.', '{}', 10.4),
  ('review-s3',  'review-c1', 'Espresso',     '9',  18, 38, 30,  4.5, '{6,8,6,8,2,8}', '{"Jasmine": 3, "Bergamot": 2, "Honey": 2}',
     'Sweet and floral, like jasmine tea. This is the one.', '{}', 8.4),
  ('review-s4',  'review-c1', 'Espresso',     '9',  18, 38, 25,  3.5, '{8,5,5,6,2,5}', '{"Lemon": 2, "Sour": 1, "Jasmine": 1}',
     'Same grind ran faster today and it''s a bit sour again.', '{}', 5.4),
  ('review-s5',  'review-c1', 'Espresso',     '8',  18, 38, 30,  4.5, '{6,8,7,8,2,8}', '{"Jasmine": 3, "Honey": 2, "Bergamot": 1}',
     'One step finer and it''s back: sweet, floral, long finish.', '{}', 4.4),
  ('review-s6',  'review-c1', 'Pour Over',    '24', 15, 250, 185, 4,  '{7,7,4,7,2,7}', '{"Bergamot": 2, "Peach": 2, "Black tea": 1}',
     'Clean and juicy.', '{"brewer": "V60", "temp": 94}', 3.6),
  ('review-s7',  'review-c2', 'Espresso',     '10', 18, 36, 31,  3,   '{4,5,8,4,7,4}', '{"Bitter": 2, "Dark chocolate": 2}',
     'Too bitter and running long. Coarser next time.', '{}', 5.6),
  ('review-s8',  'review-c2', 'Espresso',     '11', 18, 38, 28,  4,   '{5,7,7,7,4,6}', '{"Milk chocolate": 3, "Cherry": 2, "Caramel": 1}',
     'Chocolate and cherry, much rounder.', '{}', 2.4),
  ('review-s9',  'review-c2', 'French Press', '30', 30, 500, 240, 3.5, '{4,6,8,6,4,5}', '{"Milk chocolate": 2, "Hazelnut": 1}',
     'Heavy and cozy.', '{}', 1.6),
  ('review-s10', 'review-c3', 'AeroPress',    '16', 15, 230, 120, 4,  '{7,6,5,6,3,6}', '{"Grapefruit": 2, "Brown sugar": 2}',
     'Bright and sweet.', '{"inverted": true}', 1.4),
  ('review-s11', 'review-c3', 'Pour Over',    '22', 20, 320, 210, 4.5, '{8,8,5,8,2,9}', '{"Blackcurrant": 3, "Grapefruit": 2, "Brown sugar": 1}',
     'Big blackcurrant, really juicy.', '{"brewer": "Kalita Wave", "temp": 96}', 0.2);

insert into sessions (legacy_id, owner_id, coffee_id, audience, method, grind, dose, yield, time_s, rating, taste, tasted, flavor_notes, extras, brewed_at)
select s.lid, rp.id, (select id from coffees where legacy_id = s.cof), 'only_me', s.method, s.grind, s.dose, s.yld, s.t, s.rating,
       jsonb_build_object('acidity', s.taste[1], 'sweetness', s.taste[2], 'body', s.taste[3], 'finish', s.taste[4], 'bitterness', s.taste[5], 'balance', s.taste[6]),
       '{acidity,sweetness,body,finish,bitterness,balance}'::text[], s.notes,
       s.extras || jsonb_build_object('flavors', (select string_agg(k, ',' order by (s.notes->>k)::int desc, k) from jsonb_object_keys(s.notes) k)),
       now() - make_interval(secs => s.ago * 86400)
from rp, review_sessions s
on conflict (legacy_id) do update set owner_id = excluded.owner_id, coffee_id = excluded.coffee_id, audience = 'only_me', help_wanted = false,
  method = excluded.method, grind = excluded.grind, dose = excluded.dose, yield = excluded.yield, time_s = excluded.time_s, rating = excluded.rating,
  taste = excluded.taste, tasted = excluded.tasted, flavor_notes = excluded.flavor_notes, extras = excluded.extras, brewed_at = excluded.brewed_at,
  updated_at = now(), deleted_at = null;

insert into session_notes (session_id, body, audience)
select x.id, s.words, 'friends' from review_sessions s join sessions x on x.legacy_id = s.lid
on conflict (session_id) do update set body = excluded.body, updated_at = now();
