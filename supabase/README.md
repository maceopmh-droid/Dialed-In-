# Supabase (phase 1 draft)

First draft of the database for the public version of Dialed In. **Not applied anywhere yet**: there's no
Supabase project until Maceo creates one.

- `schema.sql`: the tables (profiles, follows, blocks, groups, coffees, sessions, notes, photos, likes, comments,
  reports) and the privacy rules, written as Postgres row-level security. Every read is checked against the
  "Who sees what" rules in the plan before anything leaves the database.
- `test_rls.py`: runs `schema.sql` on a real Postgres and checks, as seven pretend people (you, a friend, a
  stranger who follows you, a private profile, a private-group buddy, an open-group member, someone who blocked
  you), exactly which sessions, notes, photos, comments, groups and profiles each can see or change.

```
python3 supabase/test_rls.py --host <postgres socket dir or host> [--user postgres]
```

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
