/**
 * auth-init.js - Version avec gestion dynamique du CLIENTID
 * Auteur: PS Genesys - Matthieu FRYS
 * Date: 05/2025
 */

/**
 * @typedef {'implicit'|'pkce'} AuthMode
 * @typedef {{name: string, clientId: string, description: string, authMode: AuthMode}} OrgConfig
 */

/** @type {Record<string, OrgConfig>} */
// Charge depuis Scripts/org-configs.local.js (non versionne)
const FILE_ORG_CONFIGS = (typeof window !== 'undefined' &&
    window.ORG_CONFIGS &&
    typeof window.ORG_CONFIGS === 'object')
    ? window.ORG_CONFIGS
    : {};
const USER_ORG_CONFIGS_STORAGE_KEY = 'gctoolUserOrgConfigs';
const USER_ORG_CONFIGS_COOKIE_KEY = 'gctoolUserOrgConfigs';

let USER_ORG_CONFIGS = loadUserOrgConfigs();
/** @type {Record<string, OrgConfig>} */
let ORG_CONFIGS = buildMergedOrgConfigs();

if (Object.keys(FILE_ORG_CONFIGS).length === 0) {
    console.warn('Aucune org preconfiguree. Saisie manuelle activee.');
}

// Configuration globale
const ORGREGION = 'eu_west_1';
let selectedOrgConfig = null;
let redirectURL = window.location.origin + window.location.pathname;
const AUTH_MODES = {
    IMPLICIT: 'implicit',
    PKCE: 'pkce'
};
const DEFAULT_AUTH_MODE = AUTH_MODES.IMPLICIT;
let selectedAuthMode = DEFAULT_AUTH_MODE;

function i18nAuth(key, fallback, params) {
    if (window.GCToolI18n && typeof window.GCToolI18n.t === 'function') {
        return window.GCToolI18n.t(key, params || {}, fallback);
    }
    return fallback;
}

// APIs Genesys Cloud
let currentUserId;
let currentOrgId;

// Initialisation du client Genesys
// @ts-ignore
const platformClient = require('platformClient');
const client = platformClient.ApiClient.instance;

/**
 * Initialisation des APIs
 */
function initializeApis() {
    usersApi = new platformClient.UsersApi();
    architectApi = new platformClient.ArchitectApi();
    routingApi = new platformClient.RoutingApi();
    analyticsApi = new platformClient.AnalyticsApi();
}

function normalizeAuthMode(mode) {
    return mode === 'pkce' ? 'pkce' : 'implicit';
}

function resolveAuthModeFromOrg(orgConfig) {
    if (!orgConfig || typeof orgConfig !== 'object') {
        return DEFAULT_AUTH_MODE;
    }

    return normalizeAuthMode(orgConfig.authMode);
}

function formatAuthModeLabel(mode) {
    return normalizeAuthMode(mode) === 'pkce' ? 'PKCE' : 'Implicit';
}

function getCookieValue(cookieName) {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.split('=').map(c => c.trim());
        if (name === cookieName) {
            return value || '';
        }
    }
    return '';
}

function setCookieValue(cookieName, cookieValue, expirationDays) {
    const expirationDate = new Date();
    expirationDate.setTime(expirationDate.getTime() + (expirationDays * 24 * 60 * 60 * 1000));
    document.cookie = `${cookieName}=${cookieValue}; expires=${expirationDate.toUTCString()}; path=/`;
}

function sanitizeOrgConfig(orgConfig) {
    if (!orgConfig || typeof orgConfig !== 'object') {
        return null;
    }

    const name = typeof orgConfig.name === 'string' ? orgConfig.name.trim() : '';
    const clientId = typeof orgConfig.clientId === 'string' ? orgConfig.clientId.trim() : '';
    const description = typeof orgConfig.description === 'string' ? orgConfig.description.trim() : '';
    const authMode = normalizeAuthMode(orgConfig.authMode);

    if (!name || !clientId) {
        return null;
    }

    return {
        name,
        clientId,
        description,
        authMode
    };
}

