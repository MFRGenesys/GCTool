/*
 * api-tester.js
 * Module front du nouvel outil API Tester.
 * Il permet de preparer un mock de Data Action et de pousser la configuration vers un petit serveur Node.
 */
(function apiTesterModule(window) {
    'use strict';

    const API_TESTER_STORAGE_KEY = 'gctool_api_tester_config_v1';
    const API_TESTER_DEFAULT_METHOD = 'GET';
    const API_TESTER_SUPPORTED_METHODS = ['GET', 'POST'];
    const API_TESTER_SWAGGER_IMPORT_METHODS = ['get', 'post'];

    const apiTesterState = {
        initialized: false,
        lastOutput: null,
        selectedMockId: '',
        serverMockIndex: [],
        feasibilityTimerId: null
    };

    window.initializeApiTesterTab = initializeApiTesterTab;

    function apiTesterI18n(key, fallback, params) {
        if (window.GCToolI18n && typeof window.GCToolI18n.t === 'function') {
            return window.GCToolI18n.t(key, params || {}, fallback);
        }

        return fallback;
    }

    /**
     * Initialisation idempotente de l'onglet.
     * On evite volontairement tout double bind lors des changements d'onglet.
     */
    function initializeApiTesterTab() {
        const root = document.getElementById('apiTesterRoot');
        if (!root) {
            console.warn('[API Tester] Root introuvable.');
            return;
        }

        if (root.getAttribute('data-api-tester-bound') !== 'true') {
            console.log('[API Tester] Binding sur une nouvelle instance de l onglet.');
            bindApiTesterEvents();
            root.setAttribute('data-api-tester-bound', 'true');
            loadInitialApiTesterConfiguration();
        }

        refreshApiTesterPreview();
        refreshServerMockList({ silent: true });

        if (!apiTesterState.initialized) {
            console.log('[API Tester] Initialisation du module.');
            apiTesterState.initialized = true;
            showTransientFeasibilityAlert();
            setApiTesterStatus(apiTesterI18n('tab.api_tester.status.initialized', 'Module initialise. La configuration locale a ete chargee.'), 'info');
            return;
        }

        console.log('[API Tester] Module deja initialise, simple rafraichissement des previews.');
    }

    /**
     * Bind centralise de tous les elements de l'onglet.
     */
    function bindApiTesterEvents() {
        console.log('[API Tester] Binding des evenements UI.');

        const watchedFieldIds = [
            'apiTesterServerBaseUrl',
            'apiTesterAdminEndpointPath',
            'apiTesterPublicEndpointPath',
            'apiTesterHttpMethod',
            'apiTesterScenarioName',
            'apiTesterDataActionName',
            'apiTesterResponseStatus',
            'apiTesterSimulatedLatency',
            'apiTesterNotes',
            'apiTesterTestQueryString',
            'apiTesterTestRequestBodyJson',
            'apiTesterResponseBodyJson',
            'apiTesterTestDataJson'
        ];

        watchedFieldIds.forEach(function attachFieldListeners(fieldId) {
            const field = document.getElementById(fieldId);
            if (!field) {
                console.warn('[API Tester] Champ introuvable:', fieldId);
                return;
            }

            field.addEventListener('input', onApiTesterFormUpdated);
            field.addEventListener('change', onApiTesterFormUpdated);
        });

        bindButton('apiTesterLoadExampleBtn', loadApiTesterExample);
        bindButton('apiTesterSaveLocalBtn', saveApiTesterConfigurationLocally);
        bindButton('apiTesterImportSwaggerBtn', openSwaggerImportDialog);
        bindButton('apiTesterSendConfigBtn', sendApiTesterConfigurationToServer);
        bindButton('apiTesterLoadServerBtn', loadApiTesterConfigurationFromServer);
        bindButton('apiTesterTestEndpointBtn', testApiTesterEndpoint);
        bindButton('apiTesterExportDataActionBtn', exportApiTesterDataActionJson);
        bindButton('apiTesterRefreshMocksBtn', refreshServerMockList);
        bindButton('apiTesterDeleteMockBtn', deleteSelectedServerMock);

        bindSelectChange('apiTesterServerMocksSelect', onApiTesterServerMockSelected);
        bindFileChange('apiTesterSwaggerFileInput', importSwaggerFile);
        bindApiTesterOverlayActions('apiTesterRoot');
    }

    function bindButton(buttonId, handler) {
        const button = document.getElementById(buttonId);
        if (!button) {
            console.warn('[API Tester] Bouton introuvable:', buttonId);
            return;
        }

        button.addEventListener('click', function onButtonClicked(event) {
            event.preventDefault();
            handler();
        });
    }

    function bindSelectChange(elementId, handler) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn('[API Tester] Select introuvable:', elementId);
            return;
        }

        element.addEventListener('change', handler);
    }

    function bindFileChange(elementId, handler) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn('[API Tester] Input file introuvable:', elementId);
            return;
        }

        element.addEventListener('change', handler);
    }

    function bindApiTesterOverlayActions(rootId) {
        const root = document.getElementById(rootId);
        if (!root) {
            console.warn('[API Tester] Root overlay introuvable:', rootId);
            return;
        }

        root.addEventListener('click', function onOverlayClicked(event) {
            const openOverlayId = event.target && event.target.closest('[data-api-tester-open-overlay]');
            if (openOverlayId) {
                event.preventDefault();
                openApiTesterOverlay(openOverlayId.getAttribute('data-api-tester-open-overlay'));
                return;
            }

            const closeOverlayId = event.target && event.target.closest('[data-api-tester-close-overlay]');
            if (closeOverlayId) {
                event.preventDefault();
                closeApiTesterOverlay(closeOverlayId.getAttribute('data-api-tester-close-overlay'));
            }
        });
    }

    function onApiTesterFormUpdated() {
        console.log('[API Tester] Formulaire modifie.');
        refreshApiTesterPreview();
        setApiTesterStatus(apiTesterI18n('tab.api_tester.status.form_updated', 'Configuration mise a jour.'), 'info');
    }

    function loadInitialApiTesterConfiguration() {
        const savedConfig = loadApiTesterConfigurationFromStorage();
        if (savedConfig) {
            console.log('[API Tester] Configuration locale detectee.');
            applyApiTesterConfigurationToForm(savedConfig);
            return;
        }

        console.log('[API Tester] Aucune configuration locale, chargement de l exemple.');
        applyApiTesterConfigurationToForm(getDefaultApiTesterConfiguration());
    }

    /**
     * Exemple de configuration de base.
     * Il correspond exactement au socle serveur livre dans Server/.
     */
    function getDefaultApiTesterConfiguration() {
        return {
            selectedMockId: '',
            serverBaseUrl: 'http://localhost:7070',
            adminEndpointPath: '/api/admin/mock-config',
            publicEndpointPath: '/api/test',
            httpMethod: API_TESTER_DEFAULT_METHOD,
            scenarioName: 'Success simple',
            dataActionName: 'GC_DATA_ACTION_TEST',
            responseStatus: 200,
            simulatedLatencyMs: 0,
            notes: 'Scenario de validation minimal pour verifier le cablage Data Action -> endpoint mock.',
            testQueryString: 'customerId=CUST-001',
            testRequestBodyJson: JSON.stringify({
                customer: {
                    id: 'CUST-001',
                    segment: 'STANDARD'
                }
            }, null, 2),
            responseBodyJson: JSON.stringify({
                status: 'Success',
                trackingId: {
                    $regexGenerate: '^TRACK-[0-9]{6}$',
                    $type: 'string'
                },
                trackingBatch: {
                    $regexGenerate: '^TRACK-[0-9]{4}$',
                    $regexGenerateCount: 3,
                    $type: 'string'
                },
                seededEmail: {
                    $fakerType: 'email',
                    $randomSeed: '${request.query.customerId}'
                }
            }, null, 2),
            testDataJson: JSON.stringify({
                matchMode: 'rules',
                cases: [
                    {
                        name: 'Client standard regex',
                        when: {
                            all: [
                                {
                                    source: 'query',
                                    field: 'customerId',
                                    operator: 'regex',
                                    value: '^CUST-([0-9]{3})$'
                                }
                            ]
                        },
                        responseStatus: 200,
                        responseBody: {
                            status: 'Success',
                            customerId: '${captures.query.customerId.1}',
                            trackingId: {
                                $regexGenerate: '^TRACK-[0-9]{6}$',
                                $type: 'string'
                            },
                            generatedContacts: {
                                $fakerType: 'email',
                                $regexGenerateCount: 2
                            }
                        }
                    }
                ]
            }, null, 2)
        };
    }

    function applyApiTesterConfigurationToForm(config) {
        const safeConfig = config || getDefaultApiTesterConfiguration();

        console.log('[API Tester] Application de configuration au formulaire.', safeConfig);
        apiTesterState.selectedMockId = safeConfig.selectedMockId || '';

        setInputValue('apiTesterServerBaseUrl', sanitizeBaseUrl(safeConfig.serverBaseUrl || 'http://localhost:7070'));
        setInputValue('apiTesterAdminEndpointPath', normalizePath(safeConfig.adminEndpointPath || '/api/admin/mock-config'));
        setInputValue('apiTesterPublicEndpointPath', normalizePath(safeConfig.publicEndpointPath || '/api/test'));
        setInputValue('apiTesterHttpMethod', String(safeConfig.httpMethod || API_TESTER_DEFAULT_METHOD).toUpperCase());
        setInputValue('apiTesterScenarioName', safeConfig.scenarioName || 'Success simple');
        setInputValue('apiTesterDataActionName', safeConfig.dataActionName || 'GC_DATA_ACTION_TEST');
        setInputValue('apiTesterResponseStatus', String(safeConfig.responseStatus || 200));
        setInputValue('apiTesterSimulatedLatency', String(safeConfig.simulatedLatencyMs || 0));
        setInputValue('apiTesterNotes', safeConfig.notes || '');
        setInputValue('apiTesterTestQueryString', safeConfig.testQueryString || 'customerId=CUST-001');
        setInputValue('apiTesterTestRequestBodyJson', ensurePrettyJsonString(safeConfig.testRequestBodyJson, {
            customer: {
                id: 'CUST-001'
            }
        }));
        setInputValue('apiTesterResponseBodyJson', ensurePrettyJsonString(safeConfig.responseBodyJson, { status: 'Success' }));
        setInputValue('apiTesterTestDataJson', ensurePrettyJsonString(safeConfig.testDataJson, { expectedResult: 'Success' }));
    }

    function collectApiTesterConfigurationFromForm() {
        const configuration = {
            selectedMockId: apiTesterState.selectedMockId || '',
            serverBaseUrl: sanitizeBaseUrl(getInputValue('apiTesterServerBaseUrl')),
            adminEndpointPath: normalizePath(getInputValue('apiTesterAdminEndpointPath') || '/api/admin/mock-config'),
            publicEndpointPath: normalizePath(getInputValue('apiTesterPublicEndpointPath') || '/api/test'),
            httpMethod: String(getInputValue('apiTesterHttpMethod') || API_TESTER_DEFAULT_METHOD).toUpperCase(),
            scenarioName: getInputValue('apiTesterScenarioName') || 'Success simple',
            dataActionName: getInputValue('apiTesterDataActionName') || 'GC_DATA_ACTION_TEST',
            responseStatus: clampHttpStatus(getInputNumberValue('apiTesterResponseStatus', 200)),
            simulatedLatencyMs: Math.max(0, getInputNumberValue('apiTesterSimulatedLatency', 0)),
            notes: getInputValue('apiTesterNotes') || '',
            testQueryString: normalizeQueryString(getInputValue('apiTesterTestQueryString') || ''),
            testRequestBodyJson: getInputValue('apiTesterTestRequestBodyJson') || '{}',
            responseBodyJson: getInputValue('apiTesterResponseBodyJson') || '{\n  "status": "Success"\n}',
            testDataJson: getInputValue('apiTesterTestDataJson') || '{}'
        };

        console.log('[API Tester] Configuration collectee depuis le formulaire.', configuration);
        return configuration;
    }

    function loadApiTesterExample() {
        console.log('[API Tester] Chargement de la configuration exemple.');
        apiTesterState.selectedMockId = '';
        applyApiTesterConfigurationToForm(getDefaultApiTesterConfiguration());
        renderServerMockSelect(apiTesterState.serverMockIndex, apiTesterState.selectedMockId);
        refreshApiTesterPreview();
        setApiTesterStatus(apiTesterI18n('tab.api_tester.status.example_loaded', "Exemple de configuration charge dans l'interface."), 'info');
    }

    function saveApiTesterConfigurationLocally() {
        try {
            const configuration = collectApiTesterConfigurationFromForm();
            validateApiTesterJsonFields(configuration);

            window.localStorage.setItem(API_TESTER_STORAGE_KEY, JSON.stringify(configuration));
            console.log('[API Tester] Configuration sauvegardee dans le localStorage.');
 
            setApiTesterStatus(apiTesterI18n('tab.api_tester.status.local_saved', 'Configuration sauvegardee en local.'), 'success');
            renderApiTesterOutput({
                action: 'save-local',
                savedAt: new Date().toISOString(),
                configuration: configuration
            });
        } catch (error) {
            console.error('[API Tester] Echec de sauvegarde locale.', error);
            setApiTesterStatus(error.message || 'Erreur de sauvegarde locale.', 'danger');
            renderApiTesterOutput(normalizeApiTesterError(error));
        }
    }

    function loadApiTesterConfigurationFromStorage() {
        try {
            const rawValue = window.localStorage.getItem(API_TESTER_STORAGE_KEY);
            if (!rawValue) {
                return null;
            }

            const parsedValue = JSON.parse(rawValue);
            console.log('[API Tester] Configuration relue depuis le localStorage.', parsedValue);
            return parsedValue;
        } catch (error) {
            console.error('[API Tester] Impossible de relire le localStorage.', error);
            return null;
        }
    }

    
    /**
     * Envoi de la configuration au backend mock.
     * Ce point rend concret le besoin de "parametrer le comportement d'un code cote serveur".
     */
    async function sendApiTesterConfigurationToServer() {
        try {
            const configuration = collectApiTesterConfigurationFromForm();
            const payload = buildServerPayload(configuration);
            const adminUrl = buildAdminRequestUrl(configuration, {});

            validateApiTesterJsonFields(configuration);

            console.log('[API Tester] Envoi de configuration vers le serveur.', {
                adminUrl: adminUrl,
                payload: payload
            });

            setApiTesterStatus('Envoi de la configuration serveur en cours...', 'info');

            const response = await fetch(adminUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const responsePayload = await parseFetchResponse(response);
            if (!response.ok) {
                throw new Error('Erreur HTTP ' + response.status + ' lors de la sauvegarde serveur.');
            }

            console.log('[API Tester] Configuration serveur enregistree.', responsePayload);
            syncServerMockCollection(responsePayload, responsePayload.selectedMockId || payload.mockId);
            if (responsePayload && responsePayload.config) {
                applyApiTesterConfigurationToForm(mapServerConfigToFormConfig(responsePayload.config, configuration));
                refreshApiTesterPreview();
            }

            setApiTesterStatus(apiTesterI18n('tab.api_tester.status.server_sync', 'Configuration envoyee au serveur mock avec succes.'), 'success');
            renderApiTesterOutput({
                action: 'send-server',
                adminUrl: adminUrl,
                response: responsePayload
            });
        } catch (error) {
            console.error('[API Tester] Echec d envoi vers le serveur.', error);
            setApiTesterStatus(resolveApiTesterServerErrorMessage(error), 'danger');
            renderApiTesterOutput(normalizeApiTesterError(error));
        }
    }

    async function loadApiTesterConfigurationFromServer(options) {
        try {
            const configuration = collectApiTesterConfigurationFromForm();
            const requestParams = buildServerSelectionParams(configuration, options);
            const adminUrl = buildAdminRequestUrl(configuration, requestParams);

            console.log('[API Tester] Lecture de la configuration serveur.', adminUrl);
            if (!options || !options.silent) {
                setApiTesterStatus('Lecture de la configuration serveur en cours...', 'info');
            }

            const response = await fetch(adminUrl, {
                method: 'GET',
                headers: {
                    Accept: 'application/json'
                }
            });

            const responsePayload = await parseFetchResponse(response);
            if (!response.ok) {
                throw new Error('Erreur HTTP ' + response.status + ' lors de la lecture serveur.');
            }

            console.log('[API Tester] Configuration serveur recue.', responsePayload);
            syncServerMockCollection(responsePayload, responsePayload.selectedMockId);

            if (responsePayload && responsePayload.config) {
                applyApiTesterConfigurationToForm(mapServerConfigToFormConfig(responsePayload.config, configuration));
                refreshApiTesterPreview();
            }

            if (!options || !options.silent) {
                setApiTesterStatus(apiTesterI18n('tab.api_tester.status.server_loaded', 'Configuration rechargee depuis le serveur.'), 'success');
            }
            renderApiTesterOutput({
                action: 'load-server',
                adminUrl: adminUrl,
                response: responsePayload
            });
        } catch (error) {
            console.error('[API Tester] Echec de lecture serveur.', error);
            if (!options || !options.silent) {
                setApiTesterStatus(resolveApiTesterServerErrorMessage(error), 'danger');
            }
            renderApiTesterOutput(normalizeApiTesterError(error));
        }
    }

    async function refreshServerMockList(options) {
        try {
            const configuration = collectApiTesterConfigurationFromForm();
            const adminUrl = buildAdminRequestUrl(configuration, {});

            console.log('[API Tester] Actualisation de la liste des mocks serveur.', adminUrl);
            const response = await fetch(adminUrl, {
                method: 'GET',
                headers: {
                    Accept: 'application/json'
                }
            });

            const responsePayload = await parseFetchResponse(response);
            if (!response.ok) {
                throw new Error('Erreur HTTP ' + response.status + ' lors du chargement de la liste serveur.');
            }

            syncServerMockCollection(responsePayload, responsePayload.selectedMockId || apiTesterState.selectedMockId);
            if (!options || !options.silent) {
                setApiTesterStatus(apiTesterI18n('tab.api_tester.status.server_list_loaded', 'Liste des mocks serveur rechargee.'), 'success');
            }
        } catch (error) {
            console.error('[API Tester] Echec de chargement de la liste serveur.', error);
            if (!options || !options.silent) {
                setApiTesterStatus(resolveApiTesterServerErrorMessage(error), 'danger');
            }
        }
    }

    async function deleteSelectedServerMock() {
        try {
            if (!apiTesterState.selectedMockId) {
                throw new Error(apiTesterI18n('tab.api_tester.error.no_mock_selected', 'Aucun mock serveur selectionne.'));
            }

            const mockSummary = findServerMockSummary(apiTesterState.selectedMockId);
            const confirmationMessage = apiTesterI18n(
                'tab.api_tester.confirm.delete_mock',
                'Supprimer le mock selectionne ?'
            ) + ' ' + (mockSummary ? mockSummary.displayLabel : apiTesterState.selectedMockId);

            if (!window.confirm(confirmationMessage)) {
                return;
            }

            const configuration = collectApiTesterConfigurationFromForm();
            const adminUrl = buildAdminRequestUrl(configuration, {
                mockId: apiTesterState.selectedMockId
            });

            console.log('[API Tester] Suppression du mock serveur.', {
                mockId: apiTesterState.selectedMockId,
                adminUrl: adminUrl
            });

            const response = await fetch(adminUrl, {
                method: 'DELETE',
                headers: {
                    Accept: 'application/json'
                }
            });

            const responsePayload = await parseFetchResponse(response);
            if (!response.ok) {
                throw new Error('Erreur HTTP ' + response.status + ' lors de la suppression serveur.');
            }

            syncServerMockCollection(responsePayload, responsePayload.selectedMockId || '');
            if (responsePayload && responsePayload.config) {
                applyApiTesterConfigurationToForm(mapServerConfigToFormConfig(responsePayload.config, configuration));
                refreshApiTesterPreview();
            }

            setApiTesterStatus(apiTesterI18n('tab.api_tester.status.mock_deleted', 'Mock supprime du serveur.'), 'success');
            renderApiTesterOutput({
                action: 'delete-server-mock',
                response: responsePayload
            });
        } catch (error) {
            console.error('[API Tester] Echec de suppression du mock serveur.', error);
            setApiTesterStatus(error.message || 'Erreur de suppression du mock serveur.', 'danger');
            renderApiTesterOutput(normalizeApiTesterError(error));
        }
    }

    function onApiTesterServerMockSelected(event) {
        const nextMockId = event && event.target ? event.target.value : '';
        console.log('[API Tester] Mock selectionne depuis la liste.', nextMockId);
        apiTesterState.selectedMockId = nextMockId || '';

        if (!apiTesterState.selectedMockId) {
            return;
        }

        loadApiTesterConfigurationFromServer({
            mockId: apiTesterState.selectedMockId
        });
    }

    async function testApiTesterEndpoint() {
        try {
            const configuration = collectApiTesterConfigurationFromForm();
            if (API_TESTER_SUPPORTED_METHODS.indexOf(configuration.httpMethod) < 0) {
                throw new Error(apiTesterI18n('tab.api_tester.error.unsupported_method', 'La methode selectionnee n est pas supportee.'));
            }

            const publicUrl = buildPublicTestUrl(configuration);
            const requestBody = safeParseJson(configuration.testRequestBodyJson, 'testRequestBodyJson');

            console.log('[API Tester] Test de l endpoint public.', publicUrl);
            setApiTesterStatus('Test du endpoint public en cours...', 'info');

            const fetchOptions = {
                method: configuration.httpMethod,
                headers: {
                    Accept: 'application/json'
                }
            };

            if (configuration.httpMethod === 'POST') {
                fetchOptions.headers['Content-Type'] = 'application/json';
                fetchOptions.body = JSON.stringify(requestBody);
            }

            const response = await fetch(publicUrl, fetchOptions);

            const responsePayload = await parseFetchResponse(response);
            if (!response.ok) {
                throw new Error('Erreur HTTP ' + response.status + ' pendant le test du endpoint public.');
            }

            console.log('[API Tester] Reponse endpoint public recue.', responsePayload);

            setApiTesterStatus(apiTesterI18n('tab.api_tester.status.endpoint_tested', 'Endpoint public teste avec succes.'), 'success');
            renderApiTesterOutput({
                action: 'test-endpoint',
                publicUrl: publicUrl,
                responseStatus: response.status,
                response: responsePayload
            });
        } catch (error) {
            console.error('[API Tester] Echec du test endpoint.', error);
            setApiTesterStatus(error.message || 'Erreur de test endpoint.', 'danger');
            renderApiTesterOutput(normalizeApiTesterError(error));
        }
    }

    function buildServerPayload(configuration) {
        return {
            mockId: configuration.selectedMockId || undefined,
            scenarioName: configuration.scenarioName,
            targetDataActionName: configuration.dataActionName,
            publicEndpointPath: configuration.publicEndpointPath,
            response: {
                statusCode: configuration.responseStatus,
                body: safeParseJson(configuration.responseBodyJson, 'responseBodyJson')
            },
            behavior: {
                simulatedLatencyMs: Math.max(0, configuration.simulatedLatencyMs)
            },
            testData: safeParseJson(configuration.testDataJson, 'testDataJson'),
            notes: configuration.notes,
            route: {
                method: configuration.httpMethod,
                path: configuration.publicEndpointPath
            },
            sampleRequest: {
                query: parseQueryParams(configuration.testQueryString),
                body: safeParseJson(configuration.testRequestBodyJson, 'testRequestBodyJson')
            }
        };
    }

    function mapServerConfigToFormConfig(serverConfig, currentFormConfig) {
        const safeServerConfig = serverConfig || {};
        const fallbackFormConfig = currentFormConfig || getDefaultApiTesterConfiguration();

        const mappedConfig = {
            selectedMockId: safeServerConfig.mockId || '',
            serverBaseUrl: fallbackFormConfig.serverBaseUrl,
            adminEndpointPath: fallbackFormConfig.adminEndpointPath,
            publicEndpointPath: normalizePath(safeServerConfig.publicEndpointPath || safeServerConfig.route && safeServerConfig.route.path || fallbackFormConfig.publicEndpointPath),
            httpMethod: String(safeServerConfig.route && safeServerConfig.route.method || fallbackFormConfig.httpMethod || API_TESTER_DEFAULT_METHOD).toUpperCase(),
            scenarioName: safeServerConfig.scenarioName || fallbackFormConfig.scenarioName,
            dataActionName: safeServerConfig.targetDataActionName || fallbackFormConfig.dataActionName,
            responseStatus: clampHttpStatus(safeServerConfig.response && safeServerConfig.response.statusCode || fallbackFormConfig.responseStatus),
            simulatedLatencyMs: Math.max(0, Number(safeServerConfig.behavior && safeServerConfig.behavior.simulatedLatencyMs) || 0),
            notes: safeServerConfig.notes || '',
            testQueryString: buildQueryStringFromObject(
                safeServerConfig.sampleRequest && safeServerConfig.sampleRequest.query || parseQueryParams(fallbackFormConfig.testQueryString || '')
            ),
            testRequestBodyJson: JSON.stringify(
                safeServerConfig.sampleRequest && safeServerConfig.sampleRequest.body || safeParseJson(fallbackFormConfig.testRequestBodyJson || '{}', 'fallbackTestRequestBodyJson'),
                null,
                2
            ),
            responseBodyJson: JSON.stringify(safeServerConfig.response && safeServerConfig.response.body || { status: 'Success' }, null, 2),
            testDataJson: JSON.stringify(safeServerConfig.testData || {}, null, 2)
        };

        console.log('[API Tester] Configuration serveur mappee vers le formulaire.', mappedConfig);
        return mappedConfig;
    }

    function refreshApiTesterPreview() {
        const configuration = collectApiTesterConfigurationFromForm();

        setTextContent('apiTesterPublicUrlPreview', buildPublicTestUrl(configuration));
        setTextContent('apiTesterAdminUrlPreview', buildAbsoluteUrl(configuration.serverBaseUrl, configuration.adminEndpointPath));
        setTextContent('apiTesterCurlPreview', buildCurlPreview(configuration));
        setTextContent('apiTesterResponsePreview', ensurePrettyJsonString(configuration.responseBodyJson, { status: 'Success' }));
        setTextContent('apiTesterDataActionPreview', JSON.stringify(buildDataActionTemplate(configuration), null, 2));
    }

    function syncServerMockCollection(responsePayload, preferredMockId) {
        const serverMocks = normalizeServerMockSummaries(responsePayload && responsePayload.availableMocks);
        const nextSelectedMockId = preferredMockId
            || responsePayload && responsePayload.selectedMockId
            || responsePayload && responsePayload.activeMockId
            || '';

        apiTesterState.serverMockIndex = serverMocks;
        apiTesterState.selectedMockId = serverMocks.some(function hasSelectedMock(candidateMock) {
            return candidateMock.mockId === nextSelectedMockId;
        }) ? nextSelectedMockId : '';

        renderServerMockSelect(serverMocks, apiTesterState.selectedMockId);
    }

    function renderServerMockSelect(serverMocks, selectedMockId) {
        const selectElement = document.getElementById('apiTesterServerMocksSelect');
        if (!selectElement) {
            return;
        }

        selectElement.innerHTML = '';

        if (!serverMocks.length) {
            appendOption(selectElement, '', apiTesterI18n('tab.api_tester.server_mocks_empty', 'Aucun mock disponible sur le serveur.'));
            selectElement.disabled = true;
            return;
        }

        appendOption(selectElement, '', apiTesterI18n('tab.api_tester.server_mocks_placeholder', 'Selectionner un mock serveur'));
        serverMocks.forEach(function appendServerMockOption(serverMock) {
            appendOption(selectElement, serverMock.mockId, serverMock.displayLabel);
        });

        selectElement.disabled = false;
        selectElement.value = selectedMockId || '';
    }

    function appendOption(selectElement, value, label) {
        const optionElement = document.createElement('option');
        optionElement.value = value;
        optionElement.textContent = label;
        selectElement.appendChild(optionElement);
    }

    function normalizeServerMockSummaries(rawServerMocks) {
        const safeServerMocks = Array.isArray(rawServerMocks) ? rawServerMocks : [];
        return safeServerMocks
            .filter(function filterServerMock(candidateMock) {
                return candidateMock && typeof candidateMock === 'object';
            })
            .map(function mapServerMock(candidateMock) {
                return {
                    mockId: String(candidateMock.mockId || ''),
                    publicEndpointPath: normalizePath(candidateMock.publicEndpointPath || '/'),
                    routeMethod: String(candidateMock.routeMethod || 'GET').toUpperCase(),
                    scenarioName: String(candidateMock.scenarioName || ''),
                    targetDataActionName: String(candidateMock.targetDataActionName || ''),
                    displayLabel: candidateMock.displayLabel
                        || (String(candidateMock.routeMethod || 'GET').toUpperCase() + ' ' + normalizePath(candidateMock.publicEndpointPath || '/') + ' - ' + String(candidateMock.scenarioName || 'Mock'))
                };
            });
    }

    function findServerMockSummary(mockId) {
        return apiTesterState.serverMockIndex.find(function findServerMock(candidateMock) {
            return candidateMock.mockId === mockId;
        }) || null;
    }

    function buildServerSelectionParams(configuration, options) {
        if (options && options.mockId) {
            return {
                mockId: options.mockId
            };
        }

        if (apiTesterState.selectedMockId) {
            return {
                mockId: apiTesterState.selectedMockId
            };
        }

        return {
            publicEndpointPath: configuration.publicEndpointPath,
            method: configuration.httpMethod
        };
    }

    function buildAdminRequestUrl(configuration, params) {
        const adminUrl = new URL(buildAbsoluteUrl(configuration.serverBaseUrl, configuration.adminEndpointPath));
        const safeParams = params || {};

        Object.keys(safeParams).forEach(function appendQueryParam(key) {
            if (typeof safeParams[key] === 'undefined' || safeParams[key] === null || safeParams[key] === '') {
                return;
            }

            adminUrl.searchParams.set(key, safeParams[key]);
        });

        return adminUrl.toString();
    }

    function showTransientFeasibilityAlert() {
        const alertElement = document.getElementById('apiTesterFeasibilityAlert');
        if (!alertElement) {
            return;
        }

        alertElement.classList.remove('api-tester-feasibility-alert-hidden');
        if (apiTesterState.feasibilityTimerId) {
            window.clearTimeout(apiTesterState.feasibilityTimerId);
        }

        apiTesterState.feasibilityTimerId = window.setTimeout(function hideFeasibilityAlert() {
            alertElement.classList.add('api-tester-feasibility-alert-hidden');
        }, 30000);
    }

    function openApiTesterOverlay(overlayId) {
        const overlayElement = document.getElementById(overlayId);
        if (!overlayElement) {
            return;
        }

        overlayElement.classList.add('is-open');
        overlayElement.setAttribute('aria-hidden', 'false');
    }

    function closeApiTesterOverlay(overlayId) {
        const overlayElement = document.getElementById(overlayId);
        if (!overlayElement) {
            return;
        }

        overlayElement.classList.remove('is-open');
        overlayElement.setAttribute('aria-hidden', 'true');
    }

    function buildCurlPreview(configuration) {
        const publicUrl = buildPublicTestUrl(configuration);
        const curlLines = [
            'curl -X ' + configuration.httpMethod + ' "' + publicUrl + '"',
            '  -H "Accept: application/json"'
        ];

        if (configuration.httpMethod === 'POST') {
            curlLines.push('  -H "Content-Type: application/json"');
            curlLines.push('  -d \'' + compactJsonForPreview(configuration.testRequestBodyJson) + '\'');
        }

        return curlLines.join('\n');
    }

    function validateApiTesterJsonFields(configuration) {
        safeParseJson(configuration.testRequestBodyJson, 'testRequestBodyJson');
        safeParseJson(configuration.responseBodyJson, 'responseBodyJson');
        safeParseJson(configuration.testDataJson, 'testDataJson');
    }

    function exportApiTesterDataActionJson() {
        try {
            const configuration = collectApiTesterConfigurationFromForm();
            const filePayload = buildDataActionTemplate(configuration);
            const fileName = sanitizeFileName(configuration.dataActionName || 'gctool-data-action') + '.json';

            validateApiTesterJsonFields(configuration);

            console.log('[API Tester] Export du modele JSON Data Action.', {
                fileName: fileName,
                payload: filePayload
            });

            downloadJsonFile(fileName, filePayload);
            setApiTesterStatus(apiTesterI18n('tab.api_tester.status.data_action_exported', 'Modele JSON Data Action exporte.'), 'success');
            renderApiTesterOutput({
                action: 'export-data-action',
                fileName: fileName,
                payload: filePayload
            });
        } catch (error) {
            console.error('[API Tester] Echec export JSON Data Action.', error);
            setApiTesterStatus(error.message || 'Erreur export JSON Data Action.', 'danger');
            renderApiTesterOutput(normalizeApiTesterError(error));
        }
    }

    function openSwaggerImportDialog() {
        const fileInput = document.getElementById('apiTesterSwaggerFileInput');
        if (!fileInput) {
            setApiTesterStatus(apiTesterI18n('tab.api_tester.error.swagger_input_missing', 'Input fichier Swagger introuvable.'), 'danger');
            return;
        }

        console.log('[API Tester] Ouverture du selecteur de fichier Swagger.');
        fileInput.value = '';
        fileInput.click();
    }

    async function importSwaggerFile(event) {
        const fileInput = event && event.target;
        const selectedFile = fileInput && fileInput.files && fileInput.files[0];
        if (!selectedFile) {
            return;
        }

        try {
            console.log('[API Tester] Import Swagger demande.', {
                fileName: selectedFile.name,
                size: selectedFile.size
            });

            setApiTesterStatus(apiTesterI18n('tab.api_tester.status.swagger_import_started', 'Import Swagger en cours...'), 'info');

            const rawFileContent = await readTextFile(selectedFile);
            const swaggerDocument = safeParseJson(rawFileContent, 'swaggerImport');
            const importBatch = buildSwaggerImportBatch(swaggerDocument);
            const importSummary = await pushSwaggerImportBatchToServer(importBatch);

            applySwaggerImportResult(importSummary);
        } catch (error) {
            console.error('[API Tester] Echec import Swagger.', error);
            setApiTesterStatus(error.message || apiTesterI18n('tab.api_tester.error.swagger_import_failed', 'Echec de l import Swagger.'), 'danger');
            renderApiTesterOutput(normalizeApiTesterError(error));
        } finally {
            if (fileInput) {
                fileInput.value = '';
            }
        }
    }

    async function pushSwaggerImportBatchToServer(importBatch) {
        const configuration = collectApiTesterConfigurationFromForm();
        const adminUrl = buildAdminRequestUrl(configuration, {});
        const summary = {
            action: 'import-swagger',
            sourceTitle: importBatch.sourceTitle,
            importedMocks: [],
            failedMocks: [],
            warnings: importBatch.warnings.slice(),
            availableMocks: [],
            selectedMockId: ''
        };

        for (let index = 0; index < importBatch.mocks.length; index += 1) {
            const mockPayload = importBatch.mocks[index];

            try {
                console.log('[API Tester] Import mock Swagger vers serveur.', {
                    index: index + 1,
                    total: importBatch.mocks.length,
                    route: mockPayload.route
                });

                const response = await fetch(adminUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(mockPayload)
                });

                const responsePayload = await parseFetchResponse(response);
                if (!response.ok) {
                    throw new Error('Erreur HTTP ' + response.status + ' lors de l import du mock ' + mockPayload.route.method + ' ' + mockPayload.route.path + '.');
                }

                summary.importedMocks.push({
                    mockId: responsePayload.selectedMockId || mockPayload.mockId || '',
                    route: mockPayload.route,
                    scenarioName: mockPayload.scenarioName,
                    response: responsePayload
                });
                summary.availableMocks = responsePayload.availableMocks || summary.availableMocks;
                summary.selectedMockId = responsePayload.selectedMockId || summary.selectedMockId;
            } catch (error) {
                summary.failedMocks.push({
                    route: mockPayload.route,
                    scenarioName: mockPayload.scenarioName,
                    message: error.message || 'Erreur inconnue'
                });
            }
        }

        return summary;
    }

    function applySwaggerImportResult(importSummary) {
        const hasImportedMocks = importSummary.importedMocks.length > 0;
        const hasFailures = importSummary.failedMocks.length > 0;
        const lastImportedMock = hasImportedMocks ? importSummary.importedMocks[importSummary.importedMocks.length - 1] : null;
        const lastResponse = lastImportedMock ? lastImportedMock.response : null;

        if (lastResponse) {
            syncServerMockCollection(lastResponse, lastResponse.selectedMockId || apiTesterState.selectedMockId);
            if (lastResponse.config) {
                applyApiTesterConfigurationToForm(mapServerConfigToFormConfig(lastResponse.config, collectApiTesterConfigurationFromForm()));
                refreshApiTesterPreview();
            }
        } else if (importSummary.availableMocks.length) {
            syncServerMockCollection({
                availableMocks: importSummary.availableMocks,
                selectedMockId: importSummary.selectedMockId
            }, importSummary.selectedMockId);
        }

        if (!hasImportedMocks && hasFailures) {
            setApiTesterStatus(apiTesterI18n('tab.api_tester.error.swagger_import_failed', 'Echec de l import Swagger.'), 'danger');
        } else if (hasImportedMocks && hasFailures) {
            setApiTesterStatus(
                apiTesterI18n(
                    'tab.api_tester.status.swagger_import_partial',
                    'Import Swagger termine avec succes partiel.'
                ) + ' ' + importSummary.importedMocks.length + '/' + (importSummary.importedMocks.length + importSummary.failedMocks.length),
                'warning'
            );
        } else if (hasImportedMocks) {
            setApiTesterStatus(
                apiTesterI18n('tab.api_tester.status.swagger_import_success', 'Import Swagger termine avec succes.') + ' ' + importSummary.importedMocks.length,
                'success'
            );
        } else {
            setApiTesterStatus(apiTesterI18n('tab.api_tester.error.swagger_import_empty', 'Aucun mock exploitable n a ete importe.'), 'danger');
        }

        renderApiTesterOutput(importSummary);
    }

    /**
     * Generation d'un modele de Data Action base sur la structure documentee par Genesys:
     * ActionConfig(request/response) + ActionContract(input/output).
     * Le contenu exact de l'import Genesys peut varier selon l'integration; on genere ici
     * un modele directement exploitable comme template de creation/import.
     */
    function buildDataActionTemplate(configuration) {
        const datasetDescriptor = buildDatasetDescriptor(safeParseJson(configuration.testDataJson, 'testDataJson'));
        const inputDescriptors = collectDynamicInputDescriptors(configuration, datasetDescriptor);
        const requestUrlTemplate = buildDataActionRequestUrlTemplate(configuration, inputDescriptors);

        return {
            name: configuration.dataActionName,
            category: 'Custom',
            secure: false,
            config: {
                request: {
                    requestUrlTemplate: requestUrlTemplate,
                    requestType: configuration.httpMethod,
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json'
                    },
                    requestTemplate: buildDataActionRequestTemplate(configuration, inputDescriptors)
                },
                response: {
                    translationMap: {},
                    translationMapDefaults: {},
                    successTemplate: '${rawResult}'
                }
            },
            contract: {
                input: {
                    inputSchema: buildDataActionInputSchema(inputDescriptors)
                },
                output: {
                    successSchema: buildDataActionOutputSchema()
                }
            }
        };
    }

    function buildDataActionRequestUrlTemplate(configuration, inputDescriptors) {
        const baseUrl = buildAbsoluteUrl(configuration.serverBaseUrl, configuration.publicEndpointPath);
        const queryDescriptors = inputDescriptors.filter(function filterQueryInput(inputDescriptor) {
            return inputDescriptor.source === 'query';
        });

        if (!queryDescriptors.length) {
            return baseUrl;
        }

        const queryTemplate = queryDescriptors.map(function buildInputPlaceholder(inputDescriptor) {
            return encodeURIComponent(inputDescriptor.path) + '=${input.' + inputDescriptor.inputKey + '}';
        }).join('&');

        return baseUrl + '?' + queryTemplate;
    }

    function buildDataActionRequestTemplate(configuration, inputDescriptors) {
        if (configuration.httpMethod !== 'POST') {
            return '{}';
        }

        return JSON.stringify(
            buildBodyTemplateFromSample(
                safeParseJson(configuration.testRequestBodyJson, 'testRequestBodyJson'),
                inputDescriptors
            ),
            null,
            2
        );
    }

    function buildDataActionInputSchema(inputDescriptors) {
        const schema = {
            '$schema': 'http://json-schema.org/draft-04/schema#',
            type: 'object',
            properties: {},
            additionalProperties: true
        };

        inputDescriptors.forEach(function appendInputProperty(inputDescriptor) {
            schema.properties[inputDescriptor.inputKey] = {
                type: 'string'
            };
        });

        return schema;
    }

    function buildDataActionOutputSchema() {
        return {
            '$schema': 'http://json-schema.org/draft-04/schema#',
            type: 'object',
            properties: {},
            additionalProperties: true
        };
    }

    /**
     * Lecture d'un fichier JSON choisi par l'utilisateur.
     * On encapsule FileReader pour garder une API Promise simple dans le flux d'import.
     */
    function readTextFile(file) {
        return new Promise(function resolveFileContent(resolve, reject) {
            const fileReader = new FileReader();

            fileReader.onload = function onFileLoaded(loadEvent) {
                resolve(loadEvent && loadEvent.target ? loadEvent.target.result : '');
            };

            fileReader.onerror = function onFileError() {
                reject(new Error(apiTesterI18n('tab.api_tester.error.swagger_read_failed', 'Impossible de lire le fichier Swagger.')));
            };

            fileReader.readAsText(file, 'utf-8');
        });
    }

    function buildSwaggerImportBatch(swaggerDocument) {
        const paths = swaggerDocument && typeof swaggerDocument === 'object' && swaggerDocument.paths && typeof swaggerDocument.paths === 'object'
            ? swaggerDocument.paths
            : null;

        if (!paths) {
            throw new Error(apiTesterI18n('tab.api_tester.error.invalid_swagger', 'Le fichier ne contient pas de section paths exploitable.'));
        }

        const warnings = [];
        const importedMocks = [];

        Object.keys(paths).forEach(function inspectSwaggerPath(pathKey) {
            const pathItem = paths[pathKey];
            if (!pathItem || typeof pathItem !== 'object') {
                return;
            }

            API_TESTER_SWAGGER_IMPORT_METHODS.forEach(function inspectSwaggerMethod(httpMethod) {
                if (!pathItem[httpMethod] || typeof pathItem[httpMethod] !== 'object') {
                    return;
                }

                const importedOperation = buildSwaggerMockFromOperation(swaggerDocument, pathKey, httpMethod, pathItem);
                if (!importedOperation) {
                    return;
                }

                importedMocks.push(importedOperation.mock);
                warnings.push.apply(warnings, importedOperation.warnings);
            });
        });

        if (!importedMocks.length) {
            throw new Error(apiTesterI18n('tab.api_tester.error.swagger_no_supported_operations', 'Aucune operation GET/POST exploitable n a ete trouvee dans le Swagger.'));
        }

        return {
            sourceTitle: sanitizeStringFromValue(swaggerDocument.info && swaggerDocument.info.title, 'Swagger import'),
            mocks: importedMocks,
            warnings: warnings
        };
    }

    function buildSwaggerMockFromOperation(swaggerDocument, pathKey, rawHttpMethod, pathItem) {
        const operation = pathItem[rawHttpMethod];
        const httpMethod = String(rawHttpMethod || 'get').toUpperCase();
        const warnings = [];
        const normalizedPath = normalizePath(pathKey);
        const operationParameters = collectSwaggerOperationParameters(pathItem, operation);
        const pathParameters = operationParameters.filter(function filterPathParameters(parameter) {
            return parameter && parameter.in === 'path';
        });
        const queryParameters = operationParameters.filter(function filterQueryParameters(parameter) {
            return parameter && parameter.in === 'query';
        });
        const requestBodySchema = getSwaggerRequestBodySchema(swaggerDocument, operation);
        const responseSelection = selectSwaggerResponseSchema(swaggerDocument, operation);

        if (pathParameters.length) {
            warnings.push('Path params non geres en mode dynamique pour ' + httpMethod + ' ' + normalizedPath + '. La route est importee telle quelle.');
        }

        const sampleQuery = buildSwaggerQuerySample(queryParameters, swaggerDocument);
        const sampleBody = requestBodySchema
            ? buildSwaggerSampleFromSchema(requestBodySchema, swaggerDocument, { includeOptionalProperties: true })
            : {};
        const responseTemplate = responseSelection.schema
            ? buildSwaggerResponseTemplateFromSchema(responseSelection.schema, swaggerDocument)
            : { status: 'Success' };
        const datasetConditions = []
            .concat(buildSwaggerRulesFromParameters(queryParameters, swaggerDocument))
            .concat(requestBodySchema ? buildSwaggerRulesFromSchema(requestBodySchema, 'body', '', swaggerDocument) : []);
        const scenarioName = sanitizeStringFromValue(
            operation.summary || operation.operationId,
            httpMethod + ' ' + normalizedPath
        );
        const dataActionName = buildSwaggerDataActionName(operation, httpMethod, normalizedPath);

        console.log('[API Tester] Operation Swagger convertie en mock.', {
            method: httpMethod,
            path: normalizedPath,
            dataActionName: dataActionName
        });

        return {
            mock: {
                mockId: sanitizeFileName((httpMethod + '-' + normalizedPath).replace(/[{}]/g, '')),
                scenarioName: scenarioName,
                targetDataActionName: dataActionName,
                publicEndpointPath: normalizedPath,
                route: {
                    method: httpMethod,
                    path: normalizedPath
                },
                response: {
                    statusCode: responseSelection.statusCode,
                    body: responseTemplate
                },
                behavior: {
                    simulatedLatencyMs: 0
                },
                testData: {
                    matchMode: 'rules',
                    cases: [
                        {
                            name: scenarioName + ' imported',
                            when: {
                                all: datasetConditions
                            },
                            responseStatus: responseSelection.statusCode,
                            responseBody: responseTemplate
                        }
                    ]
                },
                notes: 'Mock importe depuis Swagger pour ' + httpMethod + ' ' + normalizedPath,
                sampleRequest: {
                    query: sampleQuery,
                    body: sampleBody
                }
            },
            warnings: warnings
        };
    }

    function collectSwaggerOperationParameters(pathItem, operation) {
        const pathParameters = Array.isArray(pathItem && pathItem.parameters) ? pathItem.parameters : [];
        const operationParameters = Array.isArray(operation && operation.parameters) ? operation.parameters : [];
        const mergedParameters = {};

        pathParameters.concat(operationParameters).forEach(function storeSwaggerParameter(parameter) {
            if (!parameter || typeof parameter !== 'object') {
                return;
            }

            const parameterKey = String(parameter.in || '') + ':' + String(parameter.name || '');
            mergedParameters[parameterKey] = parameter;
        });

        return Object.keys(mergedParameters).map(function mapParameterKey(parameterKey) {
            return mergedParameters[parameterKey];
        });
    }

    function getSwaggerRequestBodySchema(swaggerDocument, operation) {
        const requestBody = resolveSwaggerObjectReference(swaggerDocument, operation && operation.requestBody);
        if (requestBody && requestBody.content && typeof requestBody.content === 'object') {
            const contentEntry = selectSwaggerJsonContentEntry(requestBody.content);
            if (contentEntry && contentEntry.schema) {
                return contentEntry.schema;
            }

            if (contentEntry && typeof contentEntry.example !== 'undefined') {
                return {
                    example: contentEntry.example
                };
            }
        }

        const bodyParameter = (Array.isArray(operation && operation.parameters) ? operation.parameters : []).find(function findBodyParameter(parameter) {
            return parameter && parameter.in === 'body';
        });

        if (bodyParameter && bodyParameter.schema) {
            return bodyParameter.schema;
        }

        return null;
    }

    function selectSwaggerResponseSchema(swaggerDocument, operation) {
        const responses = operation && operation.responses && typeof operation.responses === 'object'
            ? operation.responses
            : {};
        const responseCodes = Object.keys(responses);
        const preferredStatusCode = responseCodes
            .filter(function filterSuccessCode(responseCode) {
                return /^2\d\d$/.test(responseCode);
            })
            .sort()[0]
            || (responses.default ? 'default' : responseCodes[0]);
        const responseDescriptor = resolveSwaggerObjectReference(swaggerDocument, responses[preferredStatusCode]) || {};

        if (responseDescriptor.content && typeof responseDescriptor.content === 'object') {
            const contentEntry = selectSwaggerJsonContentEntry(responseDescriptor.content);
            if (contentEntry) {
                return {
                    statusCode: clampHttpStatus(preferredStatusCode === 'default' ? 200 : preferredStatusCode),
                    schema: contentEntry.schema || (typeof contentEntry.example !== 'undefined' ? { example: contentEntry.example } : null)
                };
            }
        }

        return {
            statusCode: clampHttpStatus(preferredStatusCode === 'default' ? 200 : preferredStatusCode),
            schema: responseDescriptor.schema || (typeof responseDescriptor.example !== 'undefined' ? { example: responseDescriptor.example } : null)
        };
    }

    function selectSwaggerJsonContentEntry(contentMap) {
        const contentTypes = Object.keys(contentMap || {});
        const preferredContentType = contentTypes.find(function findJsonContentType(contentType) {
            return String(contentType || '').toLowerCase().indexOf('json') >= 0;
        }) || contentTypes[0];

        return preferredContentType ? contentMap[preferredContentType] : null;
    }

    function resolveSwaggerObjectReference(swaggerDocument, candidateObject) {
        if (!candidateObject || typeof candidateObject !== 'object' || !candidateObject.$ref) {
            return candidateObject || null;
        }

        return resolveSwaggerPointer(swaggerDocument, candidateObject.$ref);
    }

    function resolveSwaggerSchema(swaggerDocument, rawSchema, visitedRefs) {
        const referenceTrail = visitedRefs || {};
        const referencedSchema = resolveSwaggerObjectReference(swaggerDocument, rawSchema);
        if (!referencedSchema || typeof referencedSchema !== 'object') {
            return {};
        }

        if (referencedSchema.$ref) {
            if (referenceTrail[referencedSchema.$ref]) {
                return {};
            }

            const nextTrail = Object.assign({}, referenceTrail);
            nextTrail[referencedSchema.$ref] = true;
            return resolveSwaggerSchema(swaggerDocument, resolveSwaggerPointer(swaggerDocument, referencedSchema.$ref), nextTrail);
        }

        if (Array.isArray(referencedSchema.allOf)) {
            return referencedSchema.allOf.reduce(function mergeAllOf(accumulator, allOfEntry) {
                return mergeSwaggerSchemas(accumulator, resolveSwaggerSchema(swaggerDocument, allOfEntry, referenceTrail));
            }, Object.assign({}, referencedSchema, { allOf: undefined }));
        }

        if (Array.isArray(referencedSchema.oneOf) && referencedSchema.oneOf[0]) {
            return mergeSwaggerSchemas(referencedSchema, resolveSwaggerSchema(swaggerDocument, referencedSchema.oneOf[0], referenceTrail));
        }

        if (Array.isArray(referencedSchema.anyOf) && referencedSchema.anyOf[0]) {
            return mergeSwaggerSchemas(referencedSchema, resolveSwaggerSchema(swaggerDocument, referencedSchema.anyOf[0], referenceTrail));
        }

        return referencedSchema;
    }

    function mergeSwaggerSchemas(baseSchema, additionalSchema) {
        const mergedSchema = Object.assign({}, baseSchema || {}, additionalSchema || {});

        mergedSchema.properties = Object.assign(
            {},
            baseSchema && baseSchema.properties || {},
            additionalSchema && additionalSchema.properties || {}
        );

        mergedSchema.required = []
            .concat(baseSchema && baseSchema.required || [])
            .concat(additionalSchema && additionalSchema.required || [])
            .filter(function keepUniqueRequired(entry, index, array) {
                return array.indexOf(entry) === index;
            });

        return mergedSchema;
    }

    function resolveSwaggerPointer(swaggerDocument, pointer) {
        const pointerSegments = String(pointer || '')
            .replace(/^#\//, '')
            .split('/')
            .filter(Boolean)
            .map(function decodePointerSegment(segment) {
                return segment.replace(/~1/g, '/').replace(/~0/g, '~');
            });

        return pointerSegments.reduce(function walkSwaggerPointer(currentNode, segment) {
            if (!currentNode || typeof currentNode !== 'object') {
                return null;
            }

            return currentNode[segment];
        }, swaggerDocument);
    }

    function buildSwaggerQuerySample(queryParameters, swaggerDocument) {
        return queryParameters.reduce(function reduceQuerySample(accumulator, parameter) {
            const parameterSchema = resolveSwaggerParameterSchema(swaggerDocument, parameter);
            accumulator[parameter.name] = String(buildSwaggerSampleFromSchema(parameterSchema, swaggerDocument, { includeOptionalProperties: true }));
            return accumulator;
        }, {});
    }

    function resolveSwaggerParameterSchema(swaggerDocument, parameter) {
        const resolvedParameter = resolveSwaggerObjectReference(swaggerDocument, parameter) || {};

        if (resolvedParameter.schema) {
            return resolvedParameter.schema;
        }

        return {
            type: resolvedParameter.type || 'string',
            format: resolvedParameter.format,
            pattern: resolvedParameter.pattern,
            enum: resolvedParameter.enum,
            items: resolvedParameter.items
        };
    }

    function buildSwaggerRulesFromParameters(queryParameters, swaggerDocument) {
        return queryParameters.map(function mapQueryParameter(parameter) {
            const parameterSchema = resolveSwaggerParameterSchema(swaggerDocument, parameter);
            return {
                source: 'query',
                field: parameter.name,
                operator: 'regex',
                value: mapSwaggerSchemaToRegexPattern(resolveSwaggerSchema(swaggerDocument, parameterSchema))
            };
        });
    }

    function buildSwaggerRulesFromSchema(rawSchema, source, basePath, swaggerDocument) {
        const resolvedSchema = resolveSwaggerSchema(swaggerDocument, rawSchema);
        const schemaType = resolveSwaggerSchemaType(resolvedSchema);
        const currentPath = String(basePath || '');

        if (schemaType === 'object') {
            const propertyNames = Object.keys(resolvedSchema.properties || {});
            if (!propertyNames.length) {
                return currentPath ? [{
                    source: source,
                    field: currentPath,
                    operator: 'exists'
                }] : [];
            }

            return propertyNames.reduce(function reduceObjectRules(accumulator, propertyName) {
                const nextPath = currentPath ? currentPath + '.' + propertyName : propertyName;
                return accumulator.concat(
                    buildSwaggerRulesFromSchema(resolvedSchema.properties[propertyName], source, nextPath, swaggerDocument)
                );
            }, []);
        }

        if (schemaType === 'array') {
            return currentPath ? [{
                source: source,
                field: currentPath,
                operator: 'exists'
            }] : [];
        }

        if (!currentPath) {
            return [];
        }

        return [{
            source: source,
            field: currentPath,
            operator: 'regex',
            value: mapSwaggerSchemaToRegexPattern(resolvedSchema)
        }];
    }

    function buildSwaggerSampleFromSchema(rawSchema, swaggerDocument, options) {
        const resolvedSchema = resolveSwaggerSchema(swaggerDocument, rawSchema);
        const schemaType = resolveSwaggerSchemaType(resolvedSchema);
        const includeOptionalProperties = !options || options.includeOptionalProperties !== false;

        if (typeof resolvedSchema.example !== 'undefined') {
            return cloneSerializableValueForUi(resolvedSchema.example);
        }

        if (typeof resolvedSchema.default !== 'undefined') {
            return cloneSerializableValueForUi(resolvedSchema.default);
        }

        if (Array.isArray(resolvedSchema.enum) && resolvedSchema.enum.length) {
            return cloneSerializableValueForUi(resolvedSchema.enum[0]);
        }

        if (schemaType === 'object') {
            const propertyNames = Object.keys(resolvedSchema.properties || {});
            const requiredProperties = Array.isArray(resolvedSchema.required) ? resolvedSchema.required : [];

            return propertyNames.reduce(function reduceObjectSample(accumulator, propertyName) {
                if (!includeOptionalProperties && requiredProperties.indexOf(propertyName) < 0) {
                    return accumulator;
                }

                accumulator[propertyName] = buildSwaggerSampleFromSchema(
                    resolvedSchema.properties[propertyName],
                    swaggerDocument,
                    options
                );
                return accumulator;
            }, {});
        }

        if (schemaType === 'array') {
            return [
                buildSwaggerSampleFromSchema(resolvedSchema.items || { type: 'string' }, swaggerDocument, options)
            ];
        }

        return buildSwaggerPrimitiveSample(resolvedSchema);
    }

    function buildSwaggerPrimitiveSample(schema) {
        const resolvedType = resolveSwaggerSchemaType(schema);
        const resolvedFormat = String(schema && schema.format || '').toLowerCase();
        const regexPattern = mapSwaggerSchemaToRegexPattern(schema);

        if (resolvedType === 'integer') {
            return 123;
        }

        if (resolvedType === 'number') {
            return 12.34;
        }

        if (resolvedType === 'boolean') {
            return true;
        }

        if (resolvedFormat === 'date') {
            return '2026-01-01';
        }

        if (resolvedFormat === 'date-time') {
            return '2026-01-01T10:00:00Z';
        }

        if (resolvedFormat === 'email') {
            return 'mock@example.com';
        }

        if (resolvedFormat === 'uuid') {
            return '123e4567-e89b-12d3-a456-426614174000';
        }

        return buildExampleStringFromRegexPattern(regexPattern) || 'sample-value';
    }

    function buildSwaggerResponseTemplateFromSchema(rawSchema, swaggerDocument) {
        const resolvedSchema = resolveSwaggerSchema(swaggerDocument, rawSchema);
        const schemaType = resolveSwaggerSchemaType(resolvedSchema);

        if (typeof resolvedSchema.example !== 'undefined') {
            return cloneSerializableValueForUi(resolvedSchema.example);
        }

        if (typeof resolvedSchema.default !== 'undefined') {
            return cloneSerializableValueForUi(resolvedSchema.default);
        }

        if (Array.isArray(resolvedSchema.enum) && resolvedSchema.enum.length) {
            return buildRegexGeneratorNode(buildEnumRegexPattern(resolvedSchema.enum), resolvedSchema);
        }

        if (schemaType === 'object') {
            return Object.keys(resolvedSchema.properties || {}).reduce(function reduceResponseObject(accumulator, propertyName) {
                accumulator[propertyName] = buildSwaggerResponseTemplateFromSchema(
                    resolvedSchema.properties[propertyName],
                    swaggerDocument
                );
                return accumulator;
            }, {});
        }

        if (schemaType === 'array') {
            return [
                buildSwaggerResponseTemplateFromSchema(resolvedSchema.items || { type: 'string' }, swaggerDocument)
            ];
        }

        return buildRegexGeneratorNode(mapSwaggerSchemaToRegexPattern(resolvedSchema), resolvedSchema);
    }

    function buildRegexGeneratorNode(pattern, schema) {
        return {
            $regexGenerate: pattern,
            $type: mapSwaggerSchemaToGeneratorType(schema)
        };
    }

    function mapSwaggerSchemaToGeneratorType(schema) {
        const schemaType = resolveSwaggerSchemaType(schema);
        if (schemaType === 'integer' || schemaType === 'number' || schemaType === 'boolean') {
            return schemaType;
        }

        return 'string';
    }

    function mapSwaggerSchemaToRegexPattern(schema) {
        const resolvedSchema = schema && typeof schema === 'object' ? schema : {};
        const schemaType = resolveSwaggerSchemaType(resolvedSchema);
        const schemaFormat = String(resolvedSchema.format || '').toLowerCase();

        if (typeof resolvedSchema.pattern === 'string' && resolvedSchema.pattern.trim()) {
            return ensureRegexAnchors(resolvedSchema.pattern.trim());
        }

        if (Array.isArray(resolvedSchema.enum) && resolvedSchema.enum.length) {
            return buildEnumRegexPattern(resolvedSchema.enum);
        }

        if (schemaFormat === 'uuid') {
            return '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
        }

        if (schemaFormat === 'date') {
            return '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
        }

        if (schemaFormat === 'date-time') {
            return '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$';
        }

        if (schemaFormat === 'email') {
            return '^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,64}\\.[A-Za-z]{2,10}$';
        }

        if (schemaType === 'integer') {
            return '^[0-9]{1,10}$';
        }

        if (schemaType === 'number') {
            return '^[0-9]{1,10}(\\.[0-9]{1,4})?$';
        }

        if (schemaType === 'boolean') {
            return '^(true|false)$';
        }

        return '^[A-Za-z0-9 _.-]{1,64}$';
    }

    function buildEnumRegexPattern(enumValues) {
        const alternation = enumValues.map(function escapeEnumValue(enumValue) {
            return escapeRegexLiteral(String(enumValue));
        }).join('|');

        return '^(' + alternation + ')$';
    }

    function resolveSwaggerSchemaType(schema) {
        if (!schema || typeof schema !== 'object') {
            return 'string';
        }

        if (schema.type) {
            return schema.type;
        }

        if (schema.properties && typeof schema.properties === 'object') {
            return 'object';
        }

        if (schema.items) {
            return 'array';
        }

        return 'string';
    }

    function buildSwaggerDataActionName(operation, httpMethod, normalizedPath) {
        const preferredName = sanitizeStringFromValue(operation && operation.operationId, '');
        if (preferredName) {
            return preferredName;
        }

        return sanitizeFileName(httpMethod.toLowerCase() + '_' + normalizedPath.replace(/[{}]/g, '')).replace(/-/g, '_').toUpperCase();
    }

    function buildExampleStringFromRegexPattern(pattern) {
        const safePattern = ensureRegexAnchors(pattern).replace(/^\^/, '').replace(/\$$/, '');

        return safePattern
            .replace(/\(\?<[^>]+>/g, '(')
            .replace(/\((?:\?:)?([^()|]+)\|[^()]*\)/g, '$1')
            .replace(/\[([^\]]+)\]\{(\d+)(?:,\d+)?\}/g, function repeatCharacterClass(_match, groupContent, repeatCount) {
                return new Array(Math.max(1, Number(repeatCount)) + 1).join(sampleCharacterForRegexGroup(groupContent));
            })
            .replace(/\[([^\]]+)\]\+/g, function replaceClassPlus(_match, groupContent) {
                return sampleCharacterForRegexGroup(groupContent);
            })
            .replace(/\[([^\]]+)\]/g, function replaceCharacterClass(_match, groupContent) {
                return sampleCharacterForRegexGroup(groupContent);
            })
            .replace(/\\d\{(\d+)(?:,\d+)?\}/g, function repeatDigits(_match, repeatCount) {
                return new Array(Math.max(1, Number(repeatCount)) + 1).join('0');
            })
            .replace(/\\d\+/g, '0')
            .replace(/\\d/g, '0')
            .replace(/\\w\{(\d+)(?:,\d+)?\}/g, function repeatWordChars(_match, repeatCount) {
                return new Array(Math.max(1, Number(repeatCount)) + 1).join('a');
            })
            .replace(/\\w\+/g, 'a')
            .replace(/\\w/g, 'a')
            .replace(/\{(\d+)(?:,\d+)?\}/g, function stripRemainingQuantifier(_match, repeatCount) {
                return repeatCount > 1 ? '' : '';
            })
            .replace(/[()?+]/g, '')
            .replace(/\\\./g, '.')
            .replace(/\\-/g, '-')
            .replace(/\\\\/g, '\\')
            || 'sample-value';
    }

    function sampleCharacterForRegexGroup(groupContent) {
        const safeGroupContent = String(groupContent || '');
        if (safeGroupContent.indexOf('A-Z') >= 0) {
            return 'A';
        }

        if (safeGroupContent.indexOf('a-z') >= 0) {
            return 'a';
        }

        if (safeGroupContent.indexOf('0-9') >= 0) {
            return '0';
        }

        return safeGroupContent.charAt(0) || 'x';
    }

    function ensureRegexAnchors(pattern) {
        const safePattern = String(pattern || '').trim();
        if (!safePattern) {
            return '^.*$';
        }

        return (safePattern.charAt(0) === '^' ? '' : '^')
            + safePattern
            + (safePattern.charAt(safePattern.length - 1) === '$' ? '' : '$');
    }

    function escapeRegexLiteral(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function cloneSerializableValueForUi(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function sanitizeStringFromValue(value, fallbackValue) {
        const safeValue = String(typeof value === 'undefined' || value === null ? '' : value).trim();
        return safeValue || fallbackValue;
    }

    function collectDynamicInputDescriptors(configuration, datasetDescriptor) {
        const descriptorsByKey = {};
        const queryParams = parseQueryParams(configuration.testQueryString);
        const bodyPaths = flattenObjectPaths(safeParseJson(configuration.testRequestBodyJson, 'testRequestBodyJson'));

        Object.keys(queryParams).forEach(function addQueryParamField(key) {
            registerInputDescriptor(descriptorsByKey, {
                source: 'query',
                path: key
            });
        });

        bodyPaths.forEach(function addBodyField(bodyPath) {
            registerInputDescriptor(descriptorsByKey, {
                source: 'body',
                path: bodyPath
            });
        });

        datasetDescriptor.cases.forEach(function addDatasetField(caseDescriptor) {
            caseDescriptor.fieldReferences.forEach(function addFieldReference(fieldReference) {
                registerInputDescriptor(descriptorsByKey, fieldReference);
            });
        });

        return Object.keys(descriptorsByKey).map(function mapDescriptor(key) {
            return descriptorsByKey[key];
        });
    }

    function buildPublicTestUrl(configuration) {
        const basePublicUrl = buildAbsoluteUrl(configuration.serverBaseUrl, configuration.publicEndpointPath);
        if (!configuration.testQueryString) {
            return basePublicUrl;
        }

        return basePublicUrl + '?' + configuration.testQueryString;
    }

    function normalizeQueryString(rawQueryString) {
        return String(rawQueryString || '').trim().replace(/^\?+/, '');
    }

    function parseQueryParams(rawQueryString) {
        const normalizedQueryString = normalizeQueryString(rawQueryString);
        const params = {};
        if (!normalizedQueryString) {
            return params;
        }

        const searchParams = new URLSearchParams(normalizedQueryString);
        searchParams.forEach(function storeParamValue(value, key) {
            params[key] = value;
        });

        return params;
    }

    function buildQueryStringFromObject(queryObject) {
        const safeQueryObject = queryObject && typeof queryObject === 'object' ? queryObject : {};
        return Object.keys(safeQueryObject).map(function mapQueryKey(key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(safeQueryObject[key]);
        }).join('&');
    }

    function buildDatasetDescriptor(testData) {
        const safeTestData = testData && typeof testData === 'object' ? testData : {};
        const rawCases = Array.isArray(safeTestData.cases) ? safeTestData.cases : [];

        return {
            matchMode: safeTestData.matchMode || 'rules',
            cases: rawCases
                .filter(function filterRule(candidateRule) {
                    return candidateRule && typeof candidateRule === 'object';
                })
                .map(function mapRule(candidateRule, index) {
                    const normalizedRule = normalizeDatasetCondition(candidateRule.when || candidateRule.match || {});
                    return {
                        name: candidateRule.name || 'case_' + (index + 1),
                        when: normalizedRule,
                        fieldReferences: collectFieldReferencesFromCondition(normalizedRule),
                        responseStatus: clampHttpStatus(candidateRule.responseStatus || 200),
                        responseBody: candidateRule.responseBody && typeof candidateRule.responseBody === 'object'
                            ? candidateRule.responseBody
                            : { status: 'Success' }
                    };
                })
        };
    }

    function normalizeDatasetCondition(rawCondition) {
        if (!rawCondition || typeof rawCondition !== 'object') {
            return {
                all: []
            };
        }

        if (Array.isArray(rawCondition.all)) {
            return {
                all: rawCondition.all.map(normalizeDatasetConditionNode)
            };
        }

        if (Array.isArray(rawCondition.any)) {
            return {
                any: rawCondition.any.map(normalizeDatasetConditionNode)
            };
        }

        return {
            all: Object.keys(rawCondition).map(function mapLegacyCondition(fieldName) {
                return {
                    source: 'query',
                    field: fieldName,
                    operator: 'equals',
                    value: rawCondition[fieldName]
                };
            })
        };
    }

    function normalizeDatasetConditionNode(rawNode) {
        if (!rawNode || typeof rawNode !== 'object') {
            return {
                source: 'query',
                field: '',
                operator: 'exists'
            };
        }

        if (Array.isArray(rawNode.all)) {
            return {
                all: rawNode.all.map(normalizeDatasetConditionNode)
            };
        }

        if (Array.isArray(rawNode.any)) {
            return {
                any: rawNode.any.map(normalizeDatasetConditionNode)
            };
        }

        return {
            source: rawNode.source === 'body' ? 'body' : 'query',
            field: String(rawNode.field || '').trim(),
            operator: normalizeRuleOperator(rawNode.operator),
            value: rawNode.value
        };
    }

    function normalizeRuleOperator(rawOperator) {
        const safeOperator = String(rawOperator || 'equals').trim().toLowerCase();
        if (safeOperator === 'contains' || safeOperator === 'exists' || safeOperator === 'regex') {
            return safeOperator;
        }

        return 'equals';
    }

    function collectFieldReferencesFromCondition(conditionNode) {
        const fieldReferences = [];
        walkConditionTree(conditionNode, function collectConditionLeaf(conditionLeaf) {
            if (!conditionLeaf.field) {
                return;
            }

            fieldReferences.push({
                source: conditionLeaf.source === 'body' ? 'body' : 'query',
                path: conditionLeaf.field
            });
        });

        return fieldReferences;
    }

    function walkConditionTree(conditionNode, visitor) {
        if (!conditionNode || typeof conditionNode !== 'object') {
            return;
        }

        if (Array.isArray(conditionNode.all)) {
            conditionNode.all.forEach(function walkAll(entry) {
                walkConditionTree(entry, visitor);
            });
            return;
        }

        if (Array.isArray(conditionNode.any)) {
            conditionNode.any.forEach(function walkAny(entry) {
                walkConditionTree(entry, visitor);
            });
            return;
        }

        visitor(conditionNode);
    }

    function registerInputDescriptor(descriptorsByKey, descriptor) {
        const source = descriptor.source === 'body' ? 'body' : 'query';
        const path = String(descriptor.path || '').trim();
        if (!path) {
            return;
        }

        const inputKey = source + '_' + path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
        if (!descriptorsByKey[inputKey]) {
            descriptorsByKey[inputKey] = {
                inputKey: inputKey,
                source: source,
                path: path
            };
        }
    }

    function flattenObjectPaths(payload, basePath) {
        const currentBasePath = basePath || '';

        if (Array.isArray(payload)) {
            return currentBasePath ? [currentBasePath] : [];
        }

        if (!payload || typeof payload !== 'object') {
            return currentBasePath ? [currentBasePath] : [];
        }

        const keys = Object.keys(payload);
        if (!keys.length) {
            return currentBasePath ? [currentBasePath] : [];
        }

        return keys.reduce(function reducePaths(accumulator, key) {
            const nextPath = currentBasePath ? currentBasePath + '.' + key : key;
            return accumulator.concat(flattenObjectPaths(payload[key], nextPath));
        }, []);
    }

    function buildBodyTemplateFromSample(sampleBody, inputDescriptors) {
        const descriptorMap = {};

        inputDescriptors.forEach(function storeDescriptor(inputDescriptor) {
            if (inputDescriptor.source === 'body') {
                descriptorMap[inputDescriptor.path] = inputDescriptor.inputKey;
            }
        });

        return mapBodyTemplateNode(sampleBody, '', descriptorMap);
    }

    function mapBodyTemplateNode(nodeValue, currentPath, descriptorMap) {
        if (Array.isArray(nodeValue)) {
            return nodeValue.map(function mapArrayEntry(entry, index) {
                const nextPath = currentPath ? currentPath + '.' + index : String(index);
                return mapBodyTemplateNode(entry, nextPath, descriptorMap);
            });
        }

        if (nodeValue && typeof nodeValue === 'object') {
            return Object.keys(nodeValue).reduce(function reduceObject(accumulator, key) {
                const nextPath = currentPath ? currentPath + '.' + key : key;
                accumulator[key] = mapBodyTemplateNode(nodeValue[key], nextPath, descriptorMap);
                return accumulator;
            }, {});
        }

        if (descriptorMap[currentPath]) {
            return '${input.' + descriptorMap[currentPath] + '}';
        }

        return nodeValue;
    }

    function sanitizeFileName(rawFileName) {
        return String(rawFileName || 'gctool-data-action')
            .trim()
            .replace(/[<>:"/\\|?*]+/g, '-')
            .replace(/\s+/g, '-');
    }

    function downloadJsonFile(fileName, payload) {
        const jsonContent = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
    }

    function safeParseJson(jsonText, fieldName) {
        try {
            return JSON.parse(String(jsonText || '').trim() || '{}');
        } catch (_error) {
            throw new Error(apiTesterI18n('tab.api_tester.error.invalid_json', 'Le JSON saisi est invalide.') + ' [' + fieldName + ']');
        }
    }

    function compactJsonForPreview(jsonText) {
        try {
            return JSON.stringify(JSON.parse(String(jsonText || '{}')));
        } catch (_error) {
            return '{}';
        }
    }

    async function parseFetchResponse(response) {
        const responseType = String(response.headers.get('content-type') || '').toLowerCase();
        if (responseType.includes('application/json')) {
            return response.json();
        }

        return response.text();
    }

    function renderApiTesterOutput(payload) {
        const outputElement = document.getElementById('apiTesterOutput');
        if (!outputElement) {
            return;
        }

        const serializedOutput = typeof payload === 'string'
            ? payload
            : JSON.stringify(payload, null, 2);

        apiTesterState.lastOutput = serializedOutput;
        outputElement.textContent = serializedOutput || apiTesterI18n('tab.api_tester.output_empty', 'Aucun resultat pour le moment.');
    }

    function setApiTesterStatus(message, level) {
        const statusElement = document.getElementById('apiTesterStatus');
        if (!statusElement) {
            return;
        }

        console.log('[API Tester] Statut UI:', level, message);
        statusElement.className = 'alert api-tester-status ' + resolveAlertClass(level);
        statusElement.textContent = message || '';
    }

    function resolveAlertClass(level) {
        const map = {
            info: 'alert-info',
            success: 'alert-success',
            warning: 'alert-warning',
            danger: 'alert-danger'
        };

        return map[level] || map.info;
    }

    function normalizeApiTesterError(error) {
        return {
            error: true,
            message: error && error.message ? error.message : 'Erreur inconnue',
            stack: error && error.stack ? error.stack : null
        };
    }

    function resolveApiTesterServerErrorMessage(error) {
        if (isApiTesterConnectivityError(error)) {
            return apiTesterI18n(
                'tab.api_tester.error.server_unreachable',
                'Serveur mock inaccessible. Verifiez le port, le host et le CORS.'
            );
        }

        return error && error.message
            ? error.message
            : apiTesterI18n(
                'tab.api_tester.error.server_unreachable',
                'Serveur mock inaccessible. Verifiez le port, le host et le CORS.'
            );
    }

    function isApiTesterConnectivityError(error) {
        const errorMessage = String(error && error.message ? error.message : '').toLowerCase();

        return error instanceof TypeError
            || errorMessage.indexOf('failed to fetch') >= 0
            || errorMessage.indexOf('networkerror') >= 0
            || errorMessage.indexOf('load failed') >= 0
            || errorMessage.indexOf('network request failed') >= 0;
    }

    function ensurePrettyJsonString(value, fallbackValue) {
        try {
            if (typeof value === 'string') {
                return JSON.stringify(JSON.parse(value), null, 2);
            }

            return JSON.stringify(value, null, 2);
        } catch (_error) {
            return JSON.stringify(fallbackValue || {}, null, 2);
        }
    }

    function buildAbsoluteUrl(baseUrl, path) {
        const safeBaseUrl = sanitizeBaseUrl(baseUrl);
        const safePath = normalizePath(path || '/');

        try {
            return new URL(safePath, safeBaseUrl + '/').toString();
        } catch (_error) {
            return safeBaseUrl.replace(/\/+$/, '') + safePath;
        }
    }

    function sanitizeBaseUrl(rawValue) {
        const trimmedValue = String(rawValue || 'http://localhost:7070').trim();
        return trimmedValue.replace(/\/+$/, '');
    }

    function normalizePath(rawPath) {
        const normalizedPath = String(rawPath || '/').trim();
        if (!normalizedPath) {
            return '/';
        }

        return normalizedPath.charAt(0) === '/' ? normalizedPath : '/' + normalizedPath;
    }

    function clampHttpStatus(value) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
            return 200;
        }

        return Math.max(100, Math.min(599, Math.round(numericValue)));
    }

    function getInputValue(elementId) {
        const element = document.getElementById(elementId);
        return element ? element.value : '';
    }

    function getInputNumberValue(elementId, fallbackValue) {
        const numericValue = Number(getInputValue(elementId));
        return Number.isFinite(numericValue) ? numericValue : fallbackValue;
    }

    function setInputValue(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.value = value;
        }
    }

    function setTextContent(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value || '';
        }
    }
}(window));
