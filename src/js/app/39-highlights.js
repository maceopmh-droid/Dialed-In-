            // ---- v14.7: monthly highlights. For the first week of a month, Discover opens with last month's: a few people
            // spotlighted for different reasons (best first month, most improved on one coffee, most helpful, explorer,
            // standout photo), never the same person two months running. Tap one for their profile.
            hlState() { return this._hl || (this._hl = { month: '', items: null, at: 0, loading: false }); },

            hlShowing(now = Date.now()) { return new Date(now).getDate() <= 7; },

            async loadHighlights() {
                const st = this.hlState();
                if (st.loading || !this.acctOn() || !Supa.ready()) return;
                st.loading = true;
                try { const out = await Supa.rpc('monthly_highlights', {}); st.month = (out && out.month) || ''; st.items = Array.isArray(out && out.items) ? out.items : []; }
                catch (e) { st.items = st.items || []; }
                finally { st.loading = false; st.at = Date.now(); }
                if (this.tab === 'feed') { this._feedHtml = null; this.render(); } else if (this.tab === 'profile') this.render();   // v15.1: Everyone on the Activity tab
            },

            hlLine(h) {
                const d = h.detail || {}, n = (v, one, many) => `${v} ${Number(v) === 1 ? one : many}`;
                switch (h.kind) {
                    case 'first_month': return ['Best first month', n(d.sessions, 'session', 'sessions')];
                    case 'improved': return ['Most improved', `${d.coffee ? `${d.coffee}: ` : ''}${this.fmtNum(d.from, 1)} to ${this.fmtNum(d.to, 1)} ★`];
                    case 'helpful': return ['Most helpful', n(d.answers, 'answer marked most helpful', 'answers marked most helpful')];
                    case 'explorer': return ['Explorer', n(d.origins, 'origin', 'origins')];
                    case 'photo': return ['Standout photo', n(d.likes, 'like', 'likes')];
                    default: return ['', ''];
                }
            },

            hlMonthLabel() { const st = this.hlState(); return st.month ? new Date(`${st.month}T12:00:00`).toLocaleDateString(undefined, { month: 'long' }) : 'Last month'; },
            hlRowsHtml() {
                return (this.hlState().items || []).map(h => {
                    const [what, more] = this.hlLine(h);
                    return `<button type="button" class="hl-row" data-profile="${this.esc(h.name)}">${this.personDotHtml(h.name, h.color)}<span class="hl-main"><b>${this.esc(h.name)}</b><small>${this.esc(what)}${more ? ` · ${this.esc(more)}` : ''}</small></span></button>`;
                }).join('');
            },

            highlightsHtml() {
                if (!this.acctOn() || !this.hlShowing()) return '';
                const st = this.hlState();
                if (!st.loading && !st.at) setTimeout(() => this.loadHighlights(), 0);
                if (!st.items || !st.items.length) return '';
                const label = this.hlMonthLabel();
                const rows = this.hlRowsHtml();
                return `<section class="feed-card hl-card" aria-label="${this.esc(label)} highlights"><div class="hl-head"><b>${this.esc(label)} highlights</b><small>From what people shared with Everyone</small></div>${rows}</section>`;
            },
