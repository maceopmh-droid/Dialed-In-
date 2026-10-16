// send-push: delivers one notification to the phones of the person it's for (Web Push). The database calls this
// (internal.on_notification, through pg_net) with the notification's id and a shared secret; everything else, the
// text, the phones and the VAPID key, it reads from the database itself. Deployed by the supabase-push workflow.
import postgres from 'npm:postgres@3.4.4';
import webpush from 'npm:web-push@3.6.7';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const secret = req.headers.get('x-push-secret') || '';
  let id = 0;
  try { id = Number((await req.json()).id) || 0; } catch (_) { /* nothing to send */ }
  if (!id || !secret) return new Response('nothing to send', { status: 400 });
  const [row] = await sql`select internal.push_payload(${id}, ${secret}) as p`;
  const p = row && row.p;
  if (!p) return new Response('not allowed', { status: 403 });
  webpush.setVapidDetails(p.subject, p.publicKey, p.privateKey);
  const body = JSON.stringify({ title: p.title, body: p.body, tag: p.tag });
  let sent = 0, gone = 0;
  for (const s of p.subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 86400, urgency: 'normal' });
      sent++;
    } catch (e) {
      const code = (e && (e as { statusCode?: number }).statusCode) || 0;
      if (code === 404 || code === 410) { await sql`delete from push_subscriptions where endpoint = ${s.endpoint}`; gone++; }   // that phone turned them off
    }
  }
  return new Response(JSON.stringify({ sent, gone }), { headers: { 'Content-Type': 'application/json' } });
});
