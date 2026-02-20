/*
 * api-explorer.js
 * Explorateur dynamique des APIs Genesys Cloud via la librairie SDK deja chargee.
 *
 */

//(function apiExplorerModule() {
    'use strict';
    const ARRAY_WILDCARD_TOKEN = '__ARRAY_ALL__';
    const FAVORITES_COOKIE_NAME = 'gctool_api_explorer_favorites';
    const FAVORITES_COOKIE_TTL_DAYS = 365;
    const PROJECTION_AUTOCOMPLETE_DEBOUNCE_MS = 140;
    const PROJECTION_AUTOCOMPLETE_MIN_CHARS = 2;
    const PROJECTION_AUTOCOMPLETE_LIMIT = 20;
    const API_RATE_LIMIT_MAX_PER_MINUTE = 300;
    const API_RATE_LIMIT_WINDOW_MS = 60 * 1000;
    const API_RATE_LIMIT_RETRY_FALLBACK_MS = 10 * 1000;
    const API_RATE_LIMIT_MAX_RETRIES = 2;
    const RESPONSE_TAB_LIMIT = 5;
    const NODE_VIEW_AUTO_TEXT_THRESHOLD_BYTES = 1024 * 1024;

    const apiExplorerState = {
        // Etat runtime uniquement (pas de persistance locale, sauf favoris via cookie).
        initialized: false,
        catalog: [],
        apiInstances: {},
        expandedCategories: new Set(),
        favorites: new Set(),
        inputMode: 'fields',
        selectedEndpointId: null,
        lastResponse: null,
        lastProjection: null,
        lastExecutionMeta: null,
        projectionAutocompletePaths: [],
        currentProjectionSuggestions: [],
        projectionAutocompleteDebounceId: null,
        isProjectionProcessing: false,
        isLeftPanelCollapsed: false,
        isLeftListCollapsed: false,
        isJsonPathHelpCollapsed: true,
        isRequestPanelCollapsed: false,
        responseTabs: [],
        activeResponseTabId: null,
        nextResponseTabSequence: 1,
        requestTimestamps: []
    };

    const batchScaffold = {
        // Espace reserve pour la future API batch "avancee" exposee globalement.
        parseInputLines: function parseInputLines(rawText) {
            if (!rawText) return [];
            return String(rawText)
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);
        },

        async executeBatchRequests() {
            throw new Error('Mode batch non implemente dans cette version.');
        },

        aggregateResponses: function aggregateResponses(responses, projectionPath) {
            const list = Array.isArray(responses) ? responses : [];
            if (!projectionPath) return list;
            return list.map((item) => getValueByPath(item, projectionPath)).filter((item) => typeof item !== 'undefined');
        }
    };

    window.GCTOOL_API_EXPLORER_BATCH = batchScaffold;
    window.initializeApiExplorerTab = initializeApiExplorerTab;

    function initializeApiExplorerTab() {
        const root = document.getElementById('apiExplorerRoot');
        if (!root) {
            console.warn('[API Explorer] Root introuvable.');
            return;
        }

        if (state.initialized) {
            return;
        }

        apiExplorerState.initialized = true;
        loadFavoritesFromCookie();
        bindUiEvents();
        buildCatalog();
        pruneUnknownFavorites();
        renderCatalog();
        renderResponseTabs();
        applyPanelLayoutState();

        console.log('[API Explorer] Module initialise.');
    }

    function bindUiEvents() {
        ensureBatchValidationElement();
        ensureProjectionSuggestionDataList();

        const searchInput = document.getElementById('apiExplorerSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', renderCatalog);
        }

        const filters = document.querySelectorAll('.api-method-filter');
        filters.forEach((checkbox) => {
            checkbox.addEventListener('change', renderCatalog);
        });

        const catalog = document.getElementById('apiExplorerCatalog');
        if (catalog) {
            catalog.addEventListener('click', onCatalogClicked);
        }

        const favoritesList = document.getElementById('apiExplorerFavoritesList');
        if (favoritesList) {
            favoritesList.addEventListener('click', onFavoritesClicked);
        }

        const executeBtn = document.getElementById('apiExplorerExecuteBtn');
        if (executeBtn) {
            executeBtn.addEventListener('click', (event) => {
                if (event) event.preventDefault();
                executeSelectedEndpoint({ targetTabMode: 'current' });
            });
        }

        const executeNewTabBtn = document.getElementById('apiExplorerExecuteNewTabBtn');
        if (executeNewTabBtn) {
            executeNewTabBtn.addEventListener('click', (event) => {
                if (event) event.preventDefault();
                executeSelectedEndpoint({ targetTabMode: 'new' });
            });
        }

        const toggleLeftPanelBtn = document.getElementById('apiExplorerToggleLeftPanelBtn');
        if (toggleLeftPanelBtn) {
            toggleLeftPanelBtn.addEventListener('click', toggleLeftPanelCollapse);
        }

        const toggleLeftListBtn = document.getElementById('apiExplorerToggleLeftListBtn');
        if (toggleLeftListBtn) {
            toggleLeftListBtn.addEventListener('click', toggleLeftListCollapse);
        }

        const toggleJsonPathHelpBtn = document.getElementById('apiExplorerToggleJsonPathHelpBtn');
        if (toggleJsonPathHelpBtn) {
            toggleJsonPathHelpBtn.addEventListener('click', toggleJsonPathHelpCollapse);
        }

        const toggleRequestPanelBtn = document.getElementById('apiExplorerToggleRequestPanelBtn');
        if (toggleRequestPanelBtn) {
            toggleRequestPanelBtn.addEventListener('click', toggleRequestPanelCollapse);
        }

        const modeFieldsBtn = document.getElementById('apiExplorerModeFieldsBtn');
        if (modeFieldsBtn) {
            modeFieldsBtn.addEventListener('click', () => switchInputMode('fields'));
        }

        const modeBatchBtn = document.getElementById('apiExplorerModeBatchBtn');
        if (modeBatchBtn) {
            modeBatchBtn.addEventListener('click', () => switchInputMode('batch'));
        }

        const batchJsonInput = document.getElementById('apiExplorerBatchJson');
        if (batchJsonInput) {
            // Fallback JS au cas ou le HTML n'a pas encore les attributs.
            batchJsonInput.setAttribute('spellcheck', 'false');
            batchJsonInput.setAttribute('autocomplete', 'off');
            batchJsonInput.setAttribute('autocorrect', 'off');
            batchJsonInput.setAttribute('autocapitalize', 'off');
            batchJsonInput.addEventListener('input', () => validateBatchJsonEditorRealtime({ silentWhenEmpty: true }));
        }

        const applyProjectionBtn = document.getElementById('apiExplorerApplyProjectionBtn');
        if (applyProjectionBtn) {
            applyProjectionBtn.addEventListener('click', applyProjection);
        }

        const resetProjectionBtn = document.getElementById('apiExplorerResetProjectionBtn');
        if (resetProjectionBtn) {
            resetProjectionBtn.addEventListener('click', resetProjection);
        }

        const exportCsvBtn = document.getElementById('apiExplorerExportCsvBtn');
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', (event) => {
                if (event) event.preventDefault();
                exportCurrentProjectionToCsv();
            });
        }

        const exportJsonBtn = document.getElementById('apiExplorerExportJsonBtn');
        if (exportJsonBtn) {
            exportJsonBtn.addEventListener('click', (event) => {
                if (event) event.preventDefault();
                exportCurrentProjectionToJson();
            });
        }

        const responseViewer = document.getElementById('apiExplorerResponse');
        if (responseViewer) {
            responseViewer.addEventListener('click', onResponseViewerClicked);
        }

        const responseTabs = document.getElementById('apiExplorerResponseTabs');
        if (responseTabs) {
            responseTabs.addEventListener('click', onResponseTabsClicked);
        }

        const projectionPathInput = document.getElementById('apiExplorerProjectionPath');
        if (projectionPathInput) {
            projectionPathInput.setAttribute('spellcheck', 'false');
            projectionPathInput.setAttribute('autocomplete', 'off');
            projectionPathInput.addEventListener('input', scheduleProjectionAutocompleteRefresh);
            projectionPathInput.addEventListener('focus', refreshProjectionAutocompleteSuggestions);
            projectionPathInput.addEventListener('keydown', onProjectionPathKeyDown);
        }

        const nodeViewSwitch = document.getElementById('apiExplorerResponseNodeViewSwitch');
        if (nodeViewSwitch) {
            nodeViewSwitch.addEventListener('change', onResponseNodeViewSwitchChanged);
        }

        applyPanelLayoutState();
    }

    function ensureBatchValidationElement() {
        const batchInput = document.getElementById('apiExplorerBatchJson');
        if (!batchInput) return null;

        let statusEl = document.getElementById('apiExplorerBatchJsonValidation');
        if (statusEl) return statusEl;

        statusEl = document.createElement('div');
        statusEl.id = 'apiExplorerBatchJsonValidation';
        statusEl.className = 'small text-muted';
        statusEl.style.marginTop = '6px';
        statusEl.textContent = 'JSON lot: en attente de saisie.';
        if (batchInput.parentNode) {
            batchInput.parentNode.appendChild(statusEl);
        }

        return statusEl;
    }

    function ensureProjectionSuggestionDataList() {
        const input = document.getElementById('apiExplorerProjectionPath');
        if (!input) return null;

        const expectedId = 'apiExplorerProjectionSuggestions';
        let dataList = document.getElementById(expectedId);
        if (!dataList) {
            dataList = document.createElement('datalist');
            dataList.id = expectedId;
            const root = document.getElementById('apiExplorerRoot') || document.body;
            root.appendChild(dataList);
        }

        if (input.getAttribute('list') !== expectedId) {
            input.setAttribute('list', expectedId);
        }

        return dataList;
    }

    function onResponseViewerClicked(event) {
        const toggleBtn = event.target.closest('.json-toggle');
        if (!toggleBtn || toggleBtn.classList.contains('json-toggle-empty')) {
            return;
        }

        const node = toggleBtn.closest('.json-node');
        if (!node || !node.classList.contains('json-composite')) {
            return;
        }

        node.classList.toggle('json-collapsed');
        toggleBtn.textContent = node.classList.contains('json-collapsed') ? '+' : '-';
    }

    function switchInputMode(mode) {
        const endpoint = getSelectedEndpoint();
        if (!endpoint) return;

        const allowsBatch = allowsBatchMode(endpoint);
        const targetMode = mode === 'batch' && allowsBatch ? 'batch' : 'fields';
        apiExplorerState.inputMode = targetMode;

        const modeFieldsBtn = document.getElementById('apiExplorerModeFieldsBtn');
        const modeBatchBtn = document.getElementById('apiExplorerModeBatchBtn');
        const paramsForm = document.getElementById('apiExplorerParamsForm');
        const batchPanel = document.getElementById('apiExplorerBatchPanel');

        if (modeFieldsBtn) modeFieldsBtn.classList.toggle('active', targetMode === 'fields');
        if (modeBatchBtn) {
            modeBatchBtn.classList.toggle('active', targetMode === 'batch');
            modeBatchBtn.disabled = !allowsBatch;
            modeBatchBtn.title = allowsBatch
                ? 'Executer plusieurs appels avec des inputs differents'
                : 'Le mode lot est reserve aux GET/DELETE/PATCH/PUT';
        }

        if (paramsForm) paramsForm.style.display = targetMode === 'fields' ? 'block' : 'none';
        if (batchPanel) batchPanel.style.display = targetMode === 'batch' ? 'block' : 'none';
    }

    function toggleLeftPanelCollapse() {
        apiExplorerState.isLeftPanelCollapsed = !state.isLeftPanelCollapsed;
        applyPanelLayoutState();
    }

    function toggleLeftListCollapse() {
        apiExplorerState.isLeftListCollapsed = !state.isLeftListCollapsed;
        if (state.isLeftListCollapsed) {
            // Si on replie la liste, on affiche automatiquement l'aide.
            apiExplorerState.isJsonPathHelpCollapsed = false;
        }
        applyPanelLayoutState();
    }

    function toggleJsonPathHelpCollapse() {
        apiExplorerState.isJsonPathHelpCollapsed = !state.isJsonPathHelpCollapsed;
        applyPanelLayoutState();
    }

    function toggleRequestPanelCollapse() {
        apiExplorerState.isRequestPanelCollapsed = !state.isRequestPanelCollapsed;
        applyPanelLayoutState();
    }

    function applyPanelLayoutState() {
        const root = document.getElementById('apiExplorerRoot');
        if (!root) return;

        root.classList.toggle('api-left-collapsed', apiExplorerState.isLeftPanelCollapsed);
        root.classList.toggle('api-left-list-collapsed', apiExplorerState.isLeftListCollapsed);
        root.classList.toggle('api-jsonpath-help-collapsed', apiExplorerState.isJsonPathHelpCollapsed);
        root.classList.toggle('api-request-collapsed', apiExplorerState.isRequestPanelCollapsed);

        const leftPanelBtn = document.getElementById('apiExplorerToggleLeftPanelBtn');
        if (leftPanelBtn) {
            const iconClass = apiExplorerState.isLeftPanelCollapsed ? 'fa-angle-double-right' : 'fa-angle-double-left';
            leftPanelBtn.innerHTML = '<i class="fa ' + iconClass + '"></i>';
            leftPanelBtn.title = apiExplorerState.isLeftPanelCollapsed ? 'Afficher le panneau API' : 'Replier le panneau API';
            leftPanelBtn.setAttribute('aria-label', leftPanelBtn.title);
        }

        const leftListBtn = document.getElementById('apiExplorerToggleLeftListBtn');
        if (leftListBtn) {
            const iconClass = apiExplorerState.isLeftListCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
            leftListBtn.innerHTML = '<i class="fa ' + iconClass + '"></i>';
            leftListBtn.title = apiExplorerState.isLeftListCollapsed
                ? 'Afficher la liste API'
                : 'Replier la liste API (afficher l aide)';
            leftListBtn.setAttribute('aria-label', leftListBtn.title);
        }

        const jsonPathHelpBtn = document.getElementById('apiExplorerToggleJsonPathHelpBtn');
        if (jsonPathHelpBtn) {
            const iconClass = apiExplorerState.isJsonPathHelpCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
            jsonPathHelpBtn.innerHTML = '<i class="fa ' + iconClass + '"></i>';
            jsonPathHelpBtn.title = apiExplorerState.isJsonPathHelpCollapsed
                ? 'Afficher l aide JSONPath'
                : 'Replier l aide JSONPath';
            jsonPathHelpBtn.setAttribute('aria-label', jsonPathHelpBtn.title);
        }

        const requestPanelBtn = document.getElementById('apiExplorerToggleRequestPanelBtn');
        if (requestPanelBtn) {
            const iconClass = apiExplorerState.isRequestPanelCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
            requestPanelBtn.innerHTML = '<i class="fa ' + iconClass + '"></i>';
            requestPanelBtn.title = apiExplorerState.isRequestPanelCollapsed
                ? 'Afficher les parametres de requete'
                : 'Replier les parametres de requete';
            requestPanelBtn.setAttribute('aria-label', requestPanelBtn.title);
        }
    }

    function allowsBatchMode(endpoint) {
        if (!endpoint) return false;
        return ['GET', 'DELETE', 'PATCH', 'PUT'].includes(endpoint.httpMethod);
    }

    function getSelectedEndpoint() {
        return apiExplorerState.catalog.find((item) => item.id === apiExplorerState.selectedEndpointId) || null;
    }

    function buildCatalog() {
        apiExplorerState.catalog = [];

        if (typeof platformClient === 'undefined' || !platformClient) {
            setCatalogInfo('SDK platformClient introuvable.');
            return;
        }

        const apiClassNames = Object.keys(platformClient)
            .filter((key) => key.endsWith('Api') && key !== 'ApiClient' && typeof platformClient[key] === 'function')
            .sort();

        const entries = [];

        // Introspection SDK: on parcourt toutes les classes *Api puis leurs methodes.
        apiClassNames.forEach((apiClassName) => {
            const apiInstance = getApiInstance(apiClassName);
            if (!apiInstance) return;

            const proto = Object.getPrototypeOf(apiInstance);
            if (!proto) return;

            const methodNames = Object.getOwnPropertyNames(proto)
                .filter((name) => name !== 'constructor' && typeof apiInstance[name] === 'function')
                .sort();

            methodNames.forEach((methodName) => {
                const fn = apiInstance[methodName];
                const meta = inferEndpointMetadata(apiClassName, methodName, fn);
                entries.push(meta);
            });
        });

        apiExplorerState.catalog = entries;
    }

    function getApiInstance(apiClassName) {
        if (state.apiInstances[apiClassName]) {
            return apiExplorerState.apiInstances[apiClassName];
        }

        try {
            apiExplorerState.apiInstances[apiClassName] = new platformClient[apiClassName]();
            return apiExplorerState.apiInstances[apiClassName];
        } catch (error) {
            console.warn('[API Explorer] Impossible de creer', apiClassName, error);
            return null;
        }
    }

    function inferEndpointMetadata(apiClassName, methodName, fn) {
        // On derive les metadonnees directement depuis le code source genere du SDK.
        const source = String(fn);
        const callApiArgs = extractCallApiArguments(source);
        const routePath = unwrapQuotedValue(callApiArgs[0]) || '';
        const httpMethod = (unwrapQuotedValue(callApiArgs[1]) || 'UNKNOWN').toUpperCase();
        const requiredParams = extractRequiredParams(source);
        const requiredInputParams = requiredParams.filter((name) => name !== 'body');
        const bodyArgumentExpression = (callApiArgs[6] || '').trim();
        const expectsBodyFromOptions = /\.body\b/.test(bodyArgumentExpression);
        const hasBodyParameter = requiredParams.includes('body') || expectsBodyFromOptions || ['POST', 'PATCH', 'PUT'].includes(httpMethod);

        return {
            id: apiClassName + '.' + methodName,
            apiClassName,
            category: prettifyCategoryName(apiClassName),
            methodName,
            httpMethod,
            routePath,
            requiredParams,
            requiredInputParams,
            functionArity: Number(fn.length) || 0,
            hasBodyParameter,
            expectsBodyFromOptions
        };
    }

    function extractCallApiArguments(sourceCode) {
        // Parseur "leger" d'arguments callApi(...), robuste aux chaines/objets imbriques.
        const token = 'callApi(';
        const start = sourceCode.indexOf(token);
        if (start === -1) return [];

        let index = start + token.length;
        let depth = 1;
        let current = '';
        const args = [];

        let inSingleQuote = false;
        let inDoubleQuote = false;
        let inTemplateQuote = false;
        let escaped = false;

        while (index < sourceCode.length) {
            const ch = sourceCode[index];

            if (escaped) {
                current += ch;
                escaped = false;
                index++;
                continue;
            }

            if (ch === '\\') {
                current += ch;
                escaped = true;
                index++;
                continue;
            }

            if (inSingleQuote) {
                current += ch;
                if (ch === "'") inSingleQuote = false;
                index++;
                continue;
            }

            if (inDoubleQuote) {
                current += ch;
                if (ch === '"') inDoubleQuote = false;
                index++;
                continue;
            }

            if (inTemplateQuote) {
                current += ch;
                if (ch === '`') inTemplateQuote = false;
                index++;
                continue;
            }

            if (ch === "'") {
                inSingleQuote = true;
                current += ch;
                index++;
                continue;
            }

            if (ch === '"') {
                inDoubleQuote = true;
                current += ch;
                index++;
                continue;
            }

            if (ch === '`') {
                inTemplateQuote = true;
                current += ch;
                index++;
                continue;
            }

            if (ch === '(' || ch === '{' || ch === '[') {
                depth++;
                current += ch;
                index++;
                continue;
            }

            if (ch === ')' || ch === '}' || ch === ']') {
                depth--;

                if (depth === 0) {
                    args.push(current.trim());
                    break;
                }

                current += ch;
                index++;
                continue;
            }

            if (ch === ',' && depth === 1) {
                args.push(current.trim());
                current = '';
                index++;
                continue;
            }

            current += ch;
            index++;
        }

        return args;
    }

    function unwrapQuotedValue(value) {
        if (!value) return '';
        const trimmed = value.trim();
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return trimmed.slice(1, -1);
        }
        return trimmed;
    }

    function extractRequiredParams(sourceCode) {
        // Le SDK signale les params requis via "Missing the required parameter ...".
        const regex = /Missing the required parameter "([^"]+)"/g;
        const found = [];
        let match;

        while ((match = regex.exec(sourceCode)) !== null) {
            const paramName = match[1];
            if (!found.includes(paramName)) {
                found.push(paramName);
            }
        }

        return found;
    }

    function prettifyCategoryName(apiClassName) {
        return apiClassName
            .replace(/Api$/, '')
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    }

    function getSelectedHttpMethods() {
        const methods = new Set();
        const checkboxes = document.querySelectorAll('.api-method-filter');

        checkboxes.forEach((checkbox) => {
            if (checkbox.checked) {
                methods.add(String(checkbox.value).toUpperCase());
            }
        });

        return methods;
    }

    function renderCatalog() {
        const catalogEl = document.getElementById('apiExplorerCatalog');
        if (!catalogEl) return;

        const searchValue = ((document.getElementById('apiExplorerSearchInput') || {}).value || '').trim().toLowerCase();
        const enabledMethods = getSelectedHttpMethods();

        const filtered = apiExplorerState.catalog.filter((item) => {
            const methodAllowed = item.httpMethod === 'UNKNOWN' || enabledMethods.has(item.httpMethod);
            if (!methodAllowed) return false;

            if (!searchValue) return true;

            const haystack = (item.category + ' ' + item.apiClassName + ' ' + item.methodName + ' ' + item.routePath + ' ' + item.httpMethod)
                .toLowerCase();

            return haystack.includes(searchValue);
        });

        const grouped = groupByCategory(filtered);
        const categories = Object.keys(grouped).sort();

        // La section favoris est rendue a chaque filtrage pour rester synchronisee.
        renderFavoritesSection();

        if (categories.length && apiExplorerState.expandedCategories.size === 0) {
            apiExplorerState.expandedCategories.add(categories[0]);
        }

        if (!filtered.length) {
            catalogEl.innerHTML = '<div class="text-muted" style="padding:10px;">Aucune API ne correspond au filtre.</div>';
            setCatalogInfo('0 endpoint - 0 categorie');
            return;
        }

        const html = categories.map((category) => {
            const endpoints = grouped[category];
            const expanded = apiExplorerState.expandedCategories.has(category);

            return `
                <div class="api-category-row">
                    <button type="button" class="api-category-toggle" data-category="${escapeAttribute(category)}">
                        <i class="fa ${expanded ? 'fa-caret-down' : 'fa-caret-right'}"></i>
                        ${escapeHtml(category)}
                        <span class="badge" style="float:right;">${endpoints.length}</span>
                    </button>
                    <div class="api-endpoint-list" style="display:${expanded ? 'block' : 'none'};">
                        ${endpoints.map(renderEndpointButton).join('')}
                    </div>
                </div>
            `;
        }).join('');

        catalogEl.innerHTML = html;
        setCatalogInfo(filtered.length + ' endpoint(s) - ' + categories.length + ' categorie(s)');
    }

    function groupByCategory(items) {
        return items.reduce((acc, item) => {
            if (!acc[item.category]) {
                acc[item.category] = [];
            }

            acc[item.category].push(item);
            return acc;
        }, {});
    }

    function renderEndpointButton(item) {
        const selectedClass = item.id === apiExplorerState.selectedEndpointId ? 'is-selected' : '';
        const isFavorite = apiExplorerState.favorites.has(item.id);

        return `
            <div class="api-endpoint-item ${selectedClass}">
                <button type="button"
                    class="api-endpoint-fav ${isFavorite ? 'is-favorite' : ''}"
                    data-favorite-toggle="1"
                    data-endpoint-id="${escapeAttribute(item.id)}"
                    title="${isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
                    <i class="fa ${isFavorite ? 'fa-star' : 'fa-star-o'}"></i>
                </button>
                <button type="button" class="api-endpoint-main" data-endpoint-id="${escapeAttribute(item.id)}">
                    <span class="label ${getMethodLabelClass(item.httpMethod)}">${escapeHtml(item.httpMethod)}</span>
                    <code>${escapeHtml(item.methodName)}</code>
                    <span class="api-path">${escapeHtml(item.routePath || '(route non detectee)')}</span>
                </button>
            </div>
        `;
    }

    function onCatalogClicked(event) {
        // Delegation d'evenements pour limiter le nombre de listeners.
        const favoriteBtn = event.target.closest('[data-favorite-toggle="1"]');
        if (favoriteBtn) {
            const endpointId = favoriteBtn.getAttribute('data-endpoint-id');
            if (endpointId) {
                toggleFavorite(endpointId);
            }
            return;
        }

        const toggle = event.target.closest('.api-category-toggle');
        if (toggle) {
            const category = toggle.getAttribute('data-category') || '';
            if (!category) return;

            if (state.expandedCategories.has(category)) {
                apiExplorerState.expandedCategories.delete(category);
            } else {
                apiExplorerState.expandedCategories.add(category);
            }

            renderCatalog();
            return;
        }

        const endpointBtn = event.target.closest('.api-endpoint-main');
        if (endpointBtn) {
            const endpointId = endpointBtn.getAttribute('data-endpoint-id');
            if (endpointId) {
                selectEndpoint(endpointId);
            }
        }
    }

    function onFavoritesClicked(event) {
        const favoriteBtn = event.target.closest('[data-favorite-toggle="1"]');
        if (favoriteBtn) {
            const endpointId = favoriteBtn.getAttribute('data-endpoint-id');
            if (endpointId) {
                toggleFavorite(endpointId);
            }
            return;
        }

        const favoriteItemBtn = event.target.closest('.api-favorite-item');
        if (favoriteItemBtn) {
            const endpointId = favoriteItemBtn.getAttribute('data-endpoint-id');
            if (endpointId) {
                selectEndpoint(endpointId);
            }
        }
    }

    function renderFavoritesSection() {
        const favoritesListEl = document.getElementById('apiExplorerFavoritesList');
        if (!favoritesListEl) return;

        const favoriteEndpoints = apiExplorerState.catalog
            .filter((item) => apiExplorerState.favorites.has(item.id))
            .sort((a, b) => {
                const left = (a.category + '.' + a.methodName).toLowerCase();
                const right = (b.category + '.' + b.methodName).toLowerCase();
                if (left < right) return -1;
                if (left > right) return 1;
                return 0;
            });

        if (!favoriteEndpoints.length) {
            favoritesListEl.innerHTML = '<div class="small text-muted">Aucun favori enregistre.</div>';
            return;
        }

        favoritesListEl.innerHTML = favoriteEndpoints.map((item) => `
            <div class="api-favorite-row">
                <button type="button" class="api-favorite-item" data-endpoint-id="${escapeAttribute(item.id)}">
                    <span class="label ${getMethodLabelClass(item.httpMethod)}">${escapeHtml(item.httpMethod)}</span>
                    <code>${escapeHtml(item.methodName)}</code>
                    <span class="api-favorite-path">${escapeHtml(item.routePath || '(route non detectee)')}</span>
                </button>
                <button type="button"
                    class="api-endpoint-fav is-favorite"
                    data-favorite-toggle="1"
                    data-endpoint-id="${escapeAttribute(item.id)}"
                    title="Retirer des favoris">
                    <i class="fa fa-star"></i>
                </button>
            </div>
        `).join('');
    }

    function toggleFavorite(endpointId) {
        if (!endpointId) return;

        if (state.favorites.has(endpointId)) {
            apiExplorerState.favorites.delete(endpointId);
        } else {
            apiExplorerState.favorites.add(endpointId);
        }

        saveFavoritesToCookie();
        renderCatalog();
    }

    function selectEndpoint(endpointId) {
        const endpoint = apiExplorerState.catalog.find((item) => item.id === endpointId);
        if (!endpoint) return;

        apiExplorerState.selectedEndpointId = endpointId;
        apiExplorerState.lastResponse = null;
        apiExplorerState.lastProjection = null;
        apiExplorerState.lastExecutionMeta = null;
        apiExplorerState.projectionAutocompletePaths = [];
        apiExplorerState.currentProjectionSuggestions = [];
        clearProjectionAutocompleteDebounce();
        apiExplorerState.activeResponseTabId = null;

        renderCatalog();
        renderResponseTabs();
        renderWorkbench(endpoint);
    }

    function renderWorkbench(endpoint, options) {
        const emptyState = document.getElementById('apiExplorerEmptyState');
        const workbench = document.getElementById('apiExplorerWorkbench');
        const preserveResponseState = Boolean(options && options.preserveResponseState);

        if (emptyState) emptyState.style.display = 'none';
        if (workbench) workbench.style.display = 'block';

        const nameEl = document.getElementById('apiExplorerSelectedName');
        const methodEl = document.getElementById('apiExplorerSelectedMethod');
        const pathEl = document.getElementById('apiExplorerSelectedPath');
        const classEl = document.getElementById('apiExplorerSelectedClass');

        if (nameEl) nameEl.textContent = endpoint.methodName;
        if (methodEl) {
            methodEl.textContent = endpoint.httpMethod;
            methodEl.className = 'label api-badge-method ' + getMethodLabelClass(endpoint.httpMethod);
        }
        if (pathEl) pathEl.textContent = endpoint.routePath || '(route non detectee)';
        if (classEl) classEl.textContent = endpoint.apiClassName + ' (arity=' + endpoint.functionArity + ')';

        renderRequiredParams(endpoint);
        configureBatchInputForEndpoint(endpoint);
        switchInputMode(state.inputMode);

        const bodyInput = document.getElementById('apiExplorerBodyJson');
        if (bodyInput) {
            if (endpoint.hasBodyParameter) {
                bodyInput.disabled = false;
                bodyInput.placeholder = '{"key":"value"}';
            } else {
                bodyInput.disabled = true;
                bodyInput.placeholder = 'Body non utilise par cette methode';
                bodyInput.value = '';
            }
        }

        const optionsInput = document.getElementById('apiExplorerOptionsJson');
        if (optionsInput) {
            optionsInput.value = '';
        }

        const autoPagingCb = document.getElementById('apiExplorerPostAutoPaging');
        if (autoPagingCb) {
            autoPagingCb.checked = false;
            autoPagingCb.disabled = endpoint.httpMethod !== 'POST';
        }

        const projectionPathInput = document.getElementById('apiExplorerProjectionPath');
        if (projectionPathInput && !preserveResponseState) projectionPathInput.value = '';
        refreshProjectionAutocompleteSuggestions();

        if (!preserveResponseState) {
            setExecutionStatus('Pret a executer.', 'info');
            updateResponseStats(null);
            renderResponseText('Aucune reponse pour le moment.');
        }
    }

    function renderRequiredParams(endpoint) {
        const container = document.getElementById('apiExplorerParamsForm');
        if (!container) return;

        if (!endpoint.requiredInputParams.length) {
            container.innerHTML = '<p class="text-muted">Aucun parametre obligatoire detecte.</p>';
            return;
        }

        container.innerHTML = endpoint.requiredInputParams.map((paramName) => {
            const inputId = buildRequiredInputId(paramName);

            return `
                <div class="form-group">
                    <label for="${escapeAttribute(inputId)}">${escapeHtml(paramName)}</label>
                    <input id="${escapeAttribute(inputId)}" data-required-param="${escapeAttribute(paramName)}" type="text" class="form-control" placeholder="${escapeAttribute(paramName)}" />
                </div>
            `;
        }).join('');
    }

    function onResponseTabsClicked(event) {
        const tabLink = event.target.closest('[data-response-tab-id]');
        if (!tabLink) return;

        event.preventDefault();
        const tabId = tabLink.getAttribute('data-response-tab-id');
        if (!tabId) return;

        activateResponseTab(tabId);
    }

    function renderResponseTabs() {
        const container = document.getElementById('apiExplorerResponseTabsContainer');
        const tabsEl = document.getElementById('apiExplorerResponseTabs');
        if (!container || !tabsEl) return;

        if (!state.responseTabs.length) {
            container.style.display = 'none';
            tabsEl.innerHTML = '';
            return;
        }

        container.style.display = 'block';
        tabsEl.innerHTML = apiExplorerState.responseTabs.map((tab) => {
            const isActive = tab.id === apiExplorerState.activeResponseTabId;
            const methodClass = getMethodLabelClass(tab.httpMethod || 'UNKNOWN');
            const title = tab.title || '(sans titre)';
            return `
                <li class="${isActive ? 'active' : ''}">
                    <a href="#" data-response-tab-id="${escapeAttribute(tab.id)}" title="${escapeAttribute(title)}">
                        <span class="label ${methodClass}">${escapeHtml(tab.httpMethod || 'N/A')}</span>
                        <span class="api-response-tab-title">${escapeHtml(title)}</span>
                    </a>
                </li>
            `;
        }).join('');
    }

    function createResponseTab(endpoint) {
        const tabId = 'responseTab_' + apiExplorerState.nextResponseTabSequence;
        apiExplorerState.nextResponseTabSequence += 1;

        const tab = {
            id: tabId,
            endpointId: endpoint.id,
            httpMethod: endpoint.httpMethod,
            methodName: endpoint.methodName,
            title: endpoint.methodName,
            response: null,
            projection: null,
            executionMeta: null,
            viewMode: null,
            context: null,
            statusMessage: '',
            statusLevel: 'info',
            createdAt: Date.now()
        };

        apiExplorerState.responseTabs.push(tab);
        while (state.responseTabs.length > RESPONSE_TAB_LIMIT) {
            const removed = apiExplorerState.responseTabs.shift();
            if (removed && removed.id === apiExplorerState.activeResponseTabId) {
                apiExplorerState.activeResponseTabId = null;
            }
        }

        return tab;
    }

    function getTabById(tabId) {
        return apiExplorerState.responseTabs.find((tab) => tab.id === tabId) || null;
    }

    function getActiveResponseTab() {
        if (!state.activeResponseTabId) return null;
        return getTabById(state.activeResponseTabId);
    }

    function resolveExecutionTargetTab(endpoint, targetTabMode) {
        if (targetTabMode !== 'new') {
            const activeTab = getActiveResponseTab();
            if (activeTab) {
                return activeTab;
            }
        }

        return createResponseTab(endpoint);
    }

    function captureCurrentRequestContext(endpoint) {
        const requiredParamValues = {};
        endpoint.requiredInputParams.forEach((paramName) => {
            const inputEl = document.getElementById(buildRequiredInputId(paramName));
            requiredParamValues[paramName] = inputEl ? inputEl.value : '';
        });

        const bodyInput = document.getElementById('apiExplorerBodyJson');
        const optionsInput = document.getElementById('apiExplorerOptionsJson');
        const batchInput = document.getElementById('apiExplorerBatchJson');
        const autoPagingCb = document.getElementById('apiExplorerPostAutoPaging');
        const projectionInput = document.getElementById('apiExplorerProjectionPath');
        const groupByObjectCb = document.getElementById('apiExplorerProjectionGroupByObject');

        return {
            endpointId: endpoint.id,
            inputMode: apiExplorerState.inputMode,
            requiredParamValues,
            bodyJson: bodyInput ? bodyInput.value : '',
            optionsJson: optionsInput ? optionsInput.value : '',
            batchJson: batchInput ? batchInput.value : '',
            postAutoPaging: Boolean(autoPagingCb && autoPagingCb.checked),
            projectionPath: projectionInput ? projectionInput.value : '',
            groupByObject: !groupByObjectCb || Boolean(groupByObjectCb.checked)
        };
    }

    function applyRequestContext(endpoint, context) {
        if (!context) return;

        const requiredParamValues = isPlainObject(context.requiredParamValues) ? context.requiredParamValues : {};
        endpoint.requiredInputParams.forEach((paramName) => {
            const inputEl = document.getElementById(buildRequiredInputId(paramName));
            if (!inputEl) return;
            if (Object.prototype.hasOwnProperty.call(requiredParamValues, paramName)) {
                inputEl.value = String(requiredParamValues[paramName]);
            }
        });

        const bodyInput = document.getElementById('apiExplorerBodyJson');
        if (bodyInput && typeof context.bodyJson === 'string') {
            bodyInput.value = context.bodyJson;
        }

        const optionsInput = document.getElementById('apiExplorerOptionsJson');
        if (optionsInput && typeof context.optionsJson === 'string') {
            optionsInput.value = context.optionsJson;
        }

        const batchInput = document.getElementById('apiExplorerBatchJson');
        if (batchInput && typeof context.batchJson === 'string') {
            batchInput.value = context.batchJson;
            validateBatchJsonEditorRealtime({ silentWhenEmpty: true });
        }

        const autoPagingCb = document.getElementById('apiExplorerPostAutoPaging');
        if (autoPagingCb && !autoPagingCb.disabled) {
            autoPagingCb.checked = Boolean(context.postAutoPaging);
        }

        if (context.inputMode) {
            switchInputMode(context.inputMode);
        }

        const projectionInput = document.getElementById('apiExplorerProjectionPath');
        if (projectionInput && typeof context.projectionPath === 'string') {
            projectionInput.value = context.projectionPath;
        }

        const groupByObjectCb = document.getElementById('apiExplorerProjectionGroupByObject');
        if (groupByObjectCb) {
            groupByObjectCb.checked = context.groupByObject !== false;
        }
    }

    function openExecutionResultInTab(options) {
        const endpoint = options.endpoint;
        const targetTabMode = options.targetTabMode === 'new' ? 'new' : 'current';
        const tab = resolveExecutionTargetTab(endpoint, targetTabMode);

        tab.endpointId = endpoint.id;
        tab.httpMethod = endpoint.httpMethod;
        tab.methodName = endpoint.methodName;
        tab.title = endpoint.methodName;
        tab.response = options.response;
        tab.projection = options.projection;
        tab.executionMeta = options.executionMeta;
        // Nouveau resultat => retour au mode auto (NODE < 1 Mo, texte brut > 1 Mo).
        tab.viewMode = null;
        tab.context = captureCurrentRequestContext(endpoint);
        tab.statusMessage = options.statusMessage || '';
        tab.statusLevel = options.statusLevel || 'info';

        activateResponseTab(tab.id);
    }

    function updateActiveTabFromCurrentState() {
        const tab = getActiveResponseTab();
        const endpoint = getSelectedEndpoint();
        if (!tab || !endpoint) return;

        tab.endpointId = endpoint.id;
        tab.httpMethod = endpoint.httpMethod;
        tab.methodName = endpoint.methodName;
        tab.title = endpoint.methodName;
        tab.response = apiExplorerState.lastResponse;
        tab.projection = apiExplorerState.lastProjection;
        tab.executionMeta = apiExplorerState.lastExecutionMeta;
        tab.context = captureCurrentRequestContext(endpoint);

        renderResponseTabs();
    }

    function activateResponseTab(tabId) {
        const tab = getTabById(tabId);
        if (!tab) return;

        apiExplorerState.activeResponseTabId = tab.id;

        const endpoint = apiExplorerState.catalog.find((item) => item.id === tab.endpointId) || null;
        if (endpoint) {
            apiExplorerState.selectedEndpointId = endpoint.id;
            renderCatalog();
            renderWorkbench(endpoint, { preserveResponseState: true });
            applyRequestContext(endpoint, tab.context);
        }

        apiExplorerState.lastResponse = tab.response;
        apiExplorerState.lastProjection = typeof tab.projection === 'undefined' ? tab.response : tab.projection;
        apiExplorerState.lastExecutionMeta = tab.executionMeta || null;
        rebuildProjectionAutocompletePaths();

        if (state.lastProjection !== null && typeof apiExplorerState.lastProjection !== 'undefined') {
            renderResponseObject(state.lastProjection);
        } else if (state.lastResponse !== null && typeof apiExplorerState.lastResponse !== 'undefined') {
            renderResponseObject(state.lastResponse);
        } else {
            renderResponseText('Aucune reponse pour cet onglet.');
        }

        if (tab.statusMessage) {
            setExecutionStatus(tab.statusMessage, tab.statusLevel || 'info');
        }

        renderResponseTabs();
    }

    function onResponseNodeViewSwitchChanged(event) {
        const switchEl = event && event.target ? event.target : document.getElementById('apiExplorerResponseNodeViewSwitch');
        if (!switchEl) return;

        const activeTab = getActiveResponseTab();
        if (activeTab) {
            activeTab.viewMode = switchEl.checked ? 'node' : 'text';
        }

        const payload = getCurrentRenderableResponsePayload();
        if (payload === null || typeof payload === 'undefined') {
            updateResponseRenderControls({
                hasPayload: false
            });
            return;
        }

        renderResponseObject(payload);
    }

    function getCurrentRenderableResponsePayload() {
        if (state.lastProjection !== null && typeof apiExplorerState.lastProjection !== 'undefined') {
            return apiExplorerState.lastProjection;
        }

        return apiExplorerState.lastResponse;
    }

    function resolveResponseRenderMode(bytes) {
        const activeTab = getActiveResponseTab();
        if (activeTab && (activeTab.viewMode === 'node' || activeTab.viewMode === 'text')) {
            return activeTab.viewMode;
        }

        if (typeof bytes === 'number' && bytes > NODE_VIEW_AUTO_TEXT_THRESHOLD_BYTES) {
            return 'text';
        }

        return 'node';
    }

    function updateResponseRenderControls(options) {
        const switchEl = document.getElementById('apiExplorerResponseNodeViewSwitch');
        const hintEl = document.getElementById('apiExplorerResponseRenderHint');
        if (!switchEl || !hintEl) return;

        const hasPayload = Boolean(options && options.hasPayload);
        if (!hasPayload) {
            switchEl.checked = false;
            switchEl.disabled = true;
            hintEl.textContent = '';
            return;
        }

        const mode = options.mode === 'text' ? 'text' : 'node';
        const bytes = typeof options.bytes === 'number' ? options.bytes : null;
        const thresholdExceeded = bytes !== null && bytes > NODE_VIEW_AUTO_TEXT_THRESHOLD_BYTES;

        switchEl.disabled = false;
        switchEl.checked = mode === 'node';

        if (thresholdExceeded && mode === 'text') {
            hintEl.textContent = 'Affichage texte brut automatique (>1 Mo). La vision NODE peut augmenter fortement la consommation memoire et ralentir l onglet.';
            return;
        }

        if (thresholdExceeded && mode === 'node') {
            hintEl.textContent = 'Vision NODE active sur une reponse >1 Mo: risque de forte consommation memoire.';
            return;
        }

        hintEl.textContent = '';
    }

    function configureBatchInputForEndpoint(endpoint) {
        const batchTextarea = document.getElementById('apiExplorerBatchJson');
        if (!batchTextarea) return;

        ensureBatchValidationElement();
        batchTextarea.value = '';
        batchTextarea.placeholder = buildBatchJsonPlaceholder(endpoint);
        validateBatchJsonEditorRealtime({ silentWhenEmpty: true });

        if (!allowsBatchMode(endpoint) && apiExplorerState.inputMode === 'batch') {
            apiExplorerState.inputMode = 'fields';
        }
    }

    function buildBatchJsonPlaceholder(endpoint) {
        const templateEntry = {};
        const requiredParams = endpoint && Array.isArray(endpoint.requiredInputParams) ? endpoint.requiredInputParams : [];

        requiredParams.forEach((paramName) => {
            templateEntry[paramName] = '...';
        });

        if (endpoint && (endpoint.httpMethod === 'PATCH' || endpoint.httpMethod === 'PUT')) {
            templateEntry.body = { key: 'value' };
        }

        return JSON.stringify([templateEntry], null, 2);
    }

    function buildRequiredInputId(paramName) {
        return 'apiExplorerParam_' + String(paramName).replace(/[^A-Za-z0-9_-]/g, '_');
    }

    // =========================
    // Execution des appels API
    // =========================
    async function executeSelectedEndpoint(options) {
        const targetTabMode = options && options.targetTabMode === 'new' ? 'new' : 'current';
        const endpoint = apiExplorerState.catalog.find((item) => item.id === apiExplorerState.selectedEndpointId);
        if (!endpoint) {
            setExecutionStatus('Selectionnez une API a executer.', 'warning');
            return;
        }

        setExecutionStatus('Execution en cours...', 'info');

        try {
            const instance = getApiInstance(endpoint.apiClassName);
            if (!instance || typeof instance[endpoint.methodName] !== 'function') {
                throw new Error('Methode SDK introuvable: ' + endpoint.apiClassName + '.' + endpoint.methodName);
            }

            const startedAt = Date.now();
            // Point d'entree unique: simple, lot JSON, ou pagination auto POST.
            const executionResult = await executeEndpointWithSelectedMode(endpoint, instance);
            const response = normalizeExecutionResultForDisplay(executionResult);
            console.log(`Response Global : `, response);
            const duration = Date.now() - startedAt;
            const executionMeta = isPlainObject(executionResult) ? executionResult : null;
            const successMessage = buildExecutionSuccessMessage(executionResult, duration);

            openExecutionResultInTab({
                targetTabMode,
                endpoint,
                response,
                projection: response,
                executionMeta,
                statusMessage: successMessage,
                statusLevel: 'success'
            });
        } catch (error) {
            const normalizedError = normalizeError(error);
            const errorMessage = 'Erreur: ' + (error && error.message ? error.message : 'Execution impossible');
            openExecutionResultInTab({
                targetTabMode,
                endpoint,
                response: normalizedError,
                projection: normalizedError,
                executionMeta: null,
                statusMessage: errorMessage,
                statusLevel: 'danger'
            });
            console.error('[API Explorer] Erreur execution', error);
        }
    }

    async function executeEndpointWithSelectedMode(endpoint, instance) {
        // Priorite: pagination auto POST > mode lot > execution simple.
        if (endpoint.httpMethod === 'POST' && isPostAutoPagingEnabled()) {
            return executePostAutoPaging(endpoint, instance);
        }

        if (state.inputMode === 'batch' && allowsBatchMode(endpoint)) {
            return executeBatchByJsonInputs(endpoint, instance);
        }

        const args = buildInvocationArgs(endpoint);
        //logApiCall(endpoint, args, { executionMode: 'single' });
        return invokeEndpointWithRateLimit(endpoint, instance, args, {
            mode: 'single',
            label: 'appel unique'
        });
    }

    async function invokeEndpointWithRateLimit(endpoint, instance, args, waitContext) {
        let attempts = 0;
        while (attempts <= API_RATE_LIMIT_MAX_RETRIES) {
            attempts += 1;
            await waitForApiRateWindow(waitContext);

            try {
                const response = await instance[endpoint.methodName].apply(instance, args);
                apiExplorerState.requestTimestamps.push(Date.now());
                trimRequestTimestamps();
                return response;
            } catch (error) {
                if (!isRateLimitError(error) || attempts > API_RATE_LIMIT_MAX_RETRIES) {
                    throw error;
                }

                const waitMs = extractRetryAfterMs(error) || API_RATE_LIMIT_RETRY_FALLBACK_MS;
                setExecutionStatus(buildRateLimitWaitMessage(waitMs, waitContext, 'Rate limit detecte (429).'), 'warning');
                await sleep(waitMs);
            }
        }

        throw new Error('Execution interrompue apres plusieurs erreurs de rate limit.');
    }

    async function waitForApiRateWindow(waitContext) {
        while (true) {
            trimRequestTimestamps();
            if (state.requestTimestamps.length < API_RATE_LIMIT_MAX_PER_MINUTE) {
                return;
            }

            const now = Date.now();
            const oldestTs = apiExplorerState.requestTimestamps[0];
            const waitMs = Math.max(250, API_RATE_LIMIT_WINDOW_MS - (now - oldestTs) + 50);
            setExecutionStatus(buildRateLimitWaitMessage(waitMs, waitContext, 'Attente limite 300 appels/min.'), 'warning');
            await sleep(waitMs);
        }
    }

    function trimRequestTimestamps() {
        const minTimestamp = Date.now() - API_RATE_LIMIT_WINDOW_MS;
        while (state.requestTimestamps.length && apiExplorerState.requestTimestamps[0] < minTimestamp) {
            apiExplorerState.requestTimestamps.shift();
        }
    }

    function isRateLimitError(error) {
        if (!error) return false;
        if (Number(error.status) === 429) return true;

        let asText = '';
        if (typeof error.message === 'string') asText += ' ' + error.message;
        if (typeof error.code === 'string') asText += ' ' + error.code;
        if (isPlainObject(error.body)) {
            if (typeof error.body.code === 'string') asText += ' ' + error.body.code;
            if (typeof error.body.message === 'string') asText += ' ' + error.body.message;
        }

        const normalized = asText.toLowerCase();
        return normalized.includes('rate') || normalized.includes('too many') || normalized.includes('429');
    }

    function extractRetryAfterMs(error) {
        if (!error) return null;

        const headers = error.headers || error.header || null;
        if (!headers) return null;

        const retryAfterRaw = headers['retry-after'] || headers['Retry-After'] || headers.retryAfter || headers.RetryAfter;
        if (typeof retryAfterRaw === 'undefined' || retryAfterRaw === null) return null;

        const retryAfterSeconds = Number(retryAfterRaw);
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
            return Math.floor(retryAfterSeconds * 1000);
        }

        const retryDateMs = Date.parse(String(retryAfterRaw));
        if (Number.isFinite(retryDateMs)) {
            const delta = retryDateMs - Date.now();
            if (delta > 0) return delta;
        }

        return null;
    }

    function buildRateLimitWaitMessage(waitMs, waitContext, prefix) {
        const safePrefix = prefix || 'Attente rate limit.';
        const seconds = Math.max(1, Math.ceil(waitMs / 1000));
        const progressLabel = buildWaitProgressLabel(waitContext);
        return safePrefix + ' Pause ' + seconds + 's' + (progressLabel ? ' (' + progressLabel + ')' : '');
    }

    function buildWaitProgressLabel(waitContext) {
        if (!waitContext || !isPlainObject(waitContext)) return '';

        if (typeof waitContext.current === 'number') {
            if (typeof waitContext.total === 'number' && waitContext.total > 0) {
                return waitContext.current + ' / ' + waitContext.total + ' ' + (waitContext.unit || '');
            }
            return String(waitContext.current) + (waitContext.unit ? ' ' + waitContext.unit : '');
        }

        return waitContext.label || '';
    }

    function sleep(durationMs) {
        const safeMs = Math.max(0, Number(durationMs) || 0);
        return new Promise((resolve) => setTimeout(resolve, safeMs));
    }

    async function executeBatchByJsonInputs(endpoint, instance) {
        // Mode lot: 1 ligne JSON = 1 appel API.
        const batchItems = parseBatchJsonInput(endpoint);
        if (!batchItems.length) {
            throw new Error('Le JSON de lot est vide.');
        }

        const baseBodyRead = readBodyValueFromEditor();
        const baseBody = baseBodyRead.hasBodyInput ? baseBodyRead.bodyValue : null;
        const baseOptions = readOptionsObject();

        const responses = [];
        const errors = [];
        let totalHitsSum = 0;
        let hasTotalHitsValue = false;
        let maxPageNumber = null;
        let maxPageCount = null;

        console.log(`Batch items : `,batchItems);
        for (let i = 0; i < batchItems.length; i += 1) {
            const item = batchItems[i];
            setExecutionStatus('Execution en cours... ' + (i + 1) + ' / ' + batchItems.length + ' requetes', 'info');
            console.log(`Appel Batch `,i,` sur `,batchItems.length,` : `,item);
            try {
                const parts = buildInvocationPartsFromBatchItem(endpoint, item, baseBody, baseOptions);
                const args = buildInvocationArgsFromParts(endpoint, parts);
                //logApiCall(endpoint, args, { executionMode: 'batch', batchIndex: i + 1 });

                //await requestFreshAccessTokenForBatchCall(i + 1, batchItems.length);
                // Code d'origine (sans refresh token par appel):
                const response = await invokeEndpointWithRateLimit(endpoint, instance, args, {
                    mode: 'batch',
                    current: i + 1,
                    total: batchItems.length,
                    unit: 'requete'
                });
                const stats = extractResponseStats(response);
                if (typeof stats.totalHits === 'number') {
                    totalHitsSum += stats.totalHits;
                    hasTotalHitsValue = true;
                }
                if (typeof stats.pageNumber === 'number') {
                    maxPageNumber = maxPageNumber === null ? stats.pageNumber : Math.max(maxPageNumber, stats.pageNumber);
                }
                if (typeof stats.pageCount === 'number') {
                    maxPageCount = maxPageCount === null ? stats.pageCount : Math.max(maxPageCount, stats.pageCount);
                }

                responses.push({
                    index: i + 1,
                    input: item,
                    response
                });
            } catch (error) {
                // On continue le lot meme en cas d'erreur individuelle.
                errors.push({
                    index: i + 1,
                    input: item,
                    error: normalizeError(error)
                });
            }
        }

        const fallbackPageValue = responses.length > 0 ? responses.length : null;

        return {
            mode: 'batch-inputs',
            method: endpoint.httpMethod,
            totalCalls: batchItems.length,
            successCount: responses.length,
            errorCount: errors.length,
            paging: {
                totalHits: hasTotalHitsValue ? totalHitsSum : null,
                pageNumber: maxPageNumber !== null ? maxPageNumber : fallbackPageValue,
                pageCount: maxPageCount !== null ? maxPageCount : fallbackPageValue
            },
            responses,
            errors
        };
    }

    async function requestFreshAccessTokenForBatchCall(batchIndex, totalCalls) {
        const apiClient = platformClient && platformClient.ApiClient
            ? platformClient.ApiClient.instance
            : null;

        if (!apiClient) {
            console.warn('[API Explorer] Refresh token batch ignore: ApiClient indisponible.');
            return;
        }

        const hasOrgContext = typeof selectedOrgConfig !== 'undefined'
            && selectedOrgConfig
            && typeof selectedOrgConfig.clientId === 'string'
            && selectedOrgConfig.clientId.length > 0;

        if (!hasOrgContext) {
            console.warn('[API Explorer] Refresh token batch ignore: selectedOrgConfig.clientId introuvable.');
            return;
        }

        const redirectForLogin = typeof redirectURL !== 'undefined' && redirectURL
            ? redirectURL
            : (window.location.origin + window.location.pathname);
        const preferredAuthMode = typeof selectedAuthMode !== 'undefined' && selectedAuthMode === 'pkce'
            ? 'pkce'
            : 'implicit';

        console.log('[API Explorer] Refresh token avant appel batch', {
            batchIndex,
            totalCalls,
            authMode: preferredAuthMode
        });
        if (preferredAuthMode === 'pkce' && typeof apiClient.loginPKCEGrant === 'function') {
            await apiClient.loginPKCEGrant(selectedOrgConfig.clientId, redirectForLogin, {
                apiExplorerState: 'gctool-batch-refresh'
            });
            return;
        }

        if (typeof apiClient.loginImplicitGrant === 'function') {
            await apiClient.loginImplicitGrant(selectedOrgConfig.clientId, redirectForLogin);
            return;
        }

        console.warn('[API Explorer] Refresh token batch ignore: aucun mode OAuth compatible.');
    }

    async function executePostAutoPaging(endpoint, instance) {
        const debugPrefix = '[API Explorer][POST-PAGINATION]';
        const parts = buildInvocationPartsFromForm(endpoint);
        const pageSetter = createPageSetter(parts);
        if (!pageSetter) {
            console.error(debugPrefix + ' Configuration pagination introuvable.', {
                endpoint: endpoint.apiClassName + '.' + endpoint.methodName,
                bodyValue: parts.bodyValue,
                optionsObject: parts.optionsObject
            });
            throw new Error('Pagination auto POST: ajoutez un pageNumber dans body/options (ou pageSize + body/options).');
        }

        let currentPage = pageSetter.getCurrentPage();
        let pageCount = null;
        let guard = 0;
        const guardLimit = 500;
        let paginationCollectionKey = null;
        console.log(debugPrefix + ' Demarrage', {
            endpoint: endpoint.apiClassName + '.' + endpoint.methodName,
            startPage: currentPage,
            pageSetterStrategy: pageSetter.strategy || 'unknown',
            guardLimit
        });

        const responses = [];
        let totalHits = null;

        // Boucle de pagination defensive: arret via pageCount, page vide, ou garde max.
        while (guard < guardLimit) {
            guard += 1;
            const totalPagesLabel = pageCount !== null ? String(pageCount) : '?';
            setExecutionStatus('Execution en cours... page ' + currentPage + ' / ' + totalPagesLabel, 'info');
            console.log(debugPrefix + ' Iteration', {
                iteration: guard,
                page: currentPage
            });

            const iterationParts = cloneInvocationParts(parts);
            pageSetter.setPage(iterationParts, currentPage);
            console.log(debugPrefix + ' Payload page', {
                page: currentPage,
                requiredInputValues: iterationParts.requiredInputValues,
                bodyValue: iterationParts.bodyValue,
                optionsObject: iterationParts.optionsObject
            });
            const args = buildInvocationArgsFromParts(endpoint, iterationParts);
            //logApiCall(endpoint, args, { executionMode: 'post-auto-pagination', pageNumber: currentPage });

            const response = await invokeEndpointWithRateLimit(endpoint, instance, args, {
                mode: 'post-pagination',
                current: currentPage,
                total: pageCount,
                unit: 'page'
            });
            responses.push(response);

            const stats = extractResponseStats(response);
            if (typeof stats.totalHits === 'number') {
                totalHits = stats.totalHits;
            }

            const collectionSummary = summarizeTopLevelCollections(response);
            if (!paginationCollectionKey && collectionSummary.primaryKey) {
                // On verrouille la cle de collection principale des la premiere detection.
                paginationCollectionKey = collectionSummary.primaryKey;
                console.log(debugPrefix + ' Collection pagination detectee', {
                    key: paginationCollectionKey
                });
            }

            const pageCollection = extractCollectionByKey(response, paginationCollectionKey);
            const pageItemCount = Array.isArray(pageCollection) ? pageCollection.length : 0;
            console.log(debugPrefix + ' Reponse recue', {
                page: currentPage,
                totalHits,
                stats,
                paginationCollectionKey,
                pageItemCount,
                collectionsDetected: collectionSummary.collections
            });

            if (typeof stats.pageCount === 'number' && stats.pageCount > 0) {
                pageCount = stats.pageCount;
                setExecutionStatus('Execution en cours... page ' + currentPage + ' / ' + stats.pageCount, 'info');
                if (currentPage >= stats.pageCount) {
                    console.log(debugPrefix + ' Arret: derniere page atteinte', {
                        page: currentPage,
                        pageCount: stats.pageCount
                    });
                    break;
                }
            } else {
                // Sans pageCount, on s'arrete si aucune donnee paginee detectee.
                const hasPageData = paginationCollectionKey
                    ? pageItemCount > 0
                    : collectionSummary.hasAnyCollectionData;
                if (!hasPageData) {
                    responses.pop();
                    console.log(debugPrefix + ' Arret: aucune donnee sur la page courante', {
                        page: currentPage,
                        paginationCollectionKey,
                        collectionsDetected: collectionSummary.collections
                    });
                    break;
                }
            }

            currentPage += 1;
        }

        if (guard >= guardLimit) {
            console.error(debugPrefix + ' Arret securite: limite atteinte', {
                guard,
                guardLimit,
                currentPage
            });
            throw new Error('Pagination auto POST interrompue (limite de securite atteinte).');
        }

        const mergedEntities = [];
        const mergedResults = [];
        const mergedItems = [];
        responses.forEach((response) => {
            if (Array.isArray(response && response.entities)) {
                mergedEntities.push.apply(mergedEntities, response.entities);
            }
            if (Array.isArray(response && response.results)) {
                mergedResults.push.apply(mergedResults, response.results);
            }

            // Agregation generique (ex: conversations/items/data), independante du nom.
            const pageCollection = extractCollectionByKey(response, paginationCollectionKey);
            if (Array.isArray(pageCollection)) {
                mergedItems.push.apply(mergedItems, pageCollection);
            }
        });

        console.log(debugPrefix + ' Termine', {
            totalCalls: responses.length,
            totalHits,
            pageNumber: pageCount || responses.length || null,
            pageCount: pageCount || responses.length || null,
            paginationCollectionKey,
            mergedEntities: mergedEntities.length,
            mergedResults: mergedResults.length,
            mergedItems: mergedItems.length
        });

        const pagingSummary = {
            totalHits,
            pageNumber: pageCount || responses.length || null,
            pageCount: pageCount || responses.length || null
        };

        return {
            mode: 'post-auto-pagination',
            method: endpoint.httpMethod,
            totalCalls: responses.length,
            paging: pagingSummary,
            responses,
            mergedEntities,
            mergedResults,
            mergedCollectionKey: paginationCollectionKey,
            mergedItems,
            mergedResponse: mergePostPaginationResponses(responses, paginationCollectionKey, pagingSummary)
        };
    }

    function normalizeExecutionResultForDisplay(executionResult) {
        if (!isPlainObject(executionResult)) {
            return executionResult;
        }

        if (executionResult.mode === 'post-auto-pagination') {
            if (typeof executionResult.mergedResponse !== 'undefined') {
                return executionResult.mergedResponse;
            }

            // Fallback defensif: si pas de fusion possible, on expose le tableau brut des pages.
            return Array.isArray(executionResult.responses) ? executionResult.responses : executionResult;
        }

        if (executionResult.mode === 'batch-inputs') {
            const batchResponses = Array.isArray(executionResult.responses) ? executionResult.responses : [];
            if (executionResult.errorCount > 0 && Array.isArray(executionResult.errors)) {
                console.warn('[API Explorer] Batch: certaines erreurs ne sont pas affichees dans le JSON simplifie.', executionResult.errors);
            }

            // Format simple et intuitif pour la projection: objet avec un tableau "results".
            const results = batchResponses.map((entry) => {
                if (isPlainObject(entry) && Object.prototype.hasOwnProperty.call(entry, 'response')) {
                    return entry.response;
                }

                return entry;
            });

            return { results };
        }

        return executionResult;
    }

    function mergePostPaginationResponses(responses, collectionKey, pagingSummary) {
        if (!Array.isArray(responses) || responses.length === 0) {
            return {};
        }

        if (collectionKey === '$root') {
            const mergedRoot = [];
            responses.forEach((response) => {
                if (Array.isArray(response)) {
                    mergedRoot.push.apply(mergedRoot, response);
                }
            });
            return mergedRoot;
        }

        const firstResponse = responses[0];
        if (!isPlainObject(firstResponse)) {
            return cloneJsonValue(firstResponse);
        }

        const mergedResponse = cloneJsonValue(firstResponse);
        if (!collectionKey) {
            return mergedResponse;
        }

        const mergedCollection = [];
        responses.forEach((response) => {
            const collection = extractCollectionByKey(response, collectionKey);
            if (Array.isArray(collection)) {
                mergedCollection.push.apply(mergedCollection, collection);
            }
        });

        mergedResponse[collectionKey] = mergedCollection;
        const mergedTotal = isPlainObject(pagingSummary) && typeof pagingSummary.totalHits === 'number'
            ? pagingSummary.totalHits
            : mergedCollection.length;
        const mergedPageNumber = isPlainObject(pagingSummary) ? parseNumericValue(pagingSummary.pageNumber) : null;
        const mergedPageCount = isPlainObject(pagingSummary) ? parseNumericValue(pagingSummary.pageCount) : null;

        if (typeof mergedResponse.totalHits !== 'undefined') mergedResponse.totalHits = mergedTotal;
        if (typeof mergedResponse.total !== 'undefined') mergedResponse.total = mergedTotal;
        if (typeof mergedResponse.totalCount !== 'undefined') mergedResponse.totalCount = mergedTotal;
        if (typeof mergedResponse.totalRecords !== 'undefined') mergedResponse.totalRecords = mergedTotal;
        if (typeof mergedResponse.count !== 'undefined') mergedResponse.count = mergedTotal;
        if (typeof mergedResponse.pageNumber !== 'undefined' && mergedPageNumber !== null) mergedResponse.pageNumber = mergedPageNumber;
        if (typeof mergedResponse.page !== 'undefined' && mergedPageNumber !== null) mergedResponse.page = mergedPageNumber;
        if (typeof mergedResponse.currentPage !== 'undefined' && mergedPageNumber !== null) mergedResponse.currentPage = mergedPageNumber;
        if (typeof mergedResponse.pageCount !== 'undefined' && mergedPageCount !== null) mergedResponse.pageCount = mergedPageCount;
        if (typeof mergedResponse.totalPages !== 'undefined' && mergedPageCount !== null) mergedResponse.totalPages = mergedPageCount;
        if (typeof mergedResponse.pages !== 'undefined' && mergedPageCount !== null) mergedResponse.pages = mergedPageCount;

        // Si la structure expose un bloc paging, on le normalise pour refleter une vue fusionnee.
        if (isPlainObject(mergedResponse.paging)) {
            if (typeof mergedResponse.paging.totalHits !== 'undefined') mergedResponse.paging.totalHits = mergedTotal;
            if (typeof mergedResponse.paging.total !== 'undefined') mergedResponse.paging.total = mergedTotal;
            if (typeof mergedResponse.paging.totalCount !== 'undefined') mergedResponse.paging.totalCount = mergedTotal;
            if (typeof mergedResponse.paging.totalRecords !== 'undefined') mergedResponse.paging.totalRecords = mergedTotal;
            if (typeof mergedResponse.paging.count !== 'undefined') mergedResponse.paging.count = mergedTotal;
            if (typeof mergedResponse.paging.pageNumber !== 'undefined' && mergedPageNumber !== null) mergedResponse.paging.pageNumber = mergedPageNumber;
            if (typeof mergedResponse.paging.page !== 'undefined' && mergedPageNumber !== null) mergedResponse.paging.page = mergedPageNumber;
            if (typeof mergedResponse.paging.currentPage !== 'undefined' && mergedPageNumber !== null) mergedResponse.paging.currentPage = mergedPageNumber;
            if (typeof mergedResponse.paging.pageCount !== 'undefined' && mergedPageCount !== null) mergedResponse.paging.pageCount = mergedPageCount;
            if (typeof mergedResponse.paging.totalPages !== 'undefined' && mergedPageCount !== null) mergedResponse.paging.totalPages = mergedPageCount;
            if (typeof mergedResponse.paging.pages !== 'undefined' && mergedPageCount !== null) mergedResponse.paging.pages = mergedPageCount;
        }

        return mergedResponse;
    }

    function buildInvocationArgs(endpoint, overrides) {
        const parts = overrides && isPlainObject(overrides.parts)
            ? overrides.parts
            : buildInvocationPartsFromForm(endpoint);

        return buildInvocationArgsFromParts(endpoint, parts);
    }

    function buildInvocationPartsFromForm(endpoint) {
        const requiredInputValues = endpoint.requiredInputParams.map((paramName) => {
            const element = document.getElementById(buildRequiredInputId(paramName));
            const rawValue = element ? element.value.trim() : '';

            if (!rawValue) {
                throw new Error('Parametre requis vide: ' + paramName);
            }

            return coerceInputValue(rawValue);
        });

        const bodyRead = readBodyValueFromEditor();
        const optionsObject = readOptionsObject();

        return {
            requiredInputValues,
            bodyValue: bodyRead.bodyValue,
            hasBodyInput: bodyRead.hasBodyInput,
            optionsObject
        };
    }

    function buildInvocationPartsFromBatchItem(endpoint, item, baseBody, baseOptions) {
        if (!isPlainObject(item)) {
            throw new Error('Chaque ligne du lot doit etre un objet JSON.');
        }

        const requiredInputValues = endpoint.requiredInputParams.map((paramName) => {
            if (!Object.prototype.hasOwnProperty.call(item, paramName)) {
                throw new Error('Parametre requis manquant dans le lot: ' + paramName);
            }

            const value = item[paramName];
            return typeof value === 'string' ? coerceInputValue(value) : value;
        });

        const bodyValue = Object.prototype.hasOwnProperty.call(item, 'body') ? item.body : baseBody;
        const hasBodyInput = bodyValue !== null && typeof bodyValue !== 'undefined';

        const itemOptions = Object.prototype.hasOwnProperty.call(item, 'options') ? item.options : null;
        if (itemOptions !== null && !isPlainObject(itemOptions)) {
            throw new Error('item.options doit etre un objet.');
        }

        const mergedOptions = mergeOptions(baseOptions, itemOptions);

        return {
            requiredInputValues,
            bodyValue,
            hasBodyInput,
            optionsObject: mergedOptions
        };
    }

    function buildInvocationArgsFromParts(endpoint, parts) {
        const args = [];
        const requiredInputValues = Array.isArray(parts.requiredInputValues) ? parts.requiredInputValues : [];

        requiredInputValues.forEach((value) => args.push(value));

        const hasBodyInput = Boolean(parts.hasBodyInput);
        const bodyValue = parts.bodyValue;

        let optionsObject = parts.optionsObject;

        if (endpoint.requiredParams.includes('body')) {
            if (!hasBodyInput) {
                throw new Error('Le body JSON est requis pour cette methode.');
            }
            args.push(bodyValue);
        }

        // Certaines methodes SDK transportent le body via options.body (et non en argument direct).
        if (endpoint.expectsBodyFromOptions && hasBodyInput) {
            if (optionsObject === null) {
                optionsObject = {};
            }

            if (!isPlainObject(optionsObject)) {
                throw new Error('Options JSON doit etre un objet pour transporter body.');
            }

            optionsObject.body = bodyValue;
        }

        if (optionsObject !== null) {
            if (endpoint.functionArity > args.length) {
                args.push(optionsObject);
            } else {
                throw new Error('Cette methode ne permet pas d ajouter un objet options ici.');
            }
        } else if (endpoint.expectsBodyFromOptions && hasBodyInput && endpoint.functionArity > args.length) {
            args.push({ body: bodyValue });
        }

        return args;
    }

    function readBodyValueFromEditor() {
        const bodyInput = document.getElementById('apiExplorerBodyJson');
        const bodyText = bodyInput ? bodyInput.value.trim() : '';
        const hasBodyInput = bodyText.length > 0;
        const bodyValue = hasBodyInput ? parseJsonOrThrow(bodyText, 'Body JSON') : null;

        return { hasBodyInput, bodyValue };
    }

    function parseBatchJsonInput(endpoint) {
        const inputEl = document.getElementById('apiExplorerBatchJson');
        const raw = inputEl ? inputEl.value.trim() : '';

        if (!raw) {
            throw new Error('Mode lot: JSON vide.');
        }

        const parsed = parseJsonOrThrow(raw, 'Batch JSON');
        if (!Array.isArray(parsed)) {
            throw new Error('Batch JSON doit etre un tableau d objets.');
        }

        if (!parsed.every((item) => isPlainObject(item))) {
            throw new Error('Batch JSON: chaque element doit etre un objet.');
        }

        if (parsed.length === 0) {
            throw new Error('Batch JSON: tableau vide.');
        }

        const missingRequired = endpoint.requiredInputParams.some((paramName) => !Object.prototype.hasOwnProperty.call(parsed[0], paramName));
        if (missingRequired) {
            // Validation detaillee lors de chaque ligne ensuite.
        }

        return parsed;
    }

    function isPostAutoPagingEnabled() {
        const cb = document.getElementById('apiExplorerPostAutoPaging');
        return Boolean(cb && cb.checked && !cb.disabled);
    }

    function mergeOptions(baseOptions, itemOptions) {
        const hasBase = isPlainObject(baseOptions);
        const hasItem = isPlainObject(itemOptions);

        if (!hasBase && !hasItem) return null;
        if (!hasBase) return cloneJsonValue(itemOptions);
        if (!hasItem) return cloneJsonValue(baseOptions);

        return Object.assign({}, cloneJsonValue(baseOptions), cloneJsonValue(itemOptions));
    }

    function cloneInvocationParts(parts) {
        return {
            requiredInputValues: Array.isArray(parts.requiredInputValues) ? parts.requiredInputValues.slice() : [],
            bodyValue: cloneJsonValue(parts.bodyValue),
            hasBodyInput: Boolean(parts.hasBodyInput),
            optionsObject: cloneJsonValue(parts.optionsObject)
        };
    }

    function cloneJsonValue(value) {
        if (value === null || typeof value === 'undefined') return value;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_error) {
            return value;
        }
    }

    function createPageSetter(parts) {
        // Detection des conventions de pagination supportees dans body/options.
        if (isPlainObject(parts.bodyValue)) {
            if (typeof parts.bodyValue.pageNumber !== 'undefined' || typeof parts.bodyValue.pageSize !== 'undefined') {
                const startPage = Number(parts.bodyValue.pageNumber) > 0 ? Number(parts.bodyValue.pageNumber) : 1;
                return {
                    strategy: 'body.pageNumber',
                    getCurrentPage: () => startPage,
                    setPage: (targetParts, pageNumber) => {
                        if (!isPlainObject(targetParts.bodyValue)) targetParts.bodyValue = {};
                        targetParts.bodyValue.pageNumber = pageNumber;
                        targetParts.hasBodyInput = true;
                    }
                };
            }

            if (isPlainObject(parts.bodyValue.paging)) {
                const paging = parts.bodyValue.paging;
                if (typeof paging.pageNumber !== 'undefined' || typeof paging.pageSize !== 'undefined') {
                    const startPage = Number(paging.pageNumber) > 0 ? Number(paging.pageNumber) : 1;
                    return {
                        strategy: 'body.paging.pageNumber',
                        getCurrentPage: () => startPage,
                        setPage: (targetParts, pageNumber) => {
                            if (!isPlainObject(targetParts.bodyValue)) targetParts.bodyValue = {};
                            if (!isPlainObject(targetParts.bodyValue.paging)) targetParts.bodyValue.paging = {};
                            targetParts.bodyValue.paging.pageNumber = pageNumber;
                            targetParts.hasBodyInput = true;
                        }
                    };
                }
            }
        }

        if (isPlainObject(parts.optionsObject)) {
            if (typeof parts.optionsObject.pageNumber !== 'undefined' || typeof parts.optionsObject.pageSize !== 'undefined') {
                const startPage = Number(parts.optionsObject.pageNumber) > 0 ? Number(parts.optionsObject.pageNumber) : 1;
                return {
                    strategy: 'options.pageNumber',
                    getCurrentPage: () => startPage,
                    setPage: (targetParts, pageNumber) => {
                        if (!isPlainObject(targetParts.optionsObject)) targetParts.optionsObject = {};
                        targetParts.optionsObject.pageNumber = pageNumber;
                    }
                };
            }
        }

        return null;
    }

    function summarizeTopLevelCollections(payload) {
        // Detecte les tableaux de 1er niveau pour trouver la "collection paginee" dominante.
        const summary = {
            collections: [],
            countByKey: {},
            primaryKey: null,
            primaryCount: 0,
            hasAnyCollectionData: false
        };

        if (Array.isArray(payload)) {
            const count = payload.length;
            summary.collections.push({ key: '$root', count });
            summary.countByKey.$root = count;
            summary.primaryKey = '$root';
            summary.primaryCount = count;
            summary.hasAnyCollectionData = count > 0;
            return summary;
        }

        if (!isPlainObject(payload)) {
            return summary;
        }

        Object.keys(payload).forEach((key) => {
            const value = payload[key];
            if (!Array.isArray(value)) return;

            const count = value.length;
            summary.collections.push({ key, count });
            summary.countByKey[key] = count;
            if (count > 0) {
                summary.hasAnyCollectionData = true;
            }
        });

        if (!summary.collections.length) {
            return summary;
        }

        const preferredKeys = ['entities', 'results', 'conversations', 'items', 'records', 'data'];
        for (let i = 0; i < preferredKeys.length; i += 1) {
            const preferredKey = preferredKeys[i];
            if (summary.countByKey[preferredKey] > 0) {
                summary.primaryKey = preferredKey;
                summary.primaryCount = summary.countByKey[preferredKey];
                return summary;
            }
        }

        let best = summary.collections[0];
        for (let i = 1; i < summary.collections.length; i += 1) {
            if (summary.collections[i].count > best.count) {
                best = summary.collections[i];
            }
        }

        summary.primaryKey = best.key;
        summary.primaryCount = best.count;
        return summary;
    }

    function extractCollectionByKey(payload, key) {
        if (!key) return null;
        if (key === '$root' && Array.isArray(payload)) {
            return payload;
        }

        if (!isPlainObject(payload)) {
            return null;
        }

        return Array.isArray(payload[key]) ? payload[key] : null;
    }

    function logApiCall(endpoint, args, context) {
        const functionName = endpoint.apiClassName + '.' + endpoint.methodName;
        const postContent = extractRequestBodyFromArgs(endpoint, args);
        const contextInfo = isPlainObject(context) ? context : {};

        console.log('[API Explorer] Appel API', {
            functionName,
            httpMethod: endpoint.httpMethod,
            postContent,
            context: contextInfo
        });
    }

    function buildExecutionSuccessMessage(response, durationMs) {
        if (isPlainObject(response)) {
            if (response.mode === 'batch-inputs') {
                return 'Batch termine en ' + durationMs + ' ms. Succes: ' + response.successCount + '/' + response.totalCalls + '.';
            }

            if (response.mode === 'post-auto-pagination') {
                return 'Pagination POST terminee en ' + durationMs + ' ms. Pages appelees: ' + response.totalCalls + '.';
            }
        }

        return 'Succes en ' + durationMs + ' ms.';
    }

    function extractRequestBodyFromArgs(endpoint, args) {
        if (!endpoint || !Array.isArray(args)) {
            return null;
        }

        const firstBodyIndex = endpoint.requiredInputParams.length;

        if (endpoint.requiredParams.includes('body') && typeof args[firstBodyIndex] !== 'undefined') {
            return args[firstBodyIndex];
        }

        // Fallback pour les signatures ou le body est dans l'objet options.
        for (let i = args.length - 1; i >= 0; i -= 1) {
            const currentArg = args[i];
            if (isPlainObject(currentArg) && Object.prototype.hasOwnProperty.call(currentArg, 'body')) {
                return currentArg.body;
            }
        }

        const bodyInput = document.getElementById('apiExplorerBodyJson');
        const bodyText = bodyInput ? bodyInput.value.trim() : '';
        if (!bodyText) {
            return null;
        }

        try {
            return JSON.parse(bodyText);
        } catch (_error) {
            return bodyText;
        }
    }

    function readOptionsObject() {
        const optionsInput = document.getElementById('apiExplorerOptionsJson');
        const optionsText = optionsInput ? optionsInput.value.trim() : '';

        if (!optionsText) {
            return null;
        }

        const value = parseJsonOrThrow(optionsText, 'Options JSON');
        if (!isPlainObject(value)) {
            throw new Error('Options JSON doit etre un objet.');
        }

        return value;
    }

    function coerceInputValue(rawValue) {
        // Conversion best-effort pour eviter de tout envoyer en string.
        const trimmed = String(rawValue).trim();

        if (/^[-]?\d+$/.test(trimmed)) {
            const asInt = parseInt(trimmed, 10);
            if (!Number.isNaN(asInt)) return asInt;
        }

        if (/^[-]?\d+\.\d+$/.test(trimmed)) {
            const asFloat = parseFloat(trimmed);
            if (!Number.isNaN(asFloat)) return asFloat;
        }

        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
        if (trimmed === 'null') return null;

        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                return JSON.parse(trimmed);
            } catch (_error) {
                return trimmed;
            }
        }

        return trimmed;
    }

    function parseJsonOrThrow(jsonText, sourceLabel) {
        try {
            return JSON.parse(jsonText);
        } catch (_error) {
            throw new Error(sourceLabel + ' invalide (JSON attendu).');
        }
    }

    function validateBatchJsonEditorRealtime(options) {
        const inputEl = document.getElementById('apiExplorerBatchJson');
        const statusEl = ensureBatchValidationElement();
        if (!inputEl || !statusEl) return;

        const raw = inputEl.value.trim();
        const silentWhenEmpty = Boolean(options && options.silentWhenEmpty);

        inputEl.classList.remove('api-json-valid', 'api-json-invalid');

        if (!raw) {
            statusEl.className = 'small text-muted';
            statusEl.textContent = silentWhenEmpty
                ? 'JSON lot: en attente de saisie.'
                : 'JSON lot vide.';
            return;
        }

        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                throw new Error('Le JSON doit etre un tableau d objets.');
            }

            if (!parsed.every((item) => isPlainObject(item))) {
                throw new Error('Chaque element du tableau doit etre un objet.');
            }

            inputEl.classList.add('api-json-valid');
            statusEl.className = 'small text-success';
            statusEl.textContent = 'JSON valide (' + parsed.length + ' ligne(s)).';
        } catch (error) {
            inputEl.classList.add('api-json-invalid');
            statusEl.className = 'small text-danger';
            statusEl.textContent = 'JSON invalide: ' + (error && error.message ? error.message : 'erreur de syntaxe');
        }
    }

    function rebuildProjectionAutocompletePaths() {
        ensureProjectionSuggestionDataList();
        clearProjectionAutocompleteDebounce();
        if (state.lastResponse === null || typeof apiExplorerState.lastResponse === 'undefined') {
            apiExplorerState.projectionAutocompletePaths = [];
            apiExplorerState.currentProjectionSuggestions = [];
            setProjectionSuggestionList([], null);
            return;
        }

        apiExplorerState.projectionAutocompletePaths = buildProjectionAutocompletePaths(state.lastResponse);
        refreshProjectionAutocompleteSuggestions();
    }

    function scheduleProjectionAutocompleteRefresh() {
        clearProjectionAutocompleteDebounce();
        apiExplorerState.projectionAutocompleteDebounceId = setTimeout(() => {
            apiExplorerState.projectionAutocompleteDebounceId = null;
            refreshProjectionAutocompleteSuggestions();
        }, PROJECTION_AUTOCOMPLETE_DEBOUNCE_MS);
    }

    function clearProjectionAutocompleteDebounce() {
        if (state.projectionAutocompleteDebounceId !== null) {
            clearTimeout(state.projectionAutocompleteDebounceId);
            apiExplorerState.projectionAutocompleteDebounceId = null;
        }
    }

    function refreshProjectionAutocompleteSuggestions() {
        const input = document.getElementById('apiExplorerProjectionPath');
        if (!input) return;

        const context = getProjectionInputContext(input.value);
        if (context.activeSegment.length < PROJECTION_AUTOCOMPLETE_MIN_CHARS) {
            apiExplorerState.currentProjectionSuggestions = [];
            setProjectionSuggestionList([], context);
            ensureProjectionInputShowsTail();
            return;
        }

        const suggestions = getProjectionSuggestionCandidates(context.query, PROJECTION_AUTOCOMPLETE_LIMIT);
        apiExplorerState.currentProjectionSuggestions = suggestions;
        setProjectionSuggestionList(suggestions, context);
        ensureProjectionInputShowsTail();
    }

    function onProjectionPathKeyDown(event) {
        if (!event || event.key !== 'Tab') return;
        if (!state.currentProjectionSuggestions.length) {
            clearProjectionAutocompleteDebounce();
            refreshProjectionAutocompleteSuggestions();
        }
        if (!state.currentProjectionSuggestions.length) return;

        event.preventDefault();
        applyProjectionSuggestion(state.currentProjectionSuggestions[0]);
    }

    function applyProjectionSuggestion(suggestion) {
        const input = document.getElementById('apiExplorerProjectionPath');
        if (!input || !suggestion) return;

        const context = getProjectionInputContext(input.value);
        input.value = context.prefix + context.leadingWhitespace + suggestion;

        const end = input.value.length;
        input.setSelectionRange(end, end);
        ensureProjectionInputShowsTail();
        refreshProjectionAutocompleteSuggestions();
    }

    function getProjectionInputContext(rawInput) {
        const raw = String(rawInput || '');
        const lastCommaIndex = findLastTopLevelCommaIndex(raw);
        const prefix = lastCommaIndex === -1 ? '' : raw.slice(0, lastCommaIndex + 1);
        const segmentRaw = lastCommaIndex === -1 ? raw : raw.slice(lastCommaIndex + 1);
        const leadingWhitespaceMatch = segmentRaw.match(/^\s*/);
        const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : '';
        const activeSegment = segmentRaw.trim();

        return {
            prefix,
            leadingWhitespace,
            activeSegment,
            query: activeSegment.toLowerCase()
        };
    }

    function findLastTopLevelCommaIndex(rawInput) {
        const text = String(rawInput || '');
        let bracketDepth = 0;
        let braceDepth = 0;
        let parenDepth = 0;
        let quote = null;
        let escaped = false;
        let lastCommaIndex = -1;

        for (let i = 0; i < text.length; i += 1) {
            const ch = text[i];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (ch === '\\') {
                escaped = true;
                continue;
            }

            if (quote) {
                if (ch === quote) {
                    quote = null;
                }
                continue;
            }

            if (ch === '"' || ch === '\'') {
                quote = ch;
                continue;
            }

            if (ch === '[') bracketDepth += 1;
            else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
            else if (ch === '{') braceDepth += 1;
            else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
            else if (ch === '(') parenDepth += 1;
            else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
            else if (ch === ',' && bracketDepth === 0 && braceDepth === 0 && parenDepth === 0) {
                lastCommaIndex = i;
            }
        }

        return lastCommaIndex;
    }

    function buildProjectionAutocompletePaths(source) {
        const maxPaths = 1200;
        const maxDepth = 8;
        const paths = new Set();

        collectProjectionPathsRecursive(source, '', paths, 0, maxDepth, maxPaths);

        return Array.from(paths).sort((a, b) => {
            if (a.length !== b.length) return a.length - b.length;
            return a.localeCompare(b);
        });
    }

    function collectProjectionPathsRecursive(current, basePath, paths, depth, maxDepth, maxPaths) {
        if (paths.size >= maxPaths) return;
        if (depth > maxDepth) return;
        if (current === null || typeof current === 'undefined') return;

        if (Array.isArray(current)) {
            const arrayPath = basePath ? basePath + '[]' : '[]';
            paths.add(arrayPath);

            if (!current.length) return;
            const sample = current.find((item) => item !== null && typeof item !== 'undefined');
            if (typeof sample === 'undefined') return;

            collectProjectionPathsRecursive(sample, arrayPath, paths, depth + 1, maxDepth, maxPaths);
            return;
        }

        if (!isPlainObject(current)) {
            return;
        }

        const keys = Object.keys(current);
        for (let i = 0; i < keys.length; i += 1) {
            if (paths.size >= maxPaths) return;
            const key = keys[i];
            const nextPath = basePath ? basePath + '.' + key : key;
            paths.add(nextPath);
            collectProjectionPathsRecursive(current[key], nextPath, paths, depth + 1, maxDepth, maxPaths);
        }
    }

    function getProjectionSuggestionCandidates(query, limit) {
        const allPaths = Array.isArray(state.projectionAutocompletePaths) ? apiExplorerState.projectionAutocompletePaths : [];
        if (!allPaths.length) return [];

        const cappedLimit = Math.max(1, Number(limit) || 40);
        if (!query) {
            return allPaths.slice(0, cappedLimit);
        }

        const startsWithMatches = [];
        const lowerQuery = String(query).toLowerCase();

        for (let i = 0; i < allPaths.length; i += 1) {
            const path = allPaths[i];
            const lowerPath = path.toLowerCase();
            if (lowerPath.startsWith(lowerQuery)) {
                startsWithMatches.push(path);
            }
        }

        return startsWithMatches.slice(0, cappedLimit);
    }

    function setProjectionSuggestionList(suggestions, context) {
        const dataList = ensureProjectionSuggestionDataList();
        if (!dataList) return;

        const values = Array.isArray(suggestions) ? suggestions : [];
        const safeContext = context || { prefix: '', leadingWhitespace: '' };
        const optionsHtml = values.map((tailValue) => {
            const fullValue = safeContext.prefix + safeContext.leadingWhitespace + tailValue;
            return '<option value="' + escapeAttribute(fullValue) + '" label="' + escapeAttribute(tailValue) + '"></option>';
        }).join('');

        // Evite de reconstruire le datalist si la proposition n'a pas change.
        if (dataList.dataset.signature === optionsHtml) {
            return;
        }

        dataList.dataset.signature = optionsHtml;
        // value = valeur complete (necessaire pour datalist + filtre navigateur)
        // label = dernier filtre uniquement (lisible en cas de multi-projection "a,b,c")
        dataList.innerHTML = optionsHtml;
    }

    function ensureProjectionInputShowsTail() {
        const input = document.getElementById('apiExplorerProjectionPath');
        if (!input) return;

        const scrollMargin = 24;
        const maxScrollLeft = Math.max(0, input.scrollWidth - input.clientWidth);
        input.scrollLeft = Math.max(0, maxScrollLeft - scrollMargin);
    }

    // =======================================
    // Projection JSON et export CSV structure
    // =======================================
    async function applyProjection() {
        // Projection simple: path unique. Projection multiple: "pathA,pathB,...".
        if (state.lastResponse === null) {
            setExecutionStatus('Aucune reponse a projeter.', 'warning');
            return;
        }

        if (state.isProjectionProcessing) {
            return;
        }

        setProjectionProcessingState(true);
        try {
            // Laisse le temps au DOM d'appliquer l'etat visuel avant le traitement potentiellement lourd.
            await waitForUiFrame();

            const input = document.getElementById('apiExplorerProjectionPath');
            const projectionInput = input ? input.value.trim() : '';
            const projectionPaths = parseProjectionPaths(projectionInput);
            const groupByObjectCheckbox = document.getElementById('apiExplorerProjectionGroupByObject');
            const groupByObject = !groupByObjectCheckbox || Boolean(groupByObjectCheckbox.checked);

            if (!projectionPaths.length) {
                apiExplorerState.lastProjection = apiExplorerState.lastResponse;
                renderResponseObject(state.lastProjection);
                updateActiveTabFromCurrentState();
                setExecutionStatus('Projection vide: affichage de la reponse complete.', 'info');
                return;
            }

            if (projectionPaths.length === 1) {
                const projected = evaluateProjectionExpression(state.lastResponse, projectionPaths[0]);
                if (typeof projected === 'undefined') {
                    setExecutionStatus('Projection introuvable: ' + projectionPaths[0], 'warning');
                    return;
                }

                apiExplorerState.lastProjection = projected;
                renderResponseObject(projected);
                updateActiveTabFromCurrentState();
                setExecutionStatus('Projection appliquee: ' + projectionPaths[0], 'success');
                return;
            }

            const multipleProjection = buildMultipleProjectionResult(state.lastResponse, projectionPaths, {
                groupByObject
            });
            if (!multipleProjection.hasData) {
                setExecutionStatus('Aucune projection valide trouvee pour: ' + projectionPaths.join(', '), 'warning');
                return;
            }

            apiExplorerState.lastProjection = multipleProjection.value;
            renderResponseObject(multipleProjection.value);
            updateActiveTabFromCurrentState();
            setExecutionStatus(multipleProjection.message, 'success');
        } finally {
            setProjectionProcessingState(false);
        }
    }

    function setProjectionProcessingState(isProcessing) {
        apiExplorerState.isProjectionProcessing = Boolean(isProcessing);

        const button = document.getElementById('apiExplorerApplyProjectionBtn');
        if (button) {
            if (!button.dataset.originalLabel) {
                button.dataset.originalLabel = button.innerHTML;
            }

            button.disabled = apiExplorerState.isProjectionProcessing;
            button.innerHTML = apiExplorerState.isProjectionProcessing
                ? '<i class="fa fa-spinner fa-spin"></i> En cours...'
                : button.dataset.originalLabel;
        }

        const responseEl = document.getElementById('apiExplorerResponse');
        if (responseEl) {
            responseEl.classList.toggle('api-response-processing', apiExplorerState.isProjectionProcessing);
        }
    }

    function waitForUiFrame() {
        return new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    }

    function resetProjection() {
        if (state.lastResponse === null) {
            setExecutionStatus('Aucune reponse a reinitialiser.', 'warning');
            return;
        }

        apiExplorerState.lastProjection = apiExplorerState.lastResponse;
        renderResponseObject(state.lastProjection);
        updateActiveTabFromCurrentState();
        setExecutionStatus('Projection reinitialisee.', 'info');
    }

    function exportCurrentProjectionToCsv() {
        const value = apiExplorerState.lastProjection !== null ? apiExplorerState.lastProjection : apiExplorerState.lastResponse;

        if (value === null) {
            setExecutionStatus('Aucune donnee a exporter.', 'warning');
            return;
        }

        const csvText = convertValueToCsv(value);
        const filename = 'api-explorer-export-' + new Date().toISOString().replace(/[T:.]/g, '-').slice(0, 19) + '.csv';

        downloadTextFile(csvText, filename, 'text/csv;charset=utf-8;');
        setExecutionStatus('Export CSV genere: ' + filename, 'success');
    }

    function exportCurrentProjectionToJson() {
        const value = apiExplorerState.lastProjection !== null ? apiExplorerState.lastProjection : apiExplorerState.lastResponse;

        if (value === null) {
            setExecutionStatus('Aucune donnee a exporter.', 'warning');
            return;
        }

        let jsonText;
        try {
            jsonText = JSON.stringify(value, null, 2);
        } catch (_error) {
            setExecutionStatus('Export JSON impossible: donnees non serialisables.', 'danger');
            return;
        }

        const filename = 'api-explorer-export-' + new Date().toISOString().replace(/[T:.]/g, '-').slice(0, 19) + '.json';
        downloadTextFile(jsonText, filename, 'application/json;charset=utf-8;');
        setExecutionStatus('Export JSON genere: ' + filename, 'success');
    }

    function parseProjectionPaths(rawInput) {
        if (!rawInput) return [];
        return splitByTopLevelComma(String(rawInput))
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    }

    function splitByTopLevelComma(rawInput) {
        const text = String(rawInput || '');
        const segments = [];
        let current = '';
        let bracketDepth = 0;
        let braceDepth = 0;
        let parenDepth = 0;
        let quote = null;
        let escaped = false;

        for (let i = 0; i < text.length; i += 1) {
            const ch = text[i];

            if (escaped) {
                current += ch;
                escaped = false;
                continue;
            }

            if (ch === '\\') {
                current += ch;
                escaped = true;
                continue;
            }

            if (quote) {
                current += ch;
                if (ch === quote) {
                    quote = null;
                }
                continue;
            }

            if (ch === '"' || ch === '\'') {
                quote = ch;
                current += ch;
                continue;
            }

            if (ch === '[') bracketDepth += 1;
            else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
            else if (ch === '{') braceDepth += 1;
            else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
            else if (ch === '(') parenDepth += 1;
            else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);

            if (ch === ',' && bracketDepth === 0 && braceDepth === 0 && parenDepth === 0) {
                segments.push(current);
                current = '';
                continue;
            }

            current += ch;
        }

        segments.push(current);
        return segments;
    }

    function evaluateProjectionExpression(source, expression) {
        const item = createProjectionItem(expression);
        return evaluateProjectionItem(source, item);
    }

    function evaluateProjectionItem(source, projectionItem) {
        if (!projectionItem) return undefined;

        if (projectionItem.kind === 'jsonpath') {
            return evaluateJsonPathSteps(source, projectionItem.steps);
        }

        return getValueByTokens(source, projectionItem.tokens);
    }

    function createProjectionItem(path) {
        const normalizedPath = String(path || '').trim();
        if (!normalizedPath) {
            return {
                kind: 'legacy',
                path: normalizedPath,
                tokens: []
            };
        }

        if (isJsonPathExpression(normalizedPath)) {
            const jsonPathInfo = parseJsonPathForProjection(normalizedPath);
            if (jsonPathInfo) {
                return {
                    kind: 'jsonpath',
                    path: normalizedPath,
                    tokens: jsonPathInfo.tokens,
                    steps: jsonPathInfo.steps
                };
            }

            return {
                kind: 'jsonpath',
                path: normalizedPath,
                tokens: [],
                steps: null
            };
        }

        return {
            kind: 'legacy',
            path: normalizedPath,
            tokens: tokenizePath(normalizedPath)
        };
    }

    function isJsonPathExpression(path) {
        return String(path || '').trim().startsWith('$');
    }

    function buildMultipleProjectionResult(source, projectionPaths, options) {
        const groupByObject = !options || options.groupByObject !== false;
        const projectionItems = projectionPaths.map((path) => createProjectionItem(path));

        if (groupByObject) {
            const commonRoot = findCommonWildcardRoot(projectionItems);
            // Si les chemins partagent la meme racine []: on aligne les champs sur les memes lignes.
            if (commonRoot) {
                const alignedRows = projectMultiplePathsWithCommonRoot(source, projectionItems, commonRoot);
                if (alignedRows.length > 0) {
                    return {
                        hasData: true,
                        value: alignedRows,
                        message: 'Projection multiple appliquee (' + alignedRows.length + ' ligne(s) alignees).'
                    };
                }
            }
        }

        const fallback = {};
        let hasData = false;
        projectionItems.forEach((item) => {
            const value = evaluateProjectionItem(source, item);
            if (typeof value !== 'undefined') {
                fallback[item.path] = value;
                hasData = true;
            }
        });

        return {
            hasData,
            value: fallback,
            message: 'Projection multiple appliquee (mode map).'
        };
    }

    function findCommonWildcardRoot(projectionItems) {
        // Ex: conversations[].id et conversations[].name => racine commune conversations[].
        if (!projectionItems || !projectionItems.length) return null;
        const rootCandidates = collectWildcardRootCandidates(projectionItems[0].tokens);
        if (!rootCandidates.length) return null;

        const commonCandidates = rootCandidates.filter((candidate) => {
            return projectionItems.every((item) => doesTokenArrayStartWith(item.tokens, candidate));
        });

        if (!commonCandidates.length) return null;
        // Prend la racine commune la plus profonde pour grouper au niveau objet le plus fin.
        return commonCandidates[commonCandidates.length - 1];
    }

    function projectMultiplePathsWithCommonRoot(source, projectionItems, rootTokens) {
        const collectionValue = rootTokens.length ? getValueByTokens(source, rootTokens) : source;
        const rootCollection = Array.isArray(collectionValue) ? collectionValue : [];

        if (!rootCollection.length) {
            return [];
        }

        const rows = [];
        for (let rowIndex = 0; rowIndex < rootCollection.length; rowIndex += 1) {
            const rootItem = rootCollection[rowIndex];
            const row = {};
            let hasAnyValue = false;

            for (let i = 0; i < projectionItems.length; i += 1) {
                const item = projectionItems[i];
                const relativeTokens = item.tokens.slice(rootTokens.length);
                const projectedValue = getValueByTokens(rootItem, relativeTokens);

                if (typeof projectedValue !== 'undefined') {
                    row[item.path] = projectedValue;
                    hasAnyValue = true;
                } else {
                    row[item.path] = '';
                }
            }

            if (hasAnyValue) {
                rows.push(row);
            }
        }

        return rows;
    }

    function collectWildcardRootCandidates(tokens) {
        if (!Array.isArray(tokens) || !tokens.length) return [];

        const roots = [];
        for (let i = 0; i < tokens.length; i += 1) {
            if (tokens[i] === ARRAY_WILDCARD_TOKEN) {
                roots.push(tokens.slice(0, i + 1));
            }
        }

        return roots;
    }

    function doesTokenArrayStartWith(tokens, prefix) {
        if (!Array.isArray(tokens) || !Array.isArray(prefix)) return false;
        if (prefix.length > tokens.length) return false;

        for (let i = 0; i < prefix.length; i += 1) {
            if (tokens[i] !== prefix[i]) {
                return false;
            }
        }

        return true;
    }

    function parseJsonPathForProjection(expression) {
        const raw = String(expression || '').trim();
        if (!raw.startsWith('$')) return null;

        const steps = [];
        let index = 1;
        let unsupported = false;

        while (index < raw.length) {
            const ch = raw[index];
            if (/\s/.test(ch)) {
                index += 1;
                continue;
            }

            if (ch === '.') {
                if (raw[index + 1] === '.') {
                    index += 2;
                    const deepToken = readJsonPathDotToken(raw, index);
                    if (!deepToken) {
                        unsupported = true;
                        break;
                    }
                    index = deepToken.nextIndex;
                    if (deepToken.token === '*') {
                        steps.push({ type: 'deep-wildcard' });
                    } else {
                        steps.push({ type: 'deep-child', key: deepToken.token });
                    }
                    continue;
                }

                index += 1;
                const dotToken = readJsonPathDotToken(raw, index);
                if (!dotToken) {
                    unsupported = true;
                    break;
                }
                index = dotToken.nextIndex;
                if (dotToken.token === '*') {
                    steps.push({ type: 'wildcard' });
                } else {
                    steps.push({ type: 'child', key: dotToken.token });
                }
                continue;
            }

            if (ch === '[') {
                const bracketToken = readJsonPathBracketToken(raw, index);
                if (!bracketToken) {
                    unsupported = true;
                    break;
                }
                index = bracketToken.nextIndex;
                steps.push(bracketToken.step);
                continue;
            }

            unsupported = true;
            break;
        }

        if (unsupported) {
            return null;
        }

        const canGroup = steps.every((step) => step.type === 'child' || step.type === 'index' || step.type === 'wildcard');
        const tokens = canGroup ? jsonPathStepsToTokens(steps) : [];

        return {
            steps,
            tokens
        };
    }

    function readJsonPathDotToken(source, startIndex) {
        if (startIndex >= source.length) return null;
        if (source[startIndex] === '*') {
            return { token: '*', nextIndex: startIndex + 1 };
        }

        let index = startIndex;
        while (index < source.length) {
            const ch = source[index];
            if (ch === '.' || ch === '[' || /\s/.test(ch)) {
                break;
            }
            index += 1;
        }

        if (index === startIndex) return null;
        return {
            token: source.slice(startIndex, index),
            nextIndex: index
        };
    }

    function readJsonPathBracketToken(source, startIndex) {
        if (source[startIndex] !== '[') return null;
        let index = startIndex + 1;

        while (index < source.length && /\s/.test(source[index])) index += 1;
        if (index >= source.length) return null;

        const first = source[index];
        if (first === '\'' || first === '"') {
            const parsed = readQuotedString(source, index);
            if (!parsed) return null;
            index = parsed.nextIndex;
            while (index < source.length && /\s/.test(source[index])) index += 1;
            if (source[index] !== ']') return null;
            return {
                step: { type: 'child', key: parsed.value },
                nextIndex: index + 1
            };
        }

        if (first === '*') {
            index += 1;
            while (index < source.length && /\s/.test(source[index])) index += 1;
            if (source[index] !== ']') return null;
            return {
                step: { type: 'wildcard' },
                nextIndex: index + 1
            };
        }

        const numberMatch = source.slice(index).match(/^-?\d+/);
        if (numberMatch) {
            index += numberMatch[0].length;
            while (index < source.length && /\s/.test(source[index])) index += 1;
            if (source[index] !== ']') return null;
            return {
                step: { type: 'index', index: parseInt(numberMatch[0], 10) },
                nextIndex: index + 1
            };
        }

        return null;
    }

    function readQuotedString(source, quoteIndex) {
        const quote = source[quoteIndex];
        let value = '';
        let escaped = false;

        for (let i = quoteIndex + 1; i < source.length; i += 1) {
            const ch = source[i];
            if (escaped) {
                value += ch;
                escaped = false;
                continue;
            }

            if (ch === '\\') {
                escaped = true;
                continue;
            }

            if (ch === quote) {
                return {
                    value,
                    nextIndex: i + 1
                };
            }

            value += ch;
        }

        return null;
    }

    function jsonPathStepsToTokens(steps) {
        const tokens = [];
        for (let i = 0; i < steps.length; i += 1) {
            const step = steps[i];
            if (step.type === 'child') {
                tokens.push(step.key);
            } else if (step.type === 'index') {
                tokens.push(step.index);
            } else if (step.type === 'wildcard') {
                tokens.push(ARRAY_WILDCARD_TOKEN);
            } else {
                return [];
            }
        }
        return tokens;
    }

    function evaluateJsonPathSteps(source, steps) {
        if (!Array.isArray(steps)) {
            return undefined;
        }

        let current = [source];

        for (let i = 0; i < steps.length; i += 1) {
            const step = steps[i];
            const next = [];

            current.forEach((node) => {
                if (typeof node === 'undefined' || node === null) {
                    return;
                }

                if (step.type === 'child') {
                    if (Object.prototype.hasOwnProperty.call(node, step.key)) {
                        next.push(node[step.key]);
                    }
                    return;
                }

                if (step.type === 'index') {
                    if (Array.isArray(node) && step.index >= 0 && step.index < node.length) {
                        next.push(node[step.index]);
                    }
                    return;
                }

                if (step.type === 'wildcard') {
                    if (Array.isArray(node)) {
                        next.push.apply(next, node);
                        return;
                    }
                    if (isPlainObject(node)) {
                        const objectValues = Object.keys(node).map((key) => node[key]);
                        next.push.apply(next, objectValues);
                    }
                    return;
                }

                if (step.type === 'deep-child') {
                    collectDeepChildValues(node, step.key, next);
                    return;
                }

                if (step.type === 'deep-wildcard') {
                    collectDeepWildcardValues(node, next);
                }
            });

            if (!next.length) {
                return undefined;
            }
            current = next;
        }

        return current.length === 1 ? current[0] : current;
    }

    function collectDeepChildValues(node, key, output) {
        if (node === null || typeof node === 'undefined') return;

        if (isPlainObject(node)) {
            if (Object.prototype.hasOwnProperty.call(node, key)) {
                output.push(node[key]);
            }
            Object.keys(node).forEach((childKey) => {
                collectDeepChildValues(node[childKey], key, output);
            });
            return;
        }

        if (Array.isArray(node)) {
            node.forEach((item) => collectDeepChildValues(item, key, output));
        }
    }

    function collectDeepWildcardValues(node, output) {
        if (node === null || typeof node === 'undefined') return;

        if (Array.isArray(node)) {
            node.forEach((item) => {
                output.push(item);
                collectDeepWildcardValues(item, output);
            });
            return;
        }

        if (isPlainObject(node)) {
            Object.keys(node).forEach((key) => {
                const value = node[key];
                output.push(value);
                collectDeepWildcardValues(value, output);
            });
        }
    }

    function areTokenArraysEqual(left, right) {
        if (!Array.isArray(left) || !Array.isArray(right)) return false;
        if (left.length !== right.length) return false;

        for (let i = 0; i < left.length; i += 1) {
            if (left[i] !== right[i]) return false;
        }

        return true;
    }

    function convertValueToCsv(value) {
        // Conversion generique: objets -> colonnes aplaties, primitives -> colonne "value".
        const rows = normalizeRowsForCsv(value);

        const headers = [];
        rows.forEach((row) => {
            Object.keys(row).forEach((key) => {
                if (!headers.includes(key)) headers.push(key);
            });
        });

        if (!headers.length) {
            headers.push('value');
        }

        const lines = [];
        lines.push(headers.map(csvEscape).join(','));

        rows.forEach((row) => {
            const line = headers.map((header) => csvEscape(row[header])).join(',');
            lines.push(line);
        });

        return lines.join('\n');
    }

    function normalizeRowsForCsv(value) {
        if (Array.isArray(value)) {
            if (!value.length) return [];

            if (value.every((entry) => isPlainObject(entry))) {
                return value.map((entry) => flattenObject(entry));
            }

            return value.map((entry) => ({ value: serializeCell(entry) }));
        }

        if (isPlainObject(value)) {
            return [flattenObject(value)];
        }

        return [{ value: serializeCell(value) }];
    }

    function flattenObject(obj, prefix, target) {
        // Aplatissement en notation "dot" (a.b.c) pour export CSV.
        const output = target || {};
        const rootPrefix = prefix || '';

        Object.keys(obj || {}).forEach((key) => {
            const value = obj[key];
            const nextKey = rootPrefix ? rootPrefix + '.' + key : key;

            if (isPlainObject(value)) {
                flattenObject(value, nextKey, output);
                return;
            }

            if (Array.isArray(value)) {
                output[nextKey] = JSON.stringify(value);
                return;
            }

            output[nextKey] = value;
        });

        return output;
    }

    function csvEscape(value) {
        if (value === null || typeof value === 'undefined') return '';

        const text = String(value);
        if (/[",\n\r]/.test(text)) {
            return '"' + text.replace(/"/g, '""') + '"';
        }

        return text;
    }

    function serializeCell(value) {
        if (value === null || typeof value === 'undefined') return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return value;
    }

    function downloadTextFile(content, fileName, mimeType) {
        const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function getValueByPath(source, path) {
        const tokens = tokenizePath(path);
        if (!tokens.length) {
            return typeof path === 'string' && path.trim() ? undefined : source;
        }

        return getValueByTokens(source, tokens);
    }

    function getValueByTokens(source, tokens) {
        if (!Array.isArray(tokens) || !tokens.length) {
            return source;
        }

        // Le parcours maintient une liste de candidats pour supporter le wildcard [].
        let currentValues = [source];

        for (let i = 0; i < tokens.length; i += 1) {
            const token = tokens[i];
            const nextValues = [];

            currentValues.forEach((current) => {
                if (current === null || typeof current === 'undefined') {
                    return;
                }

                if (token === ARRAY_WILDCARD_TOKEN) {
                    if (Array.isArray(current)) {
                        nextValues.push.apply(nextValues, current);
                    }
                    return;
                }

                const nextValue = current[token];
                if (typeof nextValue !== 'undefined') {
                    nextValues.push(nextValue);
                }
            });

            if (!nextValues.length) {
                return undefined;
            }

            currentValues = nextValues;
        }

        return currentValues.length === 1 ? currentValues[0] : currentValues;
    }

    function tokenizePath(path) {
        // Supporte: a.b[0].c, a["b"], a[*], a[].
        const rawPath = String(path || '').trim();
        if (!rawPath) return [];

        const tokens = [];
        const regex = /([^[.\]]+)|\[(\d+|\*|"[^"]+"|'[^']*')?\]/g;

        let match;
        while ((match = regex.exec(rawPath)) !== null) {
            if (match[1]) {
                tokens.push(match[1]);
                continue;
            }

            if (match[0] === '[]' || match[0] === '[*]') {
                tokens.push(ARRAY_WILDCARD_TOKEN);
                continue;
            }

            if (typeof match[2] !== 'undefined') {
                const rawToken = match[2];
                if (/^\d+$/.test(rawToken)) {
                    tokens.push(parseInt(rawToken, 10));
                } else if (rawToken === '*') {
                    tokens.push(ARRAY_WILDCARD_TOKEN);
                } else {
                    tokens.push(rawToken.slice(1, -1));
                }
            }
        }

        return tokens;
    }

    // ============================================
    // Viewer JSON (affichage colore + expand/collapse)
    // ============================================
    function renderResponseObject(value) {
        const responseEl = document.getElementById('apiExplorerResponse');
        if (!responseEl) return;

        const statsSource = resolveStatsPayload(value);
        // Les stats sont calculees sur la reponse "brute" quand une projection est active.
        updateResponseStats(statsSource);
        const bytes = updateResponseSize(value);
        const renderMode = resolveResponseRenderMode(bytes);
        updateResponseRenderControls({
            hasPayload: true,
            mode: renderMode,
            bytes
        });

        try {
            if (renderMode === 'text') {
                const textPayload = JSON.stringify(value, null, 2);
                renderResponseText(textPayload, { preserveStats: true, preserveResponseSize: true, preserveRenderControls: true });
                return;
            }

            clearResponseViewerDom(responseEl);
            responseEl.classList.add('api-json-viewer-active');
            responseEl.appendChild(createJsonNode(value, null, true, 0));
        } catch (_error) {
            let text;
            try {
                text = JSON.stringify(value, null, 2);
            } catch (_innerError) {
                text = String(value);
            }
            renderResponseText(text, { preserveStats: true, preserveResponseSize: true, preserveRenderControls: true });
        }
    }

    function renderResponseText(text, options) {
        const responseEl = document.getElementById('apiExplorerResponse');
        if (responseEl) {
            clearResponseViewerDom(responseEl);
            responseEl.classList.remove('api-json-viewer-active');
            responseEl.textContent = String(text);
        }

        const preserveStats = Boolean(options && options.preserveStats);
        const preserveResponseSize = Boolean(options && options.preserveResponseSize);
        const preserveRenderControls = Boolean(options && options.preserveRenderControls);

        if (!preserveStats) {
            updateResponseStats(null);
        }

        if (!preserveResponseSize) {
            updateResponseSize(null);
        }

        if (!preserveRenderControls) {
            updateResponseRenderControls({ hasPayload: false });
        }
    }

    function clearResponseViewerDom(responseEl) {
        if (!responseEl) return;

        const jsonNodes = responseEl.querySelectorAll('.json-node');
        jsonNodes.forEach((node) => {
            node.replaceChildren();
        });

        responseEl.replaceChildren();
    }

    function createJsonNode(value, key, isLast, depth) {
        // Rendu recursif JSON avec collapse/expand (arbre).
        const node = document.createElement('div');
        node.className = 'json-node';

        if (isCompositeValue(value)) {
            node.classList.add('json-composite');

            const isArray = Array.isArray(value);
            const openBracket = isArray ? '[' : '{';
            const closeBracket = isArray ? ']' : '}';
            const entries = getCompositeEntries(value);

            const openLine = createJsonLine(depth);
            openLine.classList.add('json-open');
            openLine.appendChild(createJsonToggle(entries.length > 0));
            appendJsonKey(openLine, key);

            if (!entries.length) {
                openLine.appendChild(createSpan('json-punctuation', openBracket + closeBracket + (isLast ? '' : ',')));
                node.appendChild(openLine);
                return node;
            }

            openLine.appendChild(createSpan('json-punctuation', openBracket));
            const summaryText = ' ... ' + closeBracket + (isLast ? '' : ',') + ' (' + entries.length + (isArray ? ' items)' : ' champs)');
            openLine.appendChild(createSpan('json-summary', summaryText));
            node.appendChild(openLine);

            const children = document.createElement('div');
            children.className = 'json-children';
            entries.forEach((entry, index) => {
                const childNode = createJsonNode(entry.value, entry.key, index === entries.length - 1, depth + 1);
                children.appendChild(childNode);
            });
            node.appendChild(children);

            const closeLine = createJsonLine(depth);
            closeLine.className = 'json-line json-close';
            closeLine.appendChild(createJsonToggle(false));
            closeLine.appendChild(createSpan('json-punctuation', closeBracket + (isLast ? '' : ',')));
            node.appendChild(closeLine);

            return node;
        }

        const primitiveLine = createJsonLine(depth);
        primitiveLine.appendChild(createJsonToggle(false));
        appendJsonKey(primitiveLine, key);
        primitiveLine.appendChild(createSpan(getPrimitiveCssClass(value), formatPrimitiveValue(value)));
        primitiveLine.appendChild(createSpan('json-punctuation', isLast ? '' : ','));
        node.appendChild(primitiveLine);

        return node;
    }

    function createJsonLine(depth) {
        const line = document.createElement('div');
        line.className = 'json-line';
        line.style.paddingLeft = (depth * 16) + 'px';
        return line;
    }

    function createJsonToggle(hasChildren) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'json-toggle' + (hasChildren ? '' : ' json-toggle-empty');
        button.textContent = hasChildren ? '-' : '+';
        return button;
    }

    function appendJsonKey(line, key) {
        if (key === null || typeof key === 'undefined') return;
        line.appendChild(createSpan('json-key', JSON.stringify(String(key))));
        line.appendChild(createSpan('json-punctuation', ': '));
    }

    function createSpan(className, text) {
        const span = document.createElement('span');
        span.className = className || '';
        span.textContent = text;
        return span;
    }

    function isCompositeValue(value) {
        return value !== null && typeof value === 'object';
    }

    function getCompositeEntries(value) {
        if (Array.isArray(value)) {
            return value.map((item) => ({ key: null, value: item }));
        }

        return Object.keys(value).map((propName) => ({
            key: propName,
            value: value[propName]
        }));
    }

    function formatPrimitiveValue(value) {
        if (typeof value === 'string') return JSON.stringify(value);
        if (typeof value === 'number' || typeof value === 'bigint') return String(value);
        if (typeof value === 'boolean') return String(value);
        if (value === null) return 'null';
        if (typeof value === 'undefined') return 'undefined';
        return String(value);
    }

    function getPrimitiveCssClass(value) {
        if (typeof value === 'string') return 'json-string';
        if (typeof value === 'number' || typeof value === 'bigint') return 'json-number';
        if (typeof value === 'boolean') return 'json-boolean';
        if (value === null || typeof value === 'undefined') return 'json-null';
        return 'json-string';
    }

    function normalizeError(error) {
        if (!error) {
            return {
                message: 'Erreur inconnue'
            };
        }

        return {
            message: error.message || 'Erreur inconnue',
            status: error.status || null,
            code: error.code || null,
            stack: error.stack || null,
            details: typeof error.body !== 'undefined' ? error.body : null
        };
    }

    // ==========================
    // Stats reponse / pagination
    // ==========================
    function resolveStatsPayload(fallbackPayload) {
        const executionMeta = apiExplorerState.lastExecutionMeta;
        if (isPlainObject(executionMeta)) {
            if (executionMeta.mode === 'post-auto-pagination' && isPlainObject(executionMeta.paging)) {
                return executionMeta.paging;
            }

            if (executionMeta.mode === 'batch-inputs' && isPlainObject(executionMeta.paging)) {
                return executionMeta.paging;
            }
        }

        return apiExplorerState.lastResponse !== null ? apiExplorerState.lastResponse : fallbackPayload;
    }

    function updateResponseStats(payload) {
        const statsEl = document.getElementById('apiExplorerResponseStats');
        if (!statsEl) return;

        const stats = extractResponseStats(payload);
        const totalHitsText = typeof stats.totalHits === 'number' ? String(stats.totalHits) : '-';
        const pageNumberText = typeof stats.pageNumber === 'number' ? String(stats.pageNumber) : '-';
        const pageCountText = typeof stats.pageCount === 'number' ? String(stats.pageCount) : '-';

        statsEl.textContent = 'totalHits: ' + totalHitsText + ' | page: ' + pageNumberText + ' / ' + pageCountText;
    }

    function updateResponseSize(payload) {
        const sizeEl = document.getElementById('apiExplorerResponseSize');
        if (!sizeEl) return null;

        if (payload === null || typeof payload === 'undefined') {
            sizeEl.textContent = 'Taille reponse: -';
            return null;
        }

        const bytes = computePayloadSizeBytes(payload);
        if (bytes === null) {
            sizeEl.textContent = 'Taille reponse: inconnue';
            return null;
        }

        const kiloBytes = bytes / 1024;
        sizeEl.textContent = 'Taille reponse: ' + formatNumberForDisplay(kiloBytes, 2) + ' Ko (' + bytes + ' octets)';
        return bytes;
    }

    function computePayloadSizeBytes(payload) {
        try {
            if (typeof payload === 'string') {
                return computeUtf8ByteLength(payload);
            }

            const asJson = JSON.stringify(payload);
            if (typeof asJson !== 'string') return null;
            return computeUtf8ByteLength(asJson);
        } catch (_error) {
            try {
                return computeUtf8ByteLength(String(payload));
            } catch (_innerError) {
                return null;
            }
        }
    }

    function computeUtf8ByteLength(text) {
        const source = String(text || '');
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(source).length;
        }

        try {
            return new Blob([source]).size;
        } catch (_error) {
            return source.length;
        }
    }

    function formatNumberForDisplay(value, decimals) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '-';
        return numeric.toFixed(decimals);
    }

    function extractResponseStats(payload) {
        // Heuristique tolerant aux structures Genesys Cloud heterogenes.
        if (!payload) {
            return { totalHits: null, pageNumber: null, pageCount: null };
        }

        if (isPlainObject(payload) && isPlainObject(payload.paging)) {
            return normalizeStatsObject(payload.paging);
        }

        if (isPlainObject(payload)) {
            return normalizeStatsObject(payload);
        }

        if (Array.isArray(payload) && payload.length > 0) {
            for (let i = payload.length - 1; i >= 0; i -= 1) {
                const item = payload[i];
                if (isPlainObject(item)) {
                    const fromItem = normalizeStatsObject(item);
                    if (hasAnyStat(fromItem)) {
                        return fromItem;
                    }
                }
            }
        }

        return { totalHits: null, pageNumber: null, pageCount: null };
    }

    function normalizeStatsObject(source) {
        const containers = collectStatsContainers(source);

        const totalHits = findNumericValue(containers, ['totalHits', 'total', 'totalCount', 'totalRecords', 'count']);
        const pageNumber = findNumericValue(containers, ['pageNumber', 'page', 'currentPage']);
        let pageCount = findNumericValue(containers, ['pageCount', 'totalPages', 'pages']);

        if (pageCount === null) {
            // Fallback: calcul pageCount a partir de totalHits/pageSize si absent.
            const pageSize = findNumericValue(containers, ['pageSize', 'size', 'perPage']);
            if (totalHits !== null && pageSize !== null && pageSize > 0) {
                pageCount = Math.ceil(totalHits / pageSize);
            }
        }

        return { totalHits, pageNumber, pageCount };
    }

    function collectStatsContainers(source) {
        const containers = [];
        if (!isPlainObject(source)) return containers;

        containers.push(source);
        ['result', 'results', 'meta', 'pagination', 'paging'].forEach((key) => {
            if (isPlainObject(source[key])) {
                containers.push(source[key]);
            }
        });

        return containers;
    }

    function findNumericValue(containers, candidateKeys) {
        for (let i = 0; i < containers.length; i += 1) {
            const container = containers[i];
            for (let j = 0; j < candidateKeys.length; j += 1) {
                const key = candidateKeys[j];
                if (Object.prototype.hasOwnProperty.call(container, key)) {
                    const parsed = parseNumericValue(container[key]);
                    if (parsed !== null) {
                        return parsed;
                    }
                }
            }
        }
        return null;
    }

    function parseNumericValue(value) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) return numeric;
        return null;
    }

    function hasAnyStat(stats) {
        return typeof stats.totalHits === 'number' || typeof stats.pageNumber === 'number' || typeof stats.pageCount === 'number';
    }

    function setExecutionStatus(message, level) {
        const statusEl = document.getElementById('apiExplorerExecutionStatus');
        if (!statusEl) return;

        statusEl.className = '';
        statusEl.textContent = message || '';

        const cssClass = {
            info: 'text-info',
            success: 'text-success',
            warning: 'text-warning',
            danger: 'text-danger'
        }[level || 'info'];

        if (cssClass) {
            statusEl.classList.add(cssClass);
        }
    }

    function setCatalogInfo(message) {
        const infoEl = document.getElementById('apiExplorerCatalogInfo');
        if (infoEl) {
            infoEl.textContent = message || '';
        }
    }

    // ==========================
    // Favoris et persistance
    // ==========================
    function loadFavoritesFromCookie() {
        // Persistance simple (cookie) pour rester autonome sans backend.
        const cookieValue = getCookieValue(FAVORITES_COOKIE_NAME);
        if (!cookieValue) {
            apiExplorerState.favorites = new Set();
            return;
        }

        try {
            const parsed = JSON.parse(decodeURIComponent(cookieValue));
            if (Array.isArray(parsed)) {
                apiExplorerState.favorites = new Set(parsed.filter((id) => typeof id === 'string' && id.trim().length > 0));
            } else {
                apiExplorerState.favorites = new Set();
            }
        } catch (_error) {
            apiExplorerState.favorites = new Set();
        }
    }

    function pruneUnknownFavorites() {
        // Nettoie les favoris devenus obsoletes apres evolution SDK/catalogue.
        const knownIds = new Set(state.catalog.map((item) => item.id));
        let changed = false;

        Array.from(state.favorites).forEach((favoriteId) => {
            if (!knownIds.has(favoriteId)) {
                apiExplorerState.favorites.delete(favoriteId);
                changed = true;
            }
        });

        if (changed) {
            saveFavoritesToCookie();
        }
    }

    function saveFavoritesToCookie() {
        const serialized = encodeURIComponent(JSON.stringify(Array.from(state.favorites)));
        const maxAge = FAVORITES_COOKIE_TTL_DAYS * 24 * 60 * 60;
        document.cookie = FAVORITES_COOKIE_NAME + '=' + serialized + '; max-age=' + maxAge + '; path=/; SameSite=Lax';
    }

    function getCookieValue(cookieName) {
        const parts = String(document.cookie || '').split(';');
        for (let i = 0; i < parts.length; i += 1) {
            const part = parts[i].trim();
            if (!part) continue;

            const equalIndex = part.indexOf('=');
            if (equalIndex === -1) continue;

            const name = part.substring(0, equalIndex);
            const value = part.substring(equalIndex + 1);
            if (name === cookieName) {
                return value;
            }
        }

        return null;
    }

    function getMethodLabelClass(httpMethod) {
        const map = {
            GET: 'label-primary',
            POST: 'label-success',
            PATCH: 'label-warning',
            DELETE: 'label-danger',
            PUT: 'label-info'
        };

        return map[httpMethod] || 'label-default';
    }

    function isPlainObject(value) {
        return Boolean(value) && Object.prototype.toString.call(value) === '[object Object]';
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttribute(value) {
        return escapeHtml(value);
    }
//})();
