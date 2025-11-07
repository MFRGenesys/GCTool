/**
 * auth-init.js - Version avec gestion dynamique du CLIENTID
 * Auteur: PS Genesys - Matthieu FRYS
 * Date: 05/2025
 */

// Configuration des organisations et leurs CLIENTID
const ORG_CONFIGS = {
    'org1': {
        name: 'PS Consulting',
        clientId: '55595517-5140-4da9-bd6f-c358b545ae98',
        description: 'Organisation PS Consulting de test'
    },
    'org2': {
        name: 'LBP ASSE', 
        clientId: '46ee6695-91f5-4810-bf89-f4717142396d',
        description: 'Organisation Client de DEV'
    },
    'org3': {
        name: 'LBP TFON', 
        clientId: '476d522e-6620-4aa0-9e60-8468c1b41cfc',
        description: 'Org LBP TFON'
    },
    'org4': {
        name: 'Organisation 3',
        clientId: 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy', 
        description: 'Organisation de développement'
    }
};

// Configuration globale
const ORGREGION = 'eu_west_1';
let selectedOrgConfig = null;
let redirectURL = window.location.origin + window.location.pathname;

// APIs Genesys Cloud
let usersApi, architectApi, routingApi;
let currentUserId;
let currentOrgId;

// Initialisation du client Genesys
const platformClient = require('platformClient');
const client = platformClient.ApiClient.instance;

/**
 * Initialisation des APIs
 */
function initializeApis() {
    usersApi = new platformClient.UsersApi();
    architectApi = new platformClient.ArchitectApi();
    routingApi = new platformClient.RoutingApi();
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
    
    return client.loginImplicitGrant(selectedOrgConfig.clientId, redirectURL)
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
                    selectedOrgConfig: selectedOrgConfig
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
                updateLoadingStatus('Chargement des données Genesys...');
            }
            
            //DEBUG COMMENT A ENLEVER return loadAllGenesysData();
        })
        .then(() => {
            console.log('✅ Données Genesys chargées avec succès');
            
            if (typeof appState !== 'undefined') {
                appState.isDataLoaded = true;
            }
            
            return {
                success: true,
                message: 'Authentification et chargement réussis',
                organization: selectedOrgConfig.name
            };
        })
        .catch((error) => {
            // ✅ Analyser le type d'erreur pour décider de l'action
            console.error('❌ Erreur d\'authentification:', error);
            
            let errorMessage = 'Erreur de connexion';
            let shouldClearOrg = true;
            
            if (error.status === 401) {
                errorMessage = 'Identifiants invalides pour cette organisation';
            } else if (error.status === 403) {
                errorMessage = 'Accès refusé à cette organisation';
            } else if (error.status >= 500) {
                errorMessage = 'Erreur serveur Genesys Cloud';
                shouldClearOrg = false; // Ne pas supprimer l'org sur erreur serveur
            } else if (error.message && error.message.includes('network')) {
                errorMessage = 'Erreur de réseau';
                shouldClearOrg = false;
            }
            
            // Enrichir l'erreur avec des informations contextuelles
            const enrichedError = new Error(`${errorMessage} (${selectedOrgConfig.name})`);
            enrichedError.originalError = error;
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
            console.log(`📂 Organisation sauvegardée: ${selectedOrgConfig.name}`);
            
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
                updateLoadingStatus('Sélection de l\'organisation...');
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
        console.log('Organisation sauvegardée supprimée');
    } catch (error) {
        console.error('Erreur lors de la suppression de l\'organisation:', error);
    }
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
                    <strong>Problème de connexion :</strong> ${errorMessage}
                    <br><small>Veuillez sélectionner une organisation pour réessayer.</small>
                </div>
            `;
        }
        
        const selectorHTML = `
            <div id="orgSelectorModal" class="modal fade" data-backdrop="static" data-keyboard="false" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h4 class="modal-title">
                                <i class="fa fa-building"></i> Sélection de l'Organisation Genesys Cloud
                            </h4>
                        </div>
                        <div class="modal-body">
                            ${errorHtml}
                            <p>Veuillez sélectionner votre organisation Genesys Cloud :</p>
                            <div class="org-list">
                                ${Object.keys(ORG_CONFIGS).map(orgKey => `
                                    <div class="org-option" data-org="${orgKey}">
                                        <div class="org-card">
                                            <h5>${ORG_CONFIGS[orgKey].name}</h5>
                                            <p class="text-muted">${ORG_CONFIGS[orgKey].description}</p>
                                            <small class="text-info">Région: ${ORGREGION}</small>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                            
                            <div class="checkbox" style="margin-top: 15px;">
                                <label>
                                    <input type="checkbox" id="rememberOrg" ${errorMessage ? '' : 'checked'}> 
                                    Se souvenir de ma sélection
                                </label>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary" id="confirmOrgBtn" disabled>
                                <i class="fa fa-sign-in"></i> Se connecter
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
    
    $('.org-option').on('click', function() {
        $('.org-option').removeClass('selected');
        $(this).addClass('selected');
        
        selectedOrg = $(this).data('org');
        $('#confirmOrgBtn').prop('disabled', false);
    });
    
    // Double-clic pour sélection rapide
    $('.org-option').on('dblclick', function() {
        selectedOrg = $(this).data('org');
        processOrgSelection();
    });
    
    // Gestionnaire de clic pour le bouton de confirmation
    $('#confirmOrgBtn').on('click', processOrgSelection);
    
    function processOrgSelection() {
        if (!selectedOrg) {
            alert('Veuillez sélectionner une organisation');
            return;
        }
        
        try {
            selectedOrgConfig = ORG_CONFIGS[selectedOrg];
            
            // Sauvegarder si demandé
            if ($('#rememberOrg').is(':checked')) {
                saveOrganization(selectedOrg);
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
                updateLoadingStatus('Authentification en cours...');
            }
            
            // Procéder à l'authentification
            proceedWithAuthentication()
                .then((result) => {
                    // Supprimer la modal du DOM
                    setTimeout(() => $('#orgSelectorModal').remove(), 500);
                    resolve(result);
                })
                .catch((error) => {
                    // Supprimer la modal du DOM
                    setTimeout(() => $('#orgSelectorModal').remove(), 500);
                    reject(error);
                });
                
        } catch (error) {
            console.error('Erreur lors du traitement de la sélection:', error);
            reject(error);
        }
    }
}







// Cache global pour les données Genesys
let dataTablesCache = [];
let queuesCache = [];
let skillsCache = [];
let promptsCache = [];
let scheduleGroupsCache = [];

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
            console.log(`  - Skills: ${promptsCache.length}`);
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

// Récupération complète des lignes d'une DataTable
function getAllDataTableRows(datatableId) {
    return getAllWithPagination(
        (opts) => architectApi.getFlowsDatatableRows(datatableId, opts),
        `DataTable ${datatableId} rows`
    ).then((result) => {
        return result.entities;
    });
}

// Fonction utilitaire pour récupérer le nom d'une DataTable par ID
function getDataTableNameById(id) {
    const dataTable = dataTablesCache.find(dt => dt.id === id);
    return dataTable ? dataTable.name : 'DataTable inconnue';
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
    if (confirm('Voulez-vous changer d\'organisation ? Cela rechargera l\'application.')) {
        clearSavedOrganization();
        window.location.reload();
    }
}
