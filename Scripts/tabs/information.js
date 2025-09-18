/**
 * information-page.js
 * Page d'informations sur l'organisation Genesys Cloud
 * Auteur: PS Genesys - Matthieu FRYS
 * Date: 05/2025
 */

/**
 * Initialisation de la page Information
 */
function initializeInformationPage() {
    console.log('📊 Initialisation de la page Information');
    
    // Mettre à jour les compteurs
    updateInformationCounters();
    
    // Mettre à jour les informations détaillées
    updateDetailedInformation();
    
    // Créer le graphique des ressources
    createResourcesChart();
}

/**
 * Mise à jour des compteurs
 */
function updateInformationCounters() {
    // Mettre à jour les compteurs avec animation
    animateCounter('dataTablesCount', dataTablesCache.length);
    animateCounter('queuesCount', queuesCache.length);
    animateCounter('skillsCount', skillsCache.length);
    animateCounter('promptsCount', promptsCache.length);
}

/**
 * Animation des compteurs
 */
function animateCounter(elementId, targetValue) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    let currentValue = 0;
    const increment = Math.ceil(targetValue / 20);
    const timer = setInterval(() => {
        currentValue += increment;
        if (currentValue >= targetValue) {
            currentValue = targetValue;
            clearInterval(timer);
        }
        element.textContent = currentValue.toLocaleString();
    }, 50);
}

/**
 * Mise à jour des informations détaillées
 */
function updateDetailedInformation() {
    // Région
    const orgRegionElement = document.getElementById('orgRegion');
    if (orgRegionElement) {
        orgRegionElement.textContent = ORGREGION || 'Non définie';
    }
    
    // Utilisateur actuel
    const userNameElement = document.getElementById('currentUserName');
    const userIdElement = document.getElementById('currentUserIdDisplay');
    const orgNameElement = document.getElementById('orgName');
    
    if (appState.currentUser) {
        if (userNameElement) {
            userNameElement.textContent = appState.currentUser.name || 'Nom non disponible';
        }
        if (userIdElement) {
            userIdElement.textContent = appState.currentUser.id || 'ID non disponible';
        }
        if (orgNameElement) {
            orgNameElement.textContent = appState.currentUser.selectedOrgConfig.name || 'Org Name non disponible';
        }
    }
    
    // Dernière synchronisation
    const lastSyncElement = document.getElementById('lastSyncTime');
    if (lastSyncElement) {
        lastSyncElement.textContent = new Date().toLocaleString();
    }
}

/**
 * Création du graphique des ressources
 */
function createResourcesChart() {
    const chartContainer = document.getElementById('resourcesChart');
    if (!chartContainer) return;
    
    const data = [
        { label: 'DataTables', value: dataTablesCache.length, color: '#3c8dbc' },
        { label: 'Queues', value: queuesCache.length, color: '#00a65a' },
        { label: 'Skills', value: skillsCache.length, color: '#f39c12' },
        { label: 'Prompts', value: promptsCache.length, color: '#dd4b39' }
    ];
    
    // Créer un graphique simple avec des barres
    let chartHTML = '<div class="progress-group">';
    
    const total = data.reduce((sum, item) => sum + item.value, 0);
    
    data.forEach(item => {
        const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
        chartHTML += `
            <div style="margin-bottom: 15px;">
                <span class="progress-text">${item.label}: ${item.value}</span>
                <span class="float-right"><b>${percentage}%</b></span>
                <div class="progress progress-sm">
                    <div class="progress-bar" style="width: ${percentage}%; background-color: ${item.color}"></div>
                </div>
            </div>
        `;
    });
    
    chartHTML += '</div>';
    chartContainer.innerHTML = chartHTML;
}

/**
 * Actualisation de la page Information
 */
function refreshInformationPage() {
    console.log('🔄 Actualisation de la page Information');
    
    // Réinitialiser les compteurs
    updateInformationCounters();
    updateDetailedInformation();
    createResourcesChart();
    
    // Animation de confirmation
    const refreshButton = event.target;
    const originalHTML = refreshButton.innerHTML;
    refreshButton.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
    
    setTimeout(() => {
        refreshButton.innerHTML = originalHTML;
    }, 1000);
}

/**
 * Export du résumé de l'organisation
 */
function exportOrganizationSummary() {
    const summary = {
        timestamp: new Date().toISOString(),
        organization: {
            region: ORGREGION,
            user: appState.currentUser
        },
        statistics: {
            dataTables: dataTablesCache.length,
            queues: queuesCache.length,
            skills: skillsCache.length,
            prompts: promptsCache.length
        },
        details: {
            dataTables: dataTablesCache.map(dt => ({ id: dt.id, name: dt.name })),
            queues: queuesCache.map(q => ({ id: q.id, name: q.name })),
            skills: skillsCache.map(s => ({ id: s.id, name: s.name })),
            prompts: promptsCache.map(p => ({ id: p.id, name: p.name }))
        }
    };
    
    const dataStr = JSON.stringify(summary, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `genesys-org-summary-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    console.log('📤 Résumé de l\'organisation exporté');
}

/**
 * Affichage des statistiques détaillées
 */
function showDetailedStatistics() {
    const detailedStats = document.getElementById('detailedStats');
    if (!detailedStats) return;
    
    if (detailedStats.style.display === 'none') {
        detailedStats.innerHTML = generateDetailedStatsHTML();
        detailedStats.style.display = 'block';
        event.target.innerHTML = '<i class="fa fa-chart-bar"></i> Masquer Statistiques';
    } else {
        detailedStats.style.display = 'none';
        event.target.innerHTML = '<i class="fa fa-chart-bar"></i> Statistiques Détaillées';
    }
}

/**
 * Génération du HTML des statistiques détaillées
 */
function generateDetailedStatsHTML() {
    return `
        <div class="row" style="margin-top: 20px;">
            <div class="col-md-3">
                <h4>DataTables Top 10</h4>
                <ul class="list-unstyled">
                    ${dataTablesCache.slice(0, 10).map(dt => `<li><small>${dt.name}</small></li>`).join('')}
                </ul>
            </div>
            <div class="col-md-3">
                <h4>Queues Top 10</h4>
                <ul class="list-unstyled">
                    ${queuesCache.slice(0, 10).map(q => `<li><small>${q.name}</small></li>`).join('')}
                </ul>
            </div>
            <div class="col-md-3">
                <h4>Skills Top 10</h4>
                <ul class="list-unstyled">
                    ${skillsCache.slice(0, 10).map(s => `<li><small>${s.name}</small></li>`).join('')}
                </ul>
            </div>
            <div class="col-md-3">
                <h4>Prompts Top 10</h4>
                <ul class="list-unstyled">
                    ${promptsCache.slice(0, 10).map(p => `<li><small>${p.name}</small></li>`).join('')}
                </ul>
            </div>
        </div>
    `;
}

/**
 * Actualisation de toutes les données
 */
function refreshAllData() {
    if (confirm('Actualiser toutes les données ? Cette opération peut prendre quelques secondes.')) {
        // Afficher le loading
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
        }
        
        // Recharger toutes les données
        loadAllGenesysData()
            .then(() => {
                // Actualiser l'affichage
                refreshInformationPage();
                hideLoading();
                alert('✅ Données actualisées avec succès !');
            })
            .catch((error) => {
                hideLoading();
                alert('❌ Erreur lors de l\'actualisation des données');
                console.error(error);
            });
    }
}
