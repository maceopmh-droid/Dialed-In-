# Moving Dialed In from the Sheet to Supabase

The step-by-step for phase 2 of the public-launch plan: the original crew signs in and the app switches from the
Google Sheet to Supabase, without losing a save. Each step can be checked before the next one, and until step 7
nothing the crew sees changes.

## 1. Create the project (Maceo)

1. Sign up at supabase.com and create a project. Pick the region closest to Chicago ("East US (Ohio)" if offered).
   The free plan is fine for setting up and testing; switch to Pro (about $25/month) before step 7, because free
   projects pause after a week without use.
2. Settings → API: copy the **Project URL** and the **anon / publishable key**. Those two go in the app. The
   **service_role** key is a master key: it goes only into Apps Script's Script properties (step 3) and GitHub's
   secrets (step 4), never into `index.html` or a chat.

## 2. Load the database

In the project's SQL editor, run these three files, in this order, each in full:

1. `supabase/schema.sql` (tables and the privacy rules)
2. `supabase/api.sql` (the app's calls)
3. `supabase/storage.sql` (photo storage)

Then Authentication → Providers → Email: on. Authentication → Email templates: in both "Magic link" and "Confirm
signup" (the first email a new person gets), replace the body with a message that shows the code, for example:

```
Your Dialed In code is {{ .Token }}
It works for one hour. If you didn't ask for it, ignore this email.
```

The app asks for the 6-digit code, never a link, because a link opens Safari instead of the home-screen app.

Supabase's built-in email sender only allows a few emails an hour. That's enough for the crew; before inviting
anyone else, connect a real sender (Authentication → SMTP, with Resend or Postmark).

## 3. Start copying the Sheet across (the shadow backend)

In the Apps Script project behind the Sheet:

1. Add `apps_script/SupabaseForward.gs` as a new file. It doesn't touch saving: the Sheet stays in charge.
2. Project Settings → Script properties: `SUPABASE_URL` = the Project URL, `SUPABASE_SERVICE_KEY` = the
   service_role key.
3. Run `setupSupabaseForward()` once and approve the prompt. From then on every new row is copied within 5
   minutes, and everything is resent once a day.

Nothing about Code.gs's deployment changes, so there's no new version to deploy for this.

## 4. Fill the tables and check them every night

Add a GitHub secret `SUPABASE_DB_URL` (Settings → Database → Connection string, with the password filled in). The
nightly workflow (`.github/workflows/nightly-shadow.yml`, once it's on main) then rebuilds the tables from the live
Sheet and checks that the app would show exactly the same thing from either side. To run it by hand:

```
node supabase/shadow_check.js --psql "psql $SUPABASE_DB_URL" --html index.html --live <the Apps Script URL>
```

It ends with `shadow backend: OK` when everything matches. The first run also creates each person's profile and
claim code. To see the codes:

```
psql "$SUPABASE_DB_URL" -c "select legacy_name, code from claim_codes order by 1;"
```

## 5. Put the project in the app (still off for everyone)

In `src/js/02-cloud.js`, fill in `SUPABASE = { url: '<Project URL>', anonKey: '<anon key>', live: false }`, build,
run the full test battery, and ship as usual. Nobody's app changes: `live: false` keeps everyone on the Sheet.

## 6. Try it on one phone

Open the app in Safari (not the home-screen icon) with `?backend=supabase` on the end of the address. That phone
switches to Supabase: sign in with your email, enter the code, then your claim code. Check your sessions, photos,
likes and comments are all there, log a test session, then open the address with `?backend=sheet` to go back.
(The test session stays in Supabase only, so delete it before going back.)

Saves made on Supabase during this test don't go to the Sheet, and the nightly rebuild (step 4) replaces the
tables with the Sheet's copy, so nothing from a test survives into the real move.

## 7. Move everyone

Pick a quiet evening and tell the crew first.

1. Run the nightly check by hand one last time and confirm `shadow backend: OK`.
2. Record the move, so nothing ever rebuilds the tables from the Sheet again:
   ```
   psql "$SUPABASE_DB_URL" -c "insert into backend_state (key, value) values ('cutover_at', now()::text);"
   ```
3. Set `live: true` in `src/js/02-cloud.js`, bump the version, run the battery, ship.
4. Everyone's app updates itself within about 20 minutes (or force-close it). It opens on the welcome screen:
   "I've been here before" → email → code → claim code. Each person's history is already there.
5. A phone that was offline when it updated keeps its unsent saves and sends them to Supabase once its owner signs
   in (only that person's part of each record, merged onto anything newer). Anything that still reached the Sheet
   (a phone that hadn't updated yet, or a save made between step 1 and step 2) is carried over by this. It goes by
   exactly which saves the tables were built from, not by time, so nothing falls in a gap. It's safe to run as often
   as you like: a save is never applied twice, and saves by someone who hasn't claimed their name yet wait for the
   next run.
   ```
   node supabase/replay_late.js --psql "psql $SUPABASE_DB_URL" --live <the Apps Script URL>
   ```
   Run it again over the first few days, until it reports nobody waiting.

The Sheet keeps every row it ever had, and Apps Script keeps copying anything new into `sheet_archive`.

## If something goes wrong

- Before step 7: nothing to undo. The crew is still on the Sheet.
- After step 7: set `live: false` and ship, so phones go back to the Sheet, which has everything up to the move.
  Then copy back what happened on Supabase since: first see what it would send, then send it.
  ```
  node supabase/copy_back.js --psql "psql $SUPABASE_DB_URL" --html index.html --live <the Apps Script URL>
  SUPABASE_URL=<Project URL> SUPABASE_SERVICE_KEY=<service_role key> node supabase/copy_back.js --psql "psql $SUPABASE_DB_URL" --html index.html --live <the Apps Script URL> --post
  ```
  It compares every record through the app's own replay (the same comparison as the parity check) and sends the
  Sheet a normal save for each one that differs (new sessions, edits, likes, comments with their replies and likes,
  gear, tasting notes, group goal switches), a delete for each one deleted on Supabase, and new photos as image
  data (Apps Script puts them in Drive). For someone who never signed in, only the likes and comments others left
  on their records are sent; the rest stays the Sheet's own copy. Run it again afterwards: it should find nothing
  left to send. Who-sees-what settings, follows and groups have no place in the Sheet and stay in Supabase.
- Photos already in Google Drive stay there and keep working; new photos go to Supabase storage.

## What's in place, and what isn't yet

Ready and tested: the tables and privacy rules, the app's calls, photo storage, the import from the Sheet, the
nightly check, sign-in by email code, claiming a name, new profiles, the sign-in screens and the who-sees-what
controls (both behind the switch, waiting for Maceo's OK on the screenshots), carrying late saves over, the copy
back to the Sheet, and a stand-in for Supabase (`supabase/dev_server.js`) that the private browser tests run the
real app against. The database side of following, groups, notifications, reporting, Download my data and Delete
account is built and tested, without screens yet.

Not yet: Sign in with Apple and Google (email codes work everywhere; those two need more setup and testing on
iPhone), the screens for following, groups, notifications and account deletion, and the community feed. Those are
phase 3.
