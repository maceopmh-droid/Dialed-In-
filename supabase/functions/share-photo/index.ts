// share-photo (v21.3): a share link opened signed out shows its session's photo. The photos folder is private (and its
// folders are named after accounts), so the link's page asks here: ?s=<session id>. The database says whether the link
// would show that photo (internal.share_photo_path: shared with Everyone, by a public profile, not hidden after a
// report); if so, this makes a two-hour address for it with the project's own key, which never leaves this function.
// Deployed by the supabase-share workflow, with --no-verify-jwt (anyone with the link may ask).
import postgres from 'npm:postgres@3.4.4';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });
const BASE = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const ref = String(new URL(req.url).searchParams.get('s') || '').slice(0, 64);
  if (!ref) return reply({ url: null }, 400);
  try {
    const [row] = await sql`select internal.share_photo_path(${ref}) as p`;
    const path = row && row.p;
    if (!path || !KEY || !BASE) return reply({ url: null }, 404);
    const res = await fetch(`${BASE}/storage/v1/object/sign/photos/${String(path).split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 7200 }) });
    const j = await res.json().catch(() => ({}));
    const signed = j && (j.signedURL || j.signedUrl);
    return signed ? reply({ url: `${BASE}/storage/v1${String(signed).startsWith('/') ? '' : '/'}${signed}` }) : reply({ url: null }, 404);
  } catch (_e) {
    return reply({ url: null }, 500);
  }
});
