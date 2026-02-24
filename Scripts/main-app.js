/**
 * main-app.js
 * Gestionnaire principal de l'application multi-outils
 * Auteur: PS Genesys - Matthieu FRYS
 * Date: 05/2025
 */

// État global de l'application
let appState = {
    isAuthenticated: false,
    isDataLoaded: false,
    currentUser: null,
    flowDesignerInitialized: false,
    loadingSteps: [
        i18nText('main.loading.step.auth', 'Authentification...'),
        i18nText('main.loading.step.datatables', 'Chargement des DataTables...'),
        i18nText('main.loading.step.queues', 'Chargement des Queues...'),
        i18nText('main.loading.step.skills', 'Chargement des Skills...'),
        i18nText('main.loading.step.schedule_groups', 'Chargement des Schedule Groups...'),
        i18nText('main.loading.step.prompts', 'Chargement des Prompts...'),
        i18nText('main.loading.step.finalize', 'Finalisation...')
    ],
    currentStep: 0
};

function i18nText(key, fallback, params) {
    if (window.GCToolI18n && typeof window.GCToolI18n.t === 'function') {
        return window.GCToolI18n.t(key, params || {}, fallback);
    }
    return fallback;
}

/**
 * Initialisation de l'application principale
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Démarrage de l\'application Genesys Cloud Tools');

    if (window.GCToolI18n && typeof window.GCToolI18n.onChange === 'function') {
        window.GCToolI18n.onChange(() => {
            appState.loadingSteps = [
                i18nText('main.loading.step.auth', 'Authentification...'),
                i18nText('main.loading.step.datatables', 'Chargement des DataTables...'),
                i18nText('main.loading.step.queues', 'Chargement des Queues...'),
                i18nText('main.loading.step.skills', 'Chargement des Skills...'),
                i18nText('main.loading.step.schedule_groups', 'Chargement des Schedule Groups...'),
                i18nText('main.loading.step.prompts', 'Chargement des Prompts...'),
                i18nText('main.loading.step.finalize', 'Finalisation...')
            ];
            updateUserInfo();
        });
    }
    
    // Démarrer l'authentification et le chargement
    initializeApplication();
});

/**
 * Fonction principale d'initialisation
 */
async function initializeApplication() {
    try {
        updateLoadingStatus(i18nText('main.loading.auth_start', 'Demarrage de l\'authentification...'));
        
        // Authentifier et charger les données
        await initializeWithOrgSelection();
        
        // Charger le contenu des onglets
        await loadTabContents();
                    
        // Charger les configurations sauvegardées
        loadSavedConfigurations();
        loadLiaisonMappingFromCookie();

        // Masquer le loading et afficher le contenu
        hideLoading();
        showMainContent();
            
        console.log('✅ Application initialisée avec succès');
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation:', error);
        showError(error.message || i18nText('main.error.unknown_init', 'Erreur inconnue lors de l\'initialisation'));
    }
}

/**
 * Mise à jour du statut de chargement
 */
function updateLoadingStatus(message) {
    const statusElement = document.getElementById('loadingStatus');
    if (statusElement) {
        statusElement.textContent = message;
    }
    
    if (appState.currentStep < appState.loadingSteps.length) {
        console.log(`📄 Étape ${appState.currentStep + 1}/${appState.loadingSteps.length}: ${message}`);
        appState.currentStep++;
    }
}

/**
 * Chargement du contenu des onglets
 */
async function loadTabContents() {
    updateLoadingStatus(i18nText('main.loading.ui', 'Chargement des interfaces...'));
    
    try {
        // Charger la page Information
        await loadTabFromFile('information', 'informationContent');
        
        // Charger la page Contrôleur DataTables
        await loadTabFromFile('datatables-controller', 'datatablesControlContent');
        
        // Charger la page Contrôleur DataTables
        await loadTabFromFile('datatables-flow', 'datatablesFlowContent');
        
        // Charger la page Flow logs
        await loadTabFromFile('logs-flow', 'logsFlowContent');

        // Charger la page Flow logs
        await loadTabFromFile('priorisation', 'priorisationContent');

        // Charger la page API Explorer
        await loadTabFromFile('api-explorer', 'apiExplorerContent');

        initializeInformationPage();

        console.log('📑 Contenu des onglets chargé depuis les fichiers');
        
    } catch (error) {
        console.error('❌ Erreur lors du chargement des onglets:', error);
        throw error;
    }
}

