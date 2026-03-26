(function (window, document) {
    'use strict';

    const RELEASE_NOTES_PATH = './Scripts/release-notes.json';
    const MODAL_ID = 'releaseNotesModal';

    let releaseNotes = null;

    function i18n(key, fallback, params) {
        if (window.GCToolI18n && typeof window.GCToolI18n.t === 'function') {
            return window.GCToolI18n.t(key, params || {}, fallback);
        }
        return fallback;
    }

    function safeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function fetchJson(path) {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${path}`);
        }
        return response.json();
    }

    function formatDate(value) {
        if (!value) {
            return '';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return date.toLocaleDateString();
    }

    function toReleaseTimestamp(value) {
        if (!value) {
            return Number.NEGATIVE_INFINITY;
        }
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
    }

    function toSemverTuple(version) {
        const raw = String(version || '').trim().replace(/^v/i, '');
        const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw);
        if (!match) {
            return null;
        }
        return [Number(match[1]), Number(match[2]), Number(match[3])];
    }

    function compareSemverDesc(left, right) {
        const leftTuple = toSemverTuple(left);
        const rightTuple = toSemverTuple(right);
        if (!leftTuple && !rightTuple) return 0;
        if (!leftTuple) return 1;
        if (!rightTuple) return -1;

        for (let i = 0; i < 3; i += 1) {
            if (leftTuple[i] === rightTuple[i]) continue;
            return leftTuple[i] > rightTuple[i] ? -1 : 1;
        }
        return 0;
    }

    function getMostRecentRelease() {
        const notes = Array.isArray(releaseNotes?.releases) ? releaseNotes.releases : [];
        if (!notes.length) {
            return null;
        }

        return notes
            .map((note, index) => ({ note, index }))
            .sort((left, right) => {
                const leftTs = toReleaseTimestamp(left.note?.date);
                const rightTs = toReleaseTimestamp(right.note?.date);
                if (leftTs !== rightTs) return rightTs - leftTs;

                const semverOrder = compareSemverDesc(left.note?.version, right.note?.version);
                if (semverOrder !== 0) return semverOrder;

                return left.index - right.index;
            })[0].note;
    }

    function normalizeVersionLabel(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        return /^v/i.test(raw) ? raw : `v${raw}`;
    }

    function ensureModal() {
        if (document.getElementById(MODAL_ID)) {
            return;
        }

        const modalHtml = `
            <div class="modal fade" id="${MODAL_ID}" tabindex="-1" role="dialog" aria-hidden="true">
                <div class="modal-dialog modal-lg" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                                <span aria-hidden="true">&times;</span>
                            </button>
                            <h4 class="modal-title">
                                <i class="fa fa-history"></i> ${i18n('app.release_notes.title', 'Release notes')}
                            </h4>
                        </div>
                        <div class="modal-body" id="releaseNotesContent"></div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-default" data-dismiss="modal">
                                ${i18n('app.release_notes.close', 'Fermer')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    function renderReleaseNotesHtml() {
        const notes = Array.isArray(releaseNotes?.releases) ? releaseNotes.releases : [];
        if (!notes.length) {
            return `<p class="text-muted">${safeHtml(i18n('app.release_notes.empty', 'Aucune release note disponible.'))}</p>`;
        }

        const noteItems = notes.map((note) => {
            const changes = Array.isArray(note.changes) ? note.changes : [];
            const changesHtml = changes.length
                ? `<ul class="release-note-changes">${changes.map((item) => `<li>${safeHtml(item)}</li>`).join('')}</ul>`
                : `<p class="text-muted">${safeHtml(i18n('app.release_notes.no_changes', 'Details non renseignes.'))}</p>`;

            return `
                <article class="release-note-item">
                    <div class="release-note-meta">${safeHtml(note.version || '-')} - ${safeHtml(formatDate(note.date || ''))}</div>
                    <div class="release-note-title">${safeHtml(note.title || '')}</div>
                    ${changesHtml}
                </article>
            `;
        }).join('');

        return `<div class="release-notes-list">${noteItems}</div>`;
    }

    function openReleaseNotesModal() {
        ensureModal();
        const content = document.getElementById('releaseNotesContent');
        if (content) {
            content.innerHTML = renderReleaseNotesHtml();
        }
        if (typeof window.$ === 'function') {
            window.$(`#${MODAL_ID}`).modal('show');
        }
    }

    function renderVersionButton() {
        const versionBtn = document.getElementById('appVersionBtn');
        if (!versionBtn) {
            return;
        }

        const latestRelease = getMostRecentRelease();
        const versionLabel = latestRelease?.version
            ? normalizeVersionLabel(latestRelease.version)
            : i18n('app.release_notes.version_unknown', 'version ?');

        versionBtn.textContent = versionLabel;
        versionBtn.title = i18n('app.release_notes.open', 'Voir les release notes');
        versionBtn.style.display = 'inline-block';
        versionBtn.onclick = openReleaseNotesModal;
    }

    async function loadVersionData() {
        try {
            const notesJson = await fetchJson(RELEASE_NOTES_PATH);
            releaseNotes = notesJson || {};
            renderVersionButton();
        } catch (error) {
            console.warn('Impossible de charger les informations de version:', error);
            releaseNotes = { releases: [] };
            renderVersionButton();
        }
    }

    function initializeVersionInfo() {
        loadVersionData();

        if (window.GCToolI18n && typeof window.GCToolI18n.onChange === 'function') {
            window.GCToolI18n.onChange(() => {
                renderVersionButton();
                const modalContent = document.getElementById('releaseNotesContent');
                if (modalContent) {
                    modalContent.innerHTML = renderReleaseNotesHtml();
                }
            });
        }
    }

    document.addEventListener('DOMContentLoaded', initializeVersionInfo);
}(window, document));
