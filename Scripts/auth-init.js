/**
 * auth-init.js - Version avec gestion dynamique du CLIENTID
 * Auteur: PS Genesys - Matthieu FRYS
 * Date: 05/2025
 */

/**
 * @typedef {'implicit'|'pkce'} AuthMode
 * @typedef {{name: string, clientId: string, description: string, authMode: AuthMode, region: string}} OrgConfig
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
const ORG_VALIDATION_STATE_STORAGE_KEY = 'gctoolOrgValidationState';
const AUTH_DEBUG_TRACE_STORAGE_KEY = 'gctoolAuthDebugTrace';
const AUTH_DEBUG_TRACE_MAX_ITEMS = 120;
const AUTH_PENDING_SELECTION_STORAGE_KEY = 'gctoolPendingOrgSelection';
const AUTH_PENDING_SELECTION_MAX_AGE_MS = 15 * 60 * 1000;
const ORG_VALIDATION_STATUSES = {
    VALID: 'valid',
    UNVERIFIED: 'unverified',
    INVALID: 'invalid'
};
let USER_ORG_CONFIGS = {};
/** @type {Record<string, OrgConfig>} */
let ORG_CONFIGS = {};
let ORG_VALIDATION_STATE = {};

// Configuration globale
let selectedOrgConfig = null;
let selectedOrgKey = null;
let redirectURL = window.location.origin + window.location.pathname;
const AUTH_MODES = {
    IMPLICIT: 'implicit',
    PKCE: 'pkce'
};
const DEFAULT_AUTH_MODE = AUTH_MODES.IMPLICIT;
const DEFAULT_ORG_REGION = 'eu_west_1';
const HELP_CONTENT_FILE_PATH = './Scripts/help/help.html';
const AUTH_ORG_HELP_SECTION_KEY = 'auth-org-selector';
const CONNECTION_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 heure
const CONNECTION_STATUS = {
    UNKNOWN: 'unknown',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    CHECKING: 'checking',
    RECONNECTING: 'reconnecting'
};
let helpContentHtmlCache = '';
let helpContentLoadPromise = null;
let ORGREGION = DEFAULT_ORG_REGION;
let selectedAuthMode = DEFAULT_AUTH_MODE;
let connectionMonitorIntervalId = null;
let connectionReconnectInProgress = false;
let currentConnectionStatus = CONNECTION_STATUS.UNKNOWN;

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
const REGION_HOSTS = (platformClient &&
    platformClient.PureCloudRegionHosts &&
    typeof platformClient.PureCloudRegionHosts === 'object')
    ? platformClient.PureCloudRegionHosts
    : {};
const AVAILABLE_ORG_REGIONS = Object.keys(REGION_HOSTS).length > 0
    ? Object.keys(REGION_HOSTS)
    : [DEFAULT_ORG_REGION];
const REGION_KEY_ALIASES = {
    ie: 'eu_west_1',
    de: 'eu_central_1',
    com: 'us_east_1',
    'com.au': 'ap_southeast_2',
    jp: 'ap_northeast_1'
};

function patchSdkAuthUrlBuilder(apiClientInstance) {
    if (!apiClientInstance || typeof apiClientInstance._buildAuthUrl !== 'function') {
        return;
    }

    const currentBuilder = apiClientInstance._buildAuthUrl;
    if (currentBuilder && currentBuilder.__gctoolPatchedAuthUrlBuilder) {
        return;
    }

    const patchedBuilder = function(path, query) {
        const safeQuery = query && typeof query === 'object' ? query : {};
        const loginBasePath = this.config.getConfUrl('login', this.config.authUrl);
        const queryParts = Object.keys(safeQuery)
            .filter((key) => safeQuery[key] !== undefined && safeQuery[key] !== null && safeQuery[key] !== '')
            .map((key) => `${key}=${safeQuery[key]}`);
        const suffix = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
        return `${loginBasePath}/${path}${suffix}`;
    };
    patchedBuilder.__gctoolPatchedAuthUrlBuilder = true;
    apiClientInstance._buildAuthUrl = patchedBuilder;

    console.log('Patch OAuth URL SDK actif: suppression du parametre vide initial (?&...).');
}

patchSdkAuthUrlBuilder(client);

ORG_VALIDATION_STATE = loadOrgValidationState();
USER_ORG_CONFIGS = loadUserOrgConfigs();
ORG_CONFIGS = buildMergedOrgConfigs();
ensureUserOrgValidationState();

if (Object.keys(FILE_ORG_CONFIGS).length === 0) {
    console.warn('Aucune org preconfiguree. Saisie manuelle activee.');
}

/**
 * Initialisation des APIs
 */
function initializeApis() {
    usersApi = new platformClient.UsersApi();
    architectApi = new platformClient.ArchitectApi();
    routingApi = new platformClient.RoutingApi();
    analyticsApi = new platformClient.AnalyticsApi();
}

/**
 * [AUTH-CONNECTION] Indicateur cloud de statut de connexion.
 */
function getConnectionStatusTitle(status) {
    switch (status) {
        case CONNECTION_STATUS.CONNECTED:
            return i18nAuth('auth.connection.connected', 'Connecte a Genesys Cloud');
        case CONNECTION_STATUS.DISCONNECTED:
            return i18nAuth('auth.connection.disconnected_click', 'Deconnecte de Genesys Cloud - cliquez pour reconnecter');
        case CONNECTION_STATUS.CHECKING:
            return i18nAuth('auth.connection.checking', 'Verification de la connexion en cours...');
        case CONNECTION_STATUS.RECONNECTING:
            return i18nAuth('auth.connection.reconnecting', 'Reconnexion en cours...');
        default:
            return i18nAuth('auth.connection.unknown_click', 'Etat de connexion inconnu - cliquez pour verifier');
    }
}

