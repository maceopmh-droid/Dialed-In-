// Read-only: where the app stands with Apple. Prints each App Store version's state, the review submissions (state and
// when they were sent), and the newest builds. Changes nothing.   env ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_FILE, BUNDLE_ID
const crypto = require('crypto'), fs = require('fs');
const clean = v => String(v || '').replace(/["'\s]/g, '');
const KID = clean(process.env.ASC_KEY_ID), ISS = clean(process.env.ASC_ISSUER_ID), BUNDLE = clean(process.env.BUNDLE_ID);
const key = crypto.createPrivateKey(fs.readFileSync(process.env.ASC_KEY_FILE, 'utf8'));
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt() {
  const now = Math.floor(Date.now() / 1000), head = b64u({ alg: 'ES256', kid: KID, typ: 'JWT' }), body = b64u({ iss: ISS, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
  return `${head}.${body}.${crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
const get = async p => { const r = await fetch('https://api.appstoreconnect.apple.com' + p, { headers: { Authorization: 'Bearer ' + jwt() } }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, j }; };
const lines = [];
(async () => {
  const apps = await get(`/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE)}&limit=5`);
  const app = ((apps.j && apps.j.data) || []).find(a => a.attributes.bundleId === BUNDLE);
  if (!app) { lines.push(`no app found (HTTP ${apps.status})`); return; }
  const vs = await get(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=20`);
  ((vs.j && vs.j.data) || []).forEach(v => lines.push(`version ${v.attributes.versionString}: ${v.attributes.appVersionState || v.attributes.appStoreState} (store state ${v.attributes.appStoreState}; made ${String(v.attributes.createdDate || '').slice(0, 16)})`));
  const rs = await get(`/v1/reviewSubmissions?filter[app]=${app.id}&limit=20`);
  if (rs.status >= 300) lines.push(`review submissions: HTTP ${rs.status}`);
  ((rs.j && rs.j.data) || []).forEach(s => lines.push(`review submission ${s.id.slice(0, 8)}: ${s.attributes.state}, sent ${String(s.attributes.submittedDate || '-').slice(0, 16)}`));
  const bs = await get(`/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=6`);
  ((bs.j && bs.j.data) || []).forEach(b => lines.push(`build ${b.attributes.version}: ${b.attributes.processingState}${b.attributes.expired ? ', expired' : ''}, uploaded ${String(b.attributes.uploadedDate || '').slice(0, 16)}`));
})().catch(e => lines.push('error: ' + String(e && e.message || e).slice(0, 200))).finally(() => {
  console.log(lines.join('\n'));
  console.log(`::notice title=App Store status::${lines.join('%0A')}`);
});
