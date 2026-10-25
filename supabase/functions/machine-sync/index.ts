// machine-sync: what an espresso machine (a GaggiMate kit, v16.9) reads at power-on and every few minutes: the coffees
// on its owner's shelf and the owner's own last shot on each (dose, grind, yield) to prefill the next. Read by the
// database (internal.machine_sync in supabase/api.sql); the web side is ../_shared/machine_http.mjs. Deployed by the
// supabase-shots workflow, with --no-verify-jwt: the machine's token isn't a Supabase sign-in, the database checks it.
import postgres from 'npm:postgres@3.4.4';
import { machineSync } from '../_shared/machine_http.mjs';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });

Deno.serve((req) => machineSync(req, async (_kind: string, token: string) => {
  const [row] = await sql`select internal.machine_sync(${token}) as r`;
  return row && row.r;
}));
