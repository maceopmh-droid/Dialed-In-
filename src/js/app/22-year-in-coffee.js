            // ===================== Year in Coffee story (v12.0) =====================
            yearCoverHtml(user, year) {
                const mine = user === this.user;
                return `<button type="button" class="yic-cover" style="--uc:${this.esc(this.getUserColor(user))}" data-name="${this.esc(user)}" onclick="app.openWrapped(this.getAttribute('data-name'), ${Number(year)})">
                    <span class="yic-cover-year">${Number(year)}</span>
                    <span class="yic-cover-text"><span class="yic-cover-title">${mine ? 'Play your' : `Play ${this.esc(user)}'s`} Year in Coffee</span><span class="yic-cover-sub">${mine ? 'Your' : 'Their'} year in stories, then the whole crew's</span></span>
                    <span class="yic-play"><svg class="icon"><use href="#i-play"/></svg></span>
                </button>`;
            },

            wrappedData(user, year) {
                const [a, b] = [new Date(year, 0, 1).getTime(), new Date(year + 1, 0, 1).getTime()];
                const all = this.sessionsBetween(a, b).sort((u, v) => this.localTime(u.date) - this.localTime(v.date));
                const owner = x => this.getBrewOwner(x);
                const mine = all.filter(x => owner(x) === user);
                const D = { user, year, color: this.getUserColor(user), count: mine.length };
                if (!mine.length) return D;
                const countBy = (rows, fn) => { const m = new Map(); rows.forEach(x => { const k = fn(x); if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((p, q) => q[1] - p[1] || String(p[0]).localeCompare(String(q[0]))); };
                const beanOf = x => this.beans.get(String(x.beanId));
                const ratingOf = x => this.normalizeRating(x.rating);
                const people = countBy(all, owner);
                D.people = people;
                D.rank = people.findIndex(p => p[0] === user) + 1;
                const days = [...new Set(mine.map(x => this.dayNum(this.localTime(x.date))))].sort((p, q) => p - q);
                D.days = days.length;
                let best = 0, run = 0, prev = null, runStart = null, bestStart = null, bestEnd = null;
                days.forEach(d => { if (prev !== null && d === prev + 1) run++; else { run = 1; runStart = d; } if (run > best) { best = run; bestStart = runStart; bestEnd = d; } prev = d; });
                D.streak = { days: best, from: bestStart !== null ? new Date(bestStart * 864e5) : null, to: bestEnd !== null ? new Date(bestEnd * 864e5) : null };
                D.grams = mine.reduce((s, x) => s + this.num(x.dose), 0);
                D.out = mine.reduce((s, x) => s + this.num(x.yield), 0);
                const isEsp = x => /espresso/i.test(String(x.method || ''));
                const inHours = x => { const prof = METHOD_PROFILES[x.method]; return !!(prof && prof.hours); };
                const secsOf = rows => rows.reduce((s, x) => { const t = this.num(x.time); return s + (!inHours(x) && t > 0 && t < 3600 ? t : 0); }, 0);
                D.secs = secsOf(mine);
                D.shots = mine.filter(isEsp).length;
                D.espOut = mine.filter(isEsp).reduce((s, x) => s + this.num(x.yield), 0);
                D.water = mine.filter(x => !isEsp(x)).reduce((s, x) => s + this.num(x.yield), 0);
                // coffees
                const byCoffee = countBy(mine, x => this.groupKeyOfBrew(x));
                D.coffees = byCoffee.length;
                D.topCoffees = byCoffee.slice(0, 5).map(([k, n]) => {
                    const rows = mine.filter(x => this.groupKeyOfBrew(x) === k), bean = beanOf(rows[0]);
                    const r = rows.map(ratingOf).filter(v => v > 0);
                    return { name: bean ? String(bean.name || '').trim() || this.beanLabel(bean) : 'Coffee', roaster: bean ? String(bean.roaster || '').trim() : '', count: n, avg: r.length ? r.reduce((s, v) => s + v, 0) / r.length : 0 };
                });
                D.origins = countBy(mine, x => { const o = String(this.originOf(x) || '').trim(); return o ? o.charAt(0).toUpperCase() + o.slice(1) : ''; });
                D.roasters = countBy(mine, x => { const bn = beanOf(x); return bn ? String(bn.roaster || '').trim() : ''; });
                D.methods = countBy(mine, x => String(x.method || '').trim());
                // rhythm
                D.months = Array.from({ length: 12 }, (_, i) => mine.filter(x => new Date(this.localTime(x.date)).getMonth() === i).length);
                D.peakMonth = D.months.indexOf(Math.max(...D.months));
                const wd = countBy(mine, x => String(new Date(this.localTime(x.date)).getDay() + 1));
                D.weekday = wd.length ? Number(wd[0][0]) - 1 : null;
                const hours = countBy(mine, x => { const h = this.sessionHour(x); return h === null ? '' : String(h + 1); });
                D.hour = hours.length ? Number(hours[0][0]) - 1 : null;
                const early = mine.filter(x => { const h = this.sessionHour(x); return h !== null && h >= 4 && h < 9; }).length;
                const late = mine.filter(x => { const h = this.sessionHour(x); return h !== null && (h >= 21 || h < 4); }).length;
                // ratings
                const rated = mine.filter(x => ratingOf(x) > 0);
                D.rated = rated.length;
                D.avg = rated.length ? rated.reduce((s, x) => s + ratingOf(x), 0) / rated.length : 0;
                D.fives = rated.filter(x => ratingOf(x) >= 5).length;
                const likesOf = x => (Array.isArray(x.likes) ? x.likes.filter(n => String(n || '').trim() && String(n).trim() !== owner(x)).length : 0);
                if (rated.length) {
                    const top = Math.max(...rated.map(ratingOf));
                    const shot = rated.filter(x => ratingOf(x) === top).sort((p, q) => likesOf(q) - likesOf(p) || this.localTime(p.date) - this.localTime(q.date))[0];
                    const photo = this.normalizePhoto(shot.photo);
                    const fb = photo ? this.buildDriveFallbackUrls(photo.fileId || this.extractDriveFileId(photo.url), photo.url) : [];
                    D.best = { rating: top, bean: beanOf(shot), date: shot.date, dose: this.num(shot.dose), yld: this.num(shot.yield), time: this.num(shot.time), grind: this.grindText(shot.grind), method: shot.method || '', notes: String(this.getBrewNotes(shot) || '').trim(), photo: fb[0] || (photo ? photo.url : ''), likes: likesOf(shot) };
                }
                // taste
                const tasted = mine.filter(x => this.tastedKeys(x).length);
                if (tasted.length >= 4) {
                    const vals = {}, seen = {};
                    TASTE_KEYS.forEach(k => { const v = tasted.map(x => this.tasteValue(x, k)).filter(v => v !== null); seen[k] = v.length; vals[k] = v.length ? v.reduce((s, n) => s + n, 0) / v.length : 5; });
                    const label = k => (TASTE_META.find(m => m[0] === k) || [k, k])[1];
                    const ranked = TASTE_KEYS.filter(k => seen[k] >= 3 && k !== 'bitterness').sort((p, q) => vals[q] - vals[p]);
                    D.taste = { vals, n: tasted.length, top: ranked[0] ? { key: ranked[0], label: label(ranked[0]), v: vals[ranked[0]] } : null };
                }
                D.notes = countBy(mine.flatMap(x => this.extractFlavors(x).map(n => ({ n }))), o => { const t = String(o.n || '').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : ''; });
                // dial-in
                let changes = 0; const lastGrind = new Map(), perCoffee = new Map();
                mine.forEach(x => {
                    const k = this.groupKeyOfBrew(x), g = this.grindText(x.grind);
                    if (g && lastGrind.has(k) && !this.sameGrind(lastGrind.get(k), g)) changes++;
                    if (g) lastGrind.set(k, g);
                    const c = perCoffee.get(k) || { n: 0, hit: 0, bean: beanOf(x) };
                    c.n++; if (!c.hit && ratingOf(x) >= 4.5) c.hit = c.n;
                    perCoffee.set(k, c);
                });
                D.grindChanges = changes;
                const hits = [...perCoffee.values()].filter(c => c.hit);
                D.fastest = hits.length ? hits.sort((p, q) => p.hit - q.hit || q.n - p.n)[0] : null;
                const chased = [...perCoffee.values()].sort((p, q) => q.n - p.n)[0];
                D.chased = chased && chased.n >= 5 ? chased : null;
                const goodEsp = mine.filter(x => /espresso/i.test(String(x.method || '')) && ratingOf(x) >= 4 && this.num(x.dose) > 0 && this.num(x.yield) > 0 && this.num(x.time) > 0);
                if (goodEsp.length >= 3) {
                    const med = arr => { const s = [...arr].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
                    D.sweet = { ratio: med(goodEsp.map(x => this.num(x.yield) / this.num(x.dose))), time: med(goodEsp.map(x => this.num(x.time))), n: goodEsp.length };
                }
                // social
                const inYear = ts => { const t = this.localTime(ts); return t >= a && t < b; };
                D.likesGiven = all.filter(x => owner(x) !== user && Array.isArray(x.likes) && x.likes.map(n => String(n).trim()).includes(user)).length;
                D.likesGot = mine.reduce((s, x) => s + likesOf(x), 0);
                let said = 0, heard = 0;
                [...this.brews.values(), ...this.beans.values()].forEach(x => this.normalizeCommentList(x.comments, `wr-${x.id}`, x.date).forEach(c => { if (!inYear(c.timestamp)) return; if (c.user === user) said++; else if ((x.beanId !== undefined ? owner(x) : String(x.user || '')) === user) heard++; }));
                D.commentsMade = said; D.commentsGot = heard;
                const myKeys = new Set(mine.map(x => this.groupKeyOfBrew(x)));
                const shared = new Map();
                all.forEach(x => { const o = owner(x); if (o !== user && myKeys.has(this.groupKeyOfBrew(x))) { if (!shared.has(o)) shared.set(o, new Set()); shared.get(o).add(this.groupKeyOfBrew(x)); } });
                const buddy = [...shared.entries()].sort((p, q) => q[1].size - p[1].size || p[0].localeCompare(q[0]))[0];
                D.buddy = buddy ? { name: buddy[0], coffees: buddy[1].size } : null;
                // monthly awards
                const won = new Map(); let champMonths = [];
                const race = new Map();
                for (let m = 0; m < 12; m++) {
                    const key = `${year}-${String(m + 1).padStart(2, '0')}`;
                    if (this.monthLocked(key)) break;
                    const aw = this.crewAwardsMemo(year, m);
                    aw.forEach(x => x.winners.forEach(n => race.set(n, (race.get(n) || 0) + 1)));
                    aw.filter(x => x.winners.includes(user)).forEach(x => { const e = won.get(x.key) || { title: x.title, icon: x.icon, color: x.color, n: 0 }; e.n++; won.set(x.key, e); });
                    const st = this.awardStandings(aw);
                    if (st.length && st[0][0] === user && (st.length === 1 || st[1][1] < st[0][1])) champMonths.push(m);
                }
                D.awards = [...won.values()].sort((p, q) => q.n - p.n || p.title.localeCompare(q.title));
                D.awardCount = D.awards.reduce((s, x) => s + x.n, 0);
                D.champMonths = champMonths;
                D.race = [...race.entries()].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0]));
                // personality: the trait where you lead the crew by the most
                const traitOf = (rows, who) => {
                    const r = rows.filter(x => ratingOf(x) > 0);
                    let ch = 0; const lg = new Map(); rows.forEach(x => { const k = this.groupKeyOfBrew(x), g = this.grindText(x.grind); if (g && lg.has(k) && !this.sameGrind(lg.get(k), g)) ch++; if (g) lg.set(k, g); });
                    const coffeesN = new Set(rows.map(x => this.groupKeyOfBrew(x))).size;
                    const topShare = rows.length ? Math.max(...countBy(rows, x => this.groupKeyOfBrew(x)).map(e => e[1])) / rows.length : 0;
                    const hr = rows.map(x => this.sessionHour(x)).filter(h => h !== null);
                    const social = all.filter(x => owner(x) !== who && Array.isArray(x.likes) && x.likes.map(n => String(n).trim()).includes(who)).length;
                    return {
                        tinkerer: rows.length ? ch / rows.length : 0,
                        explorer: rows.length ? coffeesN / Math.sqrt(rows.length) : 0,
                        loyalist: topShare,
                        early: hr.length ? hr.filter(h => h >= 4 && h < 9).length / hr.length : 0,
                        owl: hr.length ? hr.filter(h => h >= 21 || h < 4).length / hr.length : 0,
                        perfectionist: r.length >= 5 ? r.filter(x => ratingOf(x) >= 4.5).length / r.length : 0,
                        critic: r.length >= 5 ? 5 - r.reduce((s, x) => s + ratingOf(x), 0) / r.length : 0,
                        social: rows.length ? social / rows.length : 0
                    };
                };
                const crewTraits = people.filter(p => p[1] >= 5).map(([n]) => [n, traitOf(all.filter(x => owner(x) === n), n)]);
                const mineT = traitOf(mine, user);
                const P = {
                    tinkerer: ['The Tinkerer', 'You never leave a dial alone. More grind changes per session than anyone, chasing the next half star.'],
                    explorer: ['The Explorer', 'New bag, new adventure. You worked through more different coffees than the rest of the crew.'],
                    loyalist: ['The Loyalist', 'When you find the one, you stay. Your favorite coffee owned your year.'],
                    early: ['The Early Bird', 'First light, first shot. More of your coffee happened before 9 am than anyone else\'s.'],
                    owl: ['The Night Owl', 'Espresso after dark doesn\'t scare you. Your grinder works the late shift.'],
                    perfectionist: ['The Perfectionist', 'You don\'t settle. A bigger share of your shots hit 4.5★ or better than anyone\'s.'],
                    critic: ['The Critic', 'Stars from you are earned. Toughest ratings in the crew, and everyone knows it.'],
                    social: ['The Hype Machine', 'You show up for everyone else\'s coffee. Most likes handed out per session.']
                };
                let pick = null, margin = -Infinity;
                Object.keys(P).forEach(k => {
                    const vals = crewTraits.map(([, t]) => t[k]);
                    const others = crewTraits.filter(([n]) => n !== user).map(([, t]) => t[k]);
                    if (!(mineT[k] > 0)) return;
                    const spread = Math.max(...vals, mineT[k]) - Math.min(...vals, mineT[k]) || 1;
                    const lead = (mineT[k] - (others.length ? Math.max(...others) : 0)) / spread;
                    if (lead > margin) { margin = lead; pick = k; }
                });
                D.persona = pick ? { key: pick, title: P[pick][0], text: P[pick][1] } : { key: 'daily', title: 'The Daily Grinder', text: 'Steady, every week. Coffee is part of how your days go.' };
                // the crew
                const C = { sessions: all.length, grams: all.reduce((s, x) => s + this.num(x.dose), 0), coffees: new Set(all.map(x => this.groupKeyOfBrew(x))).size, origins: new Set(all.map(x => String(this.originOf(x) || '').toLowerCase()).filter(Boolean)).size, people };
                C.fives = people.map(([n]) => [n, all.filter(x => owner(x) === n && ratingOf(x) >= 5).length]);
                let goals = 0;
                for (let t = this.weekStartOf(a) + 3 * 864e5; t < Math.min(b, Date.now()); t += 7 * 864e5) { const ws = this.weekStartOf(t); if (ws + 7 * 864e5 > Date.now()) break; const q = this.crewQuest(t); if (q.done) goals++; }
                C.goals = goals;
                // the crew's coffee: the most-brewed one that more than one of you brewed (else simply the most-brewed)
                const byGroup = countBy(all, x => this.groupKeyOfBrew(x));
                const sharedTop = byGroup.find(([k]) => new Set(all.filter(x => this.groupKeyOfBrew(x) === k).map(owner)).size > 1);
                const crewCoffee = sharedTop || byGroup[0];
                if (crewCoffee) {
                    const rows = all.filter(x => this.groupKeyOfBrew(x) === crewCoffee[0]);
                    C.coffee = { bean: beanOf(rows[0]), n: crewCoffee[1], who: [...new Set(rows.map(owner))].sort() };
                }
                const loved = countBy(all, x => this.groupKeyOfBrew(x)).map(([k]) => { const r = all.filter(x => this.groupKeyOfBrew(x) === k).map(ratingOf).filter(v => v > 0); return { k, n: r.length, avg: r.length ? r.reduce((s, v) => s + v, 0) / r.length : 0 }; }).filter(e => e.n >= 5).sort((p, q) => q.avg - p.avg)[0];
                if (loved) C.loved = { bean: beanOf(all.find(x => this.groupKeyOfBrew(x) === loved.k)), avg: loved.avg, n: loved.n };
                // the year's awards
                const yearly = [];
                const lead = (pairs, min = 1, low = false) => { const rows = pairs.filter(p => low ? Number.isFinite(p[1]) : p[1] >= min); if (!rows.length) return null; const v = low ? Math.min(...rows.map(p => p[1])) : Math.max(...rows.map(p => p[1])); const names = rows.filter(p => Math.abs(p[1] - v) < 1e-9).map(p => p[0]).sort(); return names.length > 2 ? null : { names, v }; };
                const ppl = people.map(p => p[0]);
                const per = fn => ppl.map(n => [n, fn(all.filter(x => owner(x) === n), n)]);
                const award = (title, icon, color, res, stat) => { if (res) yearly.push({ title, icon, color, winners: res.names, stat: stat(res.v) }); };
                award('Brewer of the Year', 'i-coffee', '#8A6240', lead(per(r => r.length), 10), v => `${v} sessions`);
                const allRated = all.filter(x => ratingOf(x) > 0);
                if (allRated.length) {
                    const top = Math.max(...allRated.map(ratingOf));
                    const shot = allRated.filter(x => ratingOf(x) === top).sort((p, q) => likesOf(q) - likesOf(p) || this.localTime(p.date) - this.localTime(q.date))[0];
                    const bn = beanOf(shot);
                    yearly.push({ title: 'Shot of the Year', icon: 'i-medal', color: '#C49A2C', winners: [owner(shot)], stat: `${this.fmtNum(top)}★ · ${bn ? String(bn.name || '').trim() || this.beanLabel(bn) : 'a coffee'}, ${this.shortDate(shot.date)}` });
                }
                award('Award Champion', 'i-crown', '#E3AE45', lead(D.race, 2), v => `${v} monthly awards`);
                award('Explorer of the Year', 'i-compass', '#5F8FDB', lead(per(r => new Set(r.map(x => this.groupKeyOfBrew(x))).size), 3), v => `${v} different coffees`);
                award('Palate of the Year', 'i-leaf-line', '#A06F98', lead(per(r => new Set(r.flatMap(x => this.extractFlavors(x).map(n => n.toLowerCase()))).size), 5), v => `${v} different tasting notes`);
                award('Iron Streak', 'i-flame', '#E0663A', lead(per(r => { const ds = [...new Set(r.map(x => this.dayNum(this.localTime(x.date))))].sort((p, q) => p - q); let bst = 0, rn = 0, pv = null; ds.forEach(d => { rn = pv !== null && d === pv + 1 ? rn + 1 : 1; bst = Math.max(bst, rn); pv = d; }); return bst; }), 4), v => `${v} days in a row`);
                award('Crowd Favorite', 'i-award', '#D45D8A', lead(per(r => r.reduce((s, x) => s + likesOf(x), 0)), 5), v => `${v} likes received`);
                const improve = per(r => { const rr = r.filter(x => ratingOf(x) > 0); if (rr.length < 10) return -Infinity; const h = Math.floor(rr.length / 2); const avg = xs => xs.reduce((s, x) => s + ratingOf(x), 0) / xs.length; return Math.round((avg(rr.slice(h)) - avg(rr.slice(0, h))) * 10) / 10; });
                award('Most Improved', 'i-trend', '#2E9E6B', lead(improve, 0.2), v => `+${this.fmtNum(v, 1)}★ from the first half of the year to the second`);
                C.yearly = yearly;
                // ---- everyone combined, the same depth as the personal slides
                C.days = new Set(all.map(x => this.dayNum(this.localTime(x.date)))).size;
                C.secs = secsOf(all);
                C.shots = all.filter(isEsp).length;
                C.espOut = all.filter(isEsp).reduce((s, x) => s + this.num(x.yield), 0);
                C.water = all.filter(x => !isEsp(x)).reduce((s, x) => s + this.num(x.yield), 0);
                C.methods = countBy(all, x => String(x.method || '').trim());
                C.originList = countBy(all, x => { const o = String(this.originOf(x) || '').trim(); return o ? o.charAt(0).toUpperCase() + o.slice(1) : ''; });
                C.roasters = countBy(all, x => { const bn = beanOf(x); return bn ? String(bn.roaster || '').trim() : ''; });
                C.topCoffees = byGroup.slice(0, 5).map(([k, n]) => { const rows = all.filter(x => this.groupKeyOfBrew(x) === k), bn = beanOf(rows[0]); const r = rows.map(ratingOf).filter(v => v > 0); return { name: bn ? String(bn.name || '').trim() || this.beanLabel(bn) : 'Coffee', roaster: bn ? String(bn.roaster || '').trim() : '', count: n, who: [...new Set(rows.map(owner))].sort(), avg: r.length ? r.reduce((s, v) => s + v, 0) / r.length : 0 }; });
                C.months = Array.from({ length: 12 }, (_, i) => all.filter(x => new Date(this.localTime(x.date)).getMonth() === i).length);
                C.peakMonth = C.months.indexOf(Math.max(...C.months));
                const cwd = countBy(all, x => String(new Date(this.localTime(x.date)).getDay() + 1));
                C.weekday = cwd.length ? Number(cwd[0][0]) - 1 : null;
                const chr = countBy(all, x => { const h = this.sessionHour(x); return h === null ? '' : String(h + 1); });
                C.hour = chr.length ? Number(chr[0][0]) - 1 : null;
                const busy = countBy(all, x => this.dayKey(this.localTime(x.date)))[0];
                C.busiest = busy ? { key: busy[0], n: busy[1], who: [...new Set(all.filter(x => this.dayKey(this.localTime(x.date)) === busy[0]).map(owner))].sort() } : null;
                const cdays = [...new Set(all.map(x => this.dayNum(this.localTime(x.date))))].sort((p, q) => p - q);
                let cb = 0, cr = 0, cp = null, cs = null, cbs = null, cbe = null;
                cdays.forEach(d => { if (cp !== null && d === cp + 1) cr++; else { cr = 1; cs = d; } if (cr > cb) { cb = cr; cbs = cs; cbe = d; } cp = d; });
                C.streak = { days: cb, from: cbs !== null ? new Date(cbs * 864e5) : null, to: cbe !== null ? new Date(cbe * 864e5) : null };
                const cRated = all.filter(x => ratingOf(x) > 0);
                C.rated = cRated.length;
                C.avg = cRated.length ? cRated.reduce((s, x) => s + ratingOf(x), 0) / cRated.length : 0;
                C.fiveTotal = cRated.filter(x => ratingOf(x) >= 5).length;
                const cTasted = all.filter(x => this.tastedKeys(x).length);
                if (cTasted.length >= 6) {
                    const vals = {}, seen = {};
                    TASTE_KEYS.forEach(k => { const v = cTasted.map(x => this.tasteValue(x, k)).filter(v => v !== null); seen[k] = v.length; vals[k] = v.length ? v.reduce((s, n) => s + n, 0) / v.length : 5; });
                    const label = k => (TASTE_META.find(m => m[0] === k) || [k, k])[1];
                    const ranked = TASTE_KEYS.filter(k => seen[k] >= 3 && k !== 'bitterness').sort((p, q) => vals[q] - vals[p]);
                    C.taste = { vals, n: cTasted.length, top: ranked[0] ? { label: label(ranked[0]), v: vals[ranked[0]] } : null };
                }
                C.notes = countBy(all.flatMap(x => this.extractFlavors(x).map(n => ({ n }))), o => { const t = String(o.n || '').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : ''; });
                C.likes = all.reduce((s, x) => s + likesOf(x), 0);
                let cc = 0;
                [...this.brews.values(), ...this.beans.values()].forEach(x => this.normalizeCommentList(x.comments, `wrc-${x.id}`, x.date).forEach(c => { if (inYear(c.timestamp)) cc++; }));
                C.comments = cc;
                const liked = all.filter(x => likesOf(x) > 0).sort((p, q) => likesOf(q) - likesOf(p) || this.localTime(p.date) - this.localTime(q.date))[0];
                if (liked) C.mostLiked = { owner: owner(liked), bean: beanOf(liked), n: likesOf(liked), date: liked.date, rating: ratingOf(liked) };
                // with a small crew, lots of sessions tie for "most liked": count the ones everyone else liked instead
                C.allLiked = people.length > 1 ? all.filter(x => likesOf(x) >= people.length - 1).length : 0;
                const pairs = new Map();
                all.forEach(x => (Array.isArray(x.likes) ? x.likes : []).forEach(n => { const from = String(n || '').trim(), to = owner(x); if (from && from !== to) { const k = `${from}→${to}`; pairs.set(k, (pairs.get(k) || 0) + 1); } }));
                const fan = [...pairs.entries()].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0]))[0];
                if (fan) { const [from, to] = fan[0].split('→'); C.fan = { from, to, n: fan[1] }; }
                D.crew = C;
                return D;
            },

            // espresso is weighed coming out; filter, press, moka and cold brew record the water going in
            wrappedLiquid(X) {
                const L = g => this.fmtNum(g / 1000, 1);
                const parts = [];
                if (X.shots && X.espOut > 0) parts.push(`<b>${X.shots}</b> espresso shot${X.shots === 1 ? '' : 's'}, ${X.espOut >= 1000 ? `${L(X.espOut)} litres` : `${Math.round(X.espOut)} g`} in the cup`);
                if (X.water > 50) parts.push(`${X.water >= 1000 ? `<b>${L(X.water)} litres</b>` : `<b>${Math.round(X.water)} g</b>`} of water through filters, presses and pots`);
                return parts.length ? ` ${parts.join('. ').replace(/^./, c => c.toUpperCase())}.` : '';
            },

            wrappedSlides(D) {
                const S = [];
                const esc = v => this.esc(v);
                const fmt = (v, d = 0) => Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
                const you = D.user === this.user;
                const Y = you ? 'You' : D.user;
                const y = you ? 'you' : D.user;
                const your = you ? 'Your' : `${D.user}'s`;
                const yourL = you ? 'your' : `${D.user}'s`;
                const face = n => `<span class="wr-face" data-face="${esc(n)}" style="background:${esc(this.getUserColor(n))}">${esc(this.feedInitial(n))}</span>`;
                const monthL = i => new Date(D.year, i, 1).toLocaleDateString(undefined, { month: 'long' });
                const dayL = i => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i];
                const hourL = h => { const d = new Date(2020, 0, 1, h); return d.toLocaleTimeString(undefined, { hour: 'numeric' }).replace(':00', ''); };
                const beanName = bn => bn ? (String(bn.name || '').trim() || this.beanLabel(bn)) : 'a coffee';
                const ring = '<svg class="wr-ring" viewBox="0 0 200 200" role="presentation"><g fill="none" stroke="currentColor"><path d="M100 18c46 0 82 35 82 81s-37 83-83 83-81-38-81-83 36-81 82-81Z" stroke-width="7"/><path d="M101 30c39 0 70 31 70 70s-32 70-71 70-69-31-69-70 31-70 70-70Z" stroke-width="2" opacity=".6"/><path d="M40 60c10-14 26-26 44-30" stroke-width="3" opacity=".5"/></g></svg>';
                const add = (theme, html, dur = 6500, bg = '') => S.push({ theme, html, dur, bg });

                add('espresso', `${ring}<div class="wr-k wr-in" style="--d:0">${esc(your)} year in coffee</div><div class="wr-cover-year wr-in" style="--d:1">${D.year}</div><div class="wr-p wr-in" style="--d:2">${D.count} sessions, ${D.coffees} coffee${D.coffees === 1 ? '' : 's'}, one year. Let's see how ${esc(y)} brewed.</div><div class="wr-hint">Tap to start</div>`, 5000);

                const others = D.people.filter(p => p[0] !== D.user);
                let rankLine = '';
                if (D.people.length > 1) {
                    if (D.rank === 1) rankLine = `That's the most in the crew${others.length ? `. ${esc(others[0][0])} was next with ${others[0][1]}` : ''}.`;
                    else { const ahead = D.people[D.rank - 2]; rankLine = `#${D.rank} in the crew, ${ahead[1] - D.count} behind ${esc(ahead[0])}.`; }
                }
                add('you', `<div class="wr-k wr-in" style="--d:0">${esc(Y)} logged</div><div class="wr-big wr-in" style="--d:1" data-count="${D.count}">${D.count}</div><div class="wr-unit wr-in" style="--d:2">sessions</div><div class="wr-p wr-in" style="--d:3">On <b>${D.days}</b> different day${D.days === 1 ? '' : 's'}. ${rankLine}</div>`);

                if (D.grams > 0) {
                    const kg = D.grams / 1000;
                    const bags = Math.max(1, Math.round(D.grams / 340));
                    const litres = D.out / 1000;
                    const hrs = Math.floor(D.secs / 3600), mins = Math.round((D.secs % 3600) / 60);
                    add('crema', `<div class="wr-k wr-in" style="--d:0">That's</div><div class="wr-big wr-in" style="--d:1" data-count="${kg >= 1 ? kg.toFixed(1) : Math.round(D.grams)}" data-dec="${kg >= 1 ? 1 : 0}">${kg >= 1 ? fmt(kg, 1) : Math.round(D.grams)}</div><div class="wr-unit wr-in" style="--d:2">${kg >= 1 ? 'kilos' : 'grams'} of coffee beans</div><div class="wr-p wr-in" style="--d:3">About <b>${bags} bag${bags === 1 ? '' : 's'}</b>.${this.wrappedLiquid(D)}${D.secs > 600 ? ` And <b>${hrs ? `${hrs} h ` : ''}${mins} min</b> of watching it brew.` : ''}</div>`);
                }

                if (D.topCoffees.length) {
                    const rows = D.topCoffees.map((c, i) => `<li class="wr-in" style="--d:${i + 1}"><span class="n">${i + 1}</span><span class="t">${esc(c.name)}<span class="s">${c.roaster ? `${esc(c.roaster)} · ` : ''}${c.count} session${c.count === 1 ? '' : 's'}${c.avg ? ` · ${this.fmtNum(c.avg, 1)}★ avg` : ''}</span></span></li>`).join('');
                    add('espresso', `<div class="wr-k wr-in" style="--d:0">${esc(your)} top coffee${D.topCoffees.length > 1 ? 's' : ''}</div><ol class="wr-rank">${rows}</ol>`, 8000);
                }

                if (D.origins.length) {
                    const chips = D.origins.slice(0, 8).map(([o, n], i) => `<span class="wr-chip wr-in" style="--d:${i + 3}">${esc(o)}<em>${n}</em></span>`).join('');
                    const roaster = D.roasters[0];
                    add('matcha', `<div class="wr-k wr-in" style="--d:0">${esc(Y)} tasted coffee from</div><div class="wr-big wr-in" style="--d:1" data-count="${D.origins.length}">${D.origins.length}</div><div class="wr-unit wr-in" style="--d:2">origin${D.origins.length === 1 ? '' : 's'}</div><div class="wr-chips">${chips}</div>${roaster ? `<div class="wr-p wr-in" style="--d:6">Top roaster: <b>${esc(roaster[0])}</b>, ${roaster[1]} session${roaster[1] === 1 ? '' : 's'}.</div>` : ''}`, 7500);
                }

                if (D.methods.length) {
                    if (D.methods.length === 1) add('crema', `<div class="wr-k wr-in" style="--d:0">How ${esc(y)} brewed</div><div class="wr-big word wr-in" style="--d:1">${esc(D.methods[0][0])}</div><div class="wr-p wr-in" style="--d:2">Every single time. All <b>${D.count}</b> sessions.</div>`);
                    else {
                        const max = D.methods[0][1];
                        const rows = D.methods.slice(0, 5).map(([m, n], i) => `<div class="wr-bar-row wr-in" style="--d:${i + 1}"><span>${esc(m)}</span><span class="v">${n / D.count < 0.01 ? '<1' : Math.round(n / D.count * 100)}%</span><span class="track"><span class="fill" style="width:${(n / max * 100).toFixed(1)}%;--d:${i}"></span></span></div>`).join('');
                        add('crema', `<div class="wr-k wr-in" style="--d:0">How ${esc(y)} brewed</div><div class="wr-big word wr-in" style="--d:1">${esc(D.methods[0][0])}</div><div class="wr-p wr-in" style="--d:2">led the way, with ${D.methods.length - 1} other method${D.methods.length === 2 ? '' : 's'} in the mix.</div><div class="wr-bars-h">${rows}</div>`, 7500);
                    }
                }

                if (D.count >= 5) {
                    const max = Math.max(...D.months) || 1;
                    const bars = D.months.map((n, i) => `<span class="${i === D.peakMonth ? 'peak' : ''}" style="height:${Math.max(3, n / max * 100)}%;--d:${i}" title="${esc(monthL(i))}: ${n}"></span>`).join('');
                    const labels = D.months.map((_, i) => `<span>${esc(monthL(i).charAt(0))}</span>`).join('');
                    const when = D.hour === null ? '' : D.hour < 12 ? 'a morning brewer' : D.hour < 17 ? 'an afternoon brewer' : D.hour < 21 ? 'an evening brewer' : 'a night owl';
                    add('night', `<div class="wr-k wr-in" style="--d:0">${esc(your)} busiest month was</div><div class="wr-big word wr-in" style="--d:1">${esc(monthL(D.peakMonth))}</div><div class="wr-p wr-in" style="--d:2"><b>${D.months[D.peakMonth]}</b> sessions.${D.weekday !== null ? ` Favorite day: <b>${dayL(D.weekday)}</b>.` : ''}${when ? ` Usually around <b>${hourL(D.hour)}</b>, so ${you ? "you're" : `${esc(D.user)} is`} ${when}.` : ''}</div><div class="wr-months wr-in" style="--d:3">${bars}</div><div class="wr-months-l">${labels}</div>`, 7500);
                }

                if (D.streak.days >= 3) {
                    const f = d => d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
                    add('cherry', `<div class="wr-k wr-in" style="--d:0">Longest streak</div><div class="wr-big wr-in" style="--d:1" data-count="${D.streak.days}">${D.streak.days}</div><div class="wr-unit wr-in" style="--d:2">days in a row</div><div class="wr-p wr-in" style="--d:3">${f(D.streak.from)} to ${f(D.streak.to)}. Coffee every single day.</div>`);
                }

                if (D.best) {
                    const b = D.best;
                    const stars = '★'.repeat(Math.floor(b.rating)) + (b.rating % 1 ? '½' : '');
                    const recipe = [b.dose && b.yld ? `${this.fmtNum(b.dose)} g → ${this.fmtNum(b.yld)} g` : '', b.time ? `${this.fmtNum(b.time)} s` : '', b.grind && you ? `grind ${b.grind}` : ''].filter(Boolean).join(' · ');
                    const note = b.notes.length > 150 ? `${b.notes.slice(0, 147).trim()}…` : b.notes;
                    add('espresso', `${b.photo ? `<div class="wr-photo" style="background-image:url('${esc(this.cssUrl(b.photo))}')"></div>` : ''}<div class="wr-k wr-in" style="--d:0">${esc(your)} shot of the year</div><div class="wr-stars wr-in" style="--d:1">${stars}</div><div class="wr-big word wr-in wr-bean" style="--d:2">${esc(beanName(b.bean))}</div><div class="wr-p wr-in" style="--d:3">${b.bean && b.bean.roaster ? `${esc(b.bean.roaster)} · ` : ''}${esc(this.shortDate(b.date))}${b.method ? ` · ${esc(b.method)}` : ''}${recipe ? `<br><b>${esc(recipe)}</b>` : ''}</div>${note ? `<div class="wr-quote wr-in" style="--d:4">${esc(note)}</div>` : ''}`, 8000);
                }

                if (D.taste || D.notes.length >= 3) {
                    const img = D.taste && typeof FlavorShape !== 'undefined' ? (() => { try { return FlavorShape.snapshot(D.taste.vals, null, { width: 330, height: 248, zoom: 1.1, labels: false }); } catch (e) { return ''; } })() : '';
                    const chips = D.notes.slice(0, 6).map(([n, c], i) => `<span class="wr-chip wr-in" style="--d:${i + 3}">${esc(n)}<em>${c}</em></span>`).join('');
                    const chase = D.taste && D.taste.top ? `${esc(Y)} chase${you ? '' : 's'} <b>${esc(D.taste.top.label.toLowerCase())}</b>: ${this.fmtNum(D.taste.top.v, 1)} out of 10 on average.` : '';
                    add('crema', `<div class="wr-k wr-in" style="--d:0">${esc(your)} flavor shape</div>${img ? `<img class="wr-shape wr-in" style="--d:1" src="${img}" alt="">` : ''}${chase ? `<div class="wr-p wr-in" style="--d:2">${chase}</div>` : ''}${chips ? `<div class="wr-small wr-in" style="--d:2">Notes ${esc(y)} found most</div><div class="wr-chips">${chips}</div>` : ''}`, 8000);
                }

                if (D.grindChanges >= 3 || D.fastest || D.sweet) {
                    const lines = [];
                    if (D.fastest) lines.push(`Fastest dial-in: <b>${esc(beanName(D.fastest.bean))}</b>, 4.5★ ${D.fastest.hit === 1 ? 'on the first try' : `by session ${D.fastest.hit}`}.`);
                    if (D.chased && (!D.fastest || D.chased !== D.fastest)) lines.push(`Most chased: <b>${esc(beanName(D.chased.bean))}</b>, ${D.chased.n} sessions.`);
                    if (D.sweet) lines.push(`${esc(your)} espresso sweet spot: <b>1:${this.fmtNum(D.sweet.ratio, 1)} in ${Math.round(D.sweet.time)} s</b>.`);
                    add('matcha', `<div class="wr-k wr-in" style="--d:0">The dial-in</div><div class="wr-big wr-in" style="--d:1" data-count="${D.grindChanges}">${D.grindChanges}</div><div class="wr-unit wr-in" style="--d:2">grind change${D.grindChanges === 1 ? '' : 's'}</div>${lines.map((l, i) => `<div class="wr-p wr-in" style="--d:${i + 3};margin-top:${i ? 6 : 16}px">${l}</div>`).join('')}`, 8000);
                }

                add('you', `<div class="wr-k wr-in" style="--d:0">${esc(your)} coffee personality</div><div class="wr-big word wr-in" style="--d:1">${esc(D.persona.title)}</div><div class="wr-p wr-in" style="--d:2">${esc(D.persona.text)}</div>`, 7000);

                if (D.awardCount) {
                    const badges = D.awards.slice(0, 6).map((a, i) => `<div class="wr-badge wr-in" style="--d:${i + 3};--ac:${esc(a.color)}"><span class="ic"><svg class="icon"><use href="#${esc(a.icon)}"/></svg></span><div><div class="bt">${esc(a.title)}</div><div class="bw">×${a.n}</div></div></div>`).join('');
                    const champ = D.champMonths.length ? `Champion of ${D.champMonths.map(monthL).join(', ').replace(/, ([^,]*)$/, ' and $1')}.` : '';
                    const race = D.race.length > 1 ? `<div class="wr-small wr-in" style="--d:9">Award race: ${D.race.map(([n, c]) => `${n === D.user && you ? 'You' : esc(n)} ${c}`).join(' · ')}</div>` : '';
                    add('gold', `<div class="wr-k wr-in" style="--d:0">${esc(Y)} took home</div><div class="wr-big wr-in" style="--d:1" data-count="${D.awardCount}">${D.awardCount}</div><div class="wr-unit wr-in" style="--d:2">monthly award${D.awardCount === 1 ? '' : 's'}</div>${champ ? `<div class="wr-p wr-in" style="--d:3">${champ}</div>` : ''}<div class="wr-badges">${badges}</div>${race}`, 8500);
                }

                if (D.likesGiven + D.likesGot + D.commentsMade > 0) {
                    add('cherry', `<div class="wr-k wr-in" style="--d:0">The social side</div><div class="wr-big wr-in" style="--d:1" data-count="${D.likesGiven}">${D.likesGiven}</div><div class="wr-unit wr-in" style="--d:2">likes handed out</div><div class="wr-p wr-in" style="--d:3"><b>${D.likesGot}</b> like${D.likesGot === 1 ? '' : 's'} back on ${esc(yourL)} sessions${D.commentsMade ? `, and <b>${D.commentsMade}</b> comment${D.commentsMade === 1 ? '' : 's'} written` : ''}.${D.buddy ? `<br>Brew buddy: <b>${esc(D.buddy.name)}</b>, ${D.buddy.coffees} coffee${D.buddy.coffees === 1 ? '' : 's'} in common.` : ''}</div>`);
                }

                // ---- the crew: everyone combined
                const C = D.crew;
                if (C && C.people.length > 1) {
                    const names = C.people.map(p => p[0]);
                    const crewG = `linear-gradient(160deg, ${names.map((n, i) => `${this.getUserColor(n)} ${Math.round(i / Math.max(1, names.length - 1) * 100)}%`).join(', ')})`;
                    const who = list => list.length === C.people.length ? `all ${list.length} of you` : esc(list.join(' & '));
                    const facesOf = list => `<span class="wr-faces">${list.map(face).join('')}</span>`;
                    add('crew', `<div class="wr-k wr-in" style="--d:0">And together, the crew logged</div><div class="wr-big wr-in" style="--d:1" data-count="${C.sessions}">${C.sessions}</div><div class="wr-unit wr-in" style="--d:2">sessions</div><div class="wr-p wr-in" style="--d:3">${facesOf(names)}${C.people.length} people, coffee on <b>${C.days}</b> different days.${C.goals ? `<br><b>${C.goals}</b> group goal${C.goals === 1 ? '' : 's'} reached together.` : ''}</div>`, 6500, crewG);

                    const ckg = C.grams / 1000, cbags = Math.max(1, Math.round(C.grams / 340));
                    const ch = Math.floor(C.secs / 3600), cm = Math.round((C.secs % 3600) / 60);
                    add('crema', `<div class="wr-k wr-in" style="--d:0">Between you, that's</div><div class="wr-big wr-in" style="--d:1" data-count="${ckg >= 1 ? ckg.toFixed(1) : Math.round(C.grams)}" data-dec="${ckg >= 1 ? 1 : 0}">${ckg >= 1 ? fmt(ckg, 1) : Math.round(C.grams)}</div><div class="wr-unit wr-in" style="--d:2">${ckg >= 1 ? 'kilos' : 'grams'} of coffee beans</div><div class="wr-p wr-in" style="--d:3">About <b>${cbags} bags</b>.${this.wrappedLiquid(C)}${C.secs > 600 ? ` <b>${ch ? `${ch} h ` : ''}${cm} min</b> of brewing, all told.` : ''}</div>`);

                    const max = C.people[0][1];
                    const rows = C.people.map(([n, c], i) => { const f = (C.fives.find(e => e[0] === n) || [n, 0])[1]; return `<div class="wr-bar-row wr-in" style="--d:${i + 1};color:${esc(this.getUserColor(n))}"><span style="color:#EFF6EA">${i + 1}. ${esc(n)}</span><span class="v" style="color:#EFF6EA">${c}${f ? ` · ${f}×5★` : ''}</span><span class="track"><span class="fill" style="width:${(c / max * 100).toFixed(1)}%;--d:${i}"></span></span></div>`; }).join('');
                    add('matcha', `<div class="wr-k wr-in" style="--d:0">The ${D.year} leaderboard</div><div class="wr-big word wr-in" style="--d:1">${esc(C.people[0][0])}</div><div class="wr-p wr-in" style="--d:2">brewed the most, with ${C.people[0][1]} sessions.</div><div class="wr-bars-h">${rows}</div>`, 7500);

                    if (C.topCoffees.length) {
                        const list = C.topCoffees.map((c, i) => `<li class="wr-in" style="--d:${i + 1}"><span class="n">${i + 1}</span><span class="t">${esc(c.name)}<span class="s">${c.roaster ? `${esc(c.roaster)} · ` : ''}${c.count} sessions · ${c.who.map(n => esc(n)).join(', ')}</span></span></li>`).join('');
                        add('espresso', `<div class="wr-k wr-in" style="--d:0">Your top coffees together</div><ol class="wr-rank">${list}</ol>`, 8000);
                    }

                    if (C.methods.length) {
                        const mmax = C.methods[0][1];
                        const mrows = C.methods.slice(0, 6).map(([m, n], i) => `<div class="wr-bar-row wr-in" style="--d:${i + 1}"><span>${esc(m)}</span><span class="v">${n} · ${n / C.sessions < 0.01 ? '<1' : Math.round(n / C.sessions * 100)}%</span><span class="track"><span class="fill" style="width:${(n / mmax * 100).toFixed(1)}%;--d:${i}"></span></span></div>`).join('');
                        add('cherry', `<div class="wr-k wr-in" style="--d:0">Your go-to method together</div><div class="wr-big word wr-in" style="--d:1">${esc(C.methods[0][0])}</div><div class="wr-p wr-in" style="--d:2">${C.methods.length === 1 ? 'Every single session.' : `${C.methods.length} methods in all.`}${C.shots ? ` <b>${C.shots}</b> espresso shot${C.shots === 1 ? '' : 's'} pulled.` : ''}</div>${C.methods.length > 1 ? `<div class="wr-bars-h">${mrows}</div>` : ''}`, 7500);
                    }

                    if (C.originList.length) {
                        const chips = C.originList.slice(0, 10).map(([o, n], i) => `<span class="wr-chip wr-in" style="--d:${i + 3}">${esc(o)}<em>${n}</em></span>`).join('');
                        const roaster = C.roasters[0];
                        add('matcha', `<div class="wr-k wr-in" style="--d:0">Together you tasted</div><div class="wr-big wr-in" style="--d:1" data-count="${C.originList.length}">${C.originList.length}</div><div class="wr-unit wr-in" style="--d:2">origins, ${C.coffees} coffees</div><div class="wr-chips">${chips}</div>${roaster ? `<div class="wr-p wr-in" style="--d:7">The crew's roaster: <b>${esc(roaster[0])}</b>, ${roaster[1]} sessions${C.roasters.length > 1 ? ` (of ${C.roasters.length} roasters)` : ''}.</div>` : ''}`, 7500);
                    }

                    if (C.sessions >= 10) {
                        const cmax = Math.max(...C.months) || 1;
                        const bars = C.months.map((n, i) => `<span class="${i === C.peakMonth ? 'peak' : ''}" style="height:${Math.max(3, n / cmax * 100)}%;--d:${i}" title="${esc(monthL(i))}: ${n}"></span>`).join('');
                        const labels = C.months.map((_, i) => `<span>${esc(monthL(i).charAt(0))}</span>`).join('');
                        const bd = C.busiest ? new Date(this.parseLocalDate(C.busiest.key)).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : '';
                        add('night', `<div class="wr-k wr-in" style="--d:0">Your busiest month together</div><div class="wr-big word wr-in" style="--d:1">${esc(monthL(C.peakMonth))}</div><div class="wr-p wr-in" style="--d:2"><b>${C.months[C.peakMonth]}</b> sessions.${C.busiest && C.busiest.n > 1 ? ` Busiest single day: <b>${esc(bd)}</b>, ${C.busiest.n} sessions${C.busiest.who.length > 1 ? ` from ${who(C.busiest.who)}` : ''}.` : ''}${C.weekday !== null ? ` Favorite day: <b>${dayL(C.weekday)}</b>.` : ''}${C.hour !== null ? ` Peak hour: <b>${hourL(C.hour)}</b>.` : ''}</div><div class="wr-months wr-in" style="--d:3">${bars}</div><div class="wr-months-l">${labels}</div>`, 8000);
                    }

                    if (C.streak.days >= 3) {
                        const f = d => d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
                        add('cherry', `<div class="wr-k wr-in" style="--d:0">The grinder never rested for</div><div class="wr-big wr-in" style="--d:1" data-count="${C.streak.days}">${C.streak.days}</div><div class="wr-unit wr-in" style="--d:2">days straight</div><div class="wr-p wr-in" style="--d:3">${f(C.streak.from)} to ${f(C.streak.to)}: at least one of you brewed every day.</div>`);
                    }

                    if (C.rated) {
                        const topFive = [...C.fives].sort((p, q) => q[1] - p[1])[0];
                        add('gold', `<div class="wr-k wr-in" style="--d:0">Five-star shots, all of you</div><div class="wr-big wr-in" style="--d:1" data-count="${C.fiveTotal}">${C.fiveTotal}</div><div class="wr-unit wr-in" style="--d:2">perfect cups</div><div class="wr-p wr-in" style="--d:3">Out of <b>${C.rated}</b> rated sessions, averaging <b>${this.fmtNum(C.avg, 1)}★</b>.${topFive && topFive[1] ? ` Most 5★: <b>${esc(topFive[0])}</b> with ${topFive[1]}.` : ''}</div>`);
                    }

                    if (C.taste || C.notes.length >= 3) {
                        const img = C.taste && typeof FlavorShape !== 'undefined' ? (() => { try { return FlavorShape.snapshot(C.taste.vals, null, { width: 330, height: 248, zoom: 1.1, labels: false }); } catch (e) { return ''; } })() : '';
                        const chips = C.notes.slice(0, 8).map(([n, c], i) => `<span class="wr-chip wr-in" style="--d:${i + 3}">${esc(n)}<em>${c}</em></span>`).join('');
                        add('crema', `<div class="wr-k wr-in" style="--d:0">Your flavor shape together</div>${img ? `<img class="wr-shape wr-in" style="--d:1" src="${img}" alt="">` : ''}${C.taste && C.taste.top ? `<div class="wr-p wr-in" style="--d:2">Together you chase <b>${esc(C.taste.top.label.toLowerCase())}</b>: ${this.fmtNum(C.taste.top.v, 1)} out of 10 across ${C.taste.n} tasted sessions.</div>` : ''}${chips ? `<div class="wr-small wr-in" style="--d:2">Notes the crew found most</div><div class="wr-chips">${chips}</div>` : ''}`, 8000);
                    }

                    if (C.likes + C.comments > 0) {
                        const ml = C.mostLiked;
                        add('espresso', `<div class="wr-k wr-in" style="--d:0">Together you handed out</div><div class="wr-big wr-in" style="--d:1" data-count="${C.likes}">${C.likes}</div><div class="wr-unit wr-in" style="--d:2">like${C.likes === 1 ? '' : 's'}</div><div class="wr-p wr-in" style="--d:3">and wrote <b>${C.comments}</b> comment${C.comments === 1 ? '' : 's'}.${C.allLiked > 1 ? `<br><b>${C.allLiked}</b> sessions got a like from everyone else.` : ml ? `<br>Most-liked session: <b>${esc(ml.owner)}'s ${esc(beanName(ml.bean))}</b>, ${this.shortDate(ml.date)}, with ${ml.n} like${ml.n === 1 ? '' : 's'}.` : ''}${C.fan ? `<br>Biggest fan: <b>${esc(C.fan.from)}</b>, who liked ${esc(C.fan.to)}'s sessions ${C.fan.n} times.` : ''}</div>`, 7500);
                    }

                    if (C.coffee) {
                        const shared = C.coffee.who.length > 1;
                        add('crema', `<div class="wr-k wr-in" style="--d:0">Your coffee of the year together</div><div class="wr-big word wr-in wr-bean" style="--d:1">${esc(beanName(C.coffee.bean))}</div><div class="wr-p wr-in" style="--d:2">${C.coffee.bean && C.coffee.bean.roaster ? `${esc(C.coffee.bean.roaster)}. ` : ''}Brewed <b>${C.coffee.n}</b> times${shared ? ` by ${who(C.coffee.who)}` : ` by ${esc(C.coffee.who[0])}`}.</div>${C.loved && C.loved.bean && this.beanGroupKey(C.loved.bean) !== this.beanGroupKey(C.coffee.bean) ? `<div class="wr-p wr-in" style="--d:3">Most loved: <b>${esc(beanName(C.loved.bean))}</b>, ${this.fmtNum(C.loved.avg, 1)}★ across ${C.loved.n} rated sessions.</div>` : ''}`);
                    }
                    if (C.yearly.length) {
                        const badges = C.yearly.map((x, i) => `<div class="wr-badge" style="--d:${i};--ac:${esc(x.color)}"><span class="ic"><svg class="icon"><use href="#${esc(x.icon)}"/></svg></span><div style="min-width:0"><div class="bt">${esc(x.title)}</div><div class="bw">${esc(x.winners.join(' & '))}</div></div></div>`).join('');
                        add('gold', `<div class="wr-k wr-in" style="--d:0">The ${D.year} Golden Portafilters</div><div class="wr-p wr-in" style="--d:1;margin-top:6px">The year's awards, from everyone's sessions.</div><div class="wr-badges reveal">${badges}</div>`, Math.max(8000, C.yearly.length * 260 + 4500));
                    }
                }

                const kg = D.grams >= 1000 ? `${this.fmtNum(D.grams / 1000, 1)} kg` : `${Math.round(D.grams)} g`;
                add('you', `<div class="wr-k wr-in" style="--d:0">${esc(your)} ${D.year} in coffee</div><div class="wr-summary wr-in" style="--d:1">
                    <div><div class="l">Sessions</div><div class="v">${D.count}</div></div>
                    <div><div class="l">Coffee</div><div class="v">${kg}</div></div>
                    ${D.topCoffees[0] ? `<div class="wide"><div class="l">Top coffee</div><div class="v">${esc(D.topCoffees[0].name)}</div></div>` : ''}
                    <div><div class="l">Personality</div><div class="v">${esc(D.persona.title.replace(/^The /, ''))}</div></div>
                    <div><div class="l">${D.awardCount ? 'Awards' : 'Top rated'}</div><div class="v">${D.awardCount ? D.awardCount : D.best ? `${this.fmtNum(D.best.rating)}★` : '—'}</div></div>
                </div><div class="wr-actions wr-in" style="--d:2"><button type="button" onclick="app.shareWrapped()">Share</button><button type="button" class="ghost" onclick="app.wrappedGo(0)">Replay</button><button type="button" class="ghost" onclick="app.closeWrapped()">Done</button></div>`, 60000);
                return S;
            },

            openWrapped(user, year) {
                const D = this.wrappedData(user, Number(year));
                if (!D.count) { this.showToast('No sessions that year yet.'); return; }
                const slides = this.wrappedSlides(D);
                this.closeWrapped(true);
                const el = document.createElement('div');
                el.id = 'wrapped';
                el.setAttribute('role', 'dialog');
                el.setAttribute('aria-label', `${D.user}'s ${D.year} Year in Coffee`);
                el.style.setProperty('--uc', D.color);
                el.innerHTML = `<div class="wr-bars">${slides.map(() => '<i><b></b></i>').join('')}</div>
                    <div class="wr-top"><span class="wr-who"><b data-face="${this.esc(D.user)}" style="background:${this.esc(D.color)}">${this.esc(this.feedInitial(D.user))}</b>${this.esc(D.user)} · ${D.year}</span><button type="button" class="wr-close" aria-label="Close" onclick="app.closeWrapped()"><svg class="icon"><use href="#i-x"/></svg></button></div>
                    <div class="wr-stage"></div>`;
                document.body.appendChild(el);
                this._wr = { D, slides, i: 0, el, prevOverflow: document.body.style.overflow };
                document.body.style.overflow = 'hidden';
                let down = 0, held = false, holdTimer = null;
                el.addEventListener('pointerdown', e => {
                    if (e.target.closest('button')) return;
                    down = Date.now(); held = false;
                    holdTimer = setTimeout(() => { held = true; el.classList.add('paused'); }, 220);
                });
                const up = e => {
                    if (!down) return;
                    clearTimeout(holdTimer);
                    const wasHeld = held; down = 0; held = false;
                    el.classList.remove('paused');
                    if (wasHeld || e.target.closest('button')) return;
                    const x = e.clientX / (window.innerWidth || 1);
                    this.wrappedGo(this._wr.i + (x < 0.3 ? -1 : 1));
                };
                el.addEventListener('pointerup', up);
                el.addEventListener('pointercancel', () => { clearTimeout(holdTimer); down = 0; held = false; el.classList.remove('paused'); });
                this._wrKey = e => { if (!this._wr) return; if (e.key === 'Escape') this.closeWrapped(); if (e.key === 'ArrowRight' || e.key === ' ') this.wrappedGo(this._wr.i + 1); if (e.key === 'ArrowLeft') this.wrappedGo(this._wr.i - 1); };
                document.addEventListener('keydown', this._wrKey);
                this.wrappedGo(0);
            },

            wrappedGo(i) {
                const W = this._wr;
                if (!W) return;
                if (i >= W.slides.length) { this.closeWrapped(); return; }
                W.i = Math.max(0, i);
                const s = W.slides[W.i];
                const stage = W.el.querySelector('.wr-stage');
                stage.innerHTML = `<section class="wr-slide wr-t-${s.theme}" style="--uc:${this.esc(W.D.color)}${s.bg ? `;--crew-g:${this.esc(s.bg)}` : ''}">${s.html}</section>`;
                W.el.classList.toggle('wr-light', s.theme === 'crema' || s.theme === 'gold');
                W.el.querySelectorAll('.wr-bars i').forEach((bar, k) => {
                    bar.className = k < W.i ? 'past' : k === W.i ? 'now' : '';
                    const b = bar.querySelector('b');
                    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
                    if (k === W.i) { bar.style.setProperty('--dur', `${s.dur}ms`); b.onanimationend = () => { if (this._wr === W && W.i === k) this.wrappedGo(k + 1); }; } else b.onanimationend = null;
                });
                // numbers count up
                const motion = this.motionOK();
                stage.querySelectorAll('[data-count]').forEach(el => {
                    const end = Number(el.getAttribute('data-count')), dec = Number(el.getAttribute('data-dec') || 0);
                    if (!motion || !(end > 0)) return;
                    const t0 = performance.now() + 220, dur = 1100;
                    const tick = now => { if (!el.isConnected) return; const k = Math.min(1, Math.max(0, (now - t0) / dur)); const v = end * (1 - Math.pow(1 - k, 3)); el.textContent = v.toLocaleString(undefined, { maximumFractionDigits: dec, minimumFractionDigits: dec }); if (k < 1) requestAnimationFrame(tick); };
                    el.textContent = (0).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
                    requestAnimationFrame(tick);
                });
            },

            closeWrapped(silent = false) {
                const W = this._wr;
                const el = document.getElementById('wrapped');
                if (el) el.remove();
                if (W) document.body.style.overflow = W.prevOverflow || '';
                if (this._wrKey) document.removeEventListener('keydown', this._wrKey);
                this._wr = null; this._wrKey = null;
            },

            async shareWrapped() {
                const W = this._wr;
                if (!W) return;
                const D = W.D;
                const canvas = document.createElement('canvas');
                canvas.width = 1080; canvas.height = 1920;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                const font = (w, s) => `${w} ${s}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif`;
                const g = ctx.createLinearGradient(0, 0, 0, 1920);
                g.addColorStop(0, D.color); g.addColorStop(1, this.hexMix(D.color, '#000000', 0.55));
                ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1920);
                ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = font(800, 44); ctx.fillText(`${D.user}'s year in coffee`, 90, 200);
                ctx.fillStyle = '#FFFFFF'; ctx.font = font(900, 300); ctx.fillText(String(D.year), 70, 480);
                const kg = D.grams >= 1000 ? `${this.fmtNum(D.grams / 1000, 1)} kg` : `${Math.round(D.grams)} g`;
                const rows = [['Sessions', String(D.count)], ['Coffee', kg], ['Top coffee', D.topCoffees[0] ? D.topCoffees[0].name : '—'], ['Personality', D.persona.title], ['Monthly awards', String(D.awardCount || 0)], ['Best shot', D.best ? `${this.fmtNum(D.best.rating)}★ ${D.best.bean ? (D.best.bean.name || '') : ''}` : '—']];
                let y = 660;
                rows.forEach(([l, v]) => {
                    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = font(750, 38); ctx.fillText(l, 90, y);
                    ctx.fillStyle = '#FFFFFF'; ctx.font = font(850, 76); ctx.fillText(this.fitText(ctx, v, 900), 90, y + 88);
                    y += 190;
                });
                ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = font(750, 36); ctx.fillText('Logged with Dialed In', 90, 1830);
                const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                if (!blob) return;
                const file = new File([blob], `dialed-in-${D.year}.png`, { type: 'image/png' });
                try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: `${D.user}'s ${D.year} in coffee` }); return; } } catch (err) { if (err && err.name === 'AbortError') return; }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 4000);
            },

            fitText(ctx, text, max) {
                let t = String(text);
                if (ctx.measureText(t).width <= max) return t;
                while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
                return `${t}…`;
            },

            roundRect(ctx, x, y, w, h, r) {
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.arcTo(x + w, y, x + w, y + h, r);
                ctx.arcTo(x + w, y + h, x, y + h, r);
                ctx.arcTo(x, y + h, x, y, r);
                ctx.arcTo(x, y, x + w, y, r);
                ctx.closePath();
            },

            async shareRecap() {
                const s = this.lastRecap;
                if (!s || !s.count) return;
                if (!s.isYear && typeof this.shareMonthRecap === 'function') return this.shareMonthRecap(s);
                const canvas = document.createElement('canvas');
                canvas.width = 1080;
                canvas.height = 1350;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                const font = (weight, size) => `${weight} ${size}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif`;
                ctx.fillStyle = '#FDFBF8';
                ctx.fillRect(0, 0, 1080, 1350);
                ctx.fillStyle = '#586A58';
                ctx.fillRect(0, 0, 1080, 300);
                ctx.fillStyle = 'rgba(255,255,255,0.75)';
                ctx.font = font(800, 28);
                ctx.fillText('DIALED IN', 80, 110);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = font(800, 60);
                ctx.fillText(this.fitText(ctx, `${s.user}'s ${s.label}`, 920), 80, 205);
                this.recapNumbers(s).forEach(([n, cap], i) => {
                    const x = 80 + (i % 2) * 470;
                    const y = 360 + Math.floor(i / 2) * 230;
                    ctx.fillStyle = '#F1EEE8';
                    this.roundRect(ctx, x, y, 450, 200, 28);
                    ctx.fill();
                    ctx.fillStyle = '#2C2C2C';
                    ctx.font = font(800, 80);
                    ctx.fillText(this.fitText(ctx, n, 400), x + 34, y + 112);
                    ctx.fillStyle = '#888888';
                    ctx.font = font(800, 26);
                    ctx.fillText(cap.toUpperCase(), x + 34, y + 160);
                });
                let y = 880;
                this.recapLines(s).slice(0, 6).forEach(([label, value]) => {
                    ctx.fillStyle = '#9A9A9A';
                    ctx.font = font(800, 24);
                    ctx.fillText(label.toUpperCase(), 80, y);
                    ctx.fillStyle = '#2C2C2C';
                    ctx.font = font(700, 34);
                    ctx.fillText(this.fitText(ctx, value, 600), 400, y + 2);
                    y += 62;
                });
                ctx.fillStyle = '#586A58';
                ctx.font = font(700, 24);
                ctx.fillText('Logged with Dialed In', 80, 1290);
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                if (!blob) return;
                const file = new File([blob], 'dialed-in-recap.png', { type: 'image/png' });
                try {
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: s.label });
                        return;
                    }
                } catch (err) {
                    if (err && err.name === 'AbortError') return;
                }
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'dialed-in-recap.png';
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 4000);
            },

            renderAchievementsCard(user) {
                const levels = this.achievementLevelsByUser[user] || {};
                const catalog = this.getAchievementCatalog();
                const earned = catalog.reduce((s, d) => s + Number(levels[d.key] || 0), 0);
                const total = catalog.reduce((s, d) => s + d.thresholds.length, 0);
                const top = catalog.map(d => ({ d, lv: Number(levels[d.key] || 0) }))
                    .filter(x => x.lv > 0)
                    .sort((a, b) => b.lv / b.d.thresholds.length - a.lv / a.d.thresholds.length || b.lv - a.lv)
                    .slice(0, 3);
                return `<section class="profile-card"><h4 class="section-label">Achievements</h4><div class="ach-mini"><div><span class="ach-total-num">${earned}</span><span class="ach-total-of"> / ${total} levels</span></div><button type="button" class="btn-outline ach-open" data-name="${this.esc(user)}" onclick="app.openAchievementLocker(this.getAttribute('data-name'))">Open Locker</button></div>${top.length ? `<div class="ach-mini-list">${top.map(x => `<span class="flavor-mini">${this.esc(x.d.title)}${x.d.thresholds.length > 1 ? ` · Lv ${x.lv}` : ''}</span>`).join('')}</div>` : ''}</section>`;
            },

