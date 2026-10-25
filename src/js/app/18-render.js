            openFeedTarget(beanId, brewId = '', openComments = false) {
                const targetBean = this.beans.get(String(beanId || ''));
                if (!targetBean) {
                    this.showToast('That coffee no longer exists.');
                    return;
                }
                const key = this.beanGroupKey(targetBean);
                const matchingBeans = Array.from(this.beans.values()).filter(bean => this.beanGroupKey(bean) === key);
                if (!matchingBeans.length) return;
                const group = {
                    meta: this.mergeGroupMeta(matchingBeans),
                    ids: matchingBeans.map(bean => bean.id),
                    users: new Set(matchingBeans.map(bean => bean.user))
                };
                const brews = Array.from(this.brews.values()).filter(brew => group.ids.includes(brew.beanId));
                this.openCommentId = (openComments && brewId) ? String(brewId) : null;
                const tb = brewId ? this.brews.get(String(brewId)) : null;
                this._lensWant = tb ? this.getBrewOwner(tb) : '';   // v15.1: a view that has that session in it
                this._logTarget = brewId ? String(brewId) : '';   // (and its card shown, however old)
                this.openDetail(group, brews);
                if (brewId) {
                    setTimeout(() => {
                        const row = document.getElementById(`log-${brewId}`);
                        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        if (openComments) {
                            const comments = document.getElementById(`comments-${brewId}`);
                            if (comments) comments.classList.add('active');
                        }
                    }, 120);
                }
            },

            toggleSort() {
                document.getElementById('sort-menu').classList.toggle('active');
            },

            setSort(type) {
                this.currentSort = type;
                const labels = { recent: 'Recent', rated: 'Top Rated', added: 'Date Added' };
                document.getElementById('sort-label').innerText = labels[type];
                document.querySelectorAll('.sort-option').forEach(el => el.classList.remove('selected'));
                const option = document.querySelector(`[data-sort="${type}"]`);
                if (option) option.classList.add('selected');
                document.getElementById('sort-menu').classList.remove('active');
                const mobileSort = document.getElementById('mobile-sort-select');
                if (mobileSort) mobileSort.value = type;
                this.render();
            },

            // v16.2: who's on a coffee, as faces (like a roaster's): most sessions first, five, then +N. In Mine only when
            // you share it with someone; in All always
            coffeeFacesHtml(group, brews) {
                const n = new Map();
                brews.forEach(b => { const o = this.getBrewOwner(b); if (o) n.set(o, (n.get(o) || 0) + 1); });
                [...(group.users || [])].forEach(u => { if (u && !n.has(u)) n.set(u, 0); });
                const people = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(e => e[0]);
                const shared = people.some(p => p !== this.user);
                if (!people.length || (this.coffeeScopeNow() === 'mine' && !shared)) return '';
                const shown = people.slice(0, 5), more = people.length - shown.length;
                return `<span class="dh-faces card-faces" aria-label="${this.esc(people.join(', '))}">${shown.map((p, i) => `<i data-face="${this.esc(p)}" style="background:${this.esc(this.getUserColor(p))};z-index:${9 - i}">${this.esc(this.feedInitial(p))}</i>`).join('')}${more > 0 ? `<i class="more">+${more}</i>` : ''}</span>`;
            },

            setMethodFilter(method) {
                this.currentMethodFilter = method;
                document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.remove('active'));
                const chip = document.querySelector(`[data-method="${method}"]`);
                if (chip) chip.classList.add('active');
                const mobileMethod = document.getElementById('mobile-method-select');
                if (mobileMethod) mobileMethod.value = method;
                this.render();
            },

            render() {
                this.gridStale = false;
                this._drawnDay = this.dayNum(Date.now());   // v13.4: which day this screen shows
                this.nextFreshExpiry = Infinity;
                const drafts = this.captureDrafts();
                this.renderScreen();
                this.restoreDrafts(drafts);
                this.fillShapeImages();
                this.updateRecapDot();
            },

            renderScreen() {
                const grid = document.getElementById('grid');
                const cls = this.tab === 'feed' ? 'feed-list' : (this.tab === 'profile' ? 'profile-view' : 'grid');
                if (grid.className !== cls) grid.className = cls;   // v15.0: untouched when it's the same
                if (!(this.tab === 'feed' && grid.getAttribute && grid.getAttribute('data-view') === 'feed')) {
                    grid.innerHTML = '';
                    if (grid.removeAttribute) grid.removeAttribute('data-view');
                }
                this.updateAchievementCount();
                const desktopSearch = document.getElementById('search-input');
                const mobileSearch = document.getElementById('search-input-mobile');
                const topSearch = document.getElementById('search-input-top');
                const searchQuery = ((desktopSearch && desktopSearch.value) || (mobileSearch && mobileSearch.value) || (topSearch && topSearch.value) || '').toLowerCase();
                const mobileSort = document.getElementById('mobile-sort-select');
                const mobileMethod = document.getElementById('mobile-method-select');
                if (mobileSort) mobileSort.value = this.currentSort;
                if (mobileMethod) mobileMethod.value = this.currentMethodFilter;
                if (mobileSearch && desktopSearch && mobileSearch.value !== desktopSearch.value) {
                    mobileSearch.value = desktopSearch.value;
                }

                if (this.tab === 'feed') {
                    this.renderFeed(grid);
                    return;
                }

                if (this.tab === 'profile') {
                    this.renderProfile(grid);
                    return;
                }

                if (this.tab === 'roasters') { this.renderRoasterList(grid, searchQuery); return; }

                let list = this.buildBeanGroups();
                const teaShelf = this.teaMode(), dw = this.drinkWords(this.drinkNow());   // v17.0: the shelf shows coffees or teas
                list = list.filter(item => this.isTeaBean(item.group.meta) === teaShelf);
                // v14.4: the library is your circle's; community sessions and coffees (Feed, Community) stay out of it
                if (this.communityIds && this.communityIds.size) {
                    list = list.filter(item => item.group.ids.some(id => !this.communityIds.has('bean:' + id)))
                        .map(item => ({ group: item.group, brews: item.brews.filter(b => !this.communityIds.has('brew:' + b.id)) }));
                }

                if (this.tab === 'my' && this.coffeeScopeNow() === 'mine') {   // v15.1: Coffees, Mine (All is everyone's)
                    list = list.filter(item => item.group.users.has(this.user));
                }

                if (searchQuery) {
                    list = list.filter(item => {
                        const b = item.group.meta;
                        const text = `${b.roaster || ''} ${b.name || ''} ${b.origin || ''} ${b.variety || ''} ${b.process || ''} ${b.teaType || ''}`.toLowerCase();
                        return text.includes(searchQuery);
                    });
                }

                if (this.currentMethodFilter !== 'all') {
                    const want = String(this.currentMethodFilter).toLowerCase();   // v15.1: "AeroPress" and "Aeropress" are the same method
                    list = list.filter(item => item.brews.some(brew => String(brew.method || '').toLowerCase() === want));
                }

                if (this.roasterFilter) {
                    const fr = this.roasterFind(this.roasterFilter);   // v13.4: follows a merge
                    if (!fr) this.roasterFilter = '';
                    else { this.roasterFilter = fr.key; list = list.filter(item => this.roasterKey(item.group.meta.roaster) === this.roasterFilter); }
                }

                if (this.currentSort === 'recent') {
                    list.sort((a, b) => {
                        const aRecent = a.brews.length ? Math.max(...a.brews.map(br => this.toTime(br.date))) : this.toTime(a.group.meta.date);
                        const bRecent = b.brews.length ? Math.max(...b.brews.map(br => this.toTime(br.date))) : this.toTime(b.group.meta.date);
                        return bRecent - aRecent;
                    });
                } else if (this.currentSort === 'rated') {
                    list.sort((a, b) => this.calculateAverageRating(b.brews) - this.calculateAverageRating(a.brews));
                } else if (this.currentSort === 'added') {
                    list.sort((a, b) => (a.group.addedAt || 0) - (b.group.addedAt || 0));
                }

                list.forEach(({ group, brews }) => {
                    const bean = group.meta;
                    const card = document.createElement('div');
                    card.className = 'card';
                    card.onclick = () => this.openDetail(group, brews);

                    const beanAgeSource = group.addedAt && group.addedAt !== Infinity ? group.addedAt : this.toTime(bean.date);
                    const isNew = beanAgeSource && (Date.now() - beanAgeSource) < (3 * 24 * 60 * 60 * 1000);
                    if (isNew) this.nextFreshExpiry = Math.min(this.nextFreshExpiry, beanAgeSource + (3 * 24 * 60 * 60 * 1000));
                    const avgRating = this.calculateAverageRating(brews);
                    const topFlavors = this.getTopFlavors(brews, 3);
                    const userNames = [...group.users].sort((a, b) => a.localeCompare(b));
                    const isShared = userNames.length > 1;
                    const art = teaShelf ? '#i-tea-line' : isShared ? '#i-leaf-line' : '#i-bean-line';

                    card.innerHTML = `
                        ${isNew ? `<div class="fresh-dot" title="New ${dw.item}"></div>` : ''}
                        ${avgRating > 0 ? `
                            <div class="card-rating">
                                <span class="star-meter" style="--fill:${this.starFill(avgRating)}%;--whole:${this.starWhole(avgRating)};--frac:${this.starFrac(avgRating)}"></span>
                                <span>${this.esc(this.formatRating(avgRating))}</span>
                            </div>
                        ` : ''}
                        <div class="lib-name" style="font-size:1.5rem; font-weight:700;">
                            ${this.esc(bean.name || '')}
                        </div>
                        ${bean.roaster ? `<div class="lib-roaster"><span class="ro-link" role="link" tabindex="0" data-roaster="${this.esc(bean.roaster)}"${teaShelf ? ' data-kind="tea"' : ''} onclick="app.openRoasterFrom(this, event)">${this.esc(bean.roaster)}</span></div>` : '<div class="lib-roaster"></div>'}
                        <div style="margin-bottom:12px;">
                            ${teaShelf && bean.teaType ? `<span class="tag tea-type-tag" style="--tt:${(this.teaTypeInfo(bean.teaType) || {}).color || '#7FA45B'}">${this.esc(bean.teaType)}</span>` : ''}
                            ${bean.variety ? `<span class="tag">${this.esc(bean.variety)}</span>` : ''}
                            ${bean.origin ? `<span class="tag">${this.esc(bean.origin)}</span>` : ''}
                            ${bean.process ? `<span class="tag">${this.esc(bean.process)}</span>` : ''}
                        </div>
                        <div class="card-users">
                            <span class="card-count">${brews.length} session${brews.length !== 1 ? 's' : ''}</span>
                            ${this.coffeeFacesHtml(group, brews)}
                        </div>
                        ${topFlavors.length ? `
                            <div class="top-flavors">
                                ${topFlavors.map(flavor => this.famChip(flavor)).join('')}
                            </div>
                        ` : ''}
                        <div class="card-illustration">
                            <svg class="line-illustration"><use href="${art}"/></svg>
                        </div>
                    `;
                    grid.appendChild(card);
                });

                if (!list.length) {
                    const message = (searchQuery || this.currentMethodFilter !== 'all' || this.roasterFilter)
                        ? `No ${dw.items} match your filters.`
                        : `No ${dw.items} yet. Add your first one with the + button.`;
                    grid.innerHTML = `<div style="text-align:center; color:#999; padding:3rem;">${message}</div>`;
                }
                if (this.tab === 'my' && grid.insertAdjacentHTML) grid.insertAdjacentHTML('afterbegin', this.coffeeScopeHtml() + this.roasterFilterHtml());
            },

