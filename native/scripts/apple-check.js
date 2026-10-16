// Checks the Apple keys with Apple directly (a few seconds, before the long iPhone build) and says plainly what's wrong
// if anything is. Prints only yes/no answers and counts (GitHub Actions logs are public): never a key or an id.
//   env ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8   the App Store Connect API key (the .p8 text however it was pasted)
//       APNS_KEY_ID, APNS_KEY_P8, APPLE_TEAM_ID the push key
//       BUNDLE_ID
// The two keys look alike (both .p8 files with a 10-character Key ID), so each is found by what Apple accepts it for:
// if they were put in each other's secrets, it says so and the workflows use them the right way round.
// Writes to $GITHUB_OUTPUT: ok=1|0 (App Store Connect key usable for signing), why=<short reason>,
//   asc_from=ASC|APNS (which secrets hold the App Store Connect key), push_from=APNS|ASC|none (which hold the push key)
// usage: node apple-check.js [--push-only]
const crypto = require('crypto'), fs = require('fs'), http2 = require('http2');
const clean = v => String(v || '').replace(/["'\s]/g, '');
const ISS = clean(process.env.ASC_ISSUER_ID), TEAM = clean(process.env.APPLE_TEAM_ID), BUNDLE = clean(process.env.BUNDLE_ID);
const PUSH_ONLY = process.argv.includes('--push-only');
const note = (title, msg) => console.log(`::notice title=${title}::${msg}`);
const fail = (title, msg) => console.log(`::error title=${title}::${msg}`);
const out = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
const KEYS_PAGE = 'App Store Connect, Users and Access, Integrations, App Store Connect API, Team Keys';

function pem(text) {
  const body = String(text || '').replace(/\r|"/g, '').replace(/-----(BEGIN|END) [A-Z ]*-----/g, '').replace(/\s+/g, '');
  return `-----BEGIN PRIVATE KEY-----\n${(body.match(/.{1,64}/g) || []).join('\n')}\n-----END PRIVATE KEY-----\n`;
}
const keyOf = text => { try { const k = crypto.createPrivateKey(pem(text)); return k.asymmetricKeyType === 'ec' ? k : null; } catch (e) { return null; } };
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (key, head, body) => `${head}.${body}.${crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
function ascToken(key, kid, individual) {
  const now = Math.floor(Date.now() / 1000);
  return sign(key, b64u({ alg: 'ES256', kid, typ: 'JWT' }), b64u(individual ? { sub: 'user', iat: now, exp: now + 900, aud: 'appstoreconnect-v1' } : { iss: ISS, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }));
}
async function get(jwt, path) {
  const r = await fetch('https://api.appstoreconnect.apple.com' + path, { headers: { Authorization: 'Bearer ' + jwt } });
  let j = null; try { j = await r.json(); } catch (e) { /* no body */ }
  return { status: r.status, j };
}
// Apple's push service (HTTP/2): a made-up phone token answers 400 BadDeviceToken when the push key is accepted,
// 403 InvalidProviderToken when it isn't
function apnsTry(key, kid) {
  const jwt = sign(key, b64u({ alg: 'ES256', kid }), b64u({ iss: TEAM, iat: Math.floor(Date.now() / 1000) }));
  return new Promise(resolve => {
    let settled = false;
    const c = http2.connect('https://api.sandbox.push.apple.com');
    const done = v => { if (settled) return; settled = true; try { c.close(); } catch (e) { /* closed */ } resolve(v); };
    c.on('error', e => done('error ' + e.code));
    const r = c.request({ ':method': 'POST', ':path': '/3/device/' + '0'.repeat(64), authorization: 'bearer ' + jwt, 'apns-topic': BUNDLE, 'apns-push-type': 'alert' });
    let status = 0, data = '';
    r.on('response', h => { status = h[':status']; });
    r.on('data', d => { data += d; });
    r.on('end', () => { let reason = ''; try { reason = JSON.parse(data).reason; } catch (e) { /* none */ } done(`${status} ${reason}`.trim()); });
    r.on('error', e => done('error ' + e.code));
    r.end('{"aps":{}}');
    setTimeout(() => done('timeout'), 15000);
  });
}
const pushOk = r => /BadDeviceToken/.test(r);

(async () => {
  const pairs = {
    ASC: { key: keyOf(process.env.ASC_KEY_P8), kid: clean(process.env.ASC_KEY_ID), has: Boolean(process.env.ASC_KEY_P8) },
    APNS: { key: keyOf(process.env.APNS_KEY_P8), kid: clean(process.env.APNS_KEY_ID), has: Boolean(process.env.APNS_KEY_P8) }
  };
  for (const [n, p] of Object.entries(pairs)) if (p.has && !p.key) fail('Apple keys', `${n}_KEY_P8 doesn't read as a .p8 key: paste the whole text of the AuthKey_….p8 file into it again.`);

  // the push key: whichever pair Apple's push service accepts (the APNS_ secrets first)
  let pushFrom = 'none';
  if (TEAM) {
    const tried = [];
    for (const n of ['APNS', 'ASC']) {
      const p = pairs[n]; if (!p.key || !p.kid) continue;
      const r = await apnsTry(p.key, p.kid); tried.push(`${n}: ${r}`);
      if (pushOk(r)) { pushFrom = n; break; }
    }
    if (pushFrom === 'APNS') note('Apple push key', 'Apple\'s push service accepts the push key.');
    else if (pushFrom === 'ASC') note('Apple push key', 'Apple\'s push service accepts the key in the ASC_KEY_ secrets: the two keys are in each other\'s secrets, so they\'re used the right way round.');
    else if (tried.length) fail('Apple push key', `Apple's push service accepts neither key (${tried.join(', ')}). APPLE_TEAM_ID must be the team's ID, and one key must have Apple Push Notifications service ticked.`);
  }
  out('push_from', pushFrom);
  if (PUSH_ONLY) return;

  // the App Store Connect key: whichever pair App Store Connect accepts (the ASC_ secrets first)
  let ascFrom = '', apps = null;
  for (const n of ['ASC', 'APNS']) {
    const p = pairs[n]; if (!p.key || !p.kid || !ISS) continue;
    const r = await get(ascToken(p.key, p.kid, false), `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE)}&fields[apps]=bundleId&limit=5`);
    if (r.status === 200) { ascFrom = n; apps = r; break; }
  }
  if (!ascFrom) {
    for (const n of ['ASC', 'APNS']) {   // an Individual key signs without the issuer id; xcodebuild needs a Team key
      const p = pairs[n]; if (!p.key || !p.kid) continue;
      if ((await get(ascToken(p.key, p.kid, true), '/v1/apps?limit=1&fields[apps]=bundleId')).status === 200) {
        fail('Apple key check', `Apple accepts the App Store Connect key only as an Individual key. Signing on GitHub needs a Team key: ${KEYS_PAGE}, + (Access: Admin). Then update ASC_KEY_ID, ASC_KEY_P8 and ASC_ISSUER_ID (shown above the Team Keys list).`);
        out('ok', 0); out('why', 'individual'); return;
      }
    }
    fail('Apple key check', `App Store Connect accepts neither key (Key IDs of ${pairs.ASC.kid.length} and ${pairs.APNS.kid.length} characters, issuer id of ${ISS.length}; Apple's are 10 and 36). In ${KEYS_PAGE}: ASC_KEY_ID is the Key ID in the same row as the downloaded AuthKey_….p8, ASC_ISSUER_ID the Issuer ID above the list, and the key must not be revoked.`);
    out('ok', 0); out('why', '401'); return;
  }
  out('asc_from', ascFrom);
  const jwt = ascToken(pairs[ascFrom].key, pairs[ascFrom].kid, false);
  const app = (apps.j.data || []).find(a => a.attributes && a.attributes.bundleId === BUNDLE);
  note('Apple key check', `App Store Connect accepts the key${ascFrom === 'APNS' ? ' in the APNS_KEY_ secrets (the two keys are in each other\'s secrets, so they\'re used the right way round)' : ''}. App record for the bundle ID: ${app ? 'found' : 'NOT found'}.`);

  const bid = await get(jwt, `/v1/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE)}&include=bundleIdCapabilities&limit=5`);
  const b = bid.status === 200 ? (bid.j.data || []).find(x => x.attributes && x.attributes.identifier === BUNDLE) : null;
  const caps = bid.status === 200 ? (bid.j.included || []).map(c => c.attributes && c.attributes.capabilityType).filter(Boolean) : [];
  const certs = await get(jwt, '/v1/certificates?limit=50&fields[certificates]=certificateType,expirationDate');
  const devices = await get(jwt, '/v1/devices?limit=1&fields[devices]=status');
  const profiles = await get(jwt, '/v1/profiles?limit=50&fields[profiles]=profileType,profileState');
  const count = (r, f) => r.status === 200 ? (r.j.data || []).filter(f || (() => true)).length : `no access (${r.status})`;
  note('Apple account', [
    `bundle ID registered: ${bid.status === 200 ? (b ? 'yes' : 'NO') : `no access (${bid.status})`}`,
    `push capability: ${b ? (caps.includes('PUSH_NOTIFICATIONS') ? 'yes' : 'no') : '-'}`,
    `distribution certificates: ${count(certs, c => /DISTRIBUTION/.test(c.attributes.certificateType))}`,
    `development certificates: ${count(certs, c => /DEVELOPMENT/.test(c.attributes.certificateType))}`,
    `App Store profiles: ${count(profiles, p => p.attributes.profileType === 'IOS_APP_STORE')}`,
    `registered devices: ${devices.status === 200 ? (devices.j.meta && devices.j.meta.paging ? devices.j.meta.paging.total : (devices.j.data || []).length) : `no access (${devices.status})`}`
  ].join(' | '));
  if (certs.status === 403 || profiles.status === 403) { fail('Apple key check', `The App Store Connect key works but can't see certificates or profiles: it needs Admin access. ${KEYS_PAGE}: make a new key with Access: Admin and update ASC_KEY_ID and ASC_KEY_P8.`); out('ok', 0); out('why', 'role'); return; }
  if (!b && bid.status === 200) { fail('Apple key check', `The bundle ID ${BUNDLE} isn't registered under this team (developer.apple.com, Identifiers).`); out('ok', 0); out('why', 'bundle'); return; }
  if (!app) { fail('Apple key check', `No App Store Connect app uses the bundle ID ${BUNDLE}.`); out('ok', 0); out('why', 'app'); return; }
  out('ok', 1); out('why', 'ok');
})().catch(e => { fail('Apple key check', 'The check itself failed: ' + String(e && e.message || e).slice(0, 200)); out('ok', 0); out('why', 'crash'); });