function loadUserOrgConfigs() {
    let parsedConfigs = null;
    try {
        const rawValue = localStorage.getItem(USER_ORG_CONFIGS_STORAGE_KEY);
        if (rawValue) {
            parsedConfigs = JSON.parse(rawValue);
        }
    } catch (error) {
        console.error('Erreur lecture ORGs locales (localStorage):', error);
    }

    if (!parsedConfigs) {
        try {
            const cookieValue = getCookieValue(USER_ORG_CONFIGS_COOKIE_KEY);
            if (cookieValue) {
                parsedConfigs = JSON.parse(decodeURIComponent(cookieValue));
            }
        } catch (error) {
            console.error('Erreur lecture ORGs locales (cookie):', error);
        }
    }

    if (!parsedConfigs || typeof parsedConfigs !== 'object') {
        return {};
    }

    const sanitizedConfigs = {};
    Object.keys(parsedConfigs).forEach((orgKey) => {
        const sanitizedConfig = sanitizeOrgConfig(parsedConfigs[orgKey]);
        if (sanitizedConfig) {
            sanitizedConfigs[orgKey] = sanitizedConfig;
        }
    });
    return sanitizedConfigs;
}

function persistUserOrgConfigs() {
    try {
        const rawValue = JSON.stringify(USER_ORG_CONFIGS);
        localStorage.setItem(USER_ORG_CONFIGS_STORAGE_KEY, rawValue);
        setCookieValue(USER_ORG_CONFIGS_COOKIE_KEY, encodeURIComponent(rawValue), 365);
    } catch (error) {
        console.error('Erreur sauvegarde ORGs locales:', error);
    }
}

function buildMergedOrgConfigs() {
    return {
        ...FILE_ORG_CONFIGS,
        ...USER_ORG_CONFIGS
    };
}

function refreshOrgConfigs() {
    ORG_CONFIGS = buildMergedOrgConfigs();
}

