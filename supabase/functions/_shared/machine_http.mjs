// The web side of the two functions an espresso machine calls (v16.9, the Shot Logger), shared by shot-inbox and
// machine-sync, and by the local stand-in (supabase/dev_server.js) and the tests (supabase/test_shots.js), so all of
// them run exactly this code. Each turns one request into one database call; the database does the checking and
// saving (internal.shot_inbox and internal.machine_sync in api.sql). The contract with the machine side is
// claude/shot-logger-app-handoff.md in the project docs.
//
//   POST /functions/v1/shot-inbox    Authorization: Bearer <machine token>, a shot as JSON (256 KB at most)
//   GET  /functions/v1/machine-sync  Authorization: Bearer <machine token>
//
// Answers: 200 {ok: true, ...}; 401 {ok: false, error} for a missing or unknown token (link the machine again);
// 413 (too big) and 422 {ok: false, error} for a shot that can't be saved (don't send it again); 429 (too many sends)
// and 5xx: try again later (keep the shot). The machine side treats them exactly so (the handoff's Oct 24 update).

export const MAX_BYTES = 262144;

const answer = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

// the machine's token from "Authorization: Bearer <token>"
export function machineToken(req) {
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,200})$/i.exec((req.headers.get('authorization') || '').trim());
  return m ? m[1] : '';
}

// the body, but never more than MAX_BYTES of it (a machine bug or a stranger can't make us read megabytes)
async function readCapped(req) {
  const said = Number(req.headers.get('content-length') || 0);
  if (said > MAX_BYTES) return null;
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { try { await reader.cancel(); } catch (_) { /* gone */ } return null; }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}

// the database's answer ({status, ...}) as a response
function fromDb(r) {
  const status = r && Number(r.status) || 500;
  const { status: _s, ...rest } = r || {};
  return status === 200 ? answer(200, { ok: true, ...rest }) : answer(status, { ok: false, error: rest.error || 'Something went wrong.' });
}

// db(kind, token, body?) runs internal.shot_inbox / internal.machine_sync and returns its JSON
export async function shotInbox(req, db) {
  if (req.method !== 'POST') return answer(405, { ok: false, error: 'Send shots with POST.' });
  const token = machineToken(req);
  if (!token) return answer(401, { ok: false, error: 'Missing machine token (Authorization: Bearer <token>).' });
  const raw = await readCapped(req);
  if (raw === null) return answer(413, { ok: false, error: 'The shot is too big (256 KB at most).' });
  let shot;
  try { shot = JSON.parse(new TextDecoder().decode(raw)); } catch (_) { return answer(422, { ok: false, error: 'The body isn\'t JSON.' }); }
  try { return fromDb(await db('inbox', token, shot)); }
  catch (_) { return answer(503, { ok: false, error: 'Dialed In couldn\'t save the shot just now. Keep it and try again.' }); }
}

export async function machineSync(req, db) {
  if (req.method !== 'GET') return answer(405, { ok: false, error: 'Read with GET.' });
  const token = machineToken(req);
  if (!token) return answer(401, { ok: false, error: 'Missing machine token (Authorization: Bearer <token>).' });
  try { return fromDb(await db('sync', token)); }
  catch (_) { return answer(503, { ok: false, error: 'Dialed In couldn\'t be reached just now. Try again.' }); }
}
