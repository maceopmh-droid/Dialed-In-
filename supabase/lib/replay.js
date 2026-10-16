// Who made a Sheet save, for replaying it through push_event as that person.
//
// The Sheet's "actor" isn't reliable for this: the app copies a record's previous actor along when someone likes or
// comments on it. So a save is attributed to everyone whose part of the record it changed, compared with the
// record's previous version: the owner for the record's own fields, and each person whose like, comment, comment
// like or want-to-try flag changed. Pushing it as each of them is safe because push_event only ever applies the
// caller's own part.
const OWN_SKIP = new Set(['likes', 'comments', 'commentMeta', 'wantToTry', 'actor', 'actorColor', 'eventAt', 'baseAt']);
const nm = v => String(v || '').trim();
const metaFold = (list, meta) => (Array.isArray(list) ? list : []).map(c => {
  const m = c && meta && meta[String(c.id)];
  return m ? { ...c, parentId: c.parentId || m.p || '', likes: Array.isArray(c.likes) ? c.likes : (m.l || []) } : c;
});
const symDiff = (a, b) => { const A = new Set((a || []).map(nm)), B = new Set((b || []).map(nm)); return [...A, ...B].filter(x => x && (A.has(x) !== B.has(x))); };

function whoChanged(prev, e) {
  const owner = nm(e.owner || e.user || e.actor);
  if (e.type === 'delete' || e.type === 'flavor') return [nm(e.actor || e.user)];
  if (e.type === 'gear' && e.owner === '__people__') return [];   // the people list: people are accounts now
  if (e.type === 'gear') return [e.owner === '__group__' ? nm(e.actor || e.user) : owner];
  if (!prev) return [owner];
  const out = new Set();
  if (Object.keys({ ...prev, ...e }).some(k => !OWN_SKIP.has(k) && JSON.stringify(prev[k]) !== JSON.stringify(e[k]))) out.add(owner);
  symDiff(prev.likes, e.likes).forEach(x => out.add(x));
  symDiff(prev.wantToTry, e.wantToTry).forEach(x => out.add(x));
  const pc = new Map(metaFold(prev.comments, prev.commentMeta).filter(c => c && c.id).map(c => [String(c.id), c]));
  const ec = new Map(metaFold(e.comments, e.commentMeta).filter(c => c && c.id).map(c => [String(c.id), c]));
  new Set([...pc.keys(), ...ec.keys()]).forEach(id => {
    const a = pc.get(id), b = ec.get(id);
    if (!a || !b || nm(a.text) !== nm(b.text) || nm(a.parentId) !== nm(b.parentId)) out.add(nm((a || b).user));
    symDiff(a && a.likes, b && b.likes).forEach(x => out.add(x));
  });
  return [...out].filter(Boolean);
}

// Sheet events in the order the app applies them
const eventTime = e => Date.parse(e.eventAt || e.date) || 0;
const inOrder = events => events.slice().sort((a, b) => eventTime(a) - eventTime(b));

// plan the replay of everything after `since`: [{ event, people: [...] }], given the whole history for context
function planReplay(events, since) {
  const cut = Date.parse(since) || 0;
  const prevOf = new Map();
  const plan = [];
  inOrder(events).forEach(e => {
    const key = e.type + ':' + e.id;
    if (eventTime(e) > cut) plan.push({ event: e, people: whoChanged(prevOf.get(key), e) });
    if (e.type === 'bean' || e.type === 'brew') prevOf.set(key, e);
  });
  return plan;
}

module.exports = { whoChanged, planReplay, inOrder, eventTime };