function createOrgKeyFromName(orgName) {
    const normalizedName = (orgName || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const safeName = normalizedName || 'org';
    return `user_${safeName}_${Date.now()}`;
}

function findExistingOrgKey(orgConfig) {
    const normalizedClientId = (orgConfig.clientId || '').trim().toLowerCase();
    const normalizedAuthMode = normalizeAuthMode(orgConfig.authMode);

    const allEntries = Object.entries(ORG_CONFIGS);
    for (const [orgKey, existingOrgConfig] of allEntries) {
        if (!existingOrgConfig) {
            continue;
        }
        const existingClientId = (existingOrgConfig.clientId || '').trim().toLowerCase();
        const existingAuthMode = normalizeAuthMode(existingOrgConfig.authMode);
        if (existingClientId === normalizedClientId && existingAuthMode === normalizedAuthMode) {
            return orgKey;
        }
    }
    return null;
}

function saveOrUpdateUserOrg(orgConfig, forcedOrgKey) {
    const sanitizedConfig = sanitizeOrgConfig(orgConfig);
    if (!sanitizedConfig) {
        throw new Error('Configuration ORG invalide');
    }

    const existingOrgKey = forcedOrgKey || findExistingOrgKey(sanitizedConfig);
    const orgKey = existingOrgKey || createOrgKeyFromName(sanitizedConfig.name);

    if (!FILE_ORG_CONFIGS[orgKey]) {
        USER_ORG_CONFIGS[orgKey] = sanitizedConfig;
        persistUserOrgConfigs();
        refreshOrgConfigs();
    }

    return orgKey;
}

function loginWithSelectedAuthMode(clientId, redirectUri) {
    const authMode = normalizeAuthMode(selectedAuthMode);
    if (authMode === AUTH_MODES.PKCE) {
        if (typeof client.loginPKCEGrant === 'function') {
            console.log('Auth mode: PKCE');
            return client.loginPKCEGrant(clientId, redirectUri, {
                state: 'gctool-pkce-auth'
            });
        }

        console.warn('loginPKCEGrant indisponible sur ce SDK, fallback en implicite.');
    }

    console.log('Auth mode: Implicit');
    return client.loginImplicitGrant(clientId, redirectUri);
}

/**
 * Authentification avec gestion d'erreurs spécifique
 */
function proceedWithAuthentication() {
    if (!selectedOrgConfig) {
        return Promise.reject(new Error('Aucune organisation sélectionnée'));
    }
    
    console.log(`🏢 Tentative de connexion: ${selectedOrgConfig.name}`);
    
    // Initialiser le client avec la région
    const environment = platformClient.PureCloudRegionHosts[ORGREGION];
    
    if (environment) {
        client.setEnvironment(environment);
    }
    
    return loginWithSelectedAuthMode(selectedOrgConfig.clientId, redirectURL)
        .then(() => {
            console.log('✅ Authentification Genesys Cloud réussie');
            initializeApis();
            return usersApi.getUsersMe();
        })
        .then((userObject) => {
            currentUserId = userObject.id;
            currentOrgId = userObject.organization?.id;
            
            console.log(`👤 Utilisateur: ${userObject.name}`);
            console.log(`🏢 Organisation: ${userObject.organization?.name} (${currentOrgId})`);
            
            // ✅ Vérifier que l'organisation correspond (optionnel)
            if (userObject.organization && userObject.organization.name) {
                console.log(`📋 Confirmation organisation: ${userObject.organization.name}`);
            }
            
            // Mettre à jour l'état de l'application
            if (typeof appState !== 'undefined') {
                appState.isAuthenticated = true;
                appState.currentUser = {
                    id: currentUserId,
                    name: userObject.name,
                    organization: userObject.organization,
                    selectedOrgConfig: selectedOrgConfig,
                    authMode: selectedAuthMode
                };
            }
            
            // Charger les configurations sauvegardées
            if (typeof loadSavedConfigurations === 'function') {
                loadSavedConfigurations();
            }
            if (typeof loadLiaisonMappingFromCookie === 'function') {
                loadLiaisonMappingFromCookie();
            }
            
            if (typeof updateLoadingStatus === 'function') {
                updateLoadingStatus(i18nAuth('auth.loading.genesys_data', 'Chargement des donnees Genesys...'));
            }
            
            //DEBUG COMMENT A ENLEVER 
            return loadAllGenesysData();
        })
        .then(() => {
            console.log('✅ Données Genesys chargées avec succès');
            
            if (typeof appState !== 'undefined') {
                appState.isDataLoaded = true;
            }
            
            return {
                success: true,
                message: 'Authentification et chargement réssis',
                organization: selectedOrgConfig.name,
                authMode: selectedAuthMode
            };
        })
        .catch((error) => {
            const err = /** @type {any} */ (error);
            console.error("Erreur d'authentification:", err);

            let errorMessage = 'Erreur de connexion';
            let shouldClearOrg = true;

            if (err.status === 401) {
                errorMessage = 'Identifiants invalides pour cette organisation';
            } else if (err.status === 403) {
                errorMessage = 'Acces refuse a cette organisation';
            } else if (err.status >= 500) {
                errorMessage = 'Erreur serveur Genesys Cloud';
                shouldClearOrg = false; // Ne pas supprimer l'org sur erreur serveur
            } else if (err.message && err.message.includes('network')) {
                errorMessage = 'Erreur de reseau';
                shouldClearOrg = false;
            }

            const enrichedError = new Error(`${errorMessage} (${selectedOrgConfig.name})`);
            enrichedError.originalError = err;
            enrichedError.shouldClearOrg = shouldClearOrg;
            enrichedError.organizationName = selectedOrgConfig.name;

            throw enrichedError;
        });
}

/**
 * Version finale de initializeWithOrgSelection avec gestion d'erreurs améliorée
 */
function initializeWithOrgSelection() {
    return new Promise((resolve, reject) => {
        console.log('🔄 Initialisation avec gestion d\'organisation...');
        
        const savedOrg = getSavedOrganization();
        
        if (savedOrg && ORG_CONFIGS[savedOrg]) {
            selectedOrgConfig = ORG_CONFIGS[savedOrg];
            selectedAuthMode = resolveAuthModeFromOrg(selectedOrgConfig);
            console.log(`📂 Organisation sauvegardee: ${selectedOrgConfig.name} (auth: ${selectedAuthMode})`);
            
            if (typeof updateLoadingStatus === 'function') {
                updateLoadingStatus(`Connexion à ${selectedOrgConfig.name}...`);
            }
            
            proceedWithAuthentication()
                .then((result) => {
                    console.log('✅ Connexion automatique réussie');
                    resolve(result);
                })
                .catch((error) => {
                    console.warn('❌ Échec connexion automatique:', error.message);
                    
                    // ✅ Supprimer l'org sauvegardée seulement si c'est une erreur d'auth
                    if (error.shouldClearOrg !== false) {
                        clearSavedOrganization();
                    }
                    
                    // ✅ Afficher le sélecteur avec le message d'erreur
                    showOrgSelector(resolve, reject, error.message);
                });
        } else {
            console.log('📋 Première connexion ou org supprimée');
            
            if (typeof updateLoadingStatus === 'function') {
                updateLoadingStatus(i18nAuth('auth.loading.select_org', "Selection de l'organisation..."));
            }
            
            showOrgSelector(resolve, reject);
        }
    });
}

/**
 * Sauvegarde de l'organisation sélectionnée
 */
function saveOrganization(orgKey) {
    try {
        localStorage.setItem('selectedOrganization', orgKey);
        
        // Cookie de secours
        const expirationDate = new Date();
        expirationDate.setTime(expirationDate.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 jours
        document.cookie = `selectedOrg=${orgKey}; expires=${expirationDate.toUTCString()}; path=/`;
        console.log('Organisation sauvegardée:', orgKey);
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de l\'organisation:', error);
    }
}

/**
 * Récupération de l'organisation sauvegardée
 */
function getSavedOrganization() {
    try {
        // D'abord localStorage
        let savedOrg = localStorage.getItem('selectedOrganization');
        if (savedOrg && ORG_CONFIGS[savedOrg]) return savedOrg;
        
        // Ensuite cookies
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.split('=').map(c => c.trim());
            if (name === 'selectedOrg' && ORG_CONFIGS[value]) {
                return value;
            }
        }
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'organisation:', error);
    }
    
    return null;
}


