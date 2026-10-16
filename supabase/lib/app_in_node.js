// Runs the app's own code from a built index.html inside Node, with just enough of a fake page that its
// replay of the log (app.process) works. Used by the importer so it reads history exactly the way the app does.
const fs = require('fs');
const vm = require('vm');

class El {
  constructor(tag, id) { this.tagName = tag; this.id = id || ''; this.innerHTML = ''; this.innerText = ''; this.className = ''; this.value = ''; this.style = {}; this.attrs = {}; this.dataset = {}; this.children = []; this.classList = { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } }; }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } removeAttribute(k) { delete this.attrs[k]; }
  querySelector() { return new El('div'); } querySelectorAll() { return []; }
  addEventListener() {} removeEventListener() {} contains() { return false; } focus() {} scrollIntoView() {} click() {}
}

function loadApp(htmlFile) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  let script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])[0];
  if (!script) throw new Error('no app script found in ' + htmlFile);
  // The tools want the app's replay of the log, never a backend: once the build has Supabase switched on for everyone
  // (live: true), it's switched off here, so the app behaves the same as on the Sheet (the people you picked, etc.).
  script = script.replace(/(const SUPABASE = \{[^}]*\blive:\s*)true\b/, '$1false');
  const registry = new Map(), local = new Map();
  const document = {
    hidden: false, activeElement: null, body: new El('body'), documentElement: new El('html'),
    getElementById: id => { if (!registry.has(id)) registry.set(id, new El('div', id)); return registry.get(id); },
    createElement: tag => new El(tag), querySelector: () => new El('div'), querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} }, document, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    URLSearchParams, structuredClone, alert() {}, confirm: () => true, prompt: () => null,
    localStorage: { getItem: k => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)), removeItem: k => local.delete(k) },
    matchMedia: () => ({ matches: false, addEventListener() {} }), location: { search: '', pathname: '/' },
    fetch: async () => { throw new Error('the importer never goes online'); },
    Chart: function Chart() { this.destroy = () => {}; this.update = () => {}; },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script + '\n;globalThis.__app = app;', sandbox, { filename: htmlFile });
  if (vm.runInContext('typeof Supa !== "undefined" && Supa.on()', sandbox)) throw new Error('the app in Node is on a backend: the tools need it on none');
  return sandbox.__app;
}

module.exports = { loadApp };
