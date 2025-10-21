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
    loadingSteps: [
        'Authentification...',
        'Chargement des DataTables...',
        'Chargement des Queues...',
        'Chargement des Skills...',
        'Chargement des Schedule Groups...',
        'Chargement des Prompts...',
        'Finalisation...'
    ],
    currentStep: 0
};

/**
 * Initialisation de l'application principale
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Démarrage de l\'application Genesys Cloud Tools');
    
    // Démarrer l'authentification et le chargement
    initializeApplication();
});

/**
 * Fonction principale d'initialisation
 */
async function initializeApplication() {
    try {
        updateLoadingStatus('Démarrage de l\'authentification...');
        
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
        showError(error.message || 'Erreur inconnue lors de l\'initialisation');
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
    updateLoadingStatus('Chargement des interfaces...');
    
    try {
        // Charger la page Information
        await loadTabFromFile('information', 'informationContent');
        
        // Charger la page Contrôleur DataTables
        await loadTabFromFile('datatables-controller', 'datatablesControlContent');
        
        // Charger la page Contrôleur DataTables
        await loadTabFromFile('datatables-flow', 'datatablesFlowContent');
        
        // Charger la page Flow logs
        await loadTabFromFile('logs-flow', 'logsFlowContent');

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
    const orgInfo = document.getElementById('orgInfo');
    
    if (appState.currentUser && userInfo && userName && orgInfo) {
        userName.textContent = appState.currentUser.name || 'Utilisateur inconnu';
        orgInfo.textContent = `Région: ${ORGREGION} | ID: ${appState.currentUser.id}`;
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
                if (typeof initializeFlowDesigner === 'function') {
                    initializeFlowDesigner();
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