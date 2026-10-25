// shot-inbox: an espresso machine (a GaggiMate kit, v16.9) sends each shot here with its own token. Everything is
// checked and saved by the database (internal.shot_inbox in supabase/api.sql); this only reads the request. The web
// side is shared with machine-sync, the local stand-in and the tests: ../_shared/machine_http.mjs. Deployed by the
// supabase-shots workflow, with --no-verify-jwt: the machine's token isn't a Supabase sign-in, the database checks it.
import postgres from 'npm:postgres@3.4.4';
import { shotInbox } from '../_shared/machine_http.mjs';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });

// (sql.json: postgres.js sends the shot as JSON itself; a string cast to jsonb would arrive as a JSON string)
// deno-lint-ignore no-explicit-any
Deno.serve((req) => shotInbox(req, async (_kind: string, token: string, shot: any) => {
  const [row] = await sql`select internal.shot_inbox(${token}, ${sql.json(shot)}) as r`;
  return row && row.r;
}));
