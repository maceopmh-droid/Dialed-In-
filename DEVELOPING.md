# Developing Dialed In

`index.html` at the root is still the single file GitHub Pages serves and people add to their home screens.
It is **generated** from `src/`. Don't edit it by hand; edit `src/` and build.

## Build

```
python3 build.py                 # src/ -> index.html (refuses to write if a check fails)
python3 build.py --check F.html  # confirm the build is byte-for-byte F.html
python3 build.py --bump 14.2     # set the version in all three places, then build
```

Needs Python 3. If Node is installed, the build also confirms every script parses.

Checks run on every build: the version matches in all three places (line 2, the `dialed-in-version` meta tag,
"Dialed In · vX.Y" at the bottom of Settings), the home-screen icon link is present, no app method is defined
twice, and every inline script parses.

## How `src/` works

`src/index.html` is the page: the head, the page markup and the order of everything. A line that reads exactly
`@@include <path>` is replaced by that file, unchanged. So the output is exactly these files, in this order.

| Path | What's in it |
| --- | --- |
| `src/index.html` | Head, page markup (sidebar, screens, sheets), and the include order |
| `src/js/theme-boot.js` | Picks light or dark before the page draws |
| `src/css/01-layout.css` … `10-v14.css` | Styles, oldest first; later files deliberately override earlier ones |
| `src/js/00-constants.js` | Tasting-note wheel, taste sliders, method profiles, built-in recipes |
| `src/js/01-flavor-shape.js` | The 3D flavor shape |
| `src/js/02-cloud.js` | The backend address and `Cloud`, the one door every load and save goes through |
| `src/js/03-roaster-engine.js` | Roaster matching and descriptions (no screen code) |
| `src/js/04-storage.js` | Safe localStorage helpers |
| `src/js/app/00-state.js` … `27-settings-equipment-misc.js` | The `app` object, cut into files by feature. These are pieces of one object, so a file on its own isn't valid JavaScript; keep each method whole within one file |
| `src/js/99-boot.js` | Starts the app |

Saving, syncing, the outbox and merging all live in `src/js/app/05-sync-and-saving.js`.

## The data layer (`Cloud`)

Since v14.2 the app reaches the backend in exactly one place, `Cloud` in `src/js/02-cloud.js`:

- `Cloud.pull({ since, version, anchor }, { signal })` downloads everything newer than `since` and resolves to the reply's text.
- `Cloud.send(event, { signal })` sends one event. The Sheet's reply can't be read, so the next pull confirms it landed.
- `Cloud.id` names the backend in the on-device copy of the log and in the outbox. It's still the Sheet's address,
  so phones keep their saved copy and anything waiting in their outbox.

Nothing else in the app calls `fetch` for data (the only other `fetch` is the self-update check, which reads
`index.html`). Moving to a new backend means giving `Cloud` a new implementation; the screens don't change.

## History

Up to v14.1 the app was produced by 51 patch modules in a private build kit. Phase 0 of the public-launch plan
turned that into `src/`. The first build from `src/` is byte-for-byte the live v14.1
(sha256 `023fcd2afc09ae579998a277062927c00a2b8f631c0f6241623d76efbbbf9c33`). From here on, `src/` is the
source of truth and the patch modules are frozen history.

## Tests

The full test battery (the in-app self-test with about 11,400 checks, the browser suites, the 73 feature tests
and the 104 backend tests) lives in the private build kit, not here. Several suites run on a copy of the real
data, which has everyone's sessions and notes, and this repository is public. Every release still runs the full
battery before shipping.

## Shipping

1. Edit `src/`, then `python3 build.py --bump X.Y`.
2. Run the full test battery on the built `index.html`.
3. Commit `src/` and `index.html` together; the committed `index.html` must match the tested file's sha256.
4. Confirm the live site serves it, then force-close the home-screen app (GitHub caches for up to 10 minutes;
   v14.0 and later also update themselves).

## Rules that keep it working

- Anything inside a quoted string in an `onclick` goes through `app.escJs(...)`, or better, a `data-` attribute.
- Calendar days come from `dayNum()` / `localTime()`; never divide milliseconds by 86,400,000.
- Every save goes through `push()`, so it reaches the outbox. Gear saves start from `gearKeep()`.
- People are added and removed with `registerPerson()` / `unregisterPerson()`; lists of people leave out `removedPeople()`.
- Star meters carry `--whole` and `--frac` next to `--fill`, and star sizes stay whole even pixels.
- Never show or suggest one person's grind number to someone else; grinders aren't comparable.