function setConnectionStatusIndicator(status) {
    const normalizedStatus = CONNECTION_STATUS[status?.toUpperCase?.()] || status || CONNECTION_STATUS.UNKNOWN;
    currentConnectionStatus = normalizedStatus;

    const button = document.getElementById('connectionStatusBtn');
    if (!button) return;

    button.dataset.status = normalizedStatus;
    button.setAttribute('title', getConnectionStatusTitle(normalizedStatus));
}

function initializeConnectionStatusIndicator() {
    const button = document.getElementById('connectionStatusBtn');
    if (!button) return;
    if (button.dataset.initialized === 'true') return;

    button.dataset.initialized = 'true';
    button.addEventListener('click', () => {
        if (connectionReconnectInProgress) return;
        if (currentConnectionStatus === CONNECTION_STATUS.DISCONNECTED) {
            reconnectGenesysSessionWithoutDataReload();
            return;
        }
        checkGenesysConnectionStatus({ manual: true });
    });

    setConnectionStatusIndicator(CONNECTION_STATUS.UNKNOWN);
    console.log('[AUTH][CONNECTION] Indicateur de connexion initialise');
}

function isAuthSessionError(error) {
    const err = /** @type {any} */ (error);
    const status = Number(err?.status || err?.statusCode || 0);
    if (status === 401 || status === 403) return true;

    const rawMessage = String(err?.message || err?.error_description || err?.error || '').toLowerCase();
    if (!rawMessage) return false;
    if (rawMessage.includes('unauthorized')) return true;
    if (rawMessage.includes('invalid') && rawMessage.includes('token')) return true;
    if (rawMessage.includes('expired') && rawMessage.includes('token')) return true;
    return false;
}

function checkGenesysConnectionStatus(options = {}) {
    const isManual = !!options.manual;
    initializeConnectionStatusIndicator();

    if (connectionReconnectInProgress) {
        console.log('[AUTH][CONNECTION] Verification ignoree: reconnexion deja en cours');
        return Promise.resolve(false);
    }

    if (!usersApi || typeof usersApi.getUsersMe !== 'function') {
        console.warn('[AUTH][CONNECTION] Verification impossible: usersApi non initialise');
        setConnectionStatusIndicator(CONNECTION_STATUS.DISCONNECTED);
        return Promise.resolve(false);
    }

    setConnectionStatusIndicator(CONNECTION_STATUS.CHECKING);
    console.log('[AUTH][CONNECTION] Verification de session', { manual: isManual });

    return usersApi.getUsersMe()
        .then((userObject) => {
            if (userObject && userObject.id) {
                currentUserId = userObject.id;
                currentOrgId = userObject.organization?.id || currentOrgId;
                if (typeof appState !== 'undefined') {
                    appState.isAuthenticated = true;
                    if (!appState.currentUser) {
                        appState.currentUser = {};
                    }
                    appState.currentUser.id = userObject.id;
                    appState.currentUser.name = userObject.name || appState.currentUser.name;
                    appState.currentUser.organization = userObject.organization || appState.currentUser.organization;
                }
                if (typeof updateUserInfo === 'function') {
                    updateUserInfo();
                }
            }

            setConnectionStatusIndicator(CONNECTION_STATUS.CONNECTED);
            return true;
        })
        .catch((error) => {
            console.warn('[AUTH][CONNECTION] Session non valide', error);
            if (typeof appState !== 'undefined' && isAuthSessionError(error)) {
                appState.isAuthenticated = false;
            }
            setConnectionStatusIndicator(CONNECTION_STATUS.DISCONNECTED);
            return false;
        });
}

function startConnectionStatusMonitor() {
    initializeConnectionStatusIndicator();
    if (connectionMonitorIntervalId) {
        clearInterval(connectionMonitorIntervalId);
    }

    connectionMonitorIntervalId = setInterval(() => {
        checkGenesysConnectionStatus({ manual: false });
    }, CONNECTION_CHECK_INTERVAL_MS);

    console.log('[AUTH][CONNECTION] Monitoring demarre (ms):', CONNECTION_CHECK_INTERVAL_MS);
}

