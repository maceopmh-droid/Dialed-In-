            extractDriveFileId(url) {
                const value = String(url || '').trim();
                if (!value) return '';
                const direct = value.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
                if (direct && direct[1]) return direct[1];
                const query = value.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
                if (query && query[1]) return query[1];
                return '';
            },

            buildDrivePhotoUrl(fileId) {
                const id = String(fileId || '').trim();
                if (!id) return '';
                return `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w1800`;
            },

            buildDriveFallbackUrls(fileId, originalUrl = '') {
                const id = String(fileId || '').trim();
                const out = [];
                if (id) {
                    out.push(`https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w1800`);
                    out.push(`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1800`);
                    out.push(`https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`);
                }
                const raw = String(originalUrl || '').trim();
                if (raw) out.push(raw);
                return [...new Set(out.filter(Boolean))];
            },

            handlePhotoFallback(imgEl) {
                if (!imgEl) return;
                const raw = imgEl.getAttribute('data-fallbacks') || '';
                const list = raw
                    .split('|')
                    .map(item => String(item || '').trim())
                    .filter(Boolean);
                const giveUp = () => { imgEl.onerror = null; const wrap = imgEl.closest('.session-photo-wrap'); if (wrap) wrap.classList.add('is-broken'); else imgEl.hidden = true; };   // v11.8: only when every source failed
                if (!list.length) {
                    giveUp();
                    return;
                }
                let idx = Number(imgEl.getAttribute('data-fallback-index') || '0');
                if (!Number.isFinite(idx)) idx = 0;
                idx += 1;
                if (idx >= list.length) {
                    giveUp();
                    return;
                }
                imgEl.setAttribute('data-fallback-index', String(idx));
                imgEl.src = list[idx];
            },

            normalizePhotoUrl(url) {
                const value = String(url || '').trim();
                if (!value) return '';
                if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(value)) return value;
                const driveId = this.extractDriveFileId(value);
                if (driveId) return this.buildDrivePhotoUrl(driveId);
                if (/^https?:\/\//i.test(value)) return value;
                return '';
            },

            normalizePhoto(value) {
                if (!value) return null;
                const row = (typeof value === 'string') ? { url: value } : value;
                if (!row || typeof row !== 'object') return null;
                const rawUrl = String(row.url || row.thumb || row.data || '').trim();
                const url = this.normalizePhotoUrl(rawUrl);
                if (!url) return null;
                if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(url) && url.length > 520000) return null;
                return {
                    url,
                    fileId: String(row.fileId || this.extractDriveFileId(url) || ''),
                    source: String(row.source || 'library'),
                    addedAt: row.addedAt || new Date().toISOString()
                };
            },

            renderSessionPhoto(brew, mode = 'detail') {
                const photo = this.normalizePhoto(brew && brew.photo);
                if (!photo) return '';
                const modeClass = mode === 'feed' ? ' feed-photo' : ' detail-photo';
                const fallbacks = this.buildDriveFallbackUrls(photo.fileId || this.extractDriveFileId(photo.url), photo.url);
                const src = fallbacks[0] || photo.url;
                return `
                    <div class="session-photo-wrap${modeClass}">
                        <img
                            class="session-photo-thumb"
                            src="${this.esc(src)}"
                            alt="Session photo"
                            loading="lazy"
                            decoding="async"
                            data-fallback-index="0"
                            data-fallbacks="${this.esc(fallbacks.join('|'))}"
                            onerror="app.handlePhotoFallback(this)"
                        >
                    </div>
                `;
            },

            openPhotoSourcePicker() {
                const sheet = document.getElementById('photo-source-sheet');
                if (!sheet) return;
                sheet.classList.add('active');
            },

            closePhotoSourcePicker() {
                const sheet = document.getElementById('photo-source-sheet');
                if (!sheet) return;
                sheet.classList.remove('active');
            },

            openPhotoPickerInput(input) {
                if (!input) return false;
                let opened = false;
                try {
                    if (typeof input.showPicker === 'function') {
                        input.showPicker();
                        opened = true;
                    }
                } catch (err) {
                    opened = false;
                }
                if (opened) return true;
                try {
                    input.click();
                    opened = true;
                } catch (err) {
                    opened = false;
                }
                return opened;
            },

            triggerCameraCapture() {
                const input = document.getElementById('photo-camera-input');
                if (!input) return;
                input.value = '';
                input.setAttribute('accept', 'image/*');
                input.setAttribute('capture', 'environment');
                const opened = this.openPhotoPickerInput(input);
                this.closePhotoSourcePicker();
                if (!opened) {
                    this.showToast('Camera unavailable on this browser. Opening library instead.');
                    this.triggerLibraryPicker();
                }
            },

            triggerLibraryPicker() {
                const input = document.getElementById('photo-library-input');
                if (!input) return;
                input.value = '';
                input.setAttribute('accept', 'image/*');
                input.removeAttribute('capture');
                const opened = this.openPhotoPickerInput(input);
                this.closePhotoSourcePicker();
                if (!opened) this.showToast('Photo picker unavailable on this browser.');
            },

            removeDraftPhoto() {
                this.draftPhoto = null;
                this.renderDraftPhoto();
                this.showToast('Photo removed.');
            },

            renderDraftPhoto() {
                const preview = document.getElementById('session-photo-preview');
                const removeBtn = document.getElementById('session-photo-remove');
                if (!preview || !removeBtn) return;
                const photo = this.normalizePhoto(this.draftPhoto);
                if (!photo) {
                    preview.classList.add('empty');
                    preview.innerHTML = 'No photo added yet.';
                    removeBtn.style.display = 'none';
                    return;
                }
                preview.classList.remove('empty');
                preview.innerHTML = `<img src="${this.esc(photo.url)}" alt="Session photo preview">`;
                removeBtn.style.display = 'inline-flex';
            },

            readFileAsDataURL(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result || ''));
                    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
                    reader.readAsDataURL(file);
                });
            },

            loadImageFromDataURL(dataUrl) {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error('Unable to process this image.'));
                    img.src = dataUrl;
                });
            },

            supportsWebPOutput() {
                if (typeof this._supportsWebPOutput === 'boolean') return this._supportsWebPOutput;
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = 2;
                    canvas.height = 2;
                    const probe = canvas.toDataURL('image/webp', 0.8);
                    this._supportsWebPOutput = /^data:image\/webp/i.test(probe);
                } catch (err) {
                    this._supportsWebPOutput = false;
                }
                return this._supportsWebPOutput;
            },

            getPhotoOutputFormat() {
                return this.supportsWebPOutput() ? 'image/webp' : 'image/jpeg';
            },

            renderCompressedImage(img, maxEdge, quality, format = 'image/jpeg') {
                const srcWidth = img.naturalWidth || img.width || 1;
                const srcHeight = img.naturalHeight || img.height || 1;
                const scale = Math.min(1, maxEdge / Math.max(srcWidth, srcHeight));
                const width = Math.max(1, Math.round(srcWidth * scale));
                const height = Math.max(1, Math.round(srcHeight * scale));
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) throw new Error('Could not create image canvas.');
                ctx.imageSmoothingEnabled = true;
                if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
                if (format === 'image/jpeg') {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                }
                ctx.drawImage(img, 0, 0, width, height);
                try {
                    const out = canvas.toDataURL(format, quality);
                    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(out)) return out;
                } catch (err) {}
                return canvas.toDataURL('image/jpeg', quality);
            },

            async compressPhotoForEvent(file) {
                const raw = await this.readFileAsDataURL(file);
                const img = await this.loadImageFromDataURL(raw);
                const format = this.getPhotoOutputFormat();
                const preferredLimit = format === 'image/webp' ? 280000 : 240000;
                const hardLimit = format === 'image/webp' ? 360000 : 320000;
                const attempts = [
                    { max: 1400, q: 0.92 },
                    { max: 1280, q: 0.9 },
                    { max: 1180, q: 0.88 },
                    { max: 1080, q: 0.86 },
                    { max: 980, q: 0.84 },
                    { max: 860, q: 0.82 },
                    { max: 760, q: 0.8 },
                    { max: 660, q: 0.78 },
                    { max: 560, q: 0.74 }
                ];
                let best = '';
                for (const attempt of attempts) {
                    const out = this.renderCompressedImage(img, attempt.max, attempt.q, format);
                    if (!best || out.length < best.length) best = out;
                    if (out.length <= preferredLimit) return out;
                }

                const qualityPass = [0.7, 0.66, 0.62, 0.58, 0.54, 0.5, 0.46, 0.42];
                for (const q of qualityPass) {
                    const out = this.renderCompressedImage(img, 620, q, format);
                    if (out.length < best.length) best = out;
                    if (out.length <= hardLimit) return out;
                }

                const finalOut = this.renderCompressedImage(img, 520, 0.4, format);
                if (finalOut.length < best.length) best = finalOut;
                if (best && best.length <= 420000) return best;

                const emergency = [
                    { max: 280, q: 0.36 },
                    { max: 240, q: 0.34 },
                    { max: 200, q: 0.32 },
                    { max: 160, q: 0.3 }
                ];
                for (const pass of emergency) {
                    const out = this.renderCompressedImage(img, pass.max, pass.q, format);
                    if (out.length < best.length) best = out;
                    if (out.length <= 520000) return out;
                }

                return best;
            },

            async handlePhotoInput(event, source = 'library') {
                const input = event && event.target;
                const file = input && input.files && input.files[0];
                if (!file) return;
                if (!String(file.type || '').startsWith('image/')) {
                    this.showToast('Please choose an image file.');
                    input.value = '';
                    return;
                }
                const gen = this._brewFormGen;
                this.photoBusy = true;
                try {
                    this.showToast('Processing photo...');
                    const dataUrl = await this.compressPhotoForEvent(file);
                    if (gen !== this._brewFormGen) return;   // the form was closed or reopened meanwhile: this photo isn't for it
                    const photo = this.normalizePhoto({
                        url: dataUrl,
                        source,
                        addedAt: new Date().toISOString()
                    });
                    if (!photo) throw new Error('Photo could not be saved.');
                    this.draftPhoto = photo;
                    this.renderDraftPhoto();
                    this.showToast('Photo ready for this session.');
                } catch (err) {
                    this.showToast(String(err && err.message ? err.message : 'Photo upload failed.'));
                } finally {
                    this.photoBusy = false;
                    if (input) input.value = '';
                    this.closePhotoSourcePicker();
                }
            },

