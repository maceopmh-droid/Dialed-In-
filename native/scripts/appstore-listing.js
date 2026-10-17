// Fills in the App Store listing through the App Store Connect API, from native/appstore/listing.json: category,
// subtitle, privacy policy, description, keywords, support link, age rating, content rights, the review account and
// notes, price (free), where it's sold, screenshots, and the build. It never submits for review (that's Maceo's call),
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
  await step('category: Food & Drink', async () => must(await api('PATCH', `/v1/appInfos/${info.id}`, { data: { type: 'appInfos', id: info.id, relationships: { primaryCategory: { data: { type: 'appCategories', id: L.primaryCategory } } } } }), 'category'));
  await step('subtitle and privacy policy link', async () => {
    const locs = must(await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations?limit=50`), 'app info languages');
    const loc = (locs.j.data || []).find(x => x.attributes.locale === L.locale);
    if (!loc) throw new Error(`no ${L.locale} app info`);
    must(await api('PATCH', `/v1/appInfoLocalizations/${loc.id}`, { data: { type: 'appInfoLocalizations', id: loc.id, attributes: { subtitle: L.subtitle, privacyPolicyUrl: L.privacyPolicyUrl } } }), 'subtitle');
  });
  await step('age rating answers', async () => {
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
    must(await api('PATCH', `/v1/ageRatingDeclarations/${d.j.data.id}`, { data: { type: 'ageRatingDeclarations', id: d.j.data.id, attributes: attrs } }), 'age rating');
  });

  // ---- the version: number, copyright, text
  const vs = must(await api('GET', `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=20`), 'versions');
  let ver = (vs.j.data || []).find(v => /PREPARE_FOR_SUBMISSION|DEVELOPER_REJECTED|REJECTED|METADATA_REJECTED|INVALID_BINARY/.test(v.attributes.appStoreState || v.attributes.appVersionState || ''));
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
    if (vloc) must(await api('PATCH', `/v1/appStoreVersionLocalizations/${vloc.id}`, { data: { type: 'appStoreVersionLocalizations', id: vloc.id, attributes } }), 'description');
    else vloc = must(await api('POST', '/v1/appStoreVersionLocalizations', { data: { type: 'appStoreVersionLocalizations', attributes: { locale: L.locale, ...attributes }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } } }), 'description').j.data;
  });

  // ---- App Review: the review account (password from the REVIEW_PASSWORD secret) and the notes
  await step('App Review sign-in and notes', async () => {
    const attributes = { demoAccountRequired: true, demoAccountName: L.review.demoAccountName, demoAccountPassword: process.env.REVIEW_PASSWORD || '', notes: L.review.notes, contactEmail: L.review.contactEmail };
    const cur = await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreReviewDetail`);
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
    for (const type of ['APP_IPHONE_67', 'APP_IPHONE_69']) {
      set = (sets.j.data || []).find(s => s.attributes.screenshotDisplayType === type);
      if (set) break;
      const r = await api('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: type }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: vloc.id } } } } });
      if (r.ok) { set = r.j.data; break; }
      lastErr = why(r);
    }
    if (!set) throw new Error(`couldn't make the iPhone screenshot set (${lastErr})`);
    const old = await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`);
    for (const s of (old.ok ? old.j.data : []) || []) await api('DELETE', `/v1/appScreenshots/${s.id}`);
    const ids = [];
    for (const f of files) {
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
    for (let i = 0; i < 30; i++) {
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

  todo.push('App Privacy (App Store Connect, App Privacy): the answers in the submission sheet; Apple has no API for this part');
  todo.push('Submit for Review (the version page, Add for Review), when you\'re ready');
  say('App Store listing', `set: ${done.join(' | ') || 'nothing'}`);
  if (problems.length) console.log(`::error title=App Store listing::not set: ${problems.join(' | ')}`);
  say('Still for you in App Store Connect', todo.join(' | '));
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.log(`::error title=App Store listing::${String(e && e.message || e).slice(0, 400)}`); process.exit(1); });