/**
 * Suppression de l'organisation sauvegardée
 */
function clearSavedOrganization() {
    try {
        localStorage.removeItem('selectedOrganization');
        document.cookie = 'selectedOrg=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = 'selectedAuthMode=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        console.log('Organisation sauvegardée supprimée');
    } catch (error) {
        console.error('Erreur lors de la suppression de l\'organisation:', error);
    }
}

function renderOrgOption(orgKey, orgConfig) {
    return `
        <div class="org-option" data-org="${orgKey}">
            <div class="org-card" style="position: relative;">
                <span class="label label-info" style="position:absolute;right:10px;top:10px;">${formatAuthModeLabel(orgConfig.authMode)}</span>
                <h5>${orgConfig.name}</h5>
                <p class="text-muted">${orgConfig.description || ''}</p>
                <small class="text-info">Région: ${ORGREGION}</small>
            </div>
        </div>
    `;
}

/**
 * Affichage du sélecteur avec message d'erreur contextuel
 */
function showOrgSelector(resolve, reject, errorMessage = null) {
    try {
        if (typeof $ === 'undefined') {
            reject(new Error('jQuery non disponible'));
            return;
        }
        
        // Masquer le loading principal
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
        
        // Supprimer toute modal existante
        $('#orgSelectorModal').remove();
        
        // ✅ Message d'erreur contextuel
        let errorHtml = '';
        if (errorMessage) {
            errorHtml = `
                <div class="alert alert-warning" role="alert">
                    <i class="fa fa-exclamation-triangle"></i>
                    <strong>${i18nAuth('auth.org_selector.connection_problem', 'Probleme de connexion :')}</strong> ${errorMessage}
                    <br><small>${i18nAuth('auth.org_selector.select_to_retry', 'Veuillez selectionner une organisation pour reessayer.')}</small>
                </div>
            `;
        }
        
        const orgKeys = Object.keys(ORG_CONFIGS);
        const noOrgConfiguredHtml = orgKeys.length === 0
            ? `
                <div class="alert alert-info" role="alert">
                    <i class="fa fa-info-circle"></i>
                    <strong>${i18nAuth('auth.org_selector.no_preconfigured_org', 'Aucune organisation preconfiguree.')}</strong>
                    <br><small>${i18nAuth('auth.org_selector.manual_entry_help', 'Renseignez les informations de connexion manuellement ci-dessous.')}</small>
                </div>
            `
            : '';

        const selectorHTML = `
            <div id="orgSelectorModal" class="modal fade" data-backdrop="static" data-keyboard="false" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h4 class="modal-title">
                                <i class="fa fa-building"></i> ${i18nAuth('auth.org_selector.title', "Selection de l'Organisation Genesys Cloud")}
                            </h4>
                        </div>
                        <div class="modal-body">
                            ${errorHtml}
                            ${noOrgConfiguredHtml}
                            <p>${i18nAuth('auth.org_selector.prompt', 'Veuillez selectionner votre organisation Genesys Cloud :')}</p>
                            <div id="orgList" class="org-list">
                                ${orgKeys.map(orgKey => renderOrgOption(orgKey, ORG_CONFIGS[orgKey])).join('')}
                            </div>

                            <hr>
                            <h5><i class="fa fa-pen"></i> ${i18nAuth('auth.org_selector.manual_section', 'Saisie manuelle / Nouvelle ORG')}</h5>
                            <div class="row">
                                <div class="col-md-6">
                                    <label>${i18nAuth('auth.org_selector.org_name', 'Nom ORG')}</label>
                                    <input type="text" class="form-control" id="manualOrgName" placeholder="${i18nAuth('auth.org_selector.org_name_placeholder', 'Ex: Mon Organisation')}">
                                </div>
                                <div class="col-md-6">
                                    <label>${i18nAuth('auth.org_selector.client_id', 'Client ID')}</label>
                                    <input type="text" class="form-control" id="manualOrgClientId" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
                                </div>
                            </div>
                            <div class="row" style="margin-top: 10px;">
                                <div class="col-md-6">
                                    <label>${i18nAuth('auth.org_selector.auth_type', 'Type de connexion')}</label>
                                    <select class="form-control" id="manualOrgAuthMode">
                                        <option value="implicit">Implicit</option>
                                        <option value="pkce">PKCE</option>
                                    </select>
                                </div>
                                <div class="col-md-6">
                                    <label>${i18nAuth('auth.org_selector.description', 'Description')}</label>
                                    <input type="text" class="form-control" id="manualOrgDescription" placeholder="${i18nAuth('auth.org_selector.optional', 'Optionnel')}">
                                </div>
                            </div>
                            <div style="margin-top: 10px;">
                                <button type="button" class="btn btn-default btn-sm" id="addManualOrgBtn">
                                    <i class="fa fa-plus"></i> ${i18nAuth('auth.org_selector.add_local_org', 'Ajouter cette ORG a la liste locale')}
                                </button>
                                <small id="manualOrgFeedback" class="text-muted" style="display:block;margin-top:6px;"></small>
                            </div>
                            <div class="checkbox" style="margin-top: 15px;">
                                <label>
                                    <input type="checkbox" id="rememberOrg" ${errorMessage ? '' : 'checked'}> 
                                    ${i18nAuth('auth.org_selector.remember', 'Se souvenir de ma selection')}
                                </label>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary" id="confirmOrgBtn" disabled>
                                <i class="fa fa-sign-in"></i> ${i18nAuth('auth.org_selector.connect', 'Se connecter')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', selectorHTML);
        $('#orgSelectorModal').modal('show');
        
        setupOrgSelection(resolve, reject);
        
    } catch (error) {
        console.error('Erreur lors de l\'affichage du sélecteur:', error);
        reject(error);
    }
}

/**
 * Configuration de la sélection avec gestion d'erreurs
 */
function setupOrgSelection(resolve, reject) {
    let selectedOrg = null;

    const orgListElement = document.getElementById('orgList');

    function setManualFeedback(message, isError) {
        const feedback = document.getElementById('manualOrgFeedback');
        if (!feedback) {
            return;
        }
        feedback.textContent = message || '';
        feedback.className = isError ? 'text-danger' : 'text-muted';
    }

    function getManualOrgConfigFromForm() {
        const name = ($('#manualOrgName').val() || '').toString().trim();
        const clientId = ($('#manualOrgClientId').val() || '').toString().trim();
        const authMode = normalizeAuthMode(($('#manualOrgAuthMode').val() || '').toString());
        const description = ($('#manualOrgDescription').val() || '').toString().trim();

        if (!name || !clientId) {
            return null;
        }
        return {
            name,
            clientId,
            description,
            authMode
        };
    }

    function isManualFormValid() {
        return !!getManualOrgConfigFromForm();
    }

    function updateConfirmButtonState() {
        const canConfirm = !!selectedOrg || isManualFormValid();
        $('#confirmOrgBtn').prop('disabled', !canConfirm);
    }

    function bindOrgOptionEvents() {
        $('.org-option').off('click').on('click', function() {
            $('.org-option').removeClass('selected');
            $(this).addClass('selected');
            selectedOrg = $(this).data('org');
            setManualFeedback('', false);
            updateConfirmButtonState();
        });

        $('.org-option').off('dblclick').on('dblclick', function() {
            selectedOrg = $(this).data('org');
            processOrgSelection();
        });
    }

    function appendOrgOption(orgKey) {
        if (!orgListElement || !ORG_CONFIGS[orgKey]) {
            return;
        }
        const existingOption = orgListElement.querySelector(`.org-option[data-org="${orgKey}"]`);
        if (existingOption) {
            $('.org-option').removeClass('selected');
            $(existingOption).addClass('selected');
            selectedOrg = orgKey;
            updateConfirmButtonState();
            return;
        }
        orgListElement.insertAdjacentHTML('beforeend', renderOrgOption(orgKey, ORG_CONFIGS[orgKey]));
        bindOrgOptionEvents();
        $('.org-option').removeClass('selected');
        $(`.org-option[data-org="${orgKey}"]`).addClass('selected');
        selectedOrg = orgKey;
        updateConfirmButtonState();
    }

    function upsertManualOrgInLocalStore() {
        const manualOrgConfig = getManualOrgConfigFromForm();
        if (!manualOrgConfig) {
            throw new Error(i18nAuth('auth.org_selector.required_fields', 'Nom ORG et Client ID obligatoires.'));
        }
        const orgKey = saveOrUpdateUserOrg(manualOrgConfig);
        return {
            orgKey,
            orgConfig: ORG_CONFIGS[orgKey] || manualOrgConfig
        };
    }

    bindOrgOptionEvents();

    $('#manualOrgName, #manualOrgClientId, #manualOrgAuthMode, #manualOrgDescription')
        .on('input change focus', function() {
            $('.org-option').removeClass('selected');
            selectedOrg = null;
            setManualFeedback('', false);
            updateConfirmButtonState();
        });

    $('#addManualOrgBtn').on('click', function() {
        try {
            const { orgKey } = upsertManualOrgInLocalStore();
            appendOrgOption(orgKey);
            setManualFeedback(i18nAuth('auth.org_selector.added_local', 'ORG ajoutee a la liste locale.'), false);
        } catch (error) {
            setManualFeedback(error.message || i18nAuth('auth.org_selector.add_failed', 'Impossible d\'ajouter l\'ORG.'), true);
        }
    });

    // Gestionnaire de clic pour le bouton de confirmation
    $('#confirmOrgBtn').on('click', processOrgSelection);
    updateConfirmButtonState();

    function processOrgSelection() {
        try {
            if (selectedOrg && ORG_CONFIGS[selectedOrg]) {
                selectedOrgConfig = ORG_CONFIGS[selectedOrg];
            } else {
                const { orgKey, orgConfig } = upsertManualOrgInLocalStore();
                selectedOrg = orgKey;
                selectedOrgConfig = orgConfig;
            }

            selectedAuthMode = resolveAuthModeFromOrg(selectedOrgConfig);

            // Sauvegarder si demandé
            if ($('#rememberOrg').is(':checked')) {
                saveOrganization(selectedOrg);
            } else {
                clearSavedOrganization();
            }

            // Fermer la modal
            $('#orgSelectorModal').modal('hide');

            // Réafficher le loading
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) {
                loadingOverlay.style.display = 'flex';
            }

            // Mettre à jour le statut si la fonction existe
            if (typeof updateLoadingStatus === 'function') {
                updateLoadingStatus(i18nAuth('auth.loading.auth_in_progress', 'Authentification en cours...'));
            }

            // Procéder à l'authentification
            proceedWithAuthentication()
                .then((result) => {
                    setTimeout(() => $('#orgSelectorModal').remove(), 500);
                    resolve(result);
                })
                .catch((error) => {
                    setTimeout(() => $('#orgSelectorModal').remove(), 500);
                    reject(error);
                });
        } catch (error) {
            console.error('Erreur lors du traitement de la sélection:', error);
            alert(error.message || i18nAuth('auth.org_selector.config_error', 'Erreur de configuration ORG.'));
        }
    }
}









// Chargement de toutes les données Genesys en parallèle
function loadAllGenesysData() {
    const loadingPromises = [
        getAllDatatables(),
        getAllQueues(),
        getAllSkills(),
        getAllPrompts(),
        getAllScheduleGroups()
    ];
    
    return Promise.all(loadingPromises)
        .then((results) => {
            console.log('📊 Données chargées:');
            console.log(`  - DataTables: ${dataTablesCache.length}`);
            console.log(`  - Queues: ${queuesCache.length}`);
            console.log(`  - Skills: ${skillsCache.length}`);
            console.log(`  - Prompts: ${promptsCache.length}`);
            console.log(`  - Schedule Groups: ${scheduleGroupsCache.length}`);
            
            return results;
        });
}

// Récupération paginée générique
function getAllWithPagination(apiCall, apiName) {
    let allEntities = [];
    let pageNumber = 1;
    const pageSize = 100;
    
    function fetchPage() {
        let opts = {
            pageSize: pageSize,
            pageNumber: pageNumber,
            sortBy: "name",
            sortOrder: "ascending",
            expand: "schema"
        };
        
        return apiCall(opts)
            .then((data) => {
                console.log(`📄 ${apiName} page ${pageNumber}: ${data.entities.length} éléments`);
                
                allEntities = allEntities.concat(data.entities);
                
                if (data.pageNumber < data.pageCount) {
                    pageNumber++;
                    return fetchPage();
                } else {
                    console.log(`✅ ${apiName} complet: ${allEntities.length} éléments`);
                    return { entities: allEntities, total: allEntities.length };
                }
            })
            .catch((err) => {
                console.error(`❌ Erreur ${apiName} page ${pageNumber}:`, err);
                throw err;
            });
    }
    
    return fetchPage();
}

// Récupération des DataTables
function getAllDatatables() {
    return getAllWithPagination(
        (opts) => architectApi.getFlowsDatatables(opts),
        'DataTables'
    ).then((result) => {
        dataTablesCache = result.entities;
        return result;
    });
}

// Récupération des Queues
function getAllQueues() {
    return getAllWithPagination(
        (opts) => routingApi.getRoutingQueues(opts),
        'Queues'
    ).then((result) => {
        queuesCache = result.entities;
        return result;
    });
}

// Récupération des Skills
function getAllSkills() {
    return getAllWithPagination(
        (opts) => routingApi.getRoutingSkills(opts),
        'Skills'
    ).then((result) => {
        skillsCache = result.entities;
        return result;
    });
}

// Récupération des Schedule Groups
function getAllScheduleGroups() {
    return getAllWithPagination(
        (opts) => architectApi.getArchitectSchedulegroups(opts),
        'Schedule Groups'
    ).then((result) => {
        scheduleGroupsCache = result.entities;
        return result;
    });
}

// Récupération des Prompts
function getAllPrompts() {
    return getAllWithPagination(
        (opts) => architectApi.getArchitectPrompts(opts),
        'Prompts'
    ).then((result) => {
        promptsCache = result.entities;
        return result;
    });
}

/**
 * Démarrage de l'application avec sélection d'organisation
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Démarrage avec sélection d\'organisation');
    
    // Vérifier si on force une réinitialisation
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset') === 'true') {
        clearSavedOrganization();
    }
});

/**
 * Fonction pour changer d'organisation
 */
function changeOrganization() {
    if (confirm(i18nAuth('auth.change_org_confirm', 'Voulez-vous changer d\'organisation ? Cela rechargera l\'application.'))) {
        clearSavedOrganization();
        window.location.reload();
    }
}



