// ==UserScript==
// @name         Genesys Cloud Analytics Query Capture
// @namespace    https://gctool.local
// @version      1.0.0
// @description  Capture les requetes Analytics envoyees depuis l'UI Genesys Cloud.
// @match        https://apps.mypurecloud.ie/*
// @match        *://apps.mypurecloud.*/*
// @match        *://*.mypurecloud.*/*
// @match        *://*.pure.cloud/*
// @run-at       document-start
// @icon         https://www.google.com/s2/favicons?sz=64&domain=mypurecloud.ie
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.__TM_GC_ANALYTICS_CAPTURE_INITIALIZED__) {
        return;
    }
    window.__TM_GC_ANALYTICS_CAPTURE_INITIALIZED__ = true;

    const STORAGE_KEY = 'tm_gc_analytics_queries';
    const MAX_ENTRIES = 20;
    const ANALYTICS_API_REGEX = /\/api\/v2\/analytics\//i;
    const PANEL_ID = 'tm-gc-analytics-panel';
    const RESTORE_BTN_ID = 'tm-gc-analytics-restore-btn';
    const EVENT_NAME = 'tm:gc:analytics-query';
    const STATS_EVENT_NAME = 'tm:gc:analytics-stats';
    const STATS_STORAGE_KEY = 'tm_gc_analytics_stats';
    const REPATCH_INTERVAL_MS = 1000;

    function safeJsonParse(text) {
        try {
            return JSON.parse(text);
        } catch (_error) {
            return text;
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function bodyToSerializable(body) {
        if (body == null) {
            return null;
        }

        if (typeof body === 'string') {
            return safeJsonParse(body);
        }

        if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
            return Object.fromEntries(body.entries());
        }

        if (typeof FormData !== 'undefined' && body instanceof FormData) {
            return Array.from(body.entries()).map(([key, value]) => [key, String(value)]);
        }

        if (typeof Blob !== 'undefined' && body instanceof Blob) {
            return `[Blob ${body.type || 'application/octet-stream'} - ${body.size} bytes]`;
        }

        if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
            return `[ArrayBuffer ${body.byteLength} bytes]`;
        }

        if (typeof body === 'object') {
            return body;
        }

        return String(body);
    }

    function loadEntries() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : [];
        } catch (_error) {
            return [];
        }
    }

    function saveEntries(entries) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    }

    function isTopWindow() {
        try {
            return window.top === window.self;
        } catch (_error) {
            return false;
        }
    }

    function loadStats() {
        try {
            const raw = localStorage.getItem(STATS_STORAGE_KEY);
            if (!raw) {
                return { seen: 0, captured: 0 };
            }
            const parsed = JSON.parse(raw);
            return {
                seen: Number(parsed?.seen) || 0,
                captured: Number(parsed?.captured) || 0
            };
        } catch (_error) {
            return { seen: 0, captured: 0 };
        }
    }

    function saveStats(nextStats) {
        const normalized = {
            seen: Math.max(0, Number(nextStats?.seen) || 0),
            captured: Math.max(0, Number(nextStats?.captured) || 0)
        };
        localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
    }

    function notifyStats(explicitStats) {
        const currentStats = explicitStats || loadStats();
        window.dispatchEvent(new CustomEvent(STATS_EVENT_NAME, {
            detail: {
                seen: currentStats.seen,
                captured: currentStats.captured
            }
        }));
    }

    function bumpStats(deltaSeen, deltaCaptured) {
        const current = loadStats();
        const next = saveStats({
            seen: current.seen + (Number(deltaSeen) || 0),
            captured: current.captured + (Number(deltaCaptured) || 0)
        });
        notifyStats(next);
    }

    function resetStats() {
        const next = saveStats({ seen: 0, captured: 0 });
        notifyStats(next);
    }

    function shouldTrackAnalytics(url) {
        if (!url) return false;
        return ANALYTICS_API_REGEX.test(String(url));
    }

    function persistEntry(entry) {
        const entries = loadEntries();
        entries.unshift(entry);
        saveEntries(entries);
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: entry }));
        console.log('[TM Analytics Capture]', entry);
    }

    function getApiV2Endpoint(url) {
        if (!url) {
            return '';
        }
        const normalizedUrl = String(url);
        const lower = normalizedUrl.toLowerCase();
        const marker = '/api/v2/';
        const markerIndex = lower.indexOf(marker);
        if (markerIndex === -1) {
            return normalizedUrl;
        }
        return normalizedUrl.slice(markerIndex + marker.length);
    }

    function getTimeOnly(isoDateString) {
        if (!isoDateString) {
            return '';
        }
        const date = new Date(isoDateString);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        return date.toLocaleTimeString();
    }

    function getGetArguments(url) {
        try {
            const parsedUrl = new URL(url, window.location.origin);
            const params = {};
            parsedUrl.searchParams.forEach((value, key) => {
                if (Object.prototype.hasOwnProperty.call(params, key)) {
                    const current = params[key];
                    if (Array.isArray(current)) {
                        current.push(value);
                    } else {
                        params[key] = [current, value];
                    }
                } else {
                    params[key] = value;
                }
            });
            return params;
        } catch (_error) {
            return {};
        }
    }

    function getEntryCopyPayload(entry) {
        const method = String(entry?.method || '').toUpperCase();
        if (method === 'POST') {
            return entry?.body ?? null;
        }
        if (method === 'GET') {
            return getGetArguments(entry?.url || '');
        }
        return entry?.body ?? null;
    }

    function shouldCapture(url, method) {
        if (!url || !method) return false;
        if (!shouldTrackAnalytics(url)) return false;
        return ['POST', 'GET'].includes(method.toUpperCase());
    }

    function buildEntry({ source, url, method, body }) {
        return {
            source,
            url,
            method: method.toUpperCase(),
            body: bodyToSerializable(body),
            capturedAt: new Date().toISOString()
        };
    }

    function captureRequest(payload) {
        if (!payload || !shouldTrackAnalytics(payload.url)) {
            return;
        }
        bumpStats(1, 0);

        if (!shouldCapture(payload.url, payload.method)) {
            ensurePanelWhenReady();
            return;
        }

        bumpStats(0, 1);
        persistEntry(buildEntry(payload));
        ensurePanelWhenReady();
    }

    function ensurePanelWhenReady() {
        if (!isTopWindow()) return;
        if (document.getElementById(PANEL_ID)) return;
        if (document.body) {
            ensurePanel();
            return;
        }
        window.requestAnimationFrame(ensurePanelWhenReady);
    }

    function patchFetch() {
        if (typeof window.fetch !== 'function') return;
        if (window.fetch.__tmGcPatchedFetch) return;

        const originalFetch = window.fetch;

        function patchedFetch(input, init) {
            const requestUrl = typeof input === 'string' ? input : input?.url || '';
            const requestMethod = (init?.method || input?.method || 'GET').toUpperCase();

            if (shouldTrackAnalytics(requestUrl)) {
                if (init && Object.prototype.hasOwnProperty.call(init, 'body')) {
                    captureRequest({
                        source: 'fetch',
                        url: requestUrl,
                        method: requestMethod,
                        body: init.body
                    });
                } else if (typeof Request !== 'undefined' && input instanceof Request) {
                    if (requestMethod === 'GET' || requestMethod === 'HEAD' || requestMethod === 'OPTIONS') {
                        captureRequest({
                            source: 'fetch',
                            url: requestUrl,
                            method: requestMethod,
                            body: null
                        });
                    } else {
                        input.clone().text()
                            .then((text) => {
                                captureRequest({
                                    source: 'fetch',
                                    url: requestUrl,
                                    method: requestMethod,
                                    body: text
                                });
                            })
                            .catch(() => {
                                captureRequest({
                                    source: 'fetch',
                                    url: requestUrl,
                                    method: requestMethod,
                                    body: null
                                });
                            });
                    }
                } else {
                    // Cas sans body (ou body inaccessible) : on journalise quand meme la requete.
                    captureRequest({
                        source: 'fetch',
                        url: requestUrl,
                        method: requestMethod,
                        body: null
                    });
                }
            }

            return originalFetch.apply(this, arguments);
        }

        Object.defineProperty(patchedFetch, '__tmGcPatchedFetch', { value: true });
        Object.defineProperty(patchedFetch, '__tmGcOriginalFetch', { value: originalFetch });
        window.fetch = patchedFetch;
    }

    function patchXHR() {
        if (typeof XMLHttpRequest === 'undefined') return;
        if (XMLHttpRequest.prototype.open && XMLHttpRequest.prototype.open.__tmGcPatchedXhrOpen &&
            XMLHttpRequest.prototype.send && XMLHttpRequest.prototype.send.__tmGcPatchedXhrSend) {
            return;
        }
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        function patchedOpen(method, url) {
            this.__tmGcMeta = { method: (method || 'GET').toUpperCase(), url: url || '' };
            return originalOpen.apply(this, arguments);
        }

        function patchedSend(body) {
            const meta = this.__tmGcMeta || {};
            captureRequest({
                source: 'xhr',
                url: meta.url || '',
                method: meta.method || 'GET',
                body
            });
            return originalSend.apply(this, arguments);
        }

        Object.defineProperty(patchedOpen, '__tmGcPatchedXhrOpen', { value: true });
        Object.defineProperty(patchedSend, '__tmGcPatchedXhrSend', { value: true });
        XMLHttpRequest.prototype.open = patchedOpen;
        XMLHttpRequest.prototype.send = patchedSend;
    }

    function isAnalyticsPage() {
        const haystack = `${location.pathname}${location.hash}${location.search}`.toLowerCase();
        return haystack.includes('analytics');
    }

    function ensurePanel() {
        if (document.getElementById(PANEL_ID)) return;
        if (!document.body) return;

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.style.cssText = [
            'position:fixed',
            'right:12px',
            'bottom:12px',
            'z-index:2147483647',
            'font-family:Arial,sans-serif',
            'font-size:12px',
            'width:360px',
            'max-height:55vh',
            'background:#fff',
            'border:1px solid #bbb',
            'border-radius:8px',
            'box-shadow:0 6px 18px rgba(0,0,0,.2)',
            'display:flex',
            'flex-direction:column',
            'overflow:hidden'
        ].join(';');

        panel.innerHTML = `
            <div style="padding:8px 10px;background:#f5f5f5;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;flex-direction:column;">
                    <strong>Analytics Query</strong>
                    <small id="tm-gc-counter" style="font-size:11px;color:#666;">0 / 0</small>
                </div>
                <div>
                    <button id="tm-gc-refresh" style="margin-right:6px;">Refresh</button>
                    <button id="tm-gc-toggle">Masquer</button>
                </div>
            </div>
            <div id="tm-gc-body" style="padding:8px;overflow:auto;white-space:pre-wrap;word-break:break-word;flex:1;"></div>
            <div style="padding:8px;border-top:1px solid #ddd;display:flex;gap:6px;justify-content:flex-end;">
                <button id="tm-gc-clear">Vider</button>
            </div>
        `;

        document.body.appendChild(panel);
        ensureRestoreButton(panel);

        const bodyEl = panel.querySelector('#tm-gc-body');
        const toggleBtn = panel.querySelector('#tm-gc-toggle');

        function render() {
            const entries = loadEntries();
            const counterEl = panel.querySelector('#tm-gc-counter');
            if (counterEl) {
                const currentStats = loadStats();
                counterEl.textContent = `Capturees / vues: ${currentStats.captured} / ${currentStats.seen}`;
            }
            if (!entries.length) {
                bodyEl.textContent = 'Aucune requete Analytics capturee pour le moment.';
                return;
            }

            const treeHtml = entries.map((entry, index) => {
                const method = String(entry.method || '').toUpperCase() || 'N/A';
                const endpoint = getApiV2Endpoint(entry.url || '');
                const timeOnly = getTimeOnly(entry.capturedAt || '');
                const isOpen = index === 0 ? ' open' : '';
                const entryJson = JSON.stringify(entry, null, 2);
                const escapedJson = escapeHtml(entryJson);

                return `
                    <details${isOpen} style="border:1px solid #e4e4e4;border-radius:6px;padding:6px 8px;background:#fafafa;">
                        <summary style="cursor:pointer;line-height:1.2;list-style:none;margin:0;padding:0;display:block;">
                            <div style="display:flex;flex-direction:column;gap:4px;min-width:0;">
                                <div style="display:flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;">
                                    <strong style="white-space:nowrap;">${escapeHtml(method)}</strong>
                                    <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;min-width:0;">
                                        ${escapeHtml(endpoint)}
                                    </span>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:24px;">
                                    <span style="font-size:11px;color:#666;">${escapeHtml(timeOnly)}</span>
                                    <button
                                        type="button"
                                        class="tm-gc-copy-entry"
                                        data-entry-index="${index}"
                                        style="display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;height:24px;min-height:24px;width:auto;min-width:56px;margin:0;padding:0 8px;line-height:1;font-size:11px;font-family:Arial,sans-serif;font-weight:400;border:1px solid #b8b8b8;border-radius:4px;background:#fff;color:#222;cursor:pointer;box-sizing:border-box;">
                                        Copier
                                    </button>
                                </div>
                            </div>
                        </summary>
                        <pre style="margin-top:8px;white-space:pre-wrap;word-break:break-word;">${escapedJson}</pre>
                    </details>
                `;
            }).join('');

            bodyEl.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:8px;">
                    ${treeHtml}
                </div>
            `;

            bodyEl.querySelectorAll('.tm-gc-copy-entry').forEach((buttonEl) => {
                buttonEl.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const index = Number(buttonEl.getAttribute('data-entry-index'));
                    if (!Number.isFinite(index) || index < 0 || index >= entries.length) {
                        return;
                    }
                    const payload = getEntryCopyPayload(entries[index]);
                    copyText(JSON.stringify(payload, null, 2));
                });
            });
        }

        function copyText(value) {
            if (!value) return;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(value).catch(() => {});
                return;
            }
            const ta = document.createElement('textarea');
            ta.value = value;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }

        panel.querySelector('#tm-gc-refresh').addEventListener('click', render);
        panel.querySelector('#tm-gc-clear').addEventListener('click', () => {
            saveEntries([]);
            resetStats();
            render();
        });
        toggleBtn.addEventListener('click', () => {
            setPanelCollapsed(panel, true);
        });

        window.addEventListener(EVENT_NAME, render);
        window.addEventListener(STATS_EVENT_NAME, render);
        window.addEventListener('storage', (event) => {
            if (!event || !event.key) return;
            if (event.key === STORAGE_KEY || event.key === STATS_STORAGE_KEY) {
                render();
            }
        });
        render();
    }

    function ensureRestoreButton(panel) {
        let restoreBtn = document.getElementById(RESTORE_BTN_ID);
        if (!restoreBtn) {
            restoreBtn = document.createElement('button');
            restoreBtn.id = RESTORE_BTN_ID;
            restoreBtn.type = 'button';
            restoreBtn.textContent = 'Afficher Analytics';
            restoreBtn.style.cssText = [
                'position:fixed',
                'right:12px',
                'bottom:12px',
                'z-index:2147483647',
                'font-family:Arial,sans-serif',
                'font-size:12px',
                'padding:6px 10px',
                'background:#ffffff',
                'border:1px solid #bbb',
                'border-radius:6px',
                'box-shadow:0 4px 10px rgba(0,0,0,.2)',
                'cursor:pointer',
                'display:none'
            ].join(';');

            restoreBtn.addEventListener('click', () => {
                setPanelCollapsed(panel, false);
            });

            document.body.appendChild(restoreBtn);
        }
    }

    function setPanelCollapsed(panel, shouldCollapse) {
        const restoreBtn = document.getElementById(RESTORE_BTN_ID);
        if (!panel) {
            return;
        }

        panel.style.display = shouldCollapse ? 'none' : 'flex';
        if (restoreBtn) {
            restoreBtn.style.display = shouldCollapse ? 'inline-block' : 'none';
        }
    }

    function installNetworkPatches() {
        patchFetch();
        patchXHR();
    }

    installNetworkPatches();
    window.setInterval(installNetworkPatches, REPATCH_INTERVAL_MS);

    function bootstrapPanel() {
        if (!isTopWindow()) return;
        if (!isAnalyticsPage()) return;
        ensurePanel();
    }

    document.addEventListener('DOMContentLoaded', bootstrapPanel);
    window.addEventListener('hashchange', bootstrapPanel);
    window.addEventListener('popstate', bootstrapPanel);
})();
