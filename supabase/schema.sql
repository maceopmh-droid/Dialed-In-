-- Dialed In: first draft of the Supabase schema (phase 1 of the public-launch plan). Not applied anywhere yet.
--
-- Who sees what (the plan's "Who sees what" table), enforced by the database with row-level security:
--   * a session's audience: 'everyone' | 'friends' (friends & private groups) | 'only_me'
--   * friends = people who follow each other (accepted, both ways)
--   * a private profile's sessions are seen only by approved followers (plus friends/groups as usual)
--   * a session's photo and notes, and every comment, have their own toggle: 'everyone' | 'friends'
--     (privacy rules work per row, not per column, so photo and notes live in their own tables)
--   * blocking beats everything, both ways
-- Old records keep their Sheet ids in legacy_id, so links, photos and comment threads line up after the move.

create extension if not exists pgcrypto;

create type audience as enum ('everyone', 'friends', 'only_me');
create type item_audience as enum ('everyone', 'friends');

-- ---------------------------------------------------------------- people
create table profiles (
  id            uuid primary key default gen_random_uuid(),
  auth_id       uuid unique references auth.users (id) on delete cascade,   -- null until someone signs in as this
                                                   -- profile (Sheet-era names exist before they're claimed);
                                                   -- deleting the account deletes the profile and everything in it
  handle        text not null unique check (handle ~ '^[a-z0-9_]{2,24}$'),
  display_name  text not null check (char_length(display_name) between 1 and 40),
  color         text check (color ~ '^#[0-9a-fA-F]{6}$'),
  avatar_path   text,
  is_private    boolean not null default false,
  city          text,
  legacy_name   text unique,                       -- the Sheet-era name this account claimed
  created_at    timestamptz not null default now()
);

create table claim_codes (
  code          text primary key,
  legacy_name   text not null unique,
  claimed_by    uuid references profiles (id),
  claimed_at    timestamptz
);

create table follows (
  follower      uuid not null references profiles (id) on delete cascade,
  followee      uuid not null references profiles (id) on delete cascade,
  status        text not null default 'accepted' check (status in ('pending', 'accepted')),
  created_at    timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);

create table blocks (
  blocker       uuid not null references profiles (id) on delete cascade,
  blocked       uuid not null references profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

create table groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 60),
  is_open       boolean not null default true,     -- open: anyone can join; private: invite only
  owner_id      uuid not null references profiles (id),
  invite_code   text unique,
  goal_on       boolean not null default false,
  awards_on     boolean not null default false,
  created_at    timestamptz not null default now()
);

create table group_members (
  group_id        uuid not null references groups (id) on delete cascade,
  user_id         uuid not null references profiles (id) on delete cascade,
  role            text not null default 'member' check (role in ('owner', 'admin', 'member')),
  counts_in_goal  boolean not null default true,
  joined_at       timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ---------------------------------------------------------------- coffee
create table roasters (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  location      text,
  website       text,
  merged_into   uuid references roasters (id),
  created_by    uuid references profiles (id),
  created_at    timestamptz not null default now()
);

create table coffees (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  owner_id      uuid not null references profiles (id) on delete cascade,
  roaster_id    uuid references roasters (id),
  roaster_text  text,                                  -- the roaster as written on this coffee (spelling kept)
  name          text not null,
  origin        text,
  process       text,
  variety       text,
  roast         text,
  roast_date    date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  owner_id      uuid not null references profiles (id) on delete cascade,
  coffee_id     uuid references coffees (id),
  audience      audience not null default 'everyone',
  help_wanted   boolean not null default false,
  method        text,
  grind         text,                              -- text on purpose: letter grinds like "3B"
  dose          numeric,
  yield         numeric,
  time_s        numeric,
  rating        numeric check (rating between 0 and 5),
  taste         jsonb,                             -- acidity, sweetness, body, finish, bitterness, complexity
  tasted        text[],
  flavor_notes  jsonb,
  extras        jsonb,                             -- method-specific fields (water, temp, steps, ...)
  equipment     jsonb,
  master        jsonb,
  brewed_at     timestamptz not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table session_notes (
  session_id    uuid primary key references sessions (id) on delete cascade,
  body          text not null,
  audience      item_audience not null default 'friends',
  updated_at    timestamptz not null default now()
);

create table session_photos (
  session_id    uuid primary key references sessions (id) on delete cascade,
  path          text not null,                     -- storage path; location data removed on upload
  audience      item_audience not null default 'friends',
  created_at    timestamptz not null default now()
);

create table likes (
  session_id    uuid not null references sessions (id) on delete cascade,
  user_id       uuid not null references profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table comments (
  id            uuid primary key default gen_random_uuid(),
  legacy_ref    text unique,                       -- "<record id>#<position>" from the Sheet
  session_id    uuid references sessions (id) on delete cascade,
  coffee_id     uuid references coffees (id) on delete cascade,
  author_id     uuid not null references profiles (id) on delete cascade,
  parent_id     uuid references comments (id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 2000),
  audience      item_audience not null default 'friends',
  most_helpful  boolean not null default false,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  deleted_at    timestamptz,
  check ((session_id is null) <> (coffee_id is null))      -- on exactly one thing
);

create table comment_likes (
  comment_id    uuid not null references comments (id) on delete cascade,
  user_id       uuid not null references profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table coffee_likes (
  coffee_id     uuid not null references coffees (id) on delete cascade,
  user_id       uuid not null references profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (coffee_id, user_id)
);

-- ---------------------------------------------------------------- your gear, lists and notes
create table equipment (                               -- shown on your profile unless you hide it
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text,
  owner_id      uuid not null references profiles (id) on delete cascade,
  type          text not null,
  name          text not null,
  hidden        boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create table want_to_try (                             -- visible to friends
  owner_id      uuid not null references profiles (id) on delete cascade,
  coffee_id     uuid not null references coffees (id) on delete cascade,   -- like today: the flag sits on one coffee record
  added_at      timestamptz not null default now(),
  primary key (owner_id, coffee_id)
);

create table profile_gear (                            -- the rest of today's gear record: yours only
  profile_id    uuid primary key references profiles (id) on delete cascade,
  recipes       jsonb not null default '[]',
  last_by_method jsonb not null default '{}',
  roaster_prefs jsonb not null default '{}',
  favorites     jsonb not null default '{}',
  master        jsonb,
  updated_at    timestamptz not null default now()
);

create table flavors (                                 -- custom tasting notes people added to the wheel
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  family        text,
  created_by    uuid references profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create table sheet_archive (                          -- every row of the V9 Sheet, exactly as it was (read-only)
  event_key     text primary key,                      -- md5 of column G as stored, so resending a row is harmless
  row_no        integer,                               -- where it sat in the Sheet when it was copied
  logged_at     text,                                  -- column A as the Sheet showed it
  payload       jsonb not null,
  received_at   timestamptz not null default now()
);

create table reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references profiles (id) on delete cascade,
  target_type   text not null check (target_type in ('session', 'comment', 'photo', 'profile', 'group')),
  target_id     uuid not null,
  reason        text,
  status        text not null default 'open' check (status in ('open', 'hidden', 'dismissed', 'removed')),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- who can see what
-- security definer + a fixed search_path: these read follows/blocks/groups for the check without exposing them

-- the signed-in person's profile id (profiles are separate from sign-in accounts so old names can be claimed)
create function me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where auth_id = auth.uid();
$$;
create function blocked_either(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

create function is_friend(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from follows f1 join follows f2 on f2.follower = f1.followee and f2.followee = f1.follower
                 where f1.follower = a and f1.followee = b and f1.status = 'accepted' and f2.status = 'accepted');
$$;

create function shares_private_group(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members m1 join group_members m2 on m2.group_id = m1.group_id
                 join groups g on g.id = m1.group_id
                 where m1.user_id = a and m2.user_id = b and not g.is_open);
$$;

create function is_group_member(g uuid, u uuid) returns boolean   -- used by the group rules (avoids a policy loop)
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members m where m.group_id = g and m.user_id = u);
$$;

create function close_to(viewer uuid, owner uuid) returns boolean   -- the "Friends and your groups" column
language sql stable as $$ select is_friend(viewer, owner) or shares_private_group(viewer, owner); $$;

create function follows_ok(viewer uuid, owner uuid) returns boolean  -- open profile, or an approved follower
language sql stable security definer set search_path = public as $$
  select not p.is_private
         or exists (select 1 from follows f where f.follower = viewer and f.followee = owner and f.status = 'accepted')
  from profiles p where p.id = owner;
$$;

create function can_see_session(viewer uuid, s sessions) returns boolean
language sql stable as $$
  select s.owner_id = viewer
      or (s.deleted_at is null and viewer is not null and not blocked_either(viewer, s.owner_id) and (
            (s.audience = 'everyone' and (follows_ok(viewer, s.owner_id) or close_to(viewer, s.owner_id)))
         or (s.audience = 'friends' and close_to(viewer, s.owner_id))));
$$;

-- a photo, a note: the session must be visible, then its own toggle
create function can_see_item(viewer uuid, session_id uuid, a item_audience) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions s where s.id = session_id and can_see_session(viewer, s)
                 and (a = 'everyone' or s.owner_id = viewer or close_to(viewer, s.owner_id)));
$$;

-- a comment: the session must be visible; a friends-only comment is for the session's owner and the author's friends
create function can_see_comment(viewer uuid, c comments) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer is not null and not blocked_either(viewer, c.author_id) and (
       exists (select 1 from sessions s where s.id = c.session_id and can_see_session(viewer, s)
               and (c.audience = 'everyone' or viewer in (c.author_id, s.owner_id) or close_to(viewer, c.author_id)))
    or exists (select 1 from coffees k where k.id = c.coffee_id and k.deleted_at is null
               and (c.audience = 'everyone' or viewer in (c.author_id, k.owner_id) or close_to(viewer, c.author_id))));
$$;

-- ---------------------------------------------------------------- row-level security
alter table profiles       enable row level security;
alter table claim_codes    enable row level security;
alter table follows        enable row level security;
alter table blocks         enable row level security;
alter table groups         enable row level security;
alter table group_members  enable row level security;
alter table roasters       enable row level security;
alter table coffees        enable row level security;
alter table sessions       enable row level security;
alter table session_notes  enable row level security;
alter table session_photos enable row level security;
alter table likes          enable row level security;
alter table comments       enable row level security;
alter table reports        enable row level security;
alter table coffee_likes   enable row level security;
alter table comment_likes  enable row level security;
alter table equipment      enable row level security;
alter table want_to_try    enable row level security;
alter table profile_gear   enable row level security;
alter table flavors        enable row level security;
alter table sheet_archive  enable row level security;   -- no rules: never readable from the app

-- profiles: everyone signed in sees the card (unless blocked); you edit only your own
create policy profiles_read  on profiles for select to authenticated using (not blocked_either(me(), id));
create policy profiles_write on profiles for insert to authenticated with check (auth_id = auth.uid());
create policy profiles_edit  on profiles for update to authenticated using (auth_id = auth.uid());

-- claim codes: never readable from the app; claiming goes through a server function
-- (no policies = no access for app users)

-- follows: you see your own follows both ways; you create your own (pending if their profile is private)
create policy follows_read   on follows for select to authenticated using (me() in (follower, followee));
create policy follows_add    on follows for insert to authenticated with check (follower = me() and not blocked_either(follower, followee));
create policy follows_accept on follows for update to authenticated using (followee = me());
create policy follows_remove on follows for delete to authenticated using (me() in (follower, followee));

-- blocks: yours only
create policy blocks_mine on blocks for all to authenticated using (blocker = me()) with check (blocker = me());

-- groups: open groups and your groups are visible; members of private groups see each other
create policy groups_read  on groups for select to authenticated using (is_open or is_group_member(id, me()));
create policy groups_add   on groups for insert to authenticated with check (owner_id = me());
create policy groups_edit  on groups for update to authenticated using (owner_id = me());
create policy members_read on group_members for select to authenticated
  using (is_group_member(group_id, me()) or exists (select 1 from groups g where g.id = group_id and g.is_open));
create policy members_join on group_members for insert to authenticated
  with check (user_id = me() and exists (select 1 from groups g where g.id = group_id and g.is_open));
create policy members_leave on group_members for delete to authenticated using (user_id = me());

-- roasters and coffees are shared facts: everyone signed in reads; you add and edit your own
create policy roasters_read on roasters for select to authenticated using (true);
create policy roasters_add  on roasters for insert to authenticated with check (created_by = me());
create policy coffees_read  on coffees for select to authenticated using (deleted_at is null or owner_id = me());
create policy coffees_add   on coffees for insert to authenticated with check (owner_id = me());
create policy coffees_edit  on coffees for update to authenticated using (owner_id = me());

-- sessions
create policy sessions_read on sessions for select to authenticated using (can_see_session(me(), sessions));
create policy sessions_add  on sessions for insert to authenticated with check (owner_id = me());
create policy sessions_edit on sessions for update to authenticated using (owner_id = me()) with check (owner_id = me());
create policy sessions_del  on sessions for delete to authenticated using (owner_id = me());

-- notes and photos: their own toggle, on top of the session's audience
create policy notes_read  on session_notes for select to authenticated using (can_see_item(me(), session_id, audience));
create policy notes_write on session_notes for all to authenticated
  using (exists (select 1 from sessions s where s.id = session_id and s.owner_id = me()))
  with check (exists (select 1 from sessions s where s.id = session_id and s.owner_id = me()));
create policy photos_read  on session_photos for select to authenticated using (can_see_item(me(), session_id, audience));
create policy photos_write on session_photos for all to authenticated
  using (exists (select 1 from sessions s where s.id = session_id and s.owner_id = me()))
  with check (exists (select 1 from sessions s where s.id = session_id and s.owner_id = me()));

-- likes: visible with the session; you like as yourself, on sessions you can see
create policy likes_read on likes for select to authenticated
  using (exists (select 1 from sessions s where s.id = session_id and can_see_session(me(), s)));
create policy likes_add  on likes for insert to authenticated
  with check (user_id = me() and exists (select 1 from sessions s where s.id = session_id and can_see_session(me(), s)));
create policy likes_del  on likes for delete to authenticated using (user_id = me());

-- comments
create policy comments_read on comments for select to authenticated using (can_see_comment(me(), comments));
create policy comments_add  on comments for insert to authenticated
  with check (author_id = me() and (exists (select 1 from sessions s where s.id = session_id and can_see_session(me(), s))
                                    or exists (select 1 from coffees k where k.id = coffee_id and k.deleted_at is null)));
create policy comments_edit on comments for update to authenticated using (author_id = me());
create policy comments_del  on comments for delete to authenticated using (author_id = me());

-- comment likes: visible with the comment (the comments rule filters the lookup); you like as yourself
create policy comment_likes_read on comment_likes for select to authenticated
  using (exists (select 1 from comments c where c.id = comment_id));
create policy comment_likes_add  on comment_likes for insert to authenticated
  with check (user_id = me() and exists (select 1 from comments c where c.id = comment_id));
create policy comment_likes_del  on comment_likes for delete to authenticated using (user_id = me());

-- coffee likes: shared like the coffee; you like as yourself
create policy coffee_likes_read on coffee_likes for select to authenticated using (not blocked_either(me(), user_id));
create policy coffee_likes_add  on coffee_likes for insert to authenticated with check (user_id = me());
create policy coffee_likes_del  on coffee_likes for delete to authenticated using (user_id = me());

-- equipment: on your profile for everyone signed in, unless hidden; yours to change
create policy equipment_read  on equipment for select to authenticated
  using (owner_id = me() or (not hidden and not blocked_either(me(), owner_id)));
create policy equipment_write on equipment for all to authenticated using (owner_id = me()) with check (owner_id = me());

-- want to try: you and your friends (and private groups)
create policy want_read  on want_to_try for select to authenticated using (owner_id = me() or (close_to(me(), owner_id) and not blocked_either(me(), owner_id)));
create policy want_write on want_to_try for all to authenticated using (owner_id = me()) with check (owner_id = me());

-- the rest of your gear: yours only
create policy gear_mine on profile_gear for all to authenticated using (profile_id = me()) with check (profile_id = me());

-- custom tasting notes: everyone signed in reads; you add your own
create policy flavors_read on flavors for select to authenticated using (true);
create policy flavors_add  on flavors for insert to authenticated with check (created_by = me());

-- reports: you file them; reviewing goes through the admin page (server side)
create policy reports_add on reports for insert to authenticated with check (reporter_id = me());
