# Moving Dialed In from the Sheet to Supabase

The step-by-step for phase 2 of the public-launch plan: the original crew signs in and the app switches from the
Google Sheet to Supabase, without losing a save. Each step can be checked before the next one, and until step 7
nothing the crew sees changes.

## 1. Create the project (Maceo) — done Oct 16, 2026 (it's in East US, North Virginia)

1. Sign up at supabase.com and create a project in the region closest to Chicago ("East US (Ohio)"). The free plan
   is fine for setting up and testing; switch to Pro (about $25/month) before step 7, because free projects pause
   after a week without use.
2. The **Project URL** and the **publishable key** (`sb_publishable_…`) go in the app; both are meant to be public
   (the privacy rules do the protecting). The **database password** and any **secret key** (`sb_secret_…`, or the
   older `service_role`) are master keys: they go only into GitHub's secrets, never into `index.html` or a chat.
3. GitHub → the repo → Settings → Secrets and variables → Actions → New repository secret:
   `SUPABASE_DB_PASSWORD` = the database password.

## 2. Load the database (from GitHub)

The `supabase setup` workflow (`.github/workflows/supabase-setup.yml`) does this, because GitHub can reach Supabase:
push to the `supabase-setup` branch (or run it from the Actions tab once it's on main). It finds the database
(`supabase/find_db.sh`: through Supabase's session pooler, since GitHub has no IPv6), loads `schema.sql`, `api.sql`
and `storage.sql` in one go (all or nothing, and only into an empty project), runs `check_project.js` (privacy
rules on everywhere, signed-out visitors get nothing, exactly the app's calls are callable, private photo bucket,
from the database and from the outside), then the shadow check (step 3).

Then, in the Supabase dashboard (Maceo): Authentication → Providers → Email: on. Authentication → Email templates:
in both "Magic link" and "Confirm signup" (the first email a new person gets), replace the body with a message that
shows the code, for example:

```
Your Dialed In code is {{ .Token }}
It works for one hour. If you didn't ask for it, ignore this email.
```

The app asks for the 6-digit code, never a link, because a link opens Safari instead of the home-screen app. Some
projects send 8-digit codes by default: in Authentication → Email (sign-in providers), set **Email OTP Length** to 6.

Supabase's built-in email sender only allows a couple of emails an hour for the whole project, which isn't enough
for four people signing in on the same evening. Before step 7, connect a real sender (Authentication → SMTP, with
Resend or Postmark; Resend's free plan is plenty).

## 3. Copy the Sheet across and check it every night (the shadow backend)

`supabase/shadow_check.js` reads the live Sheet (its public read), adds every save the archive (`sheet_archive`)
doesn't have yet, rebuilds the tables from the live Sheet, and checks that the app would show exactly the same thing
from either side. Nothing about the Sheet or Code.gs changes. The setup workflow runs it once; the nightly workflow
(`.github/workflows/nightly-shadow.yml`, once it's on main) runs it at 3:30 am Central. By hand:

```
node supabase/shadow_check.js --psql "psql $DB_URL" --html index.html --live <the Apps Script URL>
```

It ends with `shadow backend: OK` when everything matches. The first run also creates each person's profile and
claim code. To see the codes (never printed in GitHub's logs, which are public), in the SQL editor:

```
select legacy_name, code from claim_codes order by 1;
```

## 4. (Nothing to do: the archive needs no Apps Script changes)

An earlier draft had Apps Script copy each new row across with a secret key. The nightly check does it instead, so
no secret key is needed anywhere but GitHub.

## 5. Put the project in the app (still off for everyone)

In `src/js/02-cloud.js`, fill in `SUPABASE = { url: '<Project URL>', anonKey: '<publishable key>', live: false }`, build,
run the full test battery, and ship as usual. Nobody's app changes: `live: false` keeps everyone on the Sheet.

## 6. Try it on one phone

Open the app in Safari (not the home-screen icon) with `?backend=supabase` on the end of the address. That phone
switches to Supabase: sign in with your email, enter the code, then your claim code. Check your sessions, photos,
likes and comments are all there, log a test session, then open the address with `?backend=sheet` to go back.
(The test session stays in Supabase only, so delete it before going back.)

Saves made on Supabase during this test don't go to the Sheet, and the nightly rebuild (step 3) replaces the
tables with the Sheet's copy, so nothing from a test survives into the real move.

## 7. Move everyone

Pick a quiet evening and tell the crew first. (`$DB_URL` below is the database's connection string; GitHub's
workflows build it from the password secret with `supabase/find_db.sh`.)

1. Run the nightly check by hand one last time and confirm `shadow backend: OK`.
2. Record the move, so nothing ever rebuilds the tables from the Sheet again:
   ```
   insert into backend_state (key, value) values ('cutover_at', now()::text);   -- in the SQL editor
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
   node supabase/replay_late.js --psql "psql $DB_URL" --live <the Apps Script URL>
   ```
   Run it again over the first few days, until it reports nobody waiting.

The Sheet keeps every row it ever had, and the nightly check keeps copying anything new into `sheet_archive`.

## If something goes wrong

- Before step 7: nothing to undo. The crew is still on the Sheet.
- After step 7: set `live: false` and ship, so phones go back to the Sheet, which has everything up to the move.
  Then copy back what happened on Supabase since: first see what it would send, then send it.
  ```
  node supabase/copy_back.js --psql "psql $DB_URL" --html index.html --live <the Apps Script URL>
  SUPABASE_URL=<Project URL> SUPABASE_SERVICE_KEY=<secret key> node supabase/copy_back.js --psql "psql $DB_URL" --html index.html --live <the Apps Script URL> --post
  ```
  It compares every record through the app's own replay (the same comparison as the parity check) and sends the
  Sheet a normal save for each one that differs (new sessions, edits, likes, comments with their replies and likes,
  gear, tasting notes, group goal switches), a delete for each one deleted on Supabase, and new photos as image
  data (Apps Script puts them in Drive). For someone who never signed in, only the likes and comments others left
  on their records are sent; the rest stays the Sheet's own copy. Run it again afterwards: it should find nothing
  left to send. Who-sees-what settings, follows and groups have no place in the Sheet and stay in Supabase.
- Photos already in Google Drive stay there and keep working; new photos go to Supabase storage.

## What's in place, and what isn't yet

Done on the real project (Oct 16, 2026): steps 1–3. The database is loaded; every project check passes (privacy
rules on all 24 tables, signed-out visitors refused, exactly the app's 28 calls callable, private photo bucket); the
shadow check archived the live Sheet (1,409 distinct saves) and rebuilt the tables from it: 31 coffees, 239
sessions, 4 people, and the app shows exactly the same thing from either side. Step 5 is done on the branch
(`live: false`), waiting to ship. Still to do in the dashboard: the code email template and the code length (step
2); a real email sender before step 7.

Ready and tested: the tables and privacy rules, the app's calls, photo storage, the import from the Sheet, the
nightly check, sign-in by email code, claiming a name, new profiles, the sign-in screens and the who-sees-what
controls (both behind the switch, waiting for Maceo's OK on the screenshots), carrying late saves over, the copy
back to the Sheet, and a stand-in for Supabase (`supabase/dev_server.js`) that the private browser tests run the
real app against. The database side of following, groups, notifications, reporting, Download my data and Delete
account is built and tested, without screens yet.

Not yet: Sign in with Apple and Google (email codes work everywhere; those two need more setup and testing on
iPhone), the screens for following, groups, notifications and account deletion, and the community feed. Those are
phase 3.