function reconnectGenesysSessionWithoutDataReload() {
    initializeConnectionStatusIndicator();

    if (!selectedOrgConfig || !selectedOrgConfig.clientId) {
        console.warn('[AUTH][CONNECTION] Reconnexion impossible: organisation non configuree');
        setConnectionStatusIndicator(CONNECTION_STATUS.DISCONNECTED);
        return Promise.resolve(false);
    }

    if (connectionReconnectInProgress) {
        console.log('[AUTH][CONNECTION] Reconnexion deja en cours');
        return Promise.resolve(false);
    }

    connectionReconnectInProgress = true;
    setConnectionStatusIndicator(CONNECTION_STATUS.RECONNECTING);
    console.log('[AUTH][CONNECTION] Tentative de reconnexion legere (sans reload cache)');

    const environment = REGION_HOSTS[ORGREGION];
    if (environment) {
        client.setEnvironment(environment);
    }

    return loginWithSelectedAuthMode(selectedOrgConfig.clientId, redirectURL)
        .then(() => {
            initializeApis();
            return usersApi.getUsersMe();
        })
        .then((userObject) => {
            currentUserId = userObject.id;
            currentOrgId = userObject.organization?.id || currentOrgId;

            if (typeof appState !== 'undefined') {
                appState.isAuthenticated = true;
                if (!appState.currentUser) {
                    appState.currentUser = {};
                }
                appState.currentUser.id = currentUserId;
                appState.currentUser.name = userObject.name || appState.currentUser.name;
                appState.currentUser.organization = userObject.organization || appState.currentUser.organization;
                appState.currentUser.selectedOrgConfig = selectedOrgConfig;
                appState.currentUser.authMode = selectedAuthMode;
                appState.currentUser.region = ORGREGION;
            }

            if (typeof updateUserInfo === 'function') {
                updateUserInfo();
            }

            setConnectionStatusIndicator(CONNECTION_STATUS.CONNECTED);
            startConnectionStatusMonitor();
            console.log('[AUTH][CONNECTION] Reconnexion legere reussie');
            return true;
        })
        .catch((error) => {
            console.error('[AUTH][CONNECTION] Echec reconnexion legere', error);
            setConnectionStatusIndicator(CONNECTION_STATUS.DISCONNECTED);
            return false;
        })
        .finally(() => {
            connectionReconnectInProgress = false;
        });
}

window.checkGenesysConnectionStatus = checkGenesysConnectionStatus;
window.reconnectGenesysSessionWithoutDataReload = reconnectGenesysSessionWithoutDataReload;

function normalizeAuthMode(mode) {
    return mode === 'pkce' ? 'pkce' : 'implicit';
}

