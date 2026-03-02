(function (window, document) {
    'use strict';

    const VERSION_META_PATH = './Scripts/meta/version.json';
    const RELEASE_NOTES_PATH = './Scripts/release-notes.json';
    const MODAL_ID = 'releaseNotesModal';

    let versionMeta = null;
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

        const versionLabel = versionMeta?.version
            ? `v${versionMeta.version}`
            : i18n('app.release_notes.version_unknown', 'version ?');

        versionBtn.textContent = versionLabel;
        versionBtn.title = i18n('app.release_notes.open', 'Voir les release notes');
        versionBtn.style.display = 'inline-block';
        versionBtn.onclick = openReleaseNotesModal;
    }

    async function loadVersionData() {
        try {
            const [metaJson, notesJson] = await Promise.all([
                fetchJson(VERSION_META_PATH),
                fetchJson(RELEASE_NOTES_PATH)
            ]);
            versionMeta = metaJson || {};
            releaseNotes = notesJson || {};
            renderVersionButton();
        } catch (error) {
            console.warn('Impossible de charger les informations de version:', error);
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
