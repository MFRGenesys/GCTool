(function (window, document) {
    'use strict';

    const STORAGE_KEY = 'gctool.locale';
    const SUPPORTED_LOCALES = ['fr-FR', 'en-US', 'es-ES'];
    const FALLBACK_LOCALE = 'fr-FR';
    const FLAG_BY_LOCALE = {
        'fr-FR': '🇫🇷',
        'en-US': '🇺🇸',
        'es-ES': '🇪🇸'
    };

    const localeRegistry = window.GCTOOL_I18N_LOCALES || {};
    const listeners = [];
    let observer = null;

    function normalizeLocale(value) {
        if (!value) return FALLBACK_LOCALE;
        const lower = String(value).toLowerCase();
        if (lower.startsWith('fr')) return 'fr-FR';
        if (lower.startsWith('en')) return 'en-US';
        if (lower.startsWith('es')) return 'es-ES';
        return FALLBACK_LOCALE;
    }

    function detectLocale() {
        let saved = null;
        try {
            saved = window.localStorage ? localStorage.getItem(STORAGE_KEY) : null;
        } catch (_error) {
            saved = null;
        }
        if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;

        const navigatorLocales = (navigator.languages && navigator.languages.length)
            ? navigator.languages
            : [navigator.language || FALLBACK_LOCALE];
        for (const locale of navigatorLocales) {
            const normalized = normalizeLocale(locale);
            if (SUPPORTED_LOCALES.includes(normalized)) return normalized;
        }
        return FALLBACK_LOCALE;
    }

    function getDictionary(locale) {
        return localeRegistry[locale] || localeRegistry[FALLBACK_LOCALE] || {};
    }

    function interpolate(template, params) {
        if (!params) return template;
        return String(template).replace(/\{(\w+)\}/g, function (_, token) {
            return Object.prototype.hasOwnProperty.call(params, token) ? String(params[token]) : '';
        });
    }

    let currentLocale = detectLocale();

    function t(key, params, fallbackValue) {
        const dictionary = getDictionary(currentLocale);
        const fallbackDictionary = getDictionary(FALLBACK_LOCALE);
        const raw = dictionary[key] || fallbackDictionary[key] || fallbackValue || key;
        return interpolate(raw, params);
    }

    function apply(root) {
        const scope = root || document;
        if (!scope || !scope.querySelectorAll) return;

        scope.querySelectorAll('[data-i18n]').forEach((element) => {
            element.textContent = t(element.getAttribute('data-i18n'));
        });
        scope.querySelectorAll('[data-i18n-html]').forEach((element) => {
            element.innerHTML = t(element.getAttribute('data-i18n-html'));
        });
        scope.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
            element.setAttribute('placeholder', t(element.getAttribute('data-i18n-placeholder')));
        });
        scope.querySelectorAll('[data-i18n-title]').forEach((element) => {
            element.setAttribute('title', t(element.getAttribute('data-i18n-title')));
        });
        scope.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
            element.setAttribute('aria-label', t(element.getAttribute('data-i18n-aria-label')));
        });
        scope.querySelectorAll('[data-i18n-value]').forEach((element) => {
            element.setAttribute('value', t(element.getAttribute('data-i18n-value')));
        });
    }

    function persistLocale(locale) {
        if (!window.localStorage) return;
        try {
            localStorage.setItem(STORAGE_KEY, locale);
        } catch (_error) {
            // Ignore persistence error (private mode / blocked storage).
        }
    }

    function notifyChange() {
        listeners.forEach((listener) => {
            try {
                listener(currentLocale);
            } catch (error) {
                console.error('i18n listener error:', error);
            }
        });
    }

    function setLocale(locale) {
        const normalized = normalizeLocale(locale);
        if (normalized === currentLocale) return;
        currentLocale = normalized;
        persistLocale(currentLocale);
        document.documentElement.lang = currentLocale;
        apply(document);
        renderLanguageSwitcher();
        notifyChange();
    }

    function onChange(callback) {
        if (typeof callback === 'function') {
            listeners.push(callback);
        }
    }

    function getLocaleLabel(locale) {
        return t(`app.language.${locale}`, null, locale);
    }

    function renderLanguageSwitcher() {
        const container = document.getElementById('languageSwitcher');
        if (!container) return;

        container.innerHTML = '';
        const label = document.createElement('span');
        label.className = 'language-switcher-label';
        label.textContent = t('app.language.label');
        container.appendChild(label);

        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'language-switcher-buttons';

        SUPPORTED_LOCALES.forEach((locale) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `lang-flag-btn${locale === currentLocale ? ' is-active' : ''}`;
            button.dataset.locale = locale;
            button.textContent = FLAG_BY_LOCALE[locale] || locale;
            button.title = t('app.language.switch_to', { language: getLocaleLabel(locale) });
            button.setAttribute('aria-label', button.title);
            button.addEventListener('click', () => setLocale(locale));
            buttonGroup.appendChild(button);
        });

        container.appendChild(buttonGroup);
    }

    function startObserver() {
        if (observer || !window.MutationObserver) return;
        observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1) return;
                    const element = node;
                    if (
                        element.hasAttribute('data-i18n') ||
                        element.hasAttribute('data-i18n-html') ||
                        element.querySelector('[data-i18n], [data-i18n-html], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label], [data-i18n-value]')
                    ) {
                        apply(element);
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function initialize() {
        document.documentElement.lang = currentLocale;
        apply(document);
        renderLanguageSwitcher();
        startObserver();
    }

    window.GCToolI18n = {
        t,
        setLocale,
        getLocale: () => currentLocale,
        getSupportedLocales: () => SUPPORTED_LOCALES.slice(),
        apply,
        onChange,
        init: initialize
    };

    window.t = function (key, params, fallbackValue) {
        return window.GCToolI18n.t(key, params, fallbackValue);
    };

    document.addEventListener('DOMContentLoaded', initialize);
}(window, document));
