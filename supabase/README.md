# Supabase (phases 1 and 2)

The database for the public version of Dialed In. The project exists (created Oct 16, 2026); it's loaded and
checked from GitHub (`.github/workflows/supabase-setup.yml`), since GitHub can reach it. The app still runs on the
Sheet for everyone until the move (`CUTOVER.md`).

- `check_project.js`: checks the real project after loading: privacy rules on for every table, signed-out
  visitors get nothing (from the database and from the outside), signed-in people can call exactly the app's calls,
  the photo bucket is private. Prints only check names and counts (GitHub's logs are public).
- `find_db.sh`: how the workflows reach the database (Supabase's session pooler; GitHub has no IPv6).
- The privacy rules' helper functions (`blocked_either`, `my_close_ids`, …) live in a schema called `private`, and
  the API's helpers in `internal`. The app's web address serves neither, so they can't be called directly (an
  exposed `blocked_either(a, b)` would tell anyone who blocked whom).

- `schema.sql`: the tables (profiles, follows, blocks, groups, coffees, sessions, notes, photos, likes, comments,
  reports) and the privacy rules, written as Postgres row-level security. Every read is checked against the
  "Who sees what" rules in the plan before anything leaves the database.
- `test_rls.py` (52 checks): runs `schema.sql` on a real Postgres and checks, as seven pretend people (you, a friend, a
  stranger who follows you, a private profile, a private-group buddy, an open-group member, someone who blocked
  you, plus someone signed in with no profile yet and an old name nobody has claimed), exactly which sessions, notes, photos, comments, groups and profiles each can see or change.

```
python3 supabase/test_rls.py --host <postgres socket dir or host> [--user postgres]
```

## Moving the Sheet's history in

- `import_v9.js`: reads the Sheet's rows (as JSON: an array of rows, column G holding each event), runs the
  app's own replay from the built `index.html` (`lib/app_in_node.js`), and writes SQL for the tables above.
  Sheet-era names become profiles with no sign-in (claimed later). Migrated sessions, notes, photos and comments
  start as **Friends**, so old history doesn't suddenly go public. Today's group becomes the private group
  "Original crew" with the goal switches carried over. The whole Sheet is also kept in `sheet_archive`.
- `parity.js`: turns the tables back into Sheet-style events, replays them through the app, and compares every
  coffee, session, comment, like, note, photo, gear record, custom note and goal switch with what the app gets
  from the Sheet. Prints ids and field names only.

```
node supabase/import_v9.js --html index.html --rows rows.json --out import.sql --summary summary.json
psql ... -f supabase/schema.sql && psql ... -f import.sql
node supabase/parity.js --html index.html --rows rows.json --psql "psql -h HOST -U USER -d DB"
```

On the Oct 15, 2026 Sheet (1,407 rows): 4 people, 31 coffees, 237 sessions, 252 comments, 296 likes, 217
photos, 163 notes, 10 pieces of equipment, 29 custom notes; parity: everything matches. The test user John was
skipped (removed, with nothing but an equipment record). Two sessions whose coffee was deleted long ago keep
their old coffee link in `extras.beanId`.

**Achievements:** before v14.2 the app counted "comments written" and "likes received" only when they appeared in a
later version of a record, and the tables send each record once, as it is now. v14.2 also counts what's on a
record when it first appears, which changes nothing for the Sheet (a record's first save never has comments or
likes) and makes the levels match exactly. `--known-history` tolerates the difference when checking an older
`index.html`.

The real Sheet export never goes in this repository (it's public and the rows hold everyone's notes).

## The app's calls (phase 2): `api.sql`

Load after `schema.sql`. The app keeps reading and writing the same Sheet-style events it uses today; these three
functions translate, and the privacy rules above decide every read and write (they run as the signed-in person).

- `pull_events()`: your circle, as the events the app already understands: you, your friends, your private
  groups and the people you follow (their coffees and sessions, with every like and comment you may see). It stays
  small however many people use the app. Your gear comes back in full; your circle's is only what their profile
  shows (equipment, favorite coffees), never recipes or settings.
- `community_feed(before, max_items, feed_filter, feed_method)` (v14.4; filters v14.5): everyone else's sessions
  shared with Everyone that you may see, newest first, a page at a time (`before` = the `next` of the last page),
  with their coffees, in the same format. `feed_filter` is `help` (help requests) or `new` (people who joined in the
  last two weeks); `feed_method` keeps one method. The app keeps these beside your circle's records, so they never
  count toward your group goal, awards or library.
- `profile_page(name, before, max_items)` (v14.5): anyone's profile, outside your circle too: their card (how
  you're connected, whether it's private and locked to you) and the sessions of theirs you may see, newest first,
  with those sessions' coffees and what their profile shows of their gear. Never their recipes or last setups.
