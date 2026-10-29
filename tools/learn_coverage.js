#!/usr/bin/env node
// Learn coverage: what every Learn page has, against the checklist for its kind, and the hard rules a page must never break
// (v20.3, after Colombia's process list left out washed). A page is its written page (learn/pages.json, 34 of them) plus its
// research record (learn/atlas.json); the app shows both, so both count here.
//
//   node tools/learn_coverage.js                 summary + every rule broken (exit 1 if any)
//   node tools/learn_coverage.js --json out.json  every page's checklist, for the coverage report
//   node tools/learn_coverage.js --dir other/learn   check a different copy of the content
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const DIR = opt('--dir') || path.join(__dirname, '..', 'learn');
const pages = JSON.parse(fs.readFileSync(path.join(DIR, 'pages.json'), 'utf8'));
const atlas = JSON.parse(fs.readFileSync(path.join(DIR, 'atlas.json'), 'utf8'));
const maps = fs.existsSync(path.join(DIR, 'maps.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'maps.json'), 'utf8')) : {};
const MAPS = maps.maps || maps;

// the base methods (how the fruit comes off) and the add-ons on top of them
const BASE = new Set(['washed', 'natural', 'honey', 'wet-hulled', 'kenyan-soak', 'patio', 'raised-beds', 'slow-dry', 'mechanical', 'monsooned']);
const EXPERIMENTAL = new Set(['anaerobic', 'carbonic', 'co-ferment', 'cold-ferment', 'extended', 'fermentation', 'koji', 'lactic', 'mossto', 'thermal-shock', 'yeast']);
// countries whose coffee is mostly Robusta or tiny: their process lists can be short, but never empty
const keyOf = r => r.kind === 'region' ? `region:${r.id}` : `${r.kind}:${r.id}`;

const W = new Map(), R = new Map();
(pages.entries || []).forEach(e => W.set(`${e.kind}:${e.id}`, e));
(atlas.records || []).forEach(r => R.set(keyOf(r), r));
const keys = [...new Set([...R.keys(), ...W.keys()])].sort();

const has = v => Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : !!(v && String(v).trim());
const secs = (w, r) => [...((w && w.sections) || []), ...((r && r.sections) || [])];
const secHas = (w, r, re) => secs(w, r).some(s => re.test(s.title || ''));

function checklist(key) {
    const w = W.get(key) || null, r = R.get(key) || null, kind = key.split(':')[0];
    const cup = (r && r.cup) || {}, taste = (w && w.taste) || {}, feel = (w && w.feel) || cup.feel;
    const C = {};
    const set = (k, ok) => { C[k] = !!ok; };
    set('lede', has(w && w.lede) || has(r && r.lede));
    set('facts', [...((w && w.facts) || []), ...((r && r.facts) || [])].length >= 3);
    set('cup', has(taste.notes) || has(taste.text) || has(cup.notes) || has(cup.text));
    set('body and acidity', has(feel));
    set('story', ((r && r.story) || []).length >= 3 || secs(w, null).length >= 3);
    set('sections', secs(w, r).length >= 2);
    set('related', has(w && w.related) || has(r && r.related));
    if (kind === 'variety' || kind === 'species') {
        set('family', has(r && r.family) || !!(w && w.family));
        set('the plant', has(r && r.plant));
        set('grown in', has(r && r.grownIn));
        set('why it tastes so', has(cup.why) || has(taste.why));
    } else if (kind === 'process') {
        set('steps', ((r && r.steps) || []).length >= 3);
        set('what stays on while drying', has(r && r.layers));
        set('on different coffees', has(cup.byCoffee));
        set('prized to fault', has(r && r.spectrum));
        set("where it's done", secHas(w, r, /where it.?s done|where it.?s used|who does it/i));
        if (EXPERIMENTAL.has(key.split(':')[1])) { set('on the bag', secHas(w, r, /on the bag|names/i)); set('risks and faults', secHas(w, r, /risk|fault|goes wrong/i)); }
    } else if (kind === 'origin') {
        const g = (w && w.grows) || (r && r.grows) || {};
        set('regions', ((w && w.regions) || (r && r.regions) || []).length >= 2);
        set('harvest', has(w && w.harvest) || has(r && r.harvest));
        set('varieties', has(g.varieties));
        set('processes', has(g.processes));
        set("what's typical", has(g.text));
        set('map', !!(w && w.map) || !!MAPS[key.split(':')[1]]);
    } else if (kind === 'region') {
        const g = (r && r.grows) || {};
        set('altitude', has(r && r.alt));
        set('harvest', has(r && r.harvest));
        set('varieties or processes', has(g.varieties) || has(g.processes));
        set("what's typical", has(g.text));
        set('towns on the bag', has(r && r.places));
        set('outline on the map', has(r && r.area) || has(r && r.map));
    }
    return { key, kind, name: (w && w.name) || (r && r.name) || key, written: !!w, nearest: (r && r.nearest) || '', C };
}

// hard rules: a page that breaks one of these is wrong, not just thin
function rules(key) {
    const w = W.get(key) || null, r = R.get(key) || null, kind = key.split(':')[0], out = [];
    if (kind === 'origin' || kind === 'region') {
        const g = (kind === 'origin' && w && w.grows) || (r && r.grows) || null;
        const pr = (g && g.processes) || [];
        if (kind === 'origin' && !pr.length) out.push('no processes listed');
        if (pr.length && !pr.some(p => BASE.has(p))) out.push(`processes list only add-ons (${pr.join(', ')}), not how most of the coffee is made`);
        const firstBase = pr.findIndex(p => BASE.has(p)), firstExp = pr.findIndex(p => EXPERIMENTAL.has(p));
        if (firstBase >= 0 && firstExp >= 0 && firstExp < firstBase) out.push(`an add-on (${pr[firstExp]}) is listed before the main methods`);
        if (kind === 'origin' && g && (pr.length || (g.varieties || []).length) && !has(g.text)) out.push("lists without a line on what's typical");
    }
    if (kind === 'process' && !secHas(w, r, /where it.?s done|where it.?s used|who does it/i)) out.push("no \"Where it's done\"");
    if ((kind === 'variety' || kind === 'species' || kind === 'process') && r && !checklist(key).C.cup && !r.nearest) out.push('no cup and no pointer to a closer page');
    return out;
}

const all = keys.map(k => ({ ...checklist(k), broken: rules(k) }));
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ at: new Date().toISOString(), pages: all }, null, 1));
const byKind = {};
all.forEach(p => { const b = byKind[p.kind] || (byKind[p.kind] = { pages: 0, full: 0, parts: {} }); b.pages++; const miss = Object.entries(p.C).filter(([, v]) => !v).map(([k]) => k); if (!miss.length) b.full++; Object.entries(p.C).forEach(([k, v]) => { const q = b.parts[k] || (b.parts[k] = [0, 0]); q[v ? 0 : 1]++; }); });
for (const [k, b] of Object.entries(byKind)) {
    console.log(`${k}: ${b.pages} pages, ${b.full} with every part`);
    console.log('   ' + Object.entries(b.parts).map(([n, [y, no]]) => `${n} ${y}/${y + no}`).join(' · '));
}
const bad = all.filter(p => p.broken.length);
console.log(`\nrules broken on ${bad.length} pages`);
bad.forEach(p => console.log(`  ${p.key}: ${p.broken.join('; ')}`));
process.exit(bad.length ? 1 : 0);
