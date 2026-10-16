#!/usr/bin/env python3
"""Check the privacy rules in schema.sql against a real Postgres, as different pretend people.

    python3 supabase/test_rls.py --host /path/to/socket/dir [--user postgres]

Drops and recreates a database called dialed_rls_test. Supabase's sign-in pieces (auth.users, auth.uid(), the
"authenticated" role) are stood in for at the top, so the same schema.sql runs here and on Supabase.
"""
import argparse, hashlib, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DB = 'dialed_rls_test'
PEOPLE = ['maceo', 'aidan', 'stranger', 'privy', 'groupie', 'opener', 'blocker']
U = {k: f'00000000-0000-0000-0000-00000000000{i}' for i, k in enumerate(PEOPLE, 1)}       # profile ids
AUTH = {k: f'aaaaaaaa-0000-0000-0000-00000000000{i}' for i, k in enumerate(PEOPLE, 1)}    # sign-in ids (different on purpose)
AUTH['newbie'] = 'aaaaaaaa-0000-0000-0000-000000000099'                                    # signed in, no profile yet

STUB = """
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
"""

# what Supabase grants: everything on every new table and function (row rules and schema.sql's column limits do the rest)
DEFAULTS = """
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, anon;
alter default privileges in schema public grant execute on functions to authenticated, anon;
grant usage on schema public, auth to authenticated, anon;
"""
GRANTS = """
grant execute on all functions in schema auth to authenticated, anon;
"""

def sid(name): return '10000000-0000-0000-0000-' + hashlib.md5(name.encode()).hexdigest()[:12]

SESS = {  # name: (owner, audience, deleted)
    'm_every': ('maceo', 'everyone', False), 'm_friends': ('maceo', 'friends', False),
    'm_me': ('maceo', 'only_me', False), 'm_gone': ('maceo', 'everyone', True),
    'p_every': ('privy', 'everyone', False), 'p_friends': ('privy', 'friends', False),
    'b_every': ('blocker', 'everyone', False),
    'j_every': ('john', 'everyone', False),
}
U['john'] = '00000000-0000-0000-0000-000000000042'

def seed():
    out = []
    for a in AUTH.values(): out.append(f"insert into auth.users values ('{a}');")
    for k in PEOPLE:
        u = U[k]
        out.append(f"insert into profiles (id, auth_id, handle, display_name, is_private) values ('{u}', '{AUTH[k]}', '{k}', '{k.title()}', {str(k == 'privy').lower()});")
    # a Sheet-era name nobody has claimed: a profile with no sign-in, whose old public session still shows
    out.append("insert into profiles (id, handle, display_name, legacy_name) values ('00000000-0000-0000-0000-000000000042', 'john', 'John', 'John');")
    f = lambda a, b, st='accepted': out.append(f"insert into follows values ('{U[a]}', '{U[b]}', '{st}');")
    f('maceo', 'aidan'); f('aidan', 'maceo')          # friends
    f('stranger', 'maceo')                            # one-way follower
    f('aidan', 'privy'); f('stranger', 'privy', 'pending')
    out.append(f"insert into blocks values ('{U['blocker']}', '{U['maceo']}');")
    out.append(f"insert into groups (id, name, is_open, owner_id) values ('20000000-0000-0000-0000-000000000001', 'Roommates', false, '{U['maceo']}'), "
               f"('20000000-0000-0000-0000-000000000002', 'Moka pot club', true, '{U['opener']}');")
    for g, u in [(1, 'maceo'), (1, 'groupie'), (2, 'maceo'), (2, 'opener')]:
        out.append(f"insert into group_members (group_id, user_id) values ('20000000-0000-0000-0000-00000000000{g}', '{U[u]}');")
    for n, (o, a, gone) in SESS.items():
        out.append(f"insert into sessions (id, owner_id, audience, brewed_at, deleted_at) values ('{sid(n)}', '{U[o]}', '{a}', now(), {'now()' if gone else 'null'});")
    out.append(f"insert into session_notes values ('{sid('m_every')}', 'brewed before my interview', 'friends');")
    out.append(f"insert into session_photos values ('{sid('m_every')}', 'photos/m_every.webp', 'everyone');")
    out.append(f"insert into comments (id, session_id, author_id, body, audience) values "
               f"('30000000-0000-0000-0000-000000000001', '{sid('m_every')}', '{U['aidan']}', 'friends-only comment', 'friends'), "
               f"('30000000-0000-0000-0000-000000000002', '{sid('m_every')}', '{U['stranger']}', 'public comment', 'everyone');")
    return '\n'.join(out)


