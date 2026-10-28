// The files the iPhone app carries inside it: the same ones GitHub Pages serves (the app opens offline with them).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..'), www = path.join(__dirname, '..', 'www');
fs.rmSync(www, { recursive: true, force: true }); fs.mkdirSync(www, { recursive: true });
for (const f of ['index.html', 'icon.png', 'terms.html', 'privacy.html', 'support.html']) fs.copyFileSync(path.join(root, f), path.join(www, f));
// v19.0: Learn's words (the app opens with this copy, offline too; a newer one from the website replaces it)
if (fs.existsSync(path.join(root, 'learn'))) fs.cpSync(path.join(root, 'learn'), path.join(www, 'learn'), { recursive: true });
const v = (fs.readFileSync(path.join(www, 'index.html'), 'utf8').match(/<meta name="dialed-in-version" content="([\d.]+)">/) || [])[1] || '0';
fs.writeFileSync(path.join(www, 'version.txt'), v + '\n');
console.log(`www: index.html v${v}, icon, terms, privacy, help`);