- `suggest_people(max_count)` (v14.5): people you might like to follow, from what they share with Everyone (same
  coffee or roaster, same grinder, same methods; for someone with nothing logged yet, people new here and people
  brewing this week). Never anyone you follow or asked to, anyone private, or anyone blocked either way.
- `push_event(ev)`: one save from the app, applied **as the signed-in person, whatever the event says**. A save
  only changes your own part of a record: the fields of your own coffee or session, and your like, comments,
  comment likes and want-to-try flag on anyone's. Replies' parents and comment likes that the app sends on the side
  (`commentMeta`) are folded back in. Only the owner edits a coffee or session, as in the app today. Deleted stays
  deleted, even if an old phone sends the record again. Each coffee keeps the roaster spelling written on it
  (`roaster_text`), while the roasters table groups spellings for roaster pages.
- `claim_name(code)`: links a new sign-in to a Sheet-era name with its one-time code.
- `create_profile(name, color)`: someone new makes a profile. The handle (2 to 24 lowercase letters, numbers or
  `_`) is the name the app shows; Sheet-era names can't be taken.
- `my_profile()`: the signed-in person's profile, or null before they claim a name or make one.

Following (v14.4: Profiles, People): `follow(name)`, `unfollow(name)`,
`answer_follow(name, accept)` for requests to a private profile, `block(name)` / `unblock(name)`, `my_people()`
and `find_people(text)`; `set_private(on)` turns your profile private (going public again lets in everyone who
asked). Following an open profile is immediate; a private one gets a request. The original crew start out
following each other (a one-time step in `api.sql`, after the import). Two people who
follow each other are friends, and friends see each other's Friends & groups sessions. Blocking ends follows both
ways, and the blocked person can't find or follow you (they're told there's nobody by that name).

Groups (v14.4: People, Groups; invite links are `<app address>?join=<code>`): `create_group(name, open)`, `join_group(code)` (an open group's id or
a private group's 8-letter invite code), `leave_group(id)` (the group passes to its longest-standing admin, and
the last one out closes it), `new_invite(id)`, `remove_member(id, name)`, `set_member_role(id, name, role)`,
`my_groups()` and `find_groups(text)`. Private groups hold up to 30 people, and their members are each other's
people list (so they share the group goal); open groups don't change anyone's people list.

