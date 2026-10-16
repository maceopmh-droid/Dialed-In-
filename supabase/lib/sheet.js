// The live Sheet through its public read (<Apps Script URL>?v=2&since=0), as a list of events. Apps Script now and
// then answers with a Google error page instead of data (a busy moment, a timeout), so it tries a few times before
// giving up, and then says what came back (the status and the page's title, never its content).
async function fetchSheet(url, { tries = 4, wait = [5000, 20000, 45000] } = {}) {
  let last = '';
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise(r => setTimeout(r, wait[Math.min(i - 1, wait.length - 1)]));
    try {
      const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'v=2&since=0&t=' + Date.now());
      const text = await res.text();
      try {
        const body = JSON.parse(text);
        const events = Array.isArray(body) ? body : body && Array.isArray(body.events) ? body.events : null;
        if (events) return events;
        last = `${res.status}: JSON without events`;
      } catch (e) {
        const title = (/<title>([^<]{0,120})<\/title>/i.exec(text) || [])[1];
        last = `${res.status} ${res.headers.get('content-type') || ''}: ${title ? 'a web page titled "' + title.trim() + '"' : 'not JSON (' + text.length + ' characters)'}`;
      }
    } catch (e) { last = e.message; }
    console.error(`the Sheet's read didn't give data (try ${i + 1} of ${tries}): ${last}`);
  }
  throw new Error(`the Sheet's public read didn't give data after ${tries} tries (last: ${last})`);
}
module.exports = { fetchSheet };
