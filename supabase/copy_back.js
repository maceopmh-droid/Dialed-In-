#!/usr/bin/env node
// The way back: if the crew has to return to the Sheet after the move, this sends the Sheet everything that changed on
// Supabase, as ordinary app saves, so the Sheet ends up showing what Supabase shows.
//
//   node supabase/copy_back.js --psql "psql <database url>" --html index.html --live <Apps Script URL> [--post]
//
// Without --post it only lists what it would send. It reads each person's own records the way the app would see them
// (pull_events as that person: their coffees, sessions and gear, with every like and comment on them), compares each
// record with the Sheet's latest copy through the app's own replay, and sends a full save for each record that differs
// (newer than anything in the Sheet, so it wins), a delete for each record Supabase deleted, any new tasting notes, and
// the group goal switches if they changed.
// People who never signed in on Supabase have nothing new there, so nothing of theirs is sent.
const { execSync } = require('child_process');
const { loadApp } = require('./lib/app_in_node');
const { fetchSheet } = require('./lib/sheet');

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const PSQL = arg('psql'), HTML = arg('html'), LIVE = arg('live'), POST = process.argv.includes('--post');
if (!PSQL || !HTML || !LIVE) { console.error('usage: node supabase/copy_back.js --psql "psql <db>" --html index.html --live <Apps Script URL> [--post]'); process.exit(2); }
const sql = s => execSync(`${PSQL} -Atq -v ON_ERROR_STOP=1`, { input: s, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();

const { runParity } = require('./parity');
const canon = v => Array.isArray(v) ? v.map(canon) : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;

(async () => {
  // the Sheet now, through the app
  const sheetEvents = await fetchSheet(LIVE);
  const S = loadApp(HTML); S.user = ''; S.process(sheetEvents);

  // Supabase now: each signed-in person's own records, as they see them
  const owners = sql(`select coalesce(string_agg(auth_id::text || '=' || coalesce(legacy_name, display_name), E'\\n'), '') from profiles where auth_id is not null;`).split('\n').filter(Boolean).map(l => { const i = l.indexOf('='); return { auth: l.slice(0, i), name: l.slice(i + 1) }; });
  // A record's likes and comments come from everyone who can see them (a friends-only comment is always visible to
  // its writer), so the versions people pull are merged; the record's own fields come from its owner's copy when the
  // owner signed in (otherwise any copy: nobody else can change them).
  const recs = new Map(), gear = [], flavors = new Map();
  let group = null;   // the group goal switches (who doesn't count), the same for everyone in the crew
  const union = (a, b) => [...new Set([...(a || []), ...(b || [])])];
  owners.forEach(o => {
    const pulled = JSON.parse(sql(`set role authenticated; set request.jwt.claim.sub to '${o.auth}'; select pull_events();`) || '[]');
    pulled.forEach(e => {
      if (e.type === 'bean' || e.type === 'brew') {
        const k = e.type + ':' + e.id, cur = recs.get(k), isOwner = (e.owner || e.user) === o.name;
        if (!cur) { recs.set(k, { ...e, comments: (e.comments || []).map(c => ({ ...c })) }); return; }
        const base = isOwner ? { ...e } : cur;
        base.likes = union(cur.likes, e.likes);
        if (e.type === 'bean') base.wantToTry = union(cur.wantToTry, e.wantToTry);
        const byId = new Map((cur.comments || []).map(c => [String(c.id), { ...c }]));
        (e.comments || []).forEach(c => { const have = byId.get(String(c.id)); byId.set(String(c.id), have ? { ...have, likes: union(have.likes, c.likes) } : { ...c }); });
        base.comments = [...byId.values()].sort((x, y) => String(x.timestamp).localeCompare(String(y.timestamp)));
        recs.set(k, base);
      } else if (e.type === 'gear' && e.owner === o.name) gear.push(e);
      else if (e.type === 'gear' && e.owner === '__group__') group = e;
      else if (e.type === 'flavor') flavors.set(String(e.name || '').toLowerCase(), e);
    });
  });
  const mine = [...recs.values(), ...gear, ...flavors.values(), ...(group ? [group] : [])];
  const D = loadApp(HTML); D.user = ''; D.process(mine);

  // What differs, decided by the same field-by-field comparison the move was checked with (supabase/parity.js): the
  // Sheet's records against Supabase's, through the app's own replay.
  const { diffs } = runParity({ html: HTML, events: sheetEvents, psql: '', eventsB: mine, knownHistory: true });
  if (process.env.COPY_BACK_DEBUG) diffs.forEach(d => console.log('  diff ' + d));
  const now = Date.now();
  const out = [];
  // newer than anything in the Sheet, in order; replies and comment likes ride beside the comments the way the app saves
  // them (the Sheet's script keeps only each comment's id, writer, words and time)
  const stamp = (e, i) => ({ ...e, ...(Array.isArray(e.comments) ? { commentMeta: D.commentMetaOf(e.comments) } : {}), actor: e.owner || e.user, eventAt: new Date(now + i).toISOString() });
  const signedIn = new Set(owners.map(o => o.name));
  const changed = { bean: new Set(), brew: new Set(), gear: new Set() };
  let groupChanged = false;
  diffs.forEach(d => {
    if (d.startsWith('goal switch ')) { groupChanged = true; return; }
    const m = /^(coffee|session|gear) (.+?): (.+)$/.exec(d); if (!m) return;
    const [, what, id, field] = m;
    if (what === 'coffee') { if (field === 'missing') { const b = S.beans.get(id); if (b && signedIn.has(b.owner || b.user)) out.push({ type: 'delete', targetType: 'bean', id, user: b.owner || b.user }); } else changed.bean.add(id); }
    else if (what === 'session') { if (field === 'missing') { const b = S.brews.get(id); if (b && signedIn.has(S.getBrewOwner(b))) out.push({ type: 'delete', targetType: 'brew', id, user: S.getBrewOwner(b) }); } else changed.brew.add(id); }
    else if (signedIn.has(id)) changed.gear.add(id);   // (someone who never signed in has nothing new; we only see their public gear)
  });
  D.beans.forEach((b, id) => { if (!S.beans.has(id)) changed.bean.add(id); });   // new on Supabase
  D.brews.forEach((b, id) => { if (!S.brews.has(id)) changed.brew.add(id); });
  // The record to send. Its owner's copy when they signed in. When they didn't, other people can only have changed its
  // likes, comments and want-to-try list, and their copies may leave out things shared only with the owner's friends,
  // so the Sheet's own copy is sent with just those parts replaced (exactly what the app sends when someone likes it).
  const recordFor = (type, id) => {
    const m = mine.find(e => e.type === type && String(e.id) === id); if (!m) return null;
    const have = type === 'bean' ? S.beans.get(id) : S.brews.get(id);
    const owner = have ? (type === 'bean' ? (have.owner || have.user) : S.getBrewOwner(have)) : (m.owner || m.user);
    if (!have || signedIn.has(owner)) return m;
    return { type, ...S.stripMeta(have), likes: m.likes || [], comments: m.comments || [], ...(type === 'bean' ? { wantToTry: m.wantToTry || [] } : {}) };
  };
  changed.bean.forEach(id => out.push(recordFor('bean', id)));
  changed.brew.forEach(id => out.push(recordFor('brew', id)));
  changed.gear.forEach(who => out.push(mine.find(e => e.type === 'gear' && e.owner === who)));
  if (groupChanged && group) out.push(group);
  const known = new Set([...S.customFlavors.values()].map(f => String(f.name || '').toLowerCase()));
  mine.filter(e => e.type === 'flavor' && !known.has(String(e.name || '').toLowerCase())).forEach(f => { known.add(String(f.name).toLowerCase()); out.push({ ...f, id: 'flavor-' + String(f.name).toLowerCase().replace(/[^a-z0-9]+/g, '-') }); });

  // Photos in Supabase storage go to the Sheet the way the app sends a new photo (as image data, which Apps Script files
  // in Drive). That needs SUPABASE_URL and SUPABASE_SERVICE_KEY (a secret key, sb_secret_…, which goes on the apikey
  // header only; or the older service_role key) in the environment; without them those photos are left off (and
  // counted). Drive photos stay as they are.
  const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  let photosLeftOff = 0;
  const send = [];
  for (const e of out.filter(Boolean).map(stamp)) {
    if (e.type === 'brew' && e.photo && e.photo.path && !e.photo.fileId) {
      let url = null;
      if (SB && KEY && POST) {
        const r = await fetch(SB.replace(/\/+$/, '') + '/storage/v1/object/photos/' + e.photo.path.slice(3), { headers: KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: 'Bearer ' + KEY } });
        if (r.ok) url = `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
      }
      if (url) { send.push({ ...e, photo: { url, source: e.photo.source || 'library', addedAt: e.photo.addedAt || new Date().toISOString() } }); continue; }
      photosLeftOff++;
      const { photo, ...rest } = e; send.push({ ...rest, photo: null }); continue;
    }
    send.push(e);
  }
  if (photosLeftOff) console.log(`photos in Supabase storage left off: ${photosLeftOff}${POST ? ' (set SUPABASE_URL and SUPABASE_SERVICE_KEY to send them)' : ' (sent as image data with --post when SUPABASE_URL and SUPABASE_SERVICE_KEY are set)'}`);
  const counts = send.reduce((m, e) => { m[e.type] = (m[e.type] || 0) + 1; return m; }, {});
  console.log(`differences to send to the Sheet: ${send.length} ${JSON.stringify(counts)}`);
  if (!POST) { send.forEach(e => console.log(`  would send ${e.type} ${e.id}${e.targetType ? ' (' + e.targetType + ')' : ''}`)); return; }
  for (const e of send) {
    const r = await fetch(LIVE, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(e) });
    if (!r.ok) throw new Error(`the Sheet refused ${e.type} ${e.id}: ${r.status}`);
  }
  console.log(`sent ${send.length} saves to the Sheet`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
