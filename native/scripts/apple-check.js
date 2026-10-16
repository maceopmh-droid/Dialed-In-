// Checks the App Store Connect key with Apple directly, before the long iPhone build, and says plainly what's wrong if
// anything is. Prints only yes/no answers and counts (GitHub Actions logs are public): never the key, ids or names.
//   env ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (the .p8 text however it was pasted), BUNDLE_ID
// Writes ok=1|0 and why=<short reason> to $GITHUB_OUTPUT when it's set.
const crypto = require('crypto'), fs = require('fs');
const clean = v => String(v || '').replace(/["'\s]/g, '');
const KID = clean(process.env.ASC_KEY_ID), ISS = clean(process.env.ASC_ISSUER_ID), BUNDLE = clean(process.env.BUNDLE_ID);
const note = (title, msg) => console.log(`::notice title=${title}::${msg}`);
const fail = (title, msg) => console.log(`::error title=${title}::${msg}`);
const out = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

function pem(text) {
  const body = String(text || '').replace(/\r|"/g, '').replace(/-----(BEGIN|END) [A-Z ]*-----/g, '').replace(/\s+/g, '');
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
}
function token(key, individual) {
  const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: 'ES256', kid: KID, typ: 'JWT' });
  const body = b64u(individual ? { sub: 'user', iat: now, exp: now + 900, aud: 'appstoreconnect-v1' } : { iss: ISS, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${sig.toString('base64url')}`;
}
async function get(jwt, path) {
  const r = await fetch('https://api.appstoreconnect.apple.com' + path, { headers: { Authorization: 'Bearer ' + jwt } });
  let j = null; try { j = await r.json(); } catch (e) { /* no body */ }
  return { status: r.status, j };
}

(async () => {
  const shape = `key id ${KID.length} characters (Apple's are 10), issuer id ${ISS.length} characters (a team key's is 36)`;
  if (!KID || !ISS || !process.env.ASC_KEY_P8) { fail('Apple key check', 'ASC_KEY_ID, ASC_ISSUER_ID or ASC_KEY_P8 is empty.'); out('ok', 0); out('why', 'missing'); return; }
  let key;
  try { key = crypto.createPrivateKey(pem(process.env.ASC_KEY_P8)); } catch (e) { fail('Apple key check', 'ASC_KEY_P8 does not read as a .p8 key.'); out('ok', 0); out('why', 'p8'); return; }
  if (key.asymmetricKeyType !== 'ec') { fail('Apple key check', `ASC_KEY_P8 is a ${key.asymmetricKeyType} key; App Store Connect keys are EC (P-256).`); out('ok', 0); out('why', 'p8'); return; }

  let jwt = token(key, false);
  let apps = await get(jwt, `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE)}&fields[apps]=bundleId&limit=5`);
  if (apps.status === 401) {
    // maybe it's an Individual key (they sign without the issuer id); xcodebuild needs a Team key either way
    const ind = await get(token(key, true), `/v1/apps?limit=1&fields[apps]=bundleId`);
    if (ind.status === 200) { fail('Apple key check', `Apple accepts this key only as an Individual key. Xcode's signing on GitHub needs a Team key: App Store Connect, Users and Access, Integrations, App Store Connect API, Team Keys, + (Access: Admin). Then update ASC_KEY_ID, ASC_KEY_P8 and ASC_ISSUER_ID (the Issuer ID shown above the Team Keys list).`); out('ok', 0); out('why', 'individual'); return; }
    fail('Apple key check', `Apple turned the key down (401): the Key ID, the Issuer ID and the .p8 file don't belong together, or the key was revoked (${shape}). In App Store Connect, Users and Access, Integrations, App Store Connect API, Team Keys: check that ASC_KEY_ID is the Key ID in the same row as the downloaded AuthKey_….p8, and that ASC_ISSUER_ID is the Issuer ID shown above the list.`);
    out('ok', 0); out('why', '401'); return;
  }
  if (apps.status !== 200) { fail('Apple key check', `Apple answered ${apps.status} when listing apps (${(apps.j && apps.j.errors && apps.j.errors[0] && apps.j.errors[0].title) || 'no detail'}).`); out('ok', 0); out('why', 'apps-' + apps.status); return; }
  const app = (apps.j.data || []).find(a => a.attributes && a.attributes.bundleId === BUNDLE);
  note('Apple key check', `Apple accepts the key (team key). App record for the bundle ID: ${app ? 'found' : 'NOT found'}.`);

  const bid = await get(jwt, `/v1/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE)}&include=bundleIdCapabilities&limit=5`);
  const b = bid.status === 200 ? (bid.j.data || []).find(x => x.attributes && x.attributes.identifier === BUNDLE) : null;
  const caps = bid.status === 200 ? (bid.j.included || []).map(c => c.attributes && c.attributes.capabilityType).filter(Boolean) : [];
  const certs = await get(jwt, '/v1/certificates?limit=50&fields[certificates]=certificateType,expirationDate');
  const devices = await get(jwt, '/v1/devices?limit=1&fields[devices]=status');
  const profiles = await get(jwt, '/v1/profiles?limit=50&fields[profiles]=profileType,profileState');
  const count = (r, f) => r.status === 200 ? (r.j.data || []).filter(f || (() => true)).length : `no access (${r.status})`;
  const dist = count(certs, c => /DISTRIBUTION/.test(c.attributes.certificateType));
  note('Apple account', [
    `bundle ID registered: ${bid.status === 200 ? (b ? 'yes' : 'NO') : `no access (${bid.status})`}`,
    `push capability: ${b ? (caps.includes('PUSH_NOTIFICATIONS') ? 'yes' : 'no') : '-'}`,
    `distribution certificates: ${dist}`,
    `development certificates: ${count(certs, c => /DEVELOPMENT/.test(c.attributes.certificateType))}`,
    `App Store profiles: ${count(profiles, p => p.attributes.profileType === 'IOS_APP_STORE')}`,
    `registered devices: ${devices.status === 200 ? (devices.j.meta && devices.j.meta.paging ? devices.j.meta.paging.total : (devices.j.data || []).length) : `no access (${devices.status})`}`
  ].join(' | '));
  if (certs.status === 403 || profiles.status === 403) { fail('Apple key check', 'The key works but can\'t see certificates or profiles: it needs Admin access. App Store Connect, Users and Access, Integrations, App Store Connect API, Team Keys: make a new key with Access: Admin and update ASC_KEY_ID and ASC_KEY_P8.'); out('ok', 0); out('why', 'role'); return; }
  if (!b && bid.status === 200) { fail('Apple key check', `The bundle ID ${BUNDLE} isn't registered under this team (developer.apple.com, Identifiers).`); out('ok', 0); out('why', 'bundle'); return; }
  if (!app) { fail('Apple key check', `No App Store Connect app uses the bundle ID ${BUNDLE}.`); out('ok', 0); out('why', 'app'); return; }
  out('ok', 1); out('why', 'ok');
})().catch(e => { fail('Apple key check', 'The check itself failed: ' + String(e && e.message || e).slice(0, 200)); out('ok', 0); out('why', 'crash'); });
