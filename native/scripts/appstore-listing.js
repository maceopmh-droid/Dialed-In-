// Fills in the App Store listing through the App Store Connect API, from native/appstore/listing.json: category,
// subtitle, privacy policy, description, keywords, support link, age rating, content rights, the review account and
// notes, price (free), where it's sold, screenshots, and the build. It submits for review only when the commit that
// started it says [submit] (that's Maceo's call each time),
// and it leaves what the API can't do (the App Privacy answers) and personal details (the review contact's name and
// phone) for App Store Connect itself. Prints only what was set or what Apple said (GitHub Actions logs are public).
//   env ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_FILE, BUNDLE_ID, VERSION, REVIEW_PASSWORD, SHOTS_DIR (optional)
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const clean = v => String(v || '').replace(/["'\s]/g, '');
const KID = clean(process.env.ASC_KEY_ID), ISS = clean(process.env.ASC_ISSUER_ID), BUNDLE = clean(process.env.BUNDLE_ID), VERSION = clean(process.env.VERSION);
const L = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'appstore', 'listing.json'), 'utf8'));
const key = crypto.createPrivateKey(fs.readFileSync(process.env.ASC_KEY_FILE, 'utf8'));
const done = [], todo = [], problems = [];
const say = (t, m) => console.log(`::notice title=${t}::${m}`);
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt() {
  const now = Math.floor(Date.now() / 1000), head = b64u({ alg: 'ES256', kid: KID, typ: 'JWT' }), body = b64u({ iss: ISS, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
  return `${head}.${body}.${crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
async function api(method, p, body) {
  const r = await fetch('https://api.appstoreconnect.apple.com' + p, { method, headers: { Authorization: 'Bearer ' + jwt(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) { /* empty */ }
  return { status: r.status, ok: r.status < 300, j };
}
const why = r => ((r.j && r.j.errors) || []).map(e => [e.title, e.detail].filter(Boolean).join(': ')).join('; ').slice(0, 400) || `HTTP ${r.status}`;
const step = async (label, fn) => { try { const out = await fn(); if (out !== false) done.push(label); } catch (e) { problems.push(`${label}: ${String(e && e.message || e).slice(0, 300)}`); } };
// v21.6: the app's own details (name, subtitle, category, privacy link, age rating) belong to the live version once an
// update is made; Apple won't take them then, and they keep what the live version has (the same values), so that isn't
// a problem: it's noted as kept
const infoStep = async (label, fn) => { try { const out = await fn(); if (out !== false) done.push(label); } catch (e) { const m = String(e && e.message || e); if (/current (resource )?state|not editable|state of another resource/i.test(m)) done.push(`${label} (kept as on the live version)`); else problems.push(`${label}: ${m.slice(0, 300)}`); } };
const must = (r, what) => { if (!r.ok) throw new Error(`${what} (${why(r)})`); return r; };

(async () => {
  const apps = must(await api('GET', `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE)}&limit=5`), 'finding the app');
  const app = (apps.j.data || []).find(a => a.attributes.bundleId === BUNDLE);
  if (!app) throw new Error(`no app uses ${BUNDLE}`);
  const appId = app.id;

  await step('content rights: no third-party content', async () => must(await api('PATCH', `/v1/apps/${appId}`, { data: { type: 'apps', id: appId, attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } } }), 'content rights'));

  // ---- app info: category, subtitle, privacy policy, age rating
  const infos = must(await api('GET', `/v1/apps/${appId}/appInfos?limit=10`), 'app info');
  const info = (infos.j.data || []).find(i => !/READY_FOR_DISTRIBUTION|REPLACED_WITH_NEW_INFO/.test(i.attributes.state || i.attributes.appStoreState || '')) || (infos.j.data || [])[0];
  await infoStep('category: Food & Drink', async () => must(await api('PATCH', `/v1/appInfos/${info.id}`, { data: { type: 'appInfos', id: info.id, relationships: { primaryCategory: { data: { type: 'appCategories', id: L.primaryCategory } } } } }), 'category'));
  // the name shown beside the icon (its own step: a name someone else already uses is refused without holding up the rest)
  if (L.name) await infoStep(`name: ${L.name}`, async () => {
    const locs = must(await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations?limit=50`), 'app info languages');
    const loc = (locs.j.data || []).find(x => x.attributes.locale === L.locale);
    if (!loc) throw new Error(`no ${L.locale} app info`);
    must(await api('PATCH', `/v1/appInfoLocalizations/${loc.id}`, { data: { type: 'appInfoLocalizations', id: loc.id, attributes: { name: L.name } } }), 'name');
  });
  await infoStep('subtitle and privacy policy link', async () => {
    const locs = must(await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations?limit=50`), 'app info languages');
    const loc = (locs.j.data || []).find(x => x.attributes.locale === L.locale);
    if (!loc) throw new Error(`no ${L.locale} app info`);
    must(await api('PATCH', `/v1/appInfoLocalizations/${loc.id}`, { data: { type: 'appInfoLocalizations', id: loc.id, attributes: { subtitle: L.subtitle, privacyPolicyUrl: L.privacyPolicyUrl } } }), 'subtitle');
  });
  await infoStep('age rating answers', async () => {
    const d = must(await api('GET', `/v1/appInfos/${info.id}/ageRatingDeclaration`), 'age rating');
    const have = Object.keys(d.j.data.attributes || {});
    const none = ['alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gamblingSimulated', 'horrorOrFearThemes', 'matureOrSuggestiveThemes', 'medicalOrTreatmentInformation', 'profanityOrCrudeHumor',
      'sexualContentGraphicAndNudity', 'sexualContentOrNudity', 'violenceCartoonOrFantasy', 'violenceRealistic', 'violenceRealisticProlongedGraphicOrSadistic', 'gunsOrOtherWeapons'];
    const no = ['gambling', 'unrestrictedWebAccess', 'lootBox', 'advertising', 'ageAssurance', 'healthOrWellnessTopics', 'parentalControls'];
    const yes = ['userGeneratedContent', 'messagingAndChat'];
    const attrs = {};
    none.forEach(k => { if (have.includes(k)) attrs[k] = 'NONE'; });
    no.forEach(k => { if (have.includes(k)) attrs[k] = false; });
    yes.forEach(k => { if (have.includes(k)) attrs[k] = true; });
    // v21.6: Apple's social media question (required for updates from September 2026): yes, Dialed In has a feed, likes,
    // comments and following; not restricted by age (its Terms already ask for 13+, which is where Social Media rates)
    attrs.socialMedia = true;
    if (have.includes('socialMediaAgeRestricted')) attrs.socialMediaAgeRestricted = false;
    must(await api('PATCH', `/v1/ageRatingDeclarations/${d.j.data.id}`, { data: { type: 'ageRatingDeclarations', id: d.j.data.id, attributes: attrs } }), 'age rating');
  });

  // ---- v21.8: [replace] (Maceo, Nov 5: "replace the Apple update with this one"): a version waiting for review (or in
  // review) is taken back out, so this run can put this version and its build in its place. Apple marks the version
  // Developer Rejected, which can be changed again: below, its number becomes this one. Without [replace] nothing in review
  // is touched.
  if (process.env.REPLACE === '1') {
    const st = v => v.attributes.appVersionState || v.attributes.appStoreState || '';
    const all = must(await api('GET', `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=20`), 'versions');
    const inReview = (all.j.data || []).find(v => /WAITING_FOR_REVIEW|IN_REVIEW/.test(st(v)));
    if (!inReview) say('Nothing to take out of review', 'no version is waiting for review; going on as usual');
    else {
      const subs = must(await api('GET', `/v1/reviewSubmissions?filter[app]=${appId}&filter[platform]=IOS&limit=10`), 'review submissions');
      const sub = (subs.j.data || []).find(x => /WAITING_FOR_REVIEW|IN_REVIEW/.test(x.attributes.state || ''));
      if (!sub) { console.log(`::error title=App Store listing::version ${inReview.attributes.versionString} is ${st(inReview)} but no open review submission was found to cancel`); process.exit(1); }
      must(await api('PATCH', `/v1/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { canceled: true } } }), 'taking it out of review');
      let now = '';
      for (let i = 0; i < 40; i++) {   // up to 10 minutes for Apple to finish taking it out
        await new Promise(res => setTimeout(res, 15000));
        const v = must(await api('GET', `/v1/appStoreVersions/${inReview.id}`), 'the version');
        now = st(v.j.data);
        if (!/WAITING_FOR_REVIEW|IN_REVIEW/.test(now)) break;
      }
      if (/WAITING_FOR_REVIEW|IN_REVIEW/.test(now)) { console.log(`::error title=App Store listing::asked Apple to take ${inReview.attributes.versionString} out of review, but after 10 minutes it is still ${now}; run again later`); process.exit(1); }
      say('Taken out of review', `version ${inReview.attributes.versionString} (review submission ${sub.id.slice(0, 8)}): now ${now}; ${VERSION} goes in its place`);
    }
  }

  // ---- the version: number, copyright, text
  const vs = must(await api('GET', `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=20`), 'versions');
  let ver = (vs.j.data || []).find(v => /PREPARE_FOR_SUBMISSION|DEVELOPER_REJECTED|REJECTED|METADATA_REJECTED|INVALID_BINARY/.test(v.attributes.appStoreState || v.attributes.appVersionState || ''));
  const stateOf = v => v.attributes.appVersionState || v.attributes.appStoreState || '';
  say('App Store versions', (vs.j.data || []).map(v => `${v.attributes.versionString}: ${stateOf(v)}`).join(' | ') || 'none yet');
  const busy = !ver && (vs.j.data || []).find(v => /WAITING_FOR_REVIEW|IN_REVIEW|READY_FOR_REVIEW|PENDING_DEVELOPER_RELEASE|PENDING_APPLE_RELEASE|PROCESSING_FOR_APP_STORE|ACCEPTED|WAITING_FOR_EXPORT_COMPLIANCE/.test(stateOf(v)));
  if (busy) {   // Apple allows no new version while one is with App Review (or waiting to be released): say so and stop, nothing changed
    say('Nothing to change yet', `version ${busy.attributes.versionString} is ${stateOf(busy).toLowerCase().replace(/_/g, ' ')}, and Apple allows no new version until it's out of review. The ${VERSION} build is in TestFlight; run this again after ${busy.attributes.versionString} is approved (or rejected) to make ${VERSION} and attach it.`);
    process.exit(0);
  }
  if (!ver) {
    const r = must(await api('POST', '/v1/appStoreVersions', { data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: VERSION }, relationships: { app: { data: { type: 'apps', id: appId } } } } }), 'making the version');
    ver = r.j.data;
  }
  await step(`version ${VERSION}, copyright`, async () => must(await api('PATCH', `/v1/appStoreVersions/${ver.id}`, { data: { type: 'appStoreVersions', id: ver.id, attributes: { versionString: VERSION, copyright: `${new Date().getFullYear()} Dialed In` } } }), 'version'));
  let vloc = null;
  await step('description, keywords, promotional text, support link', async () => {
    const locs = must(await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=50`), 'version languages');
    vloc = (locs.j.data || []).find(x => x.attributes.locale === L.locale);
    const attributes = { description: L.description, keywords: L.keywords, promotionalText: L.promotionalText, supportUrl: L.supportUrl };
    // v21.6: What's New, on an update (an app's first version has none, and Apple refuses it there)
    const live = (vs.j.data || []).some(v => /READY_FOR_SALE|READY_FOR_DISTRIBUTION/.test(stateOf(v)));
    if (live && L.whatsNew) attributes.whatsNew = L.whatsNew;
    if (vloc) must(await api('PATCH', `/v1/appStoreVersionLocalizations/${vloc.id}`, { data: { type: 'appStoreVersionLocalizations', id: vloc.id, attributes } }), 'description');
    else vloc = must(await api('POST', '/v1/appStoreVersionLocalizations', { data: { type: 'appStoreVersionLocalizations', attributes: { locale: L.locale, ...attributes }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } } }), 'description').j.data;
  });

  // ---- App Review: the review account (password from the REVIEW_PASSWORD secret) and the notes
  await step('App Review sign-in and notes', async () => {
    const attributes = { demoAccountRequired: true, demoAccountName: L.review.demoAccountName, demoAccountPassword: process.env.REVIEW_PASSWORD || '', notes: L.review.notes, contactEmail: L.review.contactEmail };
    const cur = await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreReviewDetail`);
    // what Apple has saved for this version's review contact, as yes/no only (Actions logs are public: never the values)
    { const a = (cur.ok && cur.j && cur.j.data && cur.j.data.attributes) || null;
      console.log(`::notice title=App Review contact on Apple's side::version ${ver.attributes ? ver.attributes.versionString : '?'}: ${a ? `review details saved; first name ${a.contactFirstName ? 'yes' : 'no'}, last name ${a.contactLastName ? 'yes' : 'no'}, phone ${a.contactPhone ? 'yes' : 'no'}, email ${a.contactEmail ? 'yes' : 'no'}` : `no review details saved yet (${cur.status || '?'})`}`); }
    if (cur.ok && cur.j && cur.j.data) {
      const a = cur.j.data.attributes || {};
      if (!a.contactFirstName || !a.contactLastName || !a.contactPhone) todo.push('App Review contact: your first name, last name and phone (App Store Connect, the version page, App Review Information); Apple needs them and they are not stored anywhere here');
      must(await api('PATCH', `/v1/appStoreReviewDetails/${cur.j.data.id}`, { data: { type: 'appStoreReviewDetails', id: cur.j.data.id, attributes } }), 'review details');
    } else {
      todo.push('App Review contact: your first name, last name and phone (App Store Connect, the version page, App Review Information); Apple needs them and they are not stored anywhere here');
      must(await api('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } } }), 'review details');
    }
  });

  // ---- price: free, and sold everywhere Apple sells apps
  await step('price: free', async () => {
    const cur = await api('GET', `/v1/apps/${appId}/appPriceSchedule`);
    if (cur.ok && cur.j && cur.j.data) return;   // already set
    let pp = null, next = `/v1/apps/${appId}/appPricePoints?filter[territory]=USA&limit=200`;
    while (next && !pp) {
      const r = must(await api('GET', next), 'price points');
      pp = (r.j.data || []).find(x => Number(x.attributes.customerPrice) === 0);
      next = r.j.links && r.j.links.next ? r.j.links.next.replace('https://api.appstoreconnect.apple.com', '') : null;
    }
    if (!pp) throw new Error('no free price point');
    must(await api('POST', '/v1/appPriceSchedules', { data: { type: 'appPriceSchedules', relationships: { app: { data: { type: 'apps', id: appId } }, baseTerritory: { data: { type: 'territories', id: 'USA' } }, manualPrices: { data: [{ type: 'appPrices', id: '${free}' }] } } },
      included: [{ type: 'appPrices', id: '${free}', attributes: { startDate: null }, relationships: { appPricePoint: { data: { type: 'appPricePoints', id: pp.id } } } }] }), 'price');
  });
  await step('sold in every country and region', async () => {
    const cur = await api('GET', `/v1/apps/${appId}/appAvailabilityV2`);
    if (cur.ok && cur.j && cur.j.data) return;
    const ts = [];
    let next = '/v1/territories?limit=200';
    while (next) { const r = must(await api('GET', next), 'territories'); (r.j.data || []).forEach(t => ts.push(t.id)); next = r.j.links && r.j.links.next ? r.j.links.next.replace('https://api.appstoreconnect.apple.com', '') : null; }
    must(await api('POST', '/v2/appAvailabilities', { data: { type: 'appAvailabilities', attributes: { availableInNewTerritories: true }, relationships: { app: { data: { type: 'apps', id: appId } }, territoryAvailabilities: { data: ts.map(t => ({ type: 'territoryAvailabilities', id: '${' + t + '}' })) } } },
      included: ts.map(t => ({ type: 'territoryAvailabilities', id: '${' + t + '}', attributes: { available: true }, relationships: { territory: { data: { type: 'territories', id: t } } } })) }), 'availability');
  });

  // ---- screenshots (iPhone 6.9")
  const dir = process.env.SHOTS_DIR;
  if (dir && vloc) await step(`screenshots (${L.screenshots.length})`, async () => {
    const files = L.screenshots.map(f => path.join(dir, f));
    files.forEach(f => { if (!fs.existsSync(f)) throw new Error(`missing ${path.basename(f)}`); });
    const sets = must(await api('GET', `/v1/appStoreVersionLocalizations/${vloc.id}/appScreenshotSets?limit=50`), 'screenshot sets');
    let set = null, lastErr = '';
    // (v21.6: the 6.9" set first: the pictures are 1320 x 2868, and a 6.7" set refuses them, so Apple drops them)
    for (const type of ['APP_IPHONE_69', 'APP_IPHONE_67']) {
      set = (sets.j.data || []).find(s => s.attributes.screenshotDisplayType === type);
      if (set) break;
      const r = await api('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: type }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: vloc.id } } } } });
      if (r.ok) { set = r.j.data; break; }
      lastErr = why(r);
    }
    if (!set) throw new Error(`couldn't make the iPhone screenshot set (${lastErr})`);
    // an empty set of another size (left by an earlier run) goes, so the listing doesn't ask for pictures in it
    for (const o of (sets.j.data || []).filter(x => x.id !== set.id)) { const n = await api('GET', `/v1/appScreenshotSets/${o.id}/appScreenshots?limit=1`); if (n.ok && !(n.j.data || []).length) await api('DELETE', `/v1/appScreenshotSets/${o.id}`); }
    const old = await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`);
    // (v21.6: the same pictures already there, in order, are kept: Apple takes minutes to take each one in again)
    const sums = files.map(f => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex'));
    const have = (old.ok ? old.j.data : []) || [];
    const match = files.map((f, i) => have.find(x => x.attributes.fileName === path.basename(f) && (!x.attributes.sourceFileChecksum || x.attributes.sourceFileChecksum === sums[i]) && !/FAILED/.test((x.attributes.assetDeliveryState || {}).state || '')));
    const same = have.length === files.length && match.every(Boolean);
    console.log(`screenshots already there: ${have.length}; the same as ours: ${match.filter(Boolean).length} of ${files.length}`);
    const ids = same ? match.map(x => x.id) : [];
    if (same) await api('PATCH', `/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, { data: ids.map(id => ({ type: 'appScreenshots', id })) });   // (in our order)
    if (!same) for (const s of have) await api('DELETE', `/v1/appScreenshots/${s.id}`);
    if (!same) for (const f of files) {
      const buf = fs.readFileSync(f);
      const r = must(await api('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: path.basename(f), fileSize: buf.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } } }), `reserving ${path.basename(f)}`);
      for (const op of r.j.data.attributes.uploadOperations || []) {
        const headers = Object.fromEntries((op.requestHeaders || []).map(h => [h.name, h.value]));
        const up = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
        if (up.status >= 300) throw new Error(`uploading ${path.basename(f)}: HTTP ${up.status}`);
      }
      must(await api('PATCH', `/v1/appScreenshots/${r.j.data.id}`, { data: { type: 'appScreenshots', id: r.j.data.id, attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(buf).digest('hex') } } }), `finishing ${path.basename(f)}`);
      ids.push(r.j.data.id);
    }
    let states = [];
    for (let i = 0; i < 90; i++) {   // (up to 6 minutes: Apple can take a few to take each picture in)
      await new Promise(r => setTimeout(r, 4000));
      states = await Promise.all(ids.map(async id => { const r = await api('GET', `/v1/appScreenshots/${id}`); return r.ok ? ((r.j.data.attributes.assetDeliveryState || {}).state || '?') : 'gone'; }));
      if (states.every(s => s === 'COMPLETE' || s === 'FAILED')) break;
    }
    const bad = states.filter(s => s !== 'COMPLETE').length;
    if (bad) throw new Error(`${bad} of ${ids.length} screenshots not accepted yet (${states.join(', ')})`);
  });

  // ---- the build: the newest processed one with this version
  await step(`build for ${VERSION}`, async () => {
    // a build Apple is still processing: wait for it (up to 25 minutes)
    let r, b;
    for (let i = 0; i < 50; i++) {
      r = must(await api('GET', `/v1/builds?filter[app]=${appId}&filter[preReleaseVersion.version]=${encodeURIComponent(VERSION)}&sort=-uploadedDate&limit=5`), 'builds');
      b = (r.j.data || []).find(x => x.attributes.processingState === 'VALID');
      if (b || !(r.j.data || []).some(x => x.attributes.processingState === 'PROCESSING')) break;
      await new Promise(res => setTimeout(res, 30000));
    }
    if (!b) { todo.push(`a processed build of ${VERSION} to pick (none yet: ${(r.j.data || []).map(x => x.attributes.processingState).join(', ') || 'none uploaded'}); run this again once TestFlight shows it`); return false; }
    must(await api('PATCH', `/v1/appStoreVersions/${ver.id}/relationships/build`, { data: { type: 'builds', id: b.id } }), 'picking the build');
  });

  // v21.6: submit for review, only when the commit that started this run says [submit] (Maceo's call each time:
  // Nov 4, "push the newest version to AppStore now") and everything above went in
  const submit = process.env.SUBMIT === '1';
  if (submit && !problems.length && !todo.some(t => /processed build/.test(t))) {
    await step(`submitted ${VERSION} for review`, async () => {
      const open = must(await api('GET', `/v1/reviewSubmissions?filter[app]=${appId}&filter[platform]=IOS&limit=10`), 'review submissions');
      let sub = (open.j.data || []).find(x => /READY_FOR_REVIEW/.test(x.attributes.state || ''));
      if (!sub) sub = must(await api('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: appId } } } } }), 'starting a review submission').j.data;
      const items = must(await api('GET', `/v1/reviewSubmissions/${sub.id}/items?limit=20`), 'its items');
      const has = (items.j.data || []).some(it => it.relationships && it.relationships.appStoreVersion && it.relationships.appStoreVersion.data && it.relationships.appStoreVersion.data.id === ver.id);
      if (!has) must(await api('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } } }), 'adding the version');
      must(await api('PATCH', `/v1/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } }), 'submitting');
      say('Sent to App Review', `version ${VERSION}: submitted`);
    });
  } else {
    todo.push('App Privacy (App Store Connect, App Privacy): the answers in the submission sheet; Apple has no API for this part');
    todo.push(submit ? 'Not submitted: something above didn\'t go in (see the notes); fix it and run again with [submit]' : 'Submit for Review (the version page, Add for Review), when you\'re ready');
  }
  say('App Store listing', `set: ${done.join(' | ') || 'nothing'}`);
  if (problems.length) console.log(`::error title=App Store listing::not set: ${problems.join(' | ')}`);
  say('Still for you in App Store Connect', todo.join(' | '));
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.log(`::error title=App Store listing::${String(e && e.message || e).slice(0, 400)}`); process.exit(1); });