Notifications, reporting and your account (v14.4: the bell at the top of the Feed; Report on comments, sessions
and profiles; Settings): triggers write a
notification when someone likes, comments on or replies to your things, likes your comment, follows you (or asks
to), approves your request, or joins your group; never for the Sheet's imported history, never twice for the same
save, never between people who've blocked each other. `my_notifications()` and `mark_notifications_read()` are
for the bell. `report_item(kind, ref, reason)` files a report by the names the app knows things by (a profile's
name, a session's id, `<record id>#<comment id>`), only for things you can see. Since v14.5 a report hides the
session or comment from the person who reported it right away, and three different people reporting it hide it
from everyone but its owner until it's reviewed. Reviewers (the profile ids in `backend_state` key `admins`;
Maceo's to start) get Settings, Review reports: `review_reports()` lists what's waiting and
`resolve_report(kind, target, action)` either dismisses it (shown again to everyone, reporters included) or
removes the session or comment. Following is capped at 200 new people a day (spam). `export_my_data()` is "Download my data".
`delete_account(your name)` deletes the account and everything in it; groups you own pass on, and a coffee other
people logged sessions on passes to the first of them so their sessions keep it. (Photos in storage have to be
removed through Supabase's storage API first; the app will do that before calling it.)

`community_goal(tz)` is the community goal (v14.5: the card on top of Community, and of Following for anyone not
in a private group yet): the crew's weekly goal at community scale, with the same six types in the same weekly
rotation as the app (weeks start Monday at midnight in the phone's time zone), targets from the community's last
six weeks, and "everyone brews" as a count of people. Sessions set to Only me don't count. Only totals come back
(your own count, and how many people brewed this week), never whose session counted.

Help requests (v14.5): a session's `help_wanted` ("Ask for help dialing this in" in the log form) comes back as
`helpWanted`; the asker marks the most helpful answer (`helpfulAnswer`, a comment id kept with the session's other
fields), and its author gets a `helpful` notification. Sessions of people who joined in the last two weeks come
back with `newHere` (worked out, never stored). Profile links are `<app address>?u=<name>`.

Phone notifications (v14.5): `push_key()` (the public VAPID key; empty until the sender is set up, and then the app
shows Settings, "Notifications on this phone"), `save_push(subscription)` and `remove_push(endpoint)`. Phones' push
addresses live in `push_subscriptions`, which nobody can read from the app. When a notification is written, a
trigger asks the `send-push` function (`supabase/functions/send-push`) to deliver it, through `pg_net`, with a
shared secret; the function connects to the database itself to read the text, the phones and the VAPID key
(`internal.push_payload`), and forgets phones that have turned notifications off. The `supabase push` workflow
(push to the `supabase-push` branch; needs the `SUPABASE_ACCESS_TOKEN` secret) deploys the function, turns on
`pg_net` and stores the function's address, the secret and the key pair in `backend_state` (made once, never printed).

**What the app may change directly.** Supabase lets signed-in people use every table through its web API, limited
by the row rules. Row rules can't limit columns, so the end of `schema.sql` does: profiles are only made by
`create_profile` / `claim_name`, names can't be changed directly (the app knows people by name; a rename will need
its own checked function), names can't have stray spaces or be a reserved word, a Sheet-era name can't be changed, a group member can only flip their own "counts
in group goal" (never their role), groups are made and handed over only by their functions, a follow can only be approved (not rewritten), a private profile can't be
followed without a request, and claim codes, the Sheet archive and the backend switches are off limits.

`storage.sql` (load after `api.sql`) sets up photo storage: a private bucket, one folder per account. You can only
put files in your own folder, and you can read a photo only if you may see the session it belongs to (the check
reads `session_photos`, whose own row rules apply). `push_event` refuses a photo path outside your own folder, so
nobody can point their session at someone else's private photo. The app asks for links that expire after two hours.

**Speed limits (v14.6).** So one account can't flood strangers, a few things are counted when they're made, by
the server's clock (`internal.rate_log`; an app can't backdate around it). Over a limit, the save is refused with
"You're going a bit fast. Wait a few minutes and try again." The app's retries outlast the short windows.

| What | Short window | A day |
| --- | --- | --- |
| New comments | 20 in 5 minutes | 300 |
| New sessions | 100 in 10 minutes | 500 |
| New coffees | 50 in 10 minutes | 300 |
| Reports | 20 in an hour | 50 |
| New communities | 5 in an hour | 20 |

**Everyone on a coffee (v14.6).** `coffee_community(roaster, name)` serves the coffee page's Everyone tab. It returns
the sessions shared with Everyone on the same coffee: same roaster and name, ignoring case, spaces and punctuation.
It leaves out your own sessions and anything you reported or the row rules hide. The first page adds a summary: how
many people and sessions, the average rating, each method's middle ratio, time and dose, and the most-picked notes.
It never includes grind settings, because they don't carry across grinders.

**Changing the calls on the live database.** `api.sql` only ever replaces functions, triggers, grants and
indexes (`create or replace`, `if not exists`), so it can be run again at any time: the `supabase setup` workflow
does that whenever it runs on a database that's already loaded. `schema.sql` and `storage.sql` are never rerun;
a change to a table needs its own step.

Signed-out calls are refused outright (Postgres lets anyone run a new function unless told otherwise, so
`api.sql` revokes that).

```
node supabase/test_api.js --host <postgres socket dir or host> [--user postgres]
```

`test_api.js` (115 checks) checks each rule with pretend people, then feeds each person's `pull_events()` to the real app
(from `index.html`) to confirm the app reads it correctly. A private check (not in this repo, it needs the real
Sheet) imports the history up to Oct 9, has everyone claim their name, compares each person's pull with what the
app shows from the Sheet, then replays the 250 later real saves through `push_event` and compares again: all
four people match. Two things it found about today's data:

- The Sheet's `actor` isn't always who made a save: a like or comment on someone else's session is logged with
  the session's previous actor, because the app copies the field along. The new backend never trusts that field
  (it uses the sign-in), so this only matters for reading old history.
- On Oct 9, eleven spelling fixes on other people's coffees and sessions (roasters, origins, tasting notes) were
  saved under Maceo's name within the same second. The app's edit screen only lets owners edit, so this was a
  one-off cleanup outside the normal screens. In the new backend that kind of fix is maintenance done directly in
  the database, not an app save; the private check applies those saves as the owner.

## The move itself

`CUTOVER.md` is the step-by-step, from creating the project to everyone signed in. Two safety pieces:

- `backend_state.cutover_at` records the move. After it, the Sheet import refuses to run and the nightly check
  stops rebuilding the tables, since the app writes to them directly from then on.
- Every import records exactly which Sheet saves it built the tables from (`backend_imported`, a fingerprint of
  each save's content). `replay_late.js` carries over every Sheet save that isn't among them: a phone that hadn't
  updated, or a save made between the last nightly rebuild and the move. It goes by content, not anyone's clock,
  so nothing falls in a gap. Each one goes through `push_event` as each person whose part of the record it changed
  (`lib/replay.js`), so the same rules apply as for a save from the app. A save is never applied twice; saves by
  someone who hasn't claimed their name yet wait for the next run. The private real-data check moves the history
  over at Oct 9, records the move only afterwards, replays the 250 later real saves with this script, and confirms
  all four people's views match the Sheet.
- `copy_back.js` is the way back. If the crew returns to the Sheet, it compares every record on both sides with
  `parity.js` (through the app's own replay) and sends the Sheet a normal save for each one that differs (with
  replies and comment likes beside the comments, the way the app saves them), a delete for each one deleted on
  Supabase, the group goal switches if they changed, and new photos as image data (Apps Script files them in
  Drive). For someone who never signed in, only what others changed (likes, comments, want-to-try) is sent, on top
  of the Sheet's own copy. Without `--post` it only lists what it would send; `COPY_BACK_DEBUG=1` also lists each
  difference (ids and field names only). The private check does this on the real data after a round of changes on
  Supabase (a new session with a reply and a comment like, an edit, a delete, gear, a tasting note, a goal switch,
  a comment and an unlike on the session of someone who never signed in) and confirms a second run finds nothing
  left to send.

## Backups (`backup.sh`, `.github/workflows/backup.yml`)

The free plan has no backups you can download, so GitHub makes one every night at 4 am Central: the sign-in
accounts (`auth.users`) and the app's three schemas (`public`, `private`, `internal`: tables, privacy rules,
permissions, triggers and data), gzipped and locked with AES-256 using the `BACKUP_PASSPHRASE` secret. It's kept as
a workflow artifact for 30 days (the run's page → Artifacts). The repository is public, so anyone signed in to
GitHub can download the file, but it can't be opened without the passphrase. Each run opens the locked file again
and checks every table's row count against the database. Photos in storage are not included.

To restore into a fresh Supabase project (or look inside):

```
gpg -d dialed-in-<date>.sql.gz.gpg | gunzip > dump.sql          # asks for the passphrase
psql "<new project's connection string>" -v ON_ERROR_STOP=1 -f dump.sql
psql "<new project's connection string>" -f supabase/storage.sql  # the photo bucket and its rules
```

Checked on the test copy: restored into an empty database, it has the same rows, 50 privacy rules, 13 rule helpers,
24 triggers and the same permissions, and gives the same sync as the original (apart from order).

## Trying the app without a Supabase project: `dev_server.js`

A stand-in for the few parts of Supabase the app uses (email-code sign-in, the database functions, photo storage),
running every call on a real Postgres with these same SQL files, as the signed-in person. For development and
tests only: sign-in codes are printed instead of emailed and its tokens aren't signed.

```
node supabase/dev_server.js --host <postgres socket dir> --fresh [--rows rows.json] --static . --static-port 8080
# then in the browser's console on http://localhost:8080:
localStorage.dialed_supabase = JSON.stringify({ url: 'http://localhost:54321', anonKey: 'dev' })
```

`--fresh` rebuilds the database; `--rows` also imports a Sheet export and prints the claim codes. A private
browser test drives the real app against it with the real Sheet imported: three people sign in (two claim their
names, one makes a new profile); each phone's view matches the Sheet's exactly; a session with a photo is logged
through the form, liked, commented on, edited and deleted; a stranger can't see Friends sessions or get a link to
their photos, until the session and photo are shared with everyone (and still never the notes kept for friends, or
a friends-only comment); a second phone signs in without a claim code; a save stranded in the Sheet-era outbox goes
through once; an expired sign-in renews itself; a revoked one keeps saves waiting until the person signs in again;
saves made offline go when the connection is back; signing out wipes the phone's copy; and nothing is ever sent
to the Google Sheet (36 checks).

## The privacy test

It drops and recreates a database called `dialed_rls_test`. Supabase's sign-in pieces (`auth.users`,
`auth.uid()`, the `authenticated` and `anon` roles) are stood in for, so the same `schema.sql` runs on Supabase.

Design notes:

- Privacy rules work per row, not per column, so a session's **notes** and **photo** live in their own tables
  (`session_notes`, `session_photos`), each with its own Everyone or Friends setting.
- **Friends** means two people who follow each other. A **private group** also counts as close: members see each
  other's Friends & groups sessions. An **open group** doesn't.
- A **private profile**'s sessions set to Everyone are seen only by approved followers (and friends and
  private-group members).
- **Blocking** hides everything both ways: sessions, comments, profile cards.
- Membership checks go through `is_group_member()`, because a group rule that reads the members table, whose own
  rule reads the groups table, makes Postgres stop with "infinite recursion detected in policy".
- Old records keep their Sheet ids (`legacy_id`, `legacy_ref`) so the import can line everything up.
- **Profiles are separate from sign-in accounts** (`profiles.auth_id`). Sheet-era names exist as profiles before
  anyone signs in, so the import can attach their history; claiming a name just links your new sign-in to it.
  The rules use `me()`, the signed-in person's profile id. Deleting an account deletes its profile and everything in it.
