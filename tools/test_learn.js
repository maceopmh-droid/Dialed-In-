#!/usr/bin/env node
// Learn (v19.0): the recognizer's expected results (the table in the build brief, section 4.2) and the content checks.
//   node tools/test_learn.js            engine + content (learn/*.json)
// Prints one line per failure and a count; exits 1 if anything fails. Uses no one's data.
const fs = require('fs');
const path = require('path');
const L = require('../src/js/07-learn-engine.js');

let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) pass++; else { fail++; console.log('FAIL ' + what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const V = t => L.readVariety(t).ids;
const O = t => L.readOrigin(t);
const P = (t, ctx) => L.readProcess(t, ctx);

// ---- varieties
eq(V('SL-28'), ['sl28'], 'SL-28');
eq(V('S.L. 28'), ['sl28'], 'S.L. 28');
eq(V('SL28 & SL34'), ['sl28', 'sl34'], 'SL28 & SL34');
eq(V('sl 28'), ['sl28'], 'sl 28');
eq(V('Geisha'), ['gesha'], 'Geisha');
eq(L.entry('variety', 'gesha').name, 'Gesha', 'Gesha page name');
eq(V('Colombia'), ['colombia-var'], 'Variety Colombia');
eq(V('Java'), ['java'], 'Variety Java');
eq(L.readVariety('Single Origin').not, 'single-origin', 'Single Origin is not a variety');
eq(V('Single Origin'), [], 'Single Origin: no tag');
eq(V('Arabica'), [], 'Arabica: no variety tag');
eq(L.readVariety('Arabica').species, 'arabica', 'Arabica is the species');
ok(L.field('variety', 'Arabica', { countries: ['ETH'] }).chips.some(c => c.suggestId === 'ethiopian-landrace'), 'Arabica on an Ethiopian coffee suggests Ethiopian landrace');
eq(V('Heirloom'), ['ethiopian-landrace'], 'Heirloom');
eq(V('Ethiopian Heirloom'), ['ethiopian-landrace'], 'Ethiopian Heirloom');
eq(V('Pink Bourbon'), ['pink-bourbon'], 'Pink Bourbon');
eq(V('Bourbon Pink'), ['pink-bourbon'], 'Bourbon Pink');
eq(V('Bourbon Rosado'), ['pink-bourbon'], 'Bourbon Rosado');
eq(V('Bourbon Chiroso'), ['chiroso'], 'Bourbon Chiroso');
eq(V('Bourbon'), ['bourbon'], 'Bourbon');
eq(V('Caturra & Yellow Caturra'), ['caturra'], 'Caturra & Yellow Caturra');
eq(V('Yellow, Red Caturra'), ['caturra'], 'Yellow, Red Caturra');
eq(V('Bourbon & Yellow Caturra'), ['bourbon', 'caturra'], 'Bourbon & Yellow Caturra');
eq(V('74110/74112'), ['74110', '74112'], '74110/74112');
eq(V('Caturra, Colombia, Tabi'), ['caturra', 'colombia-var', 'tabi'], 'Caturra, Colombia, Tabi');
eq(V('Ruiru 11'), ['ruiru-11'], 'Ruiru 11'); eq(V('Ruiru-11'), ['ruiru-11'], 'Ruiru-11'); eq(V('Ruiru11'), ['ruiru-11'], 'Ruiru11');
eq(V('Castillo'), ['castillo'], 'Castillo');
eq(V('Gesha 1931'), ['gesha-1931'], 'Gesha 1931 (longest name first)');
eq(V('Robusta'), [], 'Robusta is a species, not a variety tag'); eq(L.readVariety('Robusta').species, 'robusta', 'Robusta species');
eq(L.readVariety('Espresso').not, 'espresso', 'Espresso is not a variety');
eq(L.readVariety('Blend').not, 'blend', 'Blend is not a variety');
eq(L.readVariety('Cattura').suggest && L.readVariety('Cattura').suggest.id, 'caturra', 'a variety typo is suggested');
eq(V('Cattura'), [], 'a variety typo saves nothing');
eq(V(''), [], 'empty variety');

// ---- origins
eq(O('Colombia').countries, ['COL'], 'Origin Colombia');
eq(O('Java').countries, ['IDN'], 'Origin Java');
const inza = O('Inzá, Colombia');
eq([inza.countries, inza.region, inza.place, inza.blend], [['COL'], 'cauca', 'inza', false], 'Inzá, Colombia');
eq(O('Huila').countries, ['COL'], 'Huila'); eq(O('Yirgacheffe').countries, ['ETH'], 'Yirgacheffe'); eq(O('Sumatra').countries, ['IDN'], 'Sumatra'); eq(O('Brasil').countries, ['BRA'], 'Brasil');
eq(O('Mocha').countries, ['YEM'], 'Mocha in Origin');
eq([O('Colombia & Peru').countries, O('Colombia & Peru').blend], [['COL', 'PER'], true], 'Colombia & Peru');
eq([O('Brasil, Guatemala, Ethiopia').countries, O('Brasil, Guatemala, Ethiopia').blend], [['BRA', 'GTM', 'ETH'], true], 'three countries');
eq(O('Santa Bárbara, Colombia').countries, ['COL'], 'Santa Bárbara, Colombia (the named country wins over a shared name)');
eq(O('Finca El Paraíso, Cauca').countries, ['COL'], 'a farm called El Paraíso in Cauca');
eq(O('Veracruz').countries, ['MEX'], 'Veracruz');
eq([O('South America').countries, O('South America').blend], [[], false], 'a continent names no country');
eq(O('Blend').blend, true, 'Blend in Origin');
eq(O('Ethiopia Yirgacheffe Gedeb').region, 'yirgacheffe', 'Gedeb is Yirgacheffe');
eq(O('Nyeri, Kenya').region, 'nyeri', 'Nyeri');
eq(O('Gatemala').suggest && O('Gatemala').suggest.code, 'GTM', 'an origin typo is suggested');
eq(O('').countries, [], 'empty origin');

// ---- processes
const p = t => { const r = P(t); return [r.base, r.layers]; };
eq(P('Natual').suggest && P('Natual').suggest.id, 'natural', 'Natual suggests Natural');
eq(P('Natual').base, '', 'Natual saves nothing');
eq(p('Washed, Fermented'), ['washed', ['fermentation']], 'Washed, Fermented');
eq(p('Washed long ferment'), ['washed', ['extended']], 'Washed long ferment');
eq(p('72 hour'), ['', ['extended']], '72 hour is a long ferment, not the Kenyan process');
eq(p('120h'), ['', ['extended']], '120h');
eq(p('Kenya process'), ['washed', ['kenyan-soak']], 'Kenya process');
eq(p('Double washed'), ['washed', ['kenyan-soak']], 'Double washed');
eq(p('Double fermented'), ['washed', ['kenyan-soak']], 'Double fermented');
eq(p('Soaked'), ['washed', ['kenyan-soak']], 'Soaked');
eq(p('Anaerobic Natural'), ['natural', ['anaerobic']], 'Anaerobic Natural');
eq(p('Anaerobic'), ['', ['anaerobic']], 'Anaerobic with no base keeps the base unknown');
const wn = P('Washed Natural');
eq([wn.base, wn.ask && wn.ask.kind, wn.ask && wn.ask.options], ['', 'two-bases', ['washed', 'natural']], 'Washed Natural asks');
eq([P('Mixed').base, P('Mixed').layers, P('Mixed').none], ['', [], true], 'Mixed');
eq(P('Mystery').base, '', 'Mystery');
eq(p('Honey'), ['honey', []], 'Honey');
eq([P('Black honey').base, P('Black honey').honey], ['honey', 'black'], 'Black honey');
eq(p('Miel'), ['honey', []], 'Miel');
eq(p('Wet hulled'), ['wet-hulled', []], 'Wet hulled'); eq(p('Giling basah'), ['wet-hulled', []], 'Giling basah');
eq(P('Semi-washed', { countries: ['IDN'] }).base, 'wet-hulled', 'Semi-washed in Indonesia');
eq([P('Semi-washed', { countries: ['BRA'] }).base, P('Semi-washed', { countries: ['BRA'] }).variant], ['washed', 'demucilaged'], 'Semi-washed in Brazil');
eq(P('Semi-washed', { countries: ['KEN'] }).ask && P('Semi-washed', { countries: ['KEN'] }).ask.kind, 'semi-washed', 'Semi-washed elsewhere asks');
eq([P('Pulped natural').base, P('Pulped natural').variant], ['honey', 'pulped-natural'], 'Pulped natural');
eq(P('Cereja descascado').base, 'honey', 'Cereja descascado');
eq(p('Thermal shock'), ['', ['thermal-shock']], 'Thermal shock');
eq([P('Co-fermented with passion fruit').layers, P('Co-fermented with passion fruit').added], [['co-ferment'], true], 'Co-fermented with passion fruit');
eq(P('infused').added, true, 'infused');
eq([P('Swiss Water').decaf, P('Swiss Water').base], ['swiss-water', ''], 'Swiss Water is decaf, not a process');
eq(P('Sugarcane decaf').decaf, 'sugarcane', 'Sugarcane decaf'); eq(P('EA').decaf, 'sugarcane', 'EA');
eq([P('G1').grade, P('G1').base], [['G1'], ''], 'G1 is a grade'); eq(P('Grade 1').grade, ['GRADE 1'], 'Grade 1');
eq(P('AA').grade, ['AA'], 'AA'); eq(P('SHB').grade, ['SHB'], 'SHB'); eq(P('Washed AA').grade, ['AA'], 'Washed AA has a grade');
eq(p('Washed AA'), ['washed', []], 'Washed AA is washed');
eq(p('Carbonic maceration'), ['', ['carbonic']], 'Carbonic maceration'); eq(P('Carbonic maceration').decaf, '', 'CO2 maceration is not decaf');
eq(p(''), ['', []], 'empty process');
eq(p('Natural'), ['natural', []], 'Natural'); eq(p('Washed'), ['washed', []], 'Washed');

// ---- a whole coffee
const t = L.read({ variety: 'Caturra', origin: 'Colombia', process: 'Washed, Fermented', roast: 'Light' });
eq([t.variety, t.origin.countries, t.process.base, t.process.layers, t.roast], [['caturra'], ['COL'], 'washed', ['fermentation'], 'light'], 'read a coffee');
eq(L.read({ kind: 'tea', variety: 'SL28', origin: 'Kenya' }).variety, [], 'tea mode: the recognizer is off');
eq(L.field('variety', 'SL28', { tea: true }).chips, [], 'tea mode: no chips');
eq(L.read({}).variety, [], 'an empty coffee');
// Keep as typed: the question isn't asked again for the same text
eq(L.read({ process: 'Natual', learnKeep: { process: 'Natual' } }).processSuggest, null, 'Keep as typed stops the question');
ok(!!L.read({ process: 'Washd', learnKeep: { process: 'Natual' } }).processSuggest, 'a new typo asks again');
const s = L.store({ variety: 'SL28 & SL34', origin: 'Nyeri, Kenya', process: 'Washed', learnKeep: { process: 'x' } });
eq([s.v, s.variety, s.origin.countries, s.origin.region, s.process.base, s.keep], [L.VERSION, ['sl28', 'sl34'], ['KEN'], 'nyeri', 'washed', { process: 'x' }], 'the server copy');
eq(L.store({ kind: 'tea' }), null, 'teas have no server copy');
// the decode
const d1 = L.decode({ variety: 'Caturra', origin: 'Colombia', process: 'Washed', roast: 'Light' });
ok(/^A light-roasted Colombian Caturra\./.test(d1), 'decode: ' + d1);
const d2 = L.decode({ variety: 'Caturra, Colombia, Tabi', origin: 'Inzá, Colombia', process: 'Washed' });
ok(/^A Colombian coffee of three varieties from Inzá, in Cauca\./.test(d2) && /Colombia and Tabi were bred in Colombia/.test(d2), 'decode: ' + d2);
const d3 = L.decode({ variety: 'Arabica', origin: 'Ethiopia', process: 'Washed' });
ok(/species, not a variety\. In Ethiopia/.test(d3), 'decode Arabica in Ethiopia: ' + d3);
const d4 = L.decode({ origin: 'Colombia, Ethiopia, Nicaragua' });
ok(/a blend from Colombia, Ethiopia and Nicaragua/.test(d4), 'decode a blend: ' + d4);
ok(L.decode({}) === 'A coffee.', 'decode an empty coffee: ' + L.decode({}));
// every phrase the decode can say has a source
Object.entries(L.SAY).forEach(([id, [, src]]) => ok(!!L.SRC[src], `SAY ${id} has a source`));
Object.entries(L.PSAY).forEach(([id, [, src]]) => ok(!!L.SRC[src], `PSAY ${id} has a source`));
// country codes exist in the world map (Hawaii is a dot)
const world = fs.readFileSync(path.join(__dirname, '../src/js/05-world-map.js'), 'utf8');
L.allCountries().forEach(c => ok(c.code === 'HI' || new RegExp(`\\b${c.code}: "M`).test(world) || ['JAM', 'PRI', 'CUB', 'HTI', 'DOM', 'MYS', 'SLE', 'SDS', 'TLS', 'LKA', 'TWN', 'MDG', 'CIV', 'NPL', 'LAO', 'MMR', 'PHL'].includes(c.code) && new RegExp(`\\b${c.code}\\b`).test(world), `country ${c.code} is on the world map`));
// no two aliases normalize to the same text within one field with different meanings (checked by the build: first wins)

// ---- content (learn/*.json)
const dir = path.join(__dirname, '../learn');
if (fs.existsSync(path.join(dir, 'manifest.json'))) {
  const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  ok(Number.isInteger(man.version) && man.version > 0, 'manifest has a version');
  const SRC = JSON.parse(fs.readFileSync(path.join(dir, 'sources.json'), 'utf8')).sources;
  Object.entries(SRC).forEach(([id, s2]) => ok(/^https?:\/\//.test(s2.url || '') && s2.title && s2.publisher, `source ${id} has a title, publisher and link`));
  const used = new Set(), ids = new Set(), LABELS = ['proven', 'tendency', 'trade', 'anecdotal', 'unproven'];
  const files = (man.files || []).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const check = (k, owner, list, where) => {
    ok(Array.isArray(list) && list.length > 0, `${k} ${where} has a source`);
    (list || []).forEach(s3 => { ok(!!SRC[s3], `${k} ${where} source ${s3} exists`); ok((owner.sources || []).includes(s3), `${k} ${where} source ${s3} is in the page's Sources`); used.add(s3); });
  };
  const neverSay = (k, e) => {
    const text = JSON.stringify(e);
    ok(!/\b(?:grind|setting) (?:it )?(?:at|to|on) \d/i.test(text), `${k} names no grind number`);
    ok(!/altitude makes|denser beans|ripen(?:s|ing)? slower/i.test(text), `${k} doesn't say altitude makes beans denser or slower`);
    ok(!/arabica is a variety/i.test(text), `${k} doesn't call Arabica a variety`);
    ok(!/every F1 is cloned/i.test(text), `${k} doesn't say every F1 is cloned`);
    ok(!/(?:chiroso|bourbon aj[ií]) (?:is|are) (?:an )?ethiopian/i.test(text), `${k} doesn't say Chiroso or Bourbon Ají are Ethiopian`);
  };
  files.forEach(j => {
    (j.entries || []).forEach(e => {
      const k = `${e.kind}:${e.id}`;
      ok(!ids.has(k), `id ${k} is unique`); ids.add(k);
      ['id', 'kind', 'name', 'summary', 'lede', 'kicker', 'updated'].forEach(f2 => ok(!!e[f2], `${k} has ${f2}`));
      ok(Array.isArray(e.sources) && e.sources.length > 0, `${k} has sources`);
      check(k, e, e.ledeSrc, 'lede');
      (e.facts || []).forEach((f3, i) => check(k, e, f3.src, `fact ${i + 1}`));
      if (e.taste) { check(k, e, e.taste.src, 'taste'); ok(LABELS.includes(e.taste.label), `${k} taste has an honesty label`); (e.taste.notes || []).forEach(n => ok(typeof n === 'string' && n.length > 1, `${k} note ${n}`)); }
      (e.sections || []).forEach(s4 => { check(k, e, s4.src, `section ${s4.key}`); ok(!!s4.title && !!s4.teaser && Array.isArray(s4.body), `${k} section ${s4.key} has a title, teaser and body`); });
      (e.myths || []).forEach((m, i) => { check(k, e, m.src, `myth ${i + 1}`); ok(LABELS.includes(m.label), `${k} myth ${i + 1} has a label`); });
      (e.steps || []).forEach((s5, i) => check(k, e, s5.src, `step ${i + 1}`));
      if (e.stepsText) check(k, e, e.stepsText.src, 'how it is done');
      (e.kinds || []).forEach(kd => { ok(!!kd.id && !!kd.text, `${k} kind ${kd.id}`); check(k, e, kd.src, `kind ${kd.id}`); });
      (e.tips || []).forEach((tp, i) => { check(k, e, tp.src, `tip ${i + 1}`); ok(LABELS.includes(tp.label), `${k} tip ${i + 1} has a label`); });
      (e.regions || []).forEach(r => check(k, e, r.src, `region ${r.id}`));
      (e.harvest || []).forEach(h => { check(k, e, h.src, `harvest ${h.area}`); (h.main || []).concat(h.second || [], h.peak || []).forEach(m => ok(Number.isInteger(m) && m >= 1 && m <= 12, `${k} harvest month ${m} is 1 to 12`)); });
      if (e.harvestText) check(k, e, e.harvestText.src, 'harvest text');
      if (e.grows) check(k, e, e.grows.src, 'what grows here');
      if (e.mapSrc) check(k, e, e.mapSrc, 'map');
      if (e.kind === 'origin') ok(L.allCountries().some(c => c.code === e.country), `${k} country ${e.country} is known`);
      if (e.kind === 'variety') ok(!!L.entry('variety', e.id), `${k} is a recognized variety`);
      if (e.kind === 'process') ok(!!L.entry('process', e.id), `${k} is a recognized process`);
      if (e.taste && e.taste.typicalShape) Object.entries(e.taste.typicalShape).forEach(([sk, sv]) => ok(['acidity', 'sweetness', 'body', 'finish', 'bitterness', 'balance'].includes(sk) && sv >= 1 && sv <= 10, `${k} typical ${sk}`));
      if (e.grows) (e.grows.varieties || []).forEach(v => ok(!!L.entry('variety', v), `${k} grows ${v}, a known variety`));
      if (e.grows) (e.grows.processes || []).forEach(v => ok(!!L.entry('process', v), `${k} grows ${v}, a known process`));
      (e.regions || []).forEach(r => ok(L.knownIds().region.includes(r.id), `${k} region ${r.id} is known to the recognizer`));
      (e.sources || []).forEach(s6 => ok(!!SRC[s6], `${k} lists source ${s6}`));
      neverSay(k, e);
    });
    (j.guides || []).forEach(g => {
      const k = `guide:${g.id}`; ok(!ids.has(k), `${k} unique`); ids.add(k);
      ['id', 'name', 'kicker', 'lede', 'teaser', 'updated'].forEach(f2 => ok(!!g[f2], `${k} has ${f2}`));
      (g.rows || g.steps || []).forEach((r, i) => { if (r.app) return; check(k, g, r.src, `row ${i + 1}`); if (r.label) ok(LABELS.includes(r.label), `${k} row ${i + 1} label`); });
      neverSay(k, g);
    });
    if (j.fresh) (j.fresh.countries || []).forEach(c => { ok(L.allCountries().some(x => x.code === c.code), `fresh ${c.code} is a known country`); ok(Array.isArray(c.src) && c.src.every(s7 => !!SRC[s7]), `fresh ${c.code} has a source`); (c.harvest || []).concat(c.arrive || []).forEach(m => ok(m >= 1 && m <= 12, `fresh ${c.code} month ${m}`)); });
    if (j.tree) {
      const t = j.tree, k = 'tree';
      check(k, t, t.ledeSrc, 'lede');
      (t.stages || []).forEach(s9 => { check(k, t, s9.src, `stage ${s9.id}`); ok(!!(s9.title && s9.kicker && s9.text), `tree stage ${s9.id} has a title, kicker and text`); (s9.members || []).forEach(v => ok(!!L.entry('variety', v), `tree stage ${s9.id}: ${v} is a known variety`)); if (s9.family) ok(!!L.FAMILY[s9.family], `tree stage ${s9.id}: family ${s9.family} is the recognizer's`); });
      if (t.species) check(k, t, t.species.src, 'species');
      neverSay(k, t);
    }
    if (j.processMap) {
      const pm = j.processMap, k = 'process map';
      check(k, pm, pm.ledeSrc, 'lede'); if (pm.note) check(k, pm, pm.noteSrc, 'note');
      (pm.dots || []).forEach(d => { ok(!!L.entry('process', d.id), `process map dot ${d.id} is a known process`); ok(d.x >= 0 && d.x <= 340 && d.y >= 0 && d.y <= 250, `process map dot ${d.id} is on the map`); });
    }
    if (j.maps) Object.entries(j.maps).forEach(([c, m]) => { ok(m.w > 0 && m.h > 0 && /^M/.test(m.outline), `map ${c} has an outline`); (m.dots || []).forEach(d => ok(/^https?:\/\//.test(d.src), `map ${c} dot ${d.id} has a source`)); });
  });
  (man.pages || []).forEach(pg => ok(ids.has(pg), `manifest page ${pg} exists`));
  (man.guides || []).forEach(pg => ok(ids.has('guide:' + pg), `manifest guide ${pg} exists`));
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
