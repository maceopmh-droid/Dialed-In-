#!/usr/bin/env node
// A stand-in for Supabase, for trying the app against the new backend on one computer before a real project exists.
// It speaks the few parts of Supabase's web API the app uses (email-code sign-in, the database functions, photo
// storage) and runs every call on a real Postgres as the signed-in person, with the same schema.sql, api.sql and
// storage.sql, so the privacy rules are the real ones. It is for development and tests only: sign-in codes are
// printed instead of emailed, and its tokens aren't signed.
//
//   node supabase/dev_server.js --host <postgres socket dir or host> [--user postgres] [--db dialed_dev] [--port 54321]
//        [--fresh] [--rows rows.json --html index.html]   (--fresh rebuilds the database; --rows also imports a Sheet export)
//        [--static <dir> --static-port 8080]              (also serves the app from <dir>, on its own port like the real thing)
//
// Then, on a phone or browser pointed at the app: localStorage.dialed_supabase = '{"url":"http://localhost:54321","anonKey":"dev"}'
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const arg = (k, d = null) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const HOST = arg('host'), USER = arg('user', 'postgres'), DB = arg('db', 'dialed_dev'), PORT = Number(arg('port', 54321));
if (!HOST) { console.error('usage: node supabase/dev_server.js --host <postgres socket dir or host> [--fresh] [--port 54321]'); process.exit(2); }
const FILES = path.join(require('os').tmpdir(), 'dialed-dev-storage-' + DB);
const log = (...a) => { if (!process.argv.includes('--quiet')) console.log(...a); };

