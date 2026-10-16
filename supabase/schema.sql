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
  id            uuid primary key references auth.users (id) on delete cascade,
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
  session_id    uuid not null references sessions (id) on delete cascade,
  author_id     uuid not null references profiles (id) on delete cascade,
  parent_id     uuid references comments (id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 2000),
  audience      item_audience not null default 'friends',
  most_helpful  boolean not null default false,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  deleted_at    timestamptz
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
  select exists (select 1 from sessions s where s.id = c.session_id and can_see_session(viewer, s)
                 and not blocked_either(viewer, c.author_id)
                 and (c.audience = 'everyone' or viewer in (c.author_id, s.owner_id) or close_to(viewer, c.author_id)));
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

-- profiles: everyone signed in sees the card (unless blocked); you edit only your own
create policy profiles_read  on profiles for select to authenticated using (not blocked_either(auth.uid(), id));
create policy profiles_write on profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_edit  on profiles for update to authenticated using (id = auth.uid());

-- claim codes: never readable from the app; claiming goes through a server function
-- (no policies = no access for app users)

-- follows: you see your own follows both ways; you create your own (pending if their profile is private)
create policy follows_read   on follows for select to authenticated using (auth.uid() in (follower, followee));
create policy follows_add    on follows for insert to authenticated with check (follower = auth.uid() and not blocked_either(follower, followee));
create policy follows_accept on follows for update to authenticated using (followee = auth.uid());
create policy follows_remove on follows for delete to authenticated using (auth.uid() in (follower, followee));

-- blocks: yours only
create policy blocks_mine on blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

-- groups: open groups and your groups are visible; members of private groups see each other
create policy groups_read  on groups for select to authenticated using (is_open or is_group_member(id, auth.uid()));
create policy groups_add   on groups for insert to authenticated with check (owner_id = auth.uid());
create policy groups_edit  on groups for update to authenticated using (owner_id = auth.uid());
create policy members_read on group_members for select to authenticated
  using (is_group_member(group_id, auth.uid()) or exists (select 1 from groups g where g.id = group_id and g.is_open));
create policy members_join on group_members for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from groups g where g.id = group_id and g.is_open));
create policy members_leave on group_members for delete to authenticated using (user_id = auth.uid());

-- roasters and coffees are shared facts: everyone signed in reads; you add and edit your own
create policy roasters_read on roasters for select to authenticated using (true);
create policy roasters_add  on roasters for insert to authenticated with check (created_by = auth.uid());
create policy coffees_read  on coffees for select to authenticated using (deleted_at is null or owner_id = auth.uid());
create policy coffees_add   on coffees for insert to authenticated with check (owner_id = auth.uid());
create policy coffees_edit  on coffees for update to authenticated using (owner_id = auth.uid());

-- sessions
create policy sessions_read on sessions for select to authenticated using (can_see_session(auth.uid(), sessions));
create policy sessions_add  on sessions for insert to authenticated with check (owner_id = auth.uid());
create policy sessions_edit on sessions for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy sessions_del  on sessions for delete to authenticated using (owner_id = auth.uid());

-- notes and photos: their own toggle, on top of the session's audience
create policy notes_read  on session_notes for select to authenticated using (can_see_item(auth.uid(), session_id, audience));
create policy notes_write on session_notes for all to authenticated
  using (exists (select 1 from sessions s where s.id = session_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from sessions s where s.id = session_id and s.owner_id = auth.uid()));
create policy photos_read  on session_photos for select to authenticated using (can_see_item(auth.uid(), session_id, audience));
create policy photos_write on session_photos for all to authenticated
  using (exists (select 1 from sessions s where s.id = session_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from sessions s where s.id = session_id and s.owner_id = auth.uid()));

-- likes: visible with the session; you like as yourself, on sessions you can see
create policy likes_read on likes for select to authenticated
  using (exists (select 1 from sessions s where s.id = session_id and can_see_session(auth.uid(), s)));
create policy likes_add  on likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from sessions s where s.id = session_id and can_see_session(auth.uid(), s)));
create policy likes_del  on likes for delete to authenticated using (user_id = auth.uid());

-- comments
create policy comments_read on comments for select to authenticated using (can_see_comment(auth.uid(), comments));
create policy comments_add  on comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from sessions s where s.id = session_id and can_see_session(auth.uid(), s)));
create policy comments_edit on comments for update to authenticated using (author_id = auth.uid());
create policy comments_del  on comments for delete to authenticated using (author_id = auth.uid());

-- reports: you file them; reviewing goes through the admin page (server side)
create policy reports_add on reports for insert to authenticated with check (reporter_id = auth.uid());
