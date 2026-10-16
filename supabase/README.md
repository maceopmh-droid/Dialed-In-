# Supabase (phase 1 draft)

First draft of the database for the public version of Dialed In. **Not applied anywhere yet**: there's no
Supabase project until Maceo creates one.

- `schema.sql`: the tables (profiles, follows, blocks, groups, coffees, sessions, notes, photos, likes, comments,
  reports) and the privacy rules, written as Postgres row-level security. Every read is checked against the
  "Who sees what" rules in the plan before anything leaves the database.
- `test_rls.py`: runs `schema.sql` on a real Postgres and checks, as seven pretend people (you, a friend, a
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
node supabase/parity.js --html index.html --rows rows.json --psql "psql -h HOST -U USER -d DB" --known-history
```

On the Oct 15, 2026 Sheet (1,407 rows): 4 people, 31 coffees, 237 sessions, 252 comments, 296 likes, 217
photos, 163 notes, 10 pieces of equipment, 29 custom notes; parity: everything matches. The test user John was
skipped (removed, with nothing but an equipment record). Two sessions whose coffee was deleted long ago keep
their old coffee link in `extras.beanId`.

**Known difference:** achievement levels for "comments written" and "likes received" are counted today by
walking the history of edits, which the tables don't keep (they hold each record's latest state). Phase 2 should
count those from what exists (comments you wrote, likes you have). `--known-history` reports them without failing.

The real Sheet export never goes in this repository (it's public and the rows hold everyone's notes).

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