// ---------------------------------------------------------------- Postgres
function psql(sql, db = DB) {
  return execFileSync('psql', ['-h', HOST, '-U', USER, '-d', db, '-Atq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'],
    { input: '\\set VERBOSITY verbose\n' + sql, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
const lit = v => v === null || v === undefined ? 'null' : (typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : (typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`));
const asWho = (sub, sql) => psql(`set role ${sub ? 'authenticated' : 'anon'}; set request.jwt.claim.sub to '${sub || ''}';\n${sql}`);
// a Postgres error as Supabase's API reports it
function pgError(e, sub) {
  const text = String(e.stderr || e.message || '');
  const m = /ERROR:\s+([0-9A-Z]{5}):\s+(.*)/.exec(text) || /ERROR:\s+(.*)/.exec(text);
  const code = m && m.length > 2 ? m[1] : 'XX000', message = m ? (m.length > 2 ? m[2] : m[1]).trim() : text.trim();
  const status = code === '42501' ? (sub ? 403 : 401) : code === '28000' ? 403 : code === '23505' ? 409 : code === 'P0002' ? 404 : code === '42883' ? 404 : 400;
  return { status, body: { code, message, details: null, hint: null } };
}

function setup() {
  psql(`drop database if exists ${DB}`, 'postgres'); psql(`create database ${DB}`, 'postgres');
  psql(`create schema auth; create table auth.users (id uuid primary key, email text unique);
    create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;`);
  psql(`alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, anon; alter default privileges in schema public grant execute on functions to authenticated, anon; grant usage on schema public, auth to authenticated, anon;`);   // what Supabase grants on every new table and function
  psql(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  psql(`grant execute on all functions in schema auth to authenticated, anon;`);
  psql(fs.readFileSync(path.join(__dirname, 'api.sql'), 'utf8'));
  psql(`create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid, unique (bucket_id, name));
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, anon; grant select, insert, update, delete on storage.objects to authenticated;`);
  psql(fs.readFileSync(path.join(__dirname, 'storage.sql'), 'utf8'));
  if (arg('rows')) {
    const { buildImport } = require('./import_v9.js');
    const res = buildImport({ html: arg('html', path.join(__dirname, '..', 'index.html')), rows: JSON.parse(fs.readFileSync(arg('rows'), 'utf8')), mode: 'full' });
    psql(res.sql);
    log('imported:', JSON.stringify(res.summary));
    log('claim codes:', psql(`select string_agg(legacy_name || '=' || code, ', ' order by legacy_name) from claim_codes;`));
  }
  fs.rmSync(FILES, { recursive: true, force: true });
}

// ---------------------------------------------------------------- sign-in (unsigned tokens: development only)
const codes = new Map(), refresh = new Map(), links = new Map();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN_LIFE = Number(arg('token-life', 3600));
function tokensFor(user) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_LIFE;
  const rt = crypto.randomBytes(16).toString('hex');
  refresh.set(rt, user);
  return { access_token: 'dev.' + b64({ sub: user.id, email: user.email, exp }) + '.unsigned', token_type: 'bearer', expires_in: TOKEN_LIFE, expires_at: exp, refresh_token: rt, user: { id: user.id, email: user.email, aud: 'authenticated' } };
}
function whoFrom(req) {
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Bearer ')) return { sub: null };
  const t = h.slice(7);
  if (t === 'dev' || t === arg('anon-key', 'dev')) return { sub: null };   // the public key alone: signed out
  try {
    const c = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
    if (c.exp * 1000 < Date.now()) return { expired: true };
    return { sub: c.sub };
  } catch (e) { return { bad: true }; }
}

// ---------------------------------------------------------------- the web API
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-upsert, prefer', 'Access-Control-Max-Age': '600' };
const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { ...CORS, 'Content-Type': type });
  res.end(body === undefined ? '' : (Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body)));
};
const readBody = req => new Promise(r => { const parts = []; req.on('data', c => parts.push(c)); req.on('end', () => r(Buffer.concat(parts))); });
const stats = { rpc: 0, pushes: 0, pulls: 0, uploads: 0 };

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204);
  const raw = await readBody(req);
  const json = () => { try { return JSON.parse(raw.toString() || '{}'); } catch (e) { return {}; } };

  // -- development helpers (not part of Supabase)
  if (url.pathname === '/__dev/code') return send(res, 200, { code: codes.get(String(url.searchParams.get('email') || '').toLowerCase()) || null });
  if (url.pathname === '/__dev/stats') return send(res, 200, stats);
  if (url.pathname === '/__dev/sql' && process.argv.includes('--allow-sql')) { try { return send(res, 200, { out: psql(raw.toString()) }); } catch (e) { return send(res, 400, pgError(e).body); } }

  // -- sign-in by email code
  if (url.pathname === '/auth/v1/otp' && req.method === 'POST') {
    const email = String(json().email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { code: 400, error_code: 'validation_failed', msg: 'Enter a valid email address.' });
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    codes.set(email, code);
    log(`sign-in code for ${email}: ${code}`);
    return send(res, 200, {});
  }
  if (url.pathname === '/auth/v1/verify' && req.method === 'POST') {
    const b = json(), email = String(b.email || '').trim().toLowerCase();
    if (!codes.has(email) || codes.get(email) !== String(b.token || '')) return send(res, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
    codes.delete(email);
    let id = psql(`select id from auth.users where email = ${lit(email)};`);
    if (!id) id = psql(`insert into auth.users (id, email) values (gen_random_uuid(), ${lit(email)}) returning id;`);
    return send(res, 200, tokensFor({ id, email }));
  }
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
    const rt = String(json().refresh_token || '');
    const user = refresh.get(rt);
    if (!user) return send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
    refresh.delete(rt);   // used once, like Supabase's rotation
    return send(res, 200, tokensFor(user));
  }
  if (url.pathname === '/auth/v1/logout') return send(res, 204);

  const who = whoFrom(req);
  if (who.expired || who.bad) return send(res, 401, { code: 'PGRST301', message: who.expired ? 'JWT expired' : 'JWT invalid', details: null, hint: null });

  // -- database functions
  const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
  if (rpc && req.method === 'POST') {
    stats.rpc++; if (rpc[1] === 'push_event') stats.pushes++; if (rpc[1] === 'pull_events') stats.pulls++;
    const args = json();
    if (process.env.DEV_LOG && rpc[1] === 'push_event') console.log('push as', who.sub, JSON.stringify({ type: args.ev && args.ev.type, id: args.ev && args.ev.id, likes: args.ev && args.ev.likes }));
    const call = `select ${rpc[1]}(${Object.keys(args).map(k => `${k.replace(/[^a-z_]/g, '')} => ${lit(args[k])}`).join(', ')});`;
    try { const out = asWho(who.sub, call); return send(res, 200, out === '' ? 'null' : out); } catch (e) { const err = pgError(e, who.sub); return send(res, err.status, err.body); }
  }

  // -- photo storage (bucket "photos")
  const up = /^\/storage\/v1\/object\/photos\/(.+)$/.exec(url.pathname);
  if (up && req.method === 'POST') {
    if (!who.sub) return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    const name = decodeURIComponent(up[1]);
    try {
      asWho(who.sub, `insert into storage.objects (bucket_id, name, owner) values ('photos', ${lit(name)}, '${who.sub}')` +
        (req.headers['x-upsert'] === 'true' ? ` on conflict (bucket_id, name) do update set owner = excluded.owner;` : ';'));
    } catch (e) { return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }); }
    const file = path.join(FILES, name);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, raw);
    stats.uploads++;
    return send(res, 200, { Key: 'photos/' + name, Id: crypto.randomUUID() });
  }
  if (url.pathname === '/storage/v1/object/sign/photos' && req.method === 'POST') {
    const b = json();
    const out = (Array.isArray(b.paths) ? b.paths : []).map(p => {
      let n = '0'; try { n = asWho(who.sub, `select count(*) from storage.objects where bucket_id = 'photos' and name = ${lit(p)};`); } catch (e) {}
      if (n !== '1') return { error: 'Either the object does not exist or you do not have access to it', path: p, signedURL: null };
      const t = crypto.randomBytes(12).toString('hex');
      links.set(t, { path: p, until: Date.now() + 1000 * Number(b.expiresIn || 60) });
      return { error: null, path: p, signedURL: `/object/sign/photos/${p.split('/').map(encodeURIComponent).join('/')}?token=${t}` };
    });
    return send(res, 200, out);
  }
  const get = /^\/storage\/v1\/object\/sign\/photos\/(.+)$/.exec(url.pathname);
  if (get && req.method === 'GET') {
    const l = links.get(url.searchParams.get('token') || '');
    const name = decodeURIComponent(get[1]);
    if (!l || l.path !== name || l.until < Date.now()) return send(res, 400, { statusCode: '400', error: 'InvalidJWT', message: 'invalid signature' });
    const file = path.join(FILES, name);
    if (!fs.existsSync(file)) return send(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    return send(res, 200, fs.readFileSync(file), name.endsWith('.png') ? 'image/png' : 'image/jpeg');
  }
  return send(res, 404, { message: 'Not found in the stand-in: ' + req.method + ' ' + url.pathname });
}

['SIGTERM', 'SIGINT', 'SIGHUP'].forEach(sig => process.on(sig, () => process.exit(0)));   // stop cleanly when asked
if (process.argv.includes('--fresh')) setup();
http.createServer((req, res) => handle(req, res).catch(e => { console.error(e); send(res, 500, { message: String(e.message || e) }); })).listen(PORT, () => log(`Supabase stand-in on http://localhost:${PORT} (database ${DB})`));

if (arg('static')) {
  const dir = path.resolve(arg('static'));
  const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
  http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(dir, u === '/' ? 'index.html' : u);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  }).listen(Number(arg('static-port', 8080)), () => log(`app on http://localhost:${arg('static-port', 8080)}`));
}