class PG:
    def __init__(self, host, user): self.base = ['psql', '-h', host, '-U', user, '-v', 'ON_ERROR_STOP=1', '-Atq']
    def run(self, sql, db=DB, ok=True):
        r = subprocess.run(self.base + ['-d', db, '-c', sql], capture_output=True, text=True)
        if ok and r.returncode: sys.exit(f'SQL failed: {r.stderr.strip()}\n{sql[:300]}')
        return r
    def file(self, path, db=DB):
        r = subprocess.run(self.base + ['-d', db, '-f', path], capture_output=True, text=True)
        if r.returncode: sys.exit(f'{path} failed: {r.stderr.strip()[:800]}')
    def as_(self, who, sql):
        sub = AUTH.get(who, '')
        r = self.run(f"set role {'anon' if who == 'anon' else 'authenticated'}; set request.jwt.claim.sub to '{sub}'; {sql}", ok=False)
        return r


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--host', required=True); ap.add_argument('--user', default='postgres')
    a = ap.parse_args(); pg = PG(a.host, a.user)
    pg.run(f'drop database if exists {DB}', db='postgres'); pg.run(f'create database {DB}', db='postgres')
    pg.run(STUB); pg.run(DEFAULTS); pg.file(os.path.join(HERE, 'schema.sql')); pg.run(GRANTS); pg.run(seed())

    fails = 0
    def ok(cond, msg):
        nonlocal fails
        print(('PASS ' if cond else 'FAIL ') + msg); fails += 0 if cond else 1

    names = {sid(n): n for n in SESS}
    def sees(who):
        r = pg.as_(who, 'select id from sessions order by id;')
        if r.returncode: return f'ERROR {r.stderr.strip()[:200]}'
        return sorted(names[x] for x in r.stdout.split())
    expect = {
        'maceo':    ['j_every', 'm_every', 'm_friends', 'm_gone', 'm_me'],        # all of your own, even deleted
        'aidan':    ['b_every', 'j_every', 'm_every', 'm_friends', 'p_every'],    # Maceo's friend, Privy's approved follower
        'stranger': ['b_every', 'j_every', 'm_every'],                            # one-way follower; Privy's request pending
        'groupie':  ['b_every', 'j_every', 'm_every', 'm_friends'],               # a private group with Maceo counts as close
        'opener':   ['b_every', 'j_every', 'm_every'],                            # an open group doesn't
        'blocker':  ['b_every', 'j_every'],                                       # blocked Maceo: neither sees the other
        'newbie':   [],                                                           # signed in, no profile yet: nothing
        'anon':     [],                                                           # not signed in: nothing
    }
    for who, want in expect.items():
        got = sees(who); ok(got == sorted(want), f'{who} sees sessions {sorted(want)} (got {got})')

    def count(who, sql):
        r = pg.as_(who, sql); return r.stdout.strip() if not r.returncode else 'ERROR ' + r.stderr.strip()[:200]
    note = f"select count(*) from session_notes where session_id = '{sid('m_every')}';"
    photo = f"select count(*) from session_photos where session_id = '{sid('m_every')}';"
    for who, n, p in [('maceo', 1, 1), ('aidan', 1, 1), ('groupie', 1, 1), ('stranger', 0, 1), ('opener', 0, 1), ('blocker', 0, 0)]:
        ok(count(who, note) == str(n), f"friends-only note on a public session: {who} {'sees' if n else 'does not see'} it")
        ok(count(who, photo) == str(p), f"everyone photo on a public session: {who} {'sees' if p else 'does not see'} it")

    cm = "select string_agg(body, '|' order by body) from comments;"
    for who, want in [('maceo', 'friends-only comment|public comment'), ('aidan', 'friends-only comment|public comment'),
                      ('stranger', 'public comment'), ('groupie', 'public comment'), ('blocker', '')]:
        ok(count(who, cm) == want, f'comments {who} sees: "{want}" (got "{count(who, cm)}")')

    ok(pg.as_('stranger', f"insert into likes (session_id, user_id) values ('{sid('m_friends')}', '{U['stranger']}');").returncode != 0,
       "can't like a session you can't see")
    ok(pg.as_('stranger', f"insert into likes (session_id, user_id) values ('{sid('m_every')}', '{U['stranger']}');").returncode == 0,
       'can like a public session')
    ok(pg.as_('aidan', f"insert into sessions (owner_id, audience, brewed_at) values ('{U['maceo']}', 'everyone', now());").returncode != 0,
       "can't log a session as someone else")
    ok(count('aidan', f"update sessions set audience = 'everyone' where id = '{sid('m_friends')}' returning 1;") in ('', '0'),
       "can't change someone else's session")
    ok(count('stranger', "select count(*) from profiles where handle = 'privy';") == '1', "a private profile's card is still findable")
    ok(count('blocker', "select count(*) from profiles where handle = 'maceo';") == '0', "someone you blocked can't see your card")
    gq = "select string_agg(name, ', ' order by name) from groups;"
    ok(count('stranger', gq) == 'Moka pot club', 'a stranger sees the open group, not the private one')
    ok(count('groupie', gq) == 'Moka pot club, Roommates' and count('maceo', gq) == 'Moka pot club, Roommates',
       'members see their private group (and open groups, like everyone)')
    ok(count('stranger', "select count(*) from group_members where group_id = '20000000-0000-0000-0000-000000000001';") == '0',
       "a private group's members are hidden from outsiders")
    ok(count('anon', 'select count(*) from profiles;') == '0', 'not signed in: no profiles')
    ok(all('permission denied' in count('stranger', f'select count(*) from {t};') for t in ('claim_codes', 'sheet_archive', 'backend_state')),
       'claim codes, the Sheet archive and the backend switches are off limits to the app entirely')

    # what the app can't change directly, whatever the row rules allow (column limits at the end of schema.sql)
    fails_ = lambda who, sql: pg.as_(who, sql).returncode != 0
    ok(fails_('opener', f"insert into follows values ('{U['opener']}', '{U['privy']}', 'accepted');") and not fails_('opener', f"insert into follows values ('{U['opener']}', '{U['privy']}', 'pending');"),
       "following a private profile starts as a request (you can't approve yourself)")
    ok(fails_('privy', f"update follows set follower = '{U['maceo']}' where followee = '{U['privy']}';") and not fails_('privy', f"update follows set status = 'accepted' where followee = '{U['privy']}' and follower = '{U['opener']}';"),
       "a private profile approves a request, but can't rewrite who follows them")
    ok(fails_('groupie', "update group_members set role = 'owner' where group_id = '20000000-0000-0000-0000-000000000001';"), "a member can't promote themselves in a group")
    ok(fails_('stranger', "insert into group_members (group_id, user_id, role) select id, me(), 'owner' from groups where is_open;"), "joining an open group makes you a member, never its owner")
    ok(fails_('newbie', "insert into profiles (auth_id, handle, display_name, legacy_name) values (auth.uid(), 'sneaky', 'Sneaky', 'John');"), "a profile can't be made directly (so nobody skips the name checks or takes a Sheet-era name)")
    ok(fails_('maceo', "update profiles set legacy_name = 'John' where auth_id = auth.uid();") and not fails_('maceo', "update profiles set city = 'Chicago' where auth_id = auth.uid();"), "you can edit your profile, but not the Sheet-era name it claimed")
    ok(fails_('stranger', "update profiles set display_name = 'Maceo ' where auth_id = auth.uid();"), "nobody renames themselves directly (the app knows people by name; no look-alike 'Maceo ')")

    # coffees, their comments and likes; gear and lists
    k = f"insert into coffees (id, owner_id, name) values ('40000000-0000-0000-0000-000000000001', '{U['maceo']}', 'Monarch');"
    pg.run(k)
    pg.run(f"insert into comments (session_id, coffee_id, author_id, body, audience) values (null, '40000000-0000-0000-0000-000000000001', '{U['aidan']}', 'coffee note for friends', 'friends'), (null, '40000000-0000-0000-0000-000000000001', '{U['stranger']}', 'coffee note for all', 'everyone');")
    for who, want in [('maceo', 'coffee note for all|coffee note for friends'), ('stranger', 'coffee note for all'), ('opener', 'coffee note for all')]:
        got = count(who, "select coalesce(string_agg(body, '|' order by body), '') from comments where coffee_id is not null;")
        ok(got == want, f'coffee comments {who} sees: "{want}" (got "{got}")')
    ok(pg.as_('stranger', f"insert into coffee_likes values ('40000000-0000-0000-0000-000000000001', '{U['stranger']}');").returncode == 0, 'anyone can like a coffee')
    ok(pg.as_('stranger', f"insert into coffee_likes values ('40000000-0000-0000-0000-000000000001', '{U['aidan']}');").returncode != 0, "can't like as someone else")
    pg.run(f"insert into equipment (owner_id, type, name) values ('{U['maceo']}', 'Grinder', 'Niche Zero'); insert into equipment (owner_id, type, name, hidden) values ('{U['maceo']}', 'Scale', 'Secret scale', true);")
    pg.run(f"insert into want_to_try (owner_id, coffee_id) values ('{U['maceo']}', '40000000-0000-0000-0000-000000000001'); insert into profile_gear (profile_id, recipes) values ('{U['maceo']}', '[1]');")
    ok(count('stranger', 'select count(*) from equipment;') == '1', "a stranger sees Maceo's equipment, minus the hidden item")
    ok(count('maceo', 'select count(*) from equipment;') == '2', 'you see all of your own equipment')
    ok(count('aidan', 'select count(*) from want_to_try;') == '1' and count('stranger', 'select count(*) from want_to_try;') == '0', 'want-to-try: friends yes, strangers no')
    ok(count('aidan', 'select count(*) from profile_gear;') == '0' and count('maceo', 'select count(*) from profile_gear;') == '1', 'the rest of your gear is yours only')

    # the fast row rules must say exactly what the plain rule functions say, for everyone, on everything in this test
    # (the extra rows made above included: coffees, comments on them, equipment, want-to-try)
    pg.run(f"insert into follows values ('{U['opener']}', '{U['maceo']}', 'accepted') on conflict do nothing;")
    def ids(r): return (r.stdout or '').strip() if not r.returncode else 'ERROR ' + r.stderr.strip()[:120]
    same_all = []
    for who in PEOPLE + ['john']:
        v = U[who]
        pairs = [
            ('sessions', "select coalesce(string_agg(id::text, ',' order by id), '') from sessions",
             f"select coalesce(string_agg(id::text, ',' order by id), '') from sessions s where can_see_session('{v}', s)"),
            ('notes', "select coalesce(string_agg(session_id::text, ',' order by session_id), '') from session_notes",
             f"select coalesce(string_agg(session_id::text, ',' order by session_id), '') from session_notes n where can_see_item('{v}', n.session_id, n.audience)"),
            ('photos', "select coalesce(string_agg(session_id::text, ',' order by session_id), '') from session_photos",
             f"select coalesce(string_agg(session_id::text, ',' order by session_id), '') from session_photos n where can_see_item('{v}', n.session_id, n.audience)"),
            ('comments', "select coalesce(string_agg(id::text, ',' order by id), '') from comments",
             f"select coalesce(string_agg(id::text, ',' order by id), '') from comments c where can_see_comment('{v}', c)"),
            ('likes', "select coalesce(string_agg(session_id::text || user_id::text, ',' order by session_id, user_id), '') from likes",
             f"select coalesce(string_agg(l.session_id::text || l.user_id::text, ',' order by l.session_id, l.user_id), '') from likes l join sessions s on s.id = l.session_id where can_see_session('{v}', s)"),
            ('profiles', "select coalesce(string_agg(id::text, ',' order by id), '') from profiles",
             f"select coalesce(string_agg(id::text, ',' order by id), '') from profiles p where not blocked_either('{v}', p.id)"),
            ('equipment', "select coalesce(string_agg(id::text, ',' order by id), '') from equipment",
             f"select coalesce(string_agg(id::text, ',' order by id), '') from equipment e where e.owner_id = '{v}' or (not e.hidden and not blocked_either('{v}', e.owner_id))"),
            ('want_to_try', "select coalesce(string_agg(owner_id::text || coffee_id::text, ',' order by owner_id, coffee_id), '') from want_to_try",
             f"select coalesce(string_agg(owner_id::text || coffee_id::text, ',' order by owner_id, coffee_id), '') from want_to_try w where w.owner_id = '{v}' or (close_to('{v}', w.owner_id) and not blocked_either('{v}', w.owner_id))"),
        ]
        if who == 'john':
            continue   # never signs in (an unclaimed Sheet-era name): nothing to compare from his side
        for name, fast, plain in pairs:
            a_, b_ = ids(pg.as_(who, fast + ';')), ids(pg.run(plain + ';'))
            if a_ != b_: same_all.append(f'{who}/{name}')
    ok(not same_all, 'the fast row rules agree with the plain rules for every person on sessions, notes, photos, comments, likes, profiles, equipment and want-to-try'
       + (f" (differ: {', '.join(same_all)})" if same_all else ''))

    print(f'{fails} FAILED' if fails else 'all privacy checks passed')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