function findRegionKey(regionValue) {
    if (typeof regionValue !== 'string') {
        return '';
    }

    const rawValue = regionValue.trim().toLowerCase();
    if (!rawValue) {
        return '';
    }

    if (REGION_HOSTS[rawValue]) {
        return rawValue;
    }

    const normalizedHost = rawValue
        .replace(/^https?:\/\//, '')
        .replace(/^api\./, '')
        .replace(/^login\./, '')
        .replace(/\/.*$/, '')
        .replace(/^\./, '');

    if (REGION_HOSTS[normalizedHost]) {
        return normalizedHost;
    }

    for (const [regionKey, regionHost] of Object.entries(REGION_HOSTS)) {
        if (typeof regionHost === 'string' && regionHost.toLowerCase() === normalizedHost) {
            return regionKey;
        }
    }

    const suffixCandidate = normalizedHost.startsWith('mypurecloud.')
        ? normalizedHost.slice('mypurecloud.'.length)
        : normalizedHost;
    const aliasedRegion = REGION_KEY_ALIASES[suffixCandidate] || REGION_KEY_ALIASES[normalizedHost];
    if (aliasedRegion && REGION_HOSTS[aliasedRegion]) {
        return aliasedRegion;
    }

    return '';
}

function normalizeOrgRegion(region) {
    const normalizedRegion = findRegionKey(region);
    if (normalizedRegion) {
        return normalizedRegion;
    }

    if (typeof region === 'string' && region.trim()) {
        console.warn(`Region invalide "${region}". Fallback: ${DEFAULT_ORG_REGION}`);
    }
    return DEFAULT_ORG_REGION;
}

function resolveRegionFromOrg(orgConfig) {
    if (!orgConfig || typeof orgConfig !== 'object') {
        return DEFAULT_ORG_REGION;
    }
    return normalizeOrgRegion(orgConfig.region);
}

function resolveAuthModeFromOrg(orgConfig) {
    if (!orgConfig || typeof orgConfig !== 'object') {
        return DEFAULT_AUTH_MODE;
    }

    return normalizeAuthMode(orgConfig.authMode);
}

function applySelectedOrgContext(orgConfig, orgKey) {
    const sanitizedOrgConfig = sanitizeOrgConfig(orgConfig);
    if (!sanitizedOrgConfig) {
        throw new Error('Configuration ORG invalide');
    }

    selectedOrgConfig = sanitizedOrgConfig;
    selectedOrgKey = typeof orgKey === 'string' && orgKey
        ? orgKey
        : findExistingOrgKey(sanitizedOrgConfig);
    selectedAuthMode = resolveAuthModeFromOrg(sanitizedOrgConfig);
    ORGREGION = resolveRegionFromOrg(sanitizedOrgConfig);
}

function formatAuthModeLabel(mode) {
    return normalizeAuthMode(mode) === 'pkce' ? 'PKCE' : 'Implicit';
}

function maskClientId(clientId) {
    const normalized = typeof clientId === 'string' ? clientId.trim() : '';
    if (!normalized) {
        return 'n/a';
    }
    if (normalized.length <= 8) {
        return normalized;
    }
    return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

function getAuthDebugState() {
    const regionKey = ORGREGION || DEFAULT_ORG_REGION;
    const host = REGION_HOSTS[regionKey] || '';
    return {
        selectedOrgKey: selectedOrgKey || null,
        selectedOrgName: selectedOrgConfig?.name || null,
        selectedAuthMode: selectedAuthMode || null,
        regionKey,
        host,
        authUrl: client?.config?.authUrl || null,
        basePath: client?.config?.basePath || null,
        redirectURL,
        clientIdMasked: maskClientId(selectedOrgConfig?.clientId || ''),
        selectedOrgConfig: selectedOrgConfig || null
    };
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

function normalizeOrgValidationStatus(status) {
    if (status === ORG_VALIDATION_STATUSES.VALID) {
        return ORG_VALIDATION_STATUSES.VALID;
    }
    if (status === ORG_VALIDATION_STATUSES.INVALID) {
        return ORG_VALIDATION_STATUSES.INVALID;
    }
    return ORG_VALIDATION_STATUSES.UNVERIFIED;
}

function loadOrgValidationState() {
    let parsedState = null;
    try {
        const rawValue = localStorage.getItem(ORG_VALIDATION_STATE_STORAGE_KEY);
        if (rawValue) {
            parsedState = JSON.parse(rawValue);
        }
    } catch (error) {
        console.error('Erreur lecture statut validation ORG:', error);
    }

    if (!parsedState || typeof parsedState !== 'object') {
        return {};
    }

    const normalizedState = {};
    Object.keys(parsedState).forEach((orgKey) => {
        if (!orgKey) {
            return;
        }

        const entry = parsedState[orgKey];
        if (!entry || typeof entry !== 'object') {
            return;
        }

        normalizedState[orgKey] = {
            status: normalizeOrgValidationStatus(entry.status),
            updatedAt: Number(entry.updatedAt) || Date.now()
        };
    });

    return normalizedState;
}

function persistOrgValidationState() {
    try {
        localStorage.setItem(ORG_VALIDATION_STATE_STORAGE_KEY, JSON.stringify(ORG_VALIDATION_STATE));
    } catch (error) {
        console.error('Erreur sauvegarde statut validation ORG:', error);
    }
}

function setOrgValidationStatus(orgKey, status) {
    if (!orgKey) {
        return;
    }

    ORG_VALIDATION_STATE[orgKey] = {
        status: normalizeOrgValidationStatus(status),
        updatedAt: Date.now()
    };
    persistOrgValidationState();
}

function getOrgValidationStatus(orgKey) {
    if (!orgKey || !ORG_VALIDATION_STATE[orgKey]) {
        return '';
    }
    return normalizeOrgValidationStatus(ORG_VALIDATION_STATE[orgKey].status);
}

function isOrgNotValidated(orgKey) {
    const status = getOrgValidationStatus(orgKey);
    return status === ORG_VALIDATION_STATUSES.INVALID ||
        status === ORG_VALIDATION_STATUSES.UNVERIFIED;
}

function isUserLocalOrg(orgKey) {
    return !!(orgKey && USER_ORG_CONFIGS[orgKey] && !FILE_ORG_CONFIGS[orgKey]);
}

function ensureUserOrgValidationState() {
    let hasChanges = false;
    Object.keys(USER_ORG_CONFIGS).forEach((orgKey) => {
        if (!orgKey || !USER_ORG_CONFIGS[orgKey]) {
            return;
        }
        if (!ORG_VALIDATION_STATE[orgKey]) {
            ORG_VALIDATION_STATE[orgKey] = {
                status: ORG_VALIDATION_STATUSES.UNVERIFIED,
                updatedAt: Date.now()
            };
            hasChanges = true;
        }
    });

    if (hasChanges) {
        persistOrgValidationState();
    }
}

function sanitizeOrgConfig(orgConfig) {
    if (!orgConfig || typeof orgConfig !== 'object') {
        return null;
    }

    const name = typeof orgConfig.name === 'string' ? orgConfig.name.trim() : '';
    const clientId = typeof orgConfig.clientId === 'string' ? orgConfig.clientId.trim() : '';
    const description = typeof orgConfig.description === 'string' ? orgConfig.description.trim() : '';
    const authMode = normalizeAuthMode(orgConfig.authMode);
    const region = normalizeOrgRegion(orgConfig.region);

    if (!name || !clientId) {
        return null;
    }

    return {
        name,
        clientId,
        description,
        authMode,
        region
    };
}

function sanitizeOrgConfigsMap(orgConfigsMap) {
    if (!orgConfigsMap || typeof orgConfigsMap !== 'object') {
        return {};
    }

    const sanitizedMap = {};
    Object.keys(orgConfigsMap).forEach((orgKey) => {
        const sanitizedConfig = sanitizeOrgConfig(orgConfigsMap[orgKey]);
        if (sanitizedConfig) {
            sanitizedMap[orgKey] = sanitizedConfig;
        }
    });

    return sanitizedMap;
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
        ...sanitizeOrgConfigsMap(FILE_ORG_CONFIGS),
        ...sanitizeOrgConfigsMap(USER_ORG_CONFIGS)
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
    const normalizedRegion = resolveRegionFromOrg(orgConfig);

    const allEntries = Object.entries(ORG_CONFIGS);
    for (const [orgKey, existingOrgConfig] of allEntries) {
        if (!existingOrgConfig) {
            continue;
        }
        const existingClientId = (existingOrgConfig.clientId || '').trim().toLowerCase();
        const existingAuthMode = normalizeAuthMode(existingOrgConfig.authMode);
        const existingRegion = resolveRegionFromOrg(existingOrgConfig);
        if (existingClientId === normalizedClientId &&
            existingAuthMode === normalizedAuthMode &&
            existingRegion === normalizedRegion) {
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
        setOrgValidationStatus(orgKey, ORG_VALIDATION_STATUSES.UNVERIFIED);
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
    return client.loginImplicitGrant(clientId, redirectUri, {
        state: 'gctool-implicit-auth'
    });
}

/**
 * Authentification avec gestion d'erreurs spécifique
 */
function proceedWithAuthentication() {
    if (!selectedOrgConfig) {
        return Promise.reject(new Error('Aucune organisation sélectionnée'));
    }

    const currentOrgSelectionKey = selectedOrgKey || findExistingOrgKey(selectedOrgConfig);
    ORGREGION = resolveRegionFromOrg(selectedOrgConfig);
    
    console.log(`🏢 Tentative de connexion: ${selectedOrgConfig.name}`);
    console.log(`🌍 Région sélectionnée: ${ORGREGION}`);
    
    // Initialiser le client avec la région
    const environment = REGION_HOSTS[ORGREGION];
    console.log(`OAuth host selectionne: ${environment || 'inconnu'}`);
    
    if (environment) {
        client.setEnvironment(environment);
        console.log('OAuth contexte applique:', {
            region: ORGREGION,
            host: environment,
            authMode: selectedAuthMode,
            redirectURL,
            clientIdMasked: maskClientId(selectedOrgConfig.clientId)
        });
    } else {
        console.warn(`Région Genesys Cloud inconnue: ${ORGREGION}. Utilisation du host par défaut du SDK.`);
    }
    
    return loginWithSelectedAuthMode(selectedOrgConfig.clientId, redirectURL)
        .then(() => {
            console.log('✅ Authentification Genesys Cloud réussie');
            if (currentOrgSelectionKey) {
                setOrgValidationStatus(currentOrgSelectionKey, ORG_VALIDATION_STATUSES.VALID);
            }
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
                    authMode: selectedAuthMode,
                    region: ORGREGION
                };
            }
            
            // Charger les configurations sauvegardées
            setConnectionStatusIndicator(CONNECTION_STATUS.CONNECTED);
            startConnectionStatusMonitor();
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
                authMode: selectedAuthMode,
                region: ORGREGION
            };
        })
        .catch((error) => {
            const err = /** @type {any} */ (error);
            console.error("Erreur d'authentification:", err);
            console.error('Contexte auth au moment de l\'erreur:', getAuthDebugState());

            let errorMessage = 'Erreur de connexion';
            let shouldClearOrg = true;

            if (err.error || err.error_description) {
                const oauthCode = err.error || 'oauth_error';
                const oauthDesc = err.error_description || err.message || 'Erreur OAuth';
                errorMessage = `OAuth ${oauthCode}: ${oauthDesc}`;
            } else if (err.status === 401) {
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
            enrichedError.organizationKey = currentOrgSelectionKey || null;

            if (currentOrgSelectionKey && shouldClearOrg !== false) {
                setOrgValidationStatus(currentOrgSelectionKey, ORG_VALIDATION_STATUSES.INVALID);
            }

            setConnectionStatusIndicator(CONNECTION_STATUS.DISCONNECTED);
            throw enrichedError;
        });
}

/**
 * Version finale de initializeWithOrgSelection avec gestion d'erreurs améliorée
 */
function initializeWithOrgSelection() {
    return new Promise((resolve, reject) => {
        console.log('Initialisation avec gestion d\'organisation...');

        const savedOrg = getSavedOrganization();
        const pendingSelection = getPendingOrganizationSelection();
        const hasOAuthCallback = hasOAuthCallbackPayload();
        let selectedOrgKey = null;
        let selectionSource = null;

        if (hasOAuthCallback &&
            pendingSelection &&
            pendingSelection.orgKey &&
            ORG_CONFIGS[pendingSelection.orgKey]) {
            selectedOrgKey = pendingSelection.orgKey;
            selectionSource = 'pending';
        } else if (savedOrg && ORG_CONFIGS[savedOrg]) {
            selectedOrgKey = savedOrg;
            selectionSource = 'saved';
        } else if (pendingSelection && !hasOAuthCallback) {
            clearPendingOrganizationSelection();
        }

        if (selectionSource === 'saved' && pendingSelection && !hasOAuthCallback) {
            clearPendingOrganizationSelection();
        }

        if (selectedOrgKey && ORG_CONFIGS[selectedOrgKey]) {
            applySelectedOrgContext(ORG_CONFIGS[selectedOrgKey], selectedOrgKey);
            console.log(`Organisation ${selectionSource === 'saved' ? 'sauvegardee' : 'temporaire'}: ${selectedOrgConfig.name} (auth: ${selectedAuthMode}, region: ${ORGREGION})`);

            if (typeof updateLoadingStatus === 'function') {
                updateLoadingStatus(`Connexion a ${selectedOrgConfig.name}...`);
            }

            proceedWithAuthentication()
                .then((result) => {
                    if (selectionSource === 'pending') {
                        applyRememberPreferenceAfterSuccess(selectedOrgKey, !!pendingSelection.remember);
                    }
                    clearPendingOrganizationSelection();
                    console.log('Connexion automatique reussie');
                    resolve(result);
                })
                .catch((error) => {
                    clearPendingOrganizationSelection();
                    console.warn('Echec connexion automatique:', error.message);

                    if (selectionSource === 'saved' && error.shouldClearOrg !== false) {
                        clearSavedOrganization();
                    }

                    showOrgSelector(resolve, reject, error.message);
                });
        } else {
            console.log('Premiere connexion ou org supprimee');

            if (typeof updateLoadingStatus === 'function') {
                updateLoadingStatus(i18nAuth('auth.loading.select_org', "Selection de l\'organisation..."));
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
        clearPendingOrganizationSelection();
        console.log('Organisation sauvegardée supprimée');
    } catch (error) {
        console.error('Erreur lors de la suppression de l\'organisation:', error);
    }
}

function savePendingOrganizationSelection(orgKey, rememberSelection) {
    if (!orgKey) {
        return;
    }

    try {
        const payload = {
            orgKey,
            remember: !!rememberSelection,
            createdAt: Date.now()
        };
        sessionStorage.setItem(AUTH_PENDING_SELECTION_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.error('Erreur lors de la sauvegarde temporaire de la selection ORG:', error);
    }
}

function getPendingOrganizationSelection() {
    try {
        const rawValue = sessionStorage.getItem(AUTH_PENDING_SELECTION_STORAGE_KEY);
        if (!rawValue) {
            return null;
        }

        const parsedValue = JSON.parse(rawValue);
        if (!parsedValue || typeof parsedValue !== 'object') {
            return null;
        }

        const ageMs = Date.now() - Number(parsedValue.createdAt || 0);
        if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > AUTH_PENDING_SELECTION_MAX_AGE_MS) {
            clearPendingOrganizationSelection();
            return null;
        }

        return {
            orgKey: parsedValue.orgKey,
            remember: !!parsedValue.remember
        };
    } catch (error) {
        console.error('Erreur lors de la lecture de la selection ORG temporaire:', error);
        return null;
    }
}

function clearPendingOrganizationSelection() {
    try {
        sessionStorage.removeItem(AUTH_PENDING_SELECTION_STORAGE_KEY);
    } catch (error) {
        console.error('Erreur lors de la suppression de la selection ORG temporaire:', error);
    }
}

function hasOAuthCallbackPayload() {
    try {
        const hashValue = (window.location.hash || '').replace(/^#/, '');
        const hashParams = new URLSearchParams(hashValue);
        if (hashParams.has('access_token') || hashParams.has('error')) {
            return true;
        }

        const searchParams = new URLSearchParams(window.location.search || '');
        if (searchParams.has('code') || searchParams.has('error')) {
            return true;
        }

        return false;
    } catch (error) {
        console.error('Erreur lors de la detection du callback OAuth:', error);
        return false;
    }
}

function applyRememberPreferenceAfterSuccess(orgKey, rememberSelection) {
    if (rememberSelection) {
        saveOrganization(orgKey);
    } else {
        clearSavedOrganization();
    }
}

function getRegionSelectOptionsHtml(selectedRegion) {
    const normalizedSelection = normalizeOrgRegion(selectedRegion);
    return AVAILABLE_ORG_REGIONS
        .map((regionKey) => {
            const selectedAttr = regionKey === normalizedSelection ? ' selected' : '';
            const regionHost = REGION_HOSTS[regionKey] || '';
            const optionLabel = regionHost ? `${regionKey} (${regionHost})` : regionKey;
            return `<option value="${regionKey}"${selectedAttr}>${optionLabel}</option>`;
        })
        .join('');
}

function renderOrgOption(orgKey, orgConfig) {
    const orgRegion = resolveRegionFromOrg(orgConfig);
    const orgRegionHost = REGION_HOSTS[orgRegion] || '';
    const orgRegionLabel = orgRegionHost ? `${orgRegion} (${orgRegionHost})` : orgRegion;
    const optionClasses = ['org-option'];
    const showEditButton = isUserLocalOrg(orgKey);
    if (isOrgNotValidated(orgKey)) {
        optionClasses.push('org-option-not-validated');
    }
    return `
        <div class="${optionClasses.join(' ')}" data-org="${orgKey}">
            <div class="org-card${showEditButton ? ' org-card-has-edit' : ''}" style="position: relative;">
                <span class="label label-info" style="position:absolute;right:10px;top:10px;">${formatAuthModeLabel(orgConfig.authMode)}</span>
                ${showEditButton ? `
                    <button type="button" class="btn btn-link btn-xs org-edit-btn" data-org="${orgKey}" title="${i18nAuth('auth.org_selector.edit_local_org', 'Editer cette ORG locale')}">
                        <i class="fa fa-pencil"></i>
                    </button>
                ` : ''}
                <h5>${orgConfig.name}</h5>
                <p class="text-muted">${orgConfig.description || ''}</p>
                <small class="text-info">Region: ${orgRegionLabel}</small>
            </div>
        </div>
    `;
}

/**
 * Affichage du sélecteur avec message d'erreur contextuel
 */
function loadHelpContentHtml() {
    if (helpContentHtmlCache) {
        return Promise.resolve(helpContentHtmlCache);
    }

    if (helpContentLoadPromise) {
        return helpContentLoadPromise;
    }

    helpContentLoadPromise = new Promise((resolve) => {
        $.ajax({
            url: HELP_CONTENT_FILE_PATH,
            dataType: 'html',
            cache: true
        })
            .done((htmlContent) => {
                helpContentHtmlCache = typeof htmlContent === 'string' ? htmlContent : '';
                resolve(helpContentHtmlCache);
            })
            .fail((jqXHR, textStatus, errorThrown) => {
                console.warn('Impossible de charger help.html:', textStatus, errorThrown || '');
                resolve('');
            })
            .always(() => {
                helpContentLoadPromise = null;
            });
    });

    return helpContentLoadPromise;
}

function extractHelpSectionMarkup(helpHtmlContent, sectionKey) {
    if (!helpHtmlContent || !sectionKey) {
        return '';
    }

    const parserContainer = document.createElement('div');
    parserContainer.innerHTML = helpHtmlContent;
    const section = parserContainer.querySelector(`[data-help-section="${sectionKey}"]`);
    return section ? section.innerHTML.trim() : '';
}

function loadHelpSectionIntoElement(element, sectionKey) {
    if (!element || !sectionKey) {
        return;
    }

    loadHelpContentHtml().then((helpHtmlContent) => {
        const sectionMarkup = extractHelpSectionMarkup(helpHtmlContent, sectionKey);
        if (sectionMarkup) {
            element.innerHTML = sectionMarkup;
            return;
        }

        element.innerHTML = `
            <p class="text-muted">
                ${i18nAuth('auth.org_selector.help_unavailable', 'Aide indisponible pour le moment.')}
            </p>
        `;
    });
}
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
        const regionOptionsHtml = getRegionSelectOptionsHtml(ORGREGION);
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
                            <button type="button" class="btn btn-default btn-sm pull-right" id="orgHelpToggleBtn" aria-expanded="false" aria-controls="orgHelpPanel">
                                <i class="fa fa-info-circle"></i> ${i18nAuth('auth.org_selector.help', 'Aide')}
                            </button>
                        </div>
                        <div class="modal-body">
                            <div class="org-selector-layout">
                                <div class="org-selector-main">
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
                                        <div class="col-md-4">
                                            <label>${i18nAuth('auth.org_selector.auth_type', 'Type de connexion')}</label>
                                            <select class="form-control" id="manualOrgAuthMode">
                                                <option value="implicit">Implicit</option>
                                                <option value="pkce">PKCE</option>
                                            </select>
                                        </div>
                                        <div class="col-md-4">
                                            <label>${i18nAuth('auth.org_selector.region', 'Region')}</label>
                                            <select class="form-control" id="manualOrgRegion">
                                                ${regionOptionsHtml}
                                            </select>
                                        </div>
                                        <div class="col-md-4">
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

                                <aside id="orgHelpPanel" class="org-help-panel" aria-hidden="true" data-help-section="${AUTH_ORG_HELP_SECTION_KEY}">
                                    <p class="text-muted org-help-loading">${i18nAuth('auth.org_selector.help_loading', 'Chargement de l aide...')}</p>
                                </aside>
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
        const orgHelpPanelElement = document.getElementById('orgHelpPanel');
        if (orgHelpPanelElement) {
            const helpSectionKey = orgHelpPanelElement.getAttribute('data-help-section') || AUTH_ORG_HELP_SECTION_KEY;
            loadHelpSectionIntoElement(orgHelpPanelElement, helpSectionKey);
        }
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
    let manualDraftOrgKey = null;
    let manualAutoSaveTimer = null;

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
        const region = normalizeOrgRegion(($('#manualOrgRegion').val() || '').toString());
        const description = ($('#manualOrgDescription').val() || '').toString().trim();

        if (!name || !clientId) {
            return null;
        }
        return {
            name,
            clientId,
            description,
            authMode,
            region
        };
    }

    function isManualFormValid() {
        return !!getManualOrgConfigFromForm();
    }

    function populateManualFormFromOrg(orgKey) {
        const orgConfig = ORG_CONFIGS[orgKey];
        if (!orgConfig) {
            return;
        }

        $('#manualOrgName').val(orgConfig.name || '');
        $('#manualOrgClientId').val(orgConfig.clientId || '');
        $('#manualOrgAuthMode').val(normalizeAuthMode(orgConfig.authMode));
        $('#manualOrgRegion').val(resolveRegionFromOrg(orgConfig));
        $('#manualOrgDescription').val(orgConfig.description || '');

        manualDraftOrgKey = isUserLocalOrg(orgKey) ? orgKey : null;
        $('.org-option').removeClass('selected');
        selectedOrg = null;
        setManualFeedback(i18nAuth('auth.org_selector.editing_local_org', 'Edition d une ORG locale. Modifiez puis cliquez sur Ajouter.'), false);
        updateConfirmButtonState();
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

        $('.org-edit-btn').off('click').on('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            const orgKey = ($(this).data('org') || '').toString();
            if (!isUserLocalOrg(orgKey)) {
                return;
            }
            populateManualFormFromOrg(orgKey);
        });
    }

    function appendOrgOption(orgKey, shouldSelect = true) {
        if (!orgListElement || !ORG_CONFIGS[orgKey]) {
            return;
        }
        const existingOption = orgListElement.querySelector(`.org-option[data-org="${orgKey}"]`);
        if (existingOption) {
            const isCurrentlySelected = existingOption.classList.contains('selected');
            existingOption.outerHTML = renderOrgOption(orgKey, ORG_CONFIGS[orgKey]);
            bindOrgOptionEvents();
            const refreshedOption = orgListElement.querySelector(`.org-option[data-org="${orgKey}"]`);
            if (shouldSelect) {
                $('.org-option').removeClass('selected');
                if (refreshedOption) {
                    $(refreshedOption).addClass('selected');
                }
                selectedOrg = orgKey;
            } else if (isCurrentlySelected && refreshedOption) {
                $(refreshedOption).addClass('selected');
            }
            updateConfirmButtonState();
            return;
        }
        orgListElement.insertAdjacentHTML('beforeend', renderOrgOption(orgKey, ORG_CONFIGS[orgKey]));
        bindOrgOptionEvents();
        if (shouldSelect) {
            $('.org-option').removeClass('selected');
            $(`.org-option[data-org="${orgKey}"]`).addClass('selected');
            selectedOrg = orgKey;
        }
        updateConfirmButtonState();
    }

    function upsertManualOrgInLocalStore(preferDraftKey = false) {
        const manualOrgConfig = getManualOrgConfigFromForm();
        if (!manualOrgConfig) {
            throw new Error(i18nAuth('auth.org_selector.required_fields', 'Nom ORG et Client ID obligatoires.'));
        }

        const forcedOrgKey = preferDraftKey &&
            manualDraftOrgKey &&
            USER_ORG_CONFIGS[manualDraftOrgKey]
            ? manualDraftOrgKey
            : undefined;
        const orgKey = saveOrUpdateUserOrg(manualOrgConfig, forcedOrgKey);
        if (USER_ORG_CONFIGS[orgKey]) {
            manualDraftOrgKey = orgKey;
        }

        return {
            orgKey,
            orgConfig: ORG_CONFIGS[orgKey] || manualOrgConfig
        };
    }

    function queueManualOrgAutoSave() {
        if (manualAutoSaveTimer) {
            clearTimeout(manualAutoSaveTimer);
        }

        manualAutoSaveTimer = setTimeout(() => {
            if (!isManualFormValid()) {
                return;
            }

            try {
                const { orgKey } = upsertManualOrgInLocalStore(true);
                appendOrgOption(orgKey, false);
                setManualFeedback(i18nAuth('auth.org_selector.autosaved_local', 'ORG enregistree automatiquement.'), false);
            } catch (error) {
                setManualFeedback(error.message || i18nAuth('auth.org_selector.add_failed', 'Impossible d\'ajouter l\'ORG.'), true);
            }
        }, 500);
    }

    bindOrgOptionEvents();

    $('#manualOrgName, #manualOrgClientId, #manualOrgAuthMode, #manualOrgRegion, #manualOrgDescription')
        .on('input change', function() {
            $('.org-option').removeClass('selected');
            selectedOrg = null;
            setManualFeedback('', false);
            updateConfirmButtonState();
            queueManualOrgAutoSave();
        });

    $('#addManualOrgBtn').on('click', function() {
        try {
            const { orgKey } = upsertManualOrgInLocalStore(true);
            appendOrgOption(orgKey, true);
            setManualFeedback(i18nAuth('auth.org_selector.added_local', 'ORG ajoutee a la liste locale.'), false);
        } catch (error) {
            setManualFeedback(error.message || i18nAuth('auth.org_selector.add_failed', 'Impossible d\'ajouter l\'ORG.'), true);
        }
    });

    $('#orgHelpToggleBtn').on('click', function() {
        const modal = $('#orgSelectorModal');
        const isOpen = modal.hasClass('org-help-open');
        modal.toggleClass('org-help-open', !isOpen);
        $(this).attr('aria-expanded', (!isOpen).toString());
        $('#orgHelpPanel').attr('aria-hidden', isOpen ? 'true' : 'false');
    });

    // Gestionnaire de clic pour le bouton de confirmation
    $('#confirmOrgBtn').on('click', processOrgSelection);
    updateConfirmButtonState();

    function processOrgSelection() {
        try {
            const shouldRememberSelection = $('#rememberOrg').is(':checked');
            if (manualAutoSaveTimer) {
                clearTimeout(manualAutoSaveTimer);
                manualAutoSaveTimer = null;
            }

            if (selectedOrg && ORG_CONFIGS[selectedOrg]) {
                applySelectedOrgContext(ORG_CONFIGS[selectedOrg], selectedOrg);
            } else {
                const { orgKey, orgConfig } = upsertManualOrgInLocalStore(true);
                selectedOrg = orgKey;
                applySelectedOrgContext(orgConfig, orgKey);
            }

            // Sauvegarder si demandé
            savePendingOrganizationSelection(selectedOrg, shouldRememberSelection);

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
                    applyRememberPreferenceAfterSuccess(selectedOrg, shouldRememberSelection);
                    clearPendingOrganizationSelection();
                    setTimeout(() => $('#orgSelectorModal').remove(), 500);
                    resolve(result);
                })
                .catch((error) => {
                    clearPendingOrganizationSelection();
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
        getAllScheduleGroups(),
        getAllSchedules()
    ];
    
    return Promise.all(loadingPromises)
        .then((results) => {
            console.log('📊 Données chargées:');
            console.log(`  - DataTables: ${dataTablesCache.length}`);
            console.log(`  - Queues: ${queuesCache.length}`);
            console.log(`  - Skills: ${skillsCache.length}`);
            console.log(`  - Prompts: ${promptsCache.length}`);
            console.log(`  - Schedule Groups: ${scheduleGroupsCache.length}`);
            console.log(`  - Schedules: ${schedulesCache.length}`);
            console.log(` - Schedule Groups complets:`, scheduleGroupsCache) ;
            console.log(` - Schedules complets:`, schedulesCache);
        
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

// Récupération des Schedules
function getAllSchedules() {
    return getAllWithPagination(
        (opts) => architectApi.getArchitectSchedules(opts),
        'Schedules'
    ).then((result) => {
        schedulesCache = result.entities;
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
    initializeConnectionStatusIndicator();
    setConnectionStatusIndicator(CONNECTION_STATUS.UNKNOWN);
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

if (typeof window !== 'undefined') {
    window.GCTOOL_DEBUG_AUTH = getAuthDebugState;
}
