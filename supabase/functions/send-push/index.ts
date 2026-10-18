// send-push: delivers one notification to the phones of the person it's for. The database calls this
// (internal.on_notification, through pg_net) with the notification's id and a shared secret; everything else, the
// text, the phones and the keys, it reads from the database itself. Deployed by the supabase-push workflow.
//   web push  the Home Screen web app (VAPID keys made by the workflow)
//   APNs      the iPhone app (v14.6; Maceo's Apple push key, stored by the ios workflow)
import postgres from 'npm:postgres@3.4.4';
import webpush from 'npm:web-push@3.6.7';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });

type Apns = { key?: string; keyId?: string; teamId?: string; topic?: string; host?: string };
let apnsJwt = { token: '', at: 0 };

// Apple wants a fresh signed token at most every hour (ES256, signed with the .p8 key)
async function apnsToken(a: Apns): Promise<string> {
  if (apnsJwt.token && Date.now() - apnsJwt.at < 50 * 60 * 1000) return apnsJwt.token;
  const pem = (a.key || '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const b64 = (o: unknown) => btoa(typeof o === 'string' ? o : JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const head = b64({ alg: 'ES256', kid: a.keyId }), body = b64({ iss: a.teamId, iat: Math.floor(Date.now() / 1000) });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(head + '.' + body)));
  const token = head + '.' + body + '.' + btoa(String.fromCharCode(...sig)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  apnsJwt = { token, at: Date.now() };
  return token;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const secret = req.headers.get('x-push-secret') || '';
  let id = 0;
  try { id = Number((await req.json()).id) || 0; } catch (_) { /* nothing to send */ }
  if (!id || !secret) return new Response('nothing to send', { status: 400 });
  const [row] = await sql`select internal.push_payload(${id}, ${secret}) as p`;
  const p = row && row.p;
  if (!p) return new Response('not allowed', { status: 403 });
  const web = JSON.stringify({ title: p.title, body: p.body, tag: p.tag });
  let sent = 0, gone = 0, failed = 0;
  for (const s of p.subs || []) {
    try {
      if (s.kind === 'apns') {
        const a: Apns = p.apns || {};
        if (!a.key || !a.keyId || !a.teamId || !a.topic) { failed++; continue; }
        const token = s.endpoint.slice(5);
        const res = await fetch(`https://${a.host || 'api.push.apple.com'}/3/device/${token}`, {
          method: 'POST',
          headers: { authorization: 'bearer ' + await apnsToken(a), 'apns-topic': a.topic, 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-collapse-id': String(p.tag || '').slice(0, 64) },
          body: JSON.stringify({ aps: { alert: { title: p.title, body: p.body }, sound: 'default', 'thread-id': 'dialed-in' }, open: 'notifications', tag: p.tag }),   // v15.1: tag says which notification (the app opens what it's about)
        });
        if (res.ok) sent++;
        else {
          const why = await res.text().catch(() => '');
          if (res.status === 410 || /BadDeviceToken|Unregistered/.test(why)) { await sql`delete from push_subscriptions where endpoint = ${s.endpoint}`; gone++; } else failed++;
        }
      } else {
        webpush.setVapidDetails(p.subject, p.publicKey, p.privateKey);
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, web, { TTL: 86400, urgency: 'normal' });
        sent++;
      }
    } catch (e) {
      const code = (e && (e as { statusCode?: number }).statusCode) || 0;
      if (code === 404 || code === 410) { await sql`delete from push_subscriptions where endpoint = ${s.endpoint}`; gone++; }   // that phone turned them off
      else failed++;
    }
  }
  return new Response(JSON.stringify({ sent, gone, failed }), { headers: { 'Content-Type': 'application/json' } });
});
