// Gets what the iPhone build needs to sign for the App Store, through the App Store Connect API, so nothing depends on
// Xcode's automatic signing (which needs a registered iPhone for its development profile): a fresh Apple Distribution
// certificate for this run (its private key never leaves the runner) and an App Store profile for the bundle ID.
// Certificates and profiles this makes are marked (the certificate request's name is "dialed-in-github-ci", profiles
// are named "Dialed In CI ..."); ones from earlier runs, more than 3 hours old, are cleaned up first. Nothing else on
// the account is touched. Prints only counts (GitHub Actions logs are public).
//   env ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_FILE (a proper .p8 file), BUNDLE_ID, RUN_NUMBER
// usage: node apple-sign.js <outDir>   writes key.pem, cert.cer, profile.mobileprovision, profile.env (PROFILE_NAME, PROFILE_UUID)
//        node apple-sign.js --undo <outDir>   when the upload didn't happen: revokes this run's certificate and profile
const crypto = require('crypto'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const clean = v => String(v || '').replace(/["'\s]/g, '');
const KID = clean(process.env.ASC_KEY_ID), ISS = clean(process.env.ASC_ISSUER_ID), BUNDLE = clean(process.env.BUNDLE_ID);
const UNDO = process.argv[2] === '--undo';
const OUT = UNDO ? process.argv[3] : process.argv[2];
const MARK = 'dialed-in-github-ci', PROFILE_PREFIX = 'Dialed In CI';
const note = (title, msg) => console.log(`::notice title=${title}::${msg}`);
const fail = (title, msg) => { console.log(`::error title=${title}::${msg}`); process.exit(1); };
if (!OUT) fail('Signing', 'usage: node apple-sign.js <outDir>');
fs.mkdirSync(OUT, { recursive: true });
const key = crypto.createPrivateKey(fs.readFileSync(process.env.ASC_KEY_FILE, 'utf8'));
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt() {
  const now = Math.floor(Date.now() / 1000), head = b64u({ alg: 'ES256', kid: KID, typ: 'JWT' }), body = b64u({ iss: ISS, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
  return `${head}.${body}.${crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
async function api(method, p, body) {
  const r = await fetch('https://api.appstoreconnect.apple.com' + p, { method, headers: { Authorization: 'Bearer ' + jwt(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) { /* empty */ }
  return { status: r.status, j };
}
const why = r => (r.j && r.j.errors || []).map(e => e.detail || e.title).join('; ').slice(0, 300) || `HTTP ${r.status}`;
const HOURS = 3600 * 1000;

async function undo() {
  const env = Object.fromEntries(String(fs.existsSync(path.join(OUT, 'profile.env')) ? fs.readFileSync(path.join(OUT, 'profile.env'), 'utf8') : '').split('\n').filter(Boolean).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  if (!env.CERT_ID) return;
  const profiles = await api('GET', '/v1/profiles?limit=200&fields[profiles]=name');
  for (const p of (profiles.status === 200 ? profiles.j.data : []) || []) if (p.attributes.name === env.PROFILE_NAME) await api('DELETE', `/v1/profiles/${p.id}`);
  const r = await api('DELETE', `/v1/certificates/${env.CERT_ID}`);
  note('Signing', r.status < 300 ? 'Nothing was uploaded, so this run\'s certificate and profile were removed again.' : `Couldn't remove this run's certificate (${why(r)}); the next run cleans it up.`);
}

if (UNDO) { undo().catch(e => note('Signing', 'cleanup skipped: ' + String(e && e.message).slice(0, 120))); return; }
(async () => {
  // the bundle ID, with push turned on (the app's entitlements ask for it)
  const bid = await api('GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE)}&include=bundleIdCapabilities&limit=10`);
  const b = bid.status === 200 && (bid.j.data || []).find(x => x.attributes.identifier === BUNDLE);
  if (!b) fail('Signing', `The bundle ID ${BUNDLE} isn't registered (${why(bid)}).`);
  const caps = (bid.j.included || []).map(c => c.attributes && c.attributes.capabilityType);
  if (!caps.includes('PUSH_NOTIFICATIONS')) {
    const r = await api('POST', '/v1/bundleIdCapabilities', { data: { type: 'bundleIdCapabilities', attributes: { capabilityType: 'PUSH_NOTIFICATIONS' }, relationships: { bundleId: { data: { type: 'bundleIds', id: b.id } } } } });
    if (r.status >= 300) fail('Signing', `Push notifications aren't on for the bundle ID and couldn't be turned on (${why(r)}).`);
    note('Signing', 'Turned on push notifications for the bundle ID.');
  }

  // clean up what earlier runs made (more than 3 hours old, so a build Apple is still processing keeps its certificate)
  const certs = await api('GET', '/v1/certificates?limit=200&fields[certificates]=certificateType,expirationDate,csrContent');
  if (certs.status !== 200) fail('Signing', `Couldn't list certificates (${why(certs)}): the App Store Connect key needs Admin access.`);
  let revoked = 0;
  for (const c of certs.j.data || []) {
    if (!/DISTRIBUTION/.test(c.attributes.certificateType || '')) continue;
    let ours = false;
    try { const csr = String(c.attributes.csrContent || ''); if (csr) ours = Buffer.from(csr.replace(/-----[^-]+-----|\s/g, ''), 'base64').includes(Buffer.from(MARK)) || csr.includes(MARK); } catch (e) { /* unreadable: not ours */ }
    const made = new Date(c.attributes.expirationDate).getTime() - 365 * 24 * HOURS;
    if (ours && Date.now() - made > 3 * HOURS) { const r = await api('DELETE', `/v1/certificates/${c.id}`); if (r.status < 300) revoked++; }
  }
  const profiles = await api('GET', '/v1/profiles?limit=200&fields[profiles]=name,createdDate,profileType');
  let removed = 0;
  for (const p of (profiles.status === 200 ? profiles.j.data : []) || []) {
    if (!String(p.attributes.name || '').startsWith(PROFILE_PREFIX)) continue;
    if (Date.now() - new Date(p.attributes.createdDate).getTime() > 3 * HOURS) { const r = await api('DELETE', `/v1/profiles/${p.id}`); if (r.status < 300) removed++; }
  }

  // this run's certificate: the private key is made here and stays here
  const keyFile = path.join(OUT, 'key.pem'), csrFile = path.join(OUT, 'req.csr');
  execFileSync('openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', csrFile, '-subj', `/CN=${MARK}/O=Dialed In`], { stdio: 'ignore' });
  const csr = fs.readFileSync(csrFile, 'utf8');
  let cert = await api('POST', '/v1/certificates', { data: { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent: csr } } });
  if (cert.status === 409 || cert.status === 403) fail('Signing', `Apple wouldn't make another distribution certificate (${why(cert)}). The account allows only a few: developer.apple.com, Certificates, revoke an old Apple Distribution one you don't use, then run again.`);
  if (cert.status >= 300) fail('Signing', `Making the distribution certificate failed (${why(cert)}).`);
  fs.writeFileSync(path.join(OUT, 'cert.cer'), Buffer.from(cert.j.data.attributes.certificateContent, 'base64'));

  // an App Store profile for the bundle ID with that certificate
  const name = `${PROFILE_PREFIX} ${process.env.RUN_NUMBER || ''} ${new Date().toISOString().slice(0, 16)}`.replace(/\s+/g, ' ').trim();
  const prof = await api('POST', '/v1/profiles', { data: { type: 'profiles', attributes: { name, profileType: 'IOS_APP_STORE' }, relationships: {
    bundleId: { data: { type: 'bundleIds', id: b.id } }, certificates: { data: [{ type: 'certificates', id: cert.j.data.id }] } } } });
  if (prof.status >= 300) fail('Signing', `Making the App Store profile failed (${why(prof)}).`);
  fs.writeFileSync(path.join(OUT, 'profile.mobileprovision'), Buffer.from(prof.j.data.attributes.profileContent, 'base64'));
  fs.writeFileSync(path.join(OUT, 'profile.env'), `PROFILE_NAME=${name}\nPROFILE_UUID=${prof.j.data.attributes.uuid}\nCERT_ID=${cert.j.data.id}\n`);
  note('Signing', `Made this run's distribution certificate and App Store profile (cleaned up from earlier runs: ${revoked} certificates, ${removed} profiles).`);
})().catch(e => fail('Signing', 'The signing setup failed: ' + String(e && e.message || e).slice(0, 200)));