/**
 * Chargement de l'onglet Information
 */
async function loadTabFromFile(tabName, containerId) {
    try {
        const response = await fetch(`./Scripts/tabs/${tabName}.html`);
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const htmlContent = await response.text();
        const container = document.getElementById(containerId);
        
        if (container) {
            container.innerHTML = htmlContent;
            if (window.GCToolI18n && typeof window.GCToolI18n.apply === 'function') {
                window.GCToolI18n.apply(container);
            }
            console.log(`✅ Onglet ${tabName} chargé`);
        } else {
            throw new Error(`Container ${containerId} introuvable`);
        }
        
    } catch (error) {
        console.error(`❌ Erreur lors du chargement de ${tabName}:`, error);
        throw error;
    }
}

/**
 * Affichage d'une erreur
 */
function showError(message) {
    hideLoading();
    
    const errorMessage = document.getElementById('errorMessage');
    const errorDetails = document.getElementById('errorDetails');
    
    if (errorMessage && errorDetails) {
        errorDetails.textContent = message;
        errorMessage.style.display = 'block';
    }
}

/**
 * Masquer l'overlay de chargement
 */
function hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

/**
 * Afficher le contenu principal
 */
function showMainContent() {
    const mainContent = document.getElementById('mainContent');
    if (mainContent) {
        mainContent.style.display = 'block';
    }
    
    // Mettre à jour les informations utilisateur
    updateUserInfo();
}

/**
 * Mise à jour des informations utilisateur
 */
function updateUserInfo() {
    const userInfo = document.getElementById('userInfo');
    const userName = document.getElementById('userName');

    if (appState.currentUser && userInfo && userName) {
        userName.textContent = appState.currentUser.name || i18nText('app.user.unknown', 'Utilisateur inconnu');
        userInfo.style.display = 'block';
    }
}

/**
 * Gestion des événements d'onglets - Version améliorée
 */
$(document).ready(function() {
    $('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
        const target = $(e.target).attr("href");
        console.log(`📋 Onglet activé: ${target}`);
        
        // Initialiser l'onglet selon le type
        switch(target) {
            case '#information':
                if (typeof initializeInformationPage === 'function') {
                    initializeInformationPage();
                }
                break;
            case '#datatables-controller':
                if (typeof initializeDataTablesController === 'function') {
                    initializeDataTablesController();
                }
                break;
            case '#datatables-flow':
                if (!appState.flowDesignerInitialized && typeof initializeFlowDesigner === 'function') {
                    initializeFlowDesigner();
                    appState.flowDesignerInitialized = true;
                }
                break;
            case '#logs-flow':
                console.log('🔧 Init LogsFlow via case exact');
                if (typeof initializeLogsFlowTab === 'function') {
                    initializeLogsFlowTab();
                }
                else {
                    console.warn('⚠️ initializeLogsFlowTab introuvable (ni global, ni dans GCTOOL_LOGFLOW).');
                }
                break;
            case '#priorisation':
                console.log('🔧 Init Priorisation via case exact');
                if (typeof initializePriorisationTab === 'function') {
                    initializePriorisationTab();
                }
                else {
                    console.warn('⚠️ initializePriorisationTab introuvable (ni global, ni dans GCTOOL_PRIORISATION).');
                }
                break;
            case '#api-explorer':
                console.log('Init API Explorer via case exact');
                if (typeof initializeApiExplorerTab === 'function') {
                    initializeApiExplorerTab();
                }
                else {
                    console.warn('initializeApiExplorerTab introuvable.');
                }
                break;

            default:
                // Fallback: si on a un ID approchant (ex: #logsflow, #logs_flow, …)
                if (target.includes('logs') && target.includes('flow')) {
                console.log('🔧 Init LogsFlow via fallback (target approchant):', target);
                callLogsFlowInit();
                }
                break;
        }
    });
});
