

//############################        START CONFIG        #############################


// Chargement d'une configuration existante - Version mise à jour
function loadExistingConfiguration(datatableId) {
    const config = dataTableConfigurations[datatableId];
    if (!config || !config.columns) return;
    
    Object.keys(config.columns).forEach(columnName => {
        const columnConfig = config.columns[columnName];
        const typeSelect = document.querySelector(`.column-type[data-column="${columnName}"]`);
        
        if (typeSelect) {
            typeSelect.value = columnConfig.type;
            
            // Déclencher l'événement change pour afficher les bons sélecteurs
            typeSelect.dispatchEvent(new Event('change'));
            
            // Charger les valeurs spécifiques selon le type
            if (columnConfig.type === 'liaison' && columnConfig.liaisonTarget) {
                const liaisonSelect = document.querySelector(`.liaison-target[data-column="${columnName}"]`);
                if (liaisonSelect) {
                    liaisonSelect.value = columnConfig.liaisonTarget;
                }
            } else if (columnConfig.type === 'liaison_auto' && columnConfig.liaisonAutoColumn) {
                const liaisonAutoSelect = document.querySelector(`.liaison-auto-column[data-column="${columnName}"]`);
                if (liaisonAutoSelect) {
                    liaisonAutoSelect.value = columnConfig.liaisonAutoColumn;
                }
            } else if (columnConfig.type === 'liste' && columnConfig.listeValues) {
                const listeTextarea = document.querySelector(`.liste-values[data-column="${columnName}"]`);
                const allowNullCheckbox = document.querySelector(`.liste-allow-null[data-column="${columnName}"]`);
                const ignoreCaseCheckbox = document.querySelector(`.liste-ignore-case[data-column="${columnName}"]`);
                if (listeTextarea) {
                    listeTextarea.value = columnConfig.listeValues.join(';');
                    // Déclencher l'événement input pour mettre à jour l'aperçu
                    listeTextarea.dispatchEvent(new Event('input'));
                }
                if (allowNullCheckbox) {
                    allowNullCheckbox.checked = columnConfig.allowNull || false;
                    allowNullCheckbox.dispatchEvent(new Event('change'));
                }
                if (ignoreCaseCheckbox) {
                    ignoreCaseCheckbox.checked = columnConfig.ignoreCase || false;
                    ignoreCaseCheckbox.dispatchEvent(new Event('change'));
                }
            } else if (columnConfig.type === 'regex' && columnConfig.regexPattern) {
                const regexInput = document.querySelector(`.regex-pattern[data-column="${columnName}"]`);
                const descriptionInput = document.querySelector(`.regex-description[data-column="${columnName}"]`);
                const allowNullCheckbox = document.querySelector(`.regex-allow-null[data-column="${columnName}"]`);
                
                if (regexInput) {
                    regexInput.value = columnConfig.regexPattern;
                }
                
                if (descriptionInput) {
                    descriptionInput.value = columnConfig.regexDescription || '';
                }
                
                if (allowNullCheckbox) {
                    allowNullCheckbox.checked = columnConfig.allowNull || false;
                }
            }
        }
    });
    
    console.log('📂 Configuration existante chargée pour:', datatableId);
}


// Sauvegarde de la configuration - Version mise à jour
function saveConfiguration() {
    const datatableId = document.getElementById('datatableSelector').value;
    if (!datatableId) {
        alert('Veuillez sélectionner une DataTable');
        return;
    }
    
    const configuration = {
        datatableId: datatableId,
        columns: {}
    };
    
    document.querySelectorAll('.column-type').forEach(select => {
        const columnName = select.getAttribute('data-column');
        const columnType = select.value;
        
        if (columnType) {
            configuration.columns[columnName] = { type: columnType };
            
            if (columnType === 'liaison') {
                const liaisonTarget = document.querySelector(`.liaison-target[data-column="${columnName}"]`);
                if (liaisonTarget && liaisonTarget.value) {
                    configuration.columns[columnName].liaisonTarget = liaisonTarget.value;
                }
            } else if (columnType === 'liaison_auto') {
                const liaisonAutoColumn = document.querySelector(`.liaison-auto-column[data-column="${columnName}"]`);
                if (liaisonAutoColumn && liaisonAutoColumn.value) {
                    configuration.columns[columnName].liaisonAutoColumn = liaisonAutoColumn.value;
                }
            } else if (columnType === 'liste') {
                const listeTextarea = document.querySelector(`.liste-values[data-column="${columnName}"]`);
                const allowNullCheckbox = document.querySelector(`.liste-allow-null[data-column="${columnName}"]`);
                const ignoreCaseCheckbox = document.querySelector(`.liste-ignore-case[data-column="${columnName}"]`);
                if (listeTextarea && listeTextarea.value.trim()) {
                    const values = parseListeValues(listeTextarea.value);
                    if (values.length > 0) {
                        configuration.columns[columnName].listeValues = values;
                        // Ajouter l'option pour les valeurs null
                        configuration.columns[columnName].allowNull = allowNullCheckbox ? allowNullCheckbox.checked : false;
                        // Ajouter l'option pour la casse
                        configuration.columns[columnName].ignoreCase = ignoreCaseCheckbox ? ignoreCaseCheckbox.checked : false;
                    } else {
                        alert(`Veuillez saisir au moins une valeur pour la colonne "${columnName}"`);
                        listeTextarea.focus();
                        return;
                    }
                } else {
                    alert(`Veuillez configurer les valeurs possibles pour la colonne "${columnName}"`);
                    return;
                }
            } else if (columnType === 'regex') {
                const regexInput = document.querySelector(`.regex-pattern[data-column="${columnName}"]`);
                const descriptionInput = document.querySelector(`.regex-description[data-column="${columnName}"]`);
                const allowNullCheckbox = document.querySelector(`.regex-allow-null[data-column="${columnName}"]`);
                
                if (regexInput && regexInput.value.trim()) {
                    const pattern = regexInput.value.trim();
                    
                    // Valider l'expression régulière
                    try {
                        new RegExp(pattern);
                        configuration.columns[columnName].regexPattern = pattern;
                        configuration.columns[columnName].regexDescription = descriptionInput ? descriptionInput.value.trim() : '';
                        configuration.columns[columnName].allowNull = allowNullCheckbox ? allowNullCheckbox.checked : false;
                    } catch (error) {
                        alert(`Expression régulière invalide pour la colonne "${columnName}": ${error.message}`);
                        regexInput.focus();
                        hasErrors = true;
                        return;
                    }
                } else {
                    alert(`Veuillez saisir une expression régulière pour la colonne "${columnName}"`);
                    hasErrors = true;
                    return;
                }
            }
        }
    });
    
    // Sauvegarder dans les configurations et les cookies
    dataTableConfigurations[datatableId] = configuration;
    saveConfigurationsToCookie();
    
    alert('✅ Configuration sauvegardée avec succès !');
    
    // Rafraîchir l'affichage des DataTables
    displayDataTables();
    
    console.log('💾 Configuration sauvegardée pour:', datatableId);
}



// Gestion des cookies
function saveConfigurationsToCookie() {
    const configString = JSON.stringify(dataTableConfigurations);
    const expirationDate = new Date();
    expirationDate.setTime(expirationDate.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 an
    
    document.cookie = `genesysDataTableConfigs=${configString}; expires=${expirationDate.toUTCString()}; path=/`;
}

function loadSavedConfigurations() {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.split('=').map(c => c.trim());
        if (name === 'genesysDataTableConfigs') {
            try {
                dataTableConfigurations = JSON.parse(decodeURIComponent(value));
            } catch (e) {
                console.error('Erreur lors du chargement des configurations:', e);
            }
            break;
        }
    }
}

/**
 * Gestion de l'affichage de la section import/export
 */
function toggleImportExportSection() {
    const section = document.getElementById('importExportSection');
    const button = event.target;
    
    if (section.style.display === 'none') {
        section.style.display = 'block';
        button.innerHTML = '<i class="fa fa-times"></i> Fermer Import/Export';
        updateCurrentConfigInfo();
    } else {
        section.style.display = 'none';
        button.innerHTML = '<i class="fa fa-exchange"></i> Gérer Import/Export';
    }
}

/**
 * Mise à jour des informations sur la configuration actuelle
 */
function updateCurrentConfigInfo() {
    const configuredTablesCount = Object.keys(dataTableConfigurations).length;
    const liaisonMappingsCount = Object.keys(LIAISON_MAPPING).length;
    
    document.getElementById('configuredTablesCount').textContent = configuredTablesCount;
    document.getElementById('liaisonMappingsCount').textContent = liaisonMappingsCount;
    
    // Récupérer la date de dernière sauvegarde depuis les cookies
    const lastSave = getLastSaveTime();
    document.getElementById('lastSaveTime').textContent = lastSave || 'Jamais';
}

/**
 * Export complet de la configuration
 */
function exportCompleteConfiguration() {
    try {
        const exportOptions = {
            dataTableConfigs: document.getElementById('exportDataTableConfigs').checked,
            liaisonMapping: document.getElementById('exportLiaisonMapping').checked,
            metadata: document.getElementById('exportMetadata').checked
        };
        
        console.log('🚀 Début de l\'export de configuration complète...');
        
        // Construire l'objet de configuration
        const exportData = {
            formatVersion: "1.0",
            exportTimestamp: new Date().toISOString(),
            application: {
                name: "Genesys DataTables Controller",
                version: "1.0",
                author: "PS Genesys - Matthieu FRYS"
            }
        };
        
        // Ajouter les métadonnées si demandées
        if (exportOptions.metadata) {
            exportData.metadata = {
                currentUserId: currentUserId || 'unknown',
                orgRegion: ORGREGION || 'unknown',
                exportedBy: currentUserId || 'unknown',
                totalDataTables: dataTablesCache.length,
                totalQueues: queuesCache.length,
                totalSkills: skillsCache.length,
                totalScheduleGroups: scheduleGroupsCache.length
            };
        }
        
        // Ajouter les configurations des DataTables si demandées
        if (exportOptions.dataTableConfigs) {
            exportData.dataTableConfigurations = {};
            
            Object.keys(dataTableConfigurations).forEach(datatableId => {
                const config = dataTableConfigurations[datatableId];
                const datatableName = getDataTableNameById(datatableId);
                
                exportData.dataTableConfigurations[datatableId] = {
                    datatableName: datatableName,
                    configuration: config,
                    exportTimestamp: new Date().toISOString()
                };
            });
            
            console.log(`📊 ${Object.keys(exportData.dataTableConfigurations).length} configurations de DataTables exportées`);
        }
        
        // Ajouter le mapping des liaisons si demandé
        if (exportOptions.liaisonMapping) {
            exportData.liaisonMapping = {};
            
            Object.keys(LIAISON_MAPPING).forEach(key => {
                const datatableId = LIAISON_MAPPING[key];
                const datatableName = getDataTableNameById(datatableId);
                
                exportData.liaisonMapping[key] = {
                    datatableId: datatableId,
                    datatableName: datatableName
                };
            });
            
            console.log(`🔗 ${Object.keys(exportData.liaisonMapping).length} mappings de liaisons exportés`);
        }
        
        // Statistiques de l'export
        exportData.statistics = {
            totalConfigurations: Object.keys(dataTableConfigurations).length,
            totalMappings: Object.keys(LIAISON_MAPPING).length,
            configurationsByType: getConfigurationStatistics()
        };
        
        // Créer et télécharger le fichier
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `genesys-datatables-config-complete-${timestamp}.json`;
        link.download = filename;
        
        link.click();
        
        // Sauvegarder la date d'export
        saveLastExportTime();
        
        alert(`✅ Configuration exportée avec succès dans le fichier: ${filename}`);
        console.log('✅ Export terminé avec succès');
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'export:', error);
        alert('Erreur lors de l\'export de la configuration. Consultez la console pour plus de détails.');
    }
}

/**
 * Statistiques des configurations par type
 */
function getConfigurationStatistics() {
    const stats = {
        queue: 0,
        skill: 0,
        schedulegroup: 0,
        liaison: 0,
        liaison_auto: 0,
        liste: 0
    };
    
    Object.values(dataTableConfigurations).forEach(config => {
        if (config.columns) {
            Object.values(config.columns).forEach(columnConfig => {
                if (stats.hasOwnProperty(columnConfig.type)) {
                    stats[columnConfig.type]++;
                }
            });
        }
    });
    
    return stats;
}
/**
 * Import complet de configuration
 */
function importCompleteConfiguration(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    console.log('📥 Début de l\'import de configuration...');
    
    showImportProgress(0, 'Lecture du fichier...');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            showImportProgress(20, 'Analyse du fichier JSON...');
            
            const importedData = JSON.parse(e.target.result);
            
            // Validation du format
            if (!validateImportData(importedData)) {
                throw new Error('Format de fichier invalide ou incompatible');
            }
            
            showImportProgress(40, 'Validation des données...');
            
            // Obtenir le mode d'import
            const importMode = document.querySelector('input[name="importMode"]:checked').value;
            
            // Sauvegarder la configuration actuelle en cas de rollback
            const backupConfig = {
                dataTableConfigurations: { ...dataTableConfigurations },
                liaisonMapping: { ...LIAISON_MAPPING }
            };
            
            showImportProgress(60, 'Application de la configuration...');
            
            // Appliquer l'import selon le mode
            if (importMode === 'replace') {
                applyReplaceImport(importedData);
            } else {
                applyMergeImport(importedData);
            }
            
            showImportProgress(80, 'Sauvegarde...');
            
            // Sauvegarder dans les cookies
            saveConfigurationsToCookie();
            saveLiaisonMappingToCookie();
            
            showImportProgress(100, 'Import terminé !');
            
            // Rafraîchir l'interface
            setTimeout(() => {
                hideImportProgress();
                updateCurrentConfigInfo();
                setupDataTableSelector();
                displayDataTables();
                
                const summary = generateImportSummary(importedData, importMode);
                showImportResultDialog(summary, true);
                
                console.log('✅ Import terminé avec succès');
            }, 1000);
            
        } catch (error) {
            console.error('❌ Erreur lors de l\'import:', error);
            hideImportProgress();
            showImportResultDialog(`Erreur lors de l'import: ${error.message}`, false);
        }
    };
    
    reader.onerror = function() {
        hideImportProgress();
        alert('Erreur lors de la lecture du fichier');
    };
    
    reader.readAsText(file);
    
    // Réinitialiser l'input file
    event.target.value = '';
}

/**
 * Validation des données importées
 */
function validateImportData(data) {
    // Vérifications de base
    if (!data || typeof data !== 'object') {
        console.error('❌ Données d\'import invalides');
        return false;
    }
    
    // Vérifier la version du format
    if (!data.formatVersion) {
        console.warn('⚠️ Version du format non spécifiée, tentative d\'import...');
    }
    
    // Vérifier la présence d'au moins une section
    const hasDataTableConfigs = data.dataTableConfigurations && typeof data.dataTableConfigurations === 'object';
    const hasLiaisonMapping = data.liaisonMapping && typeof data.liaisonMapping === 'object';
    
    if (!hasDataTableConfigs && !hasLiaisonMapping) {
        console.error('❌ Aucune configuration valide trouvée dans le fichier');
        return false;
    }
    
    console.log('✅ Validation du fichier d\'import réussie');
    return true;
}

/**
 * Application de l'import en mode remplacement
 */
function applyReplaceImport(importedData) {
    console.log('🔄 Application de l\'import en mode remplacement...');
    
    // Vider les configurations existantes
    Object.keys(dataTableConfigurations).forEach(key => {
        delete dataTableConfigurations[key];
    });
    
    Object.keys(LIAISON_MAPPING).forEach(key => {
        delete LIAISON_MAPPING[key];
    });
    
    // Appliquer les nouvelles configurations
    applyImportedConfigurations(importedData);
}

/**
 * Application de l'import en mode fusion
 */
function applyMergeImport(importedData) {
    console.log('🔄 Application de l\'import en mode fusion...');
    
    // Fusionner avec les configurations existantes
    applyImportedConfigurations(importedData);
}

/**
 * Application des configurations importées
 */
function applyImportedConfigurations(importedData) {
    let importedConfigs = 0;
    let importedMappings = 0;
    
    // Importer les configurations de DataTables
    if (importedData.dataTableConfigurations) {
        Object.keys(importedData.dataTableConfigurations).forEach(datatableId => {
            const importedConfig = importedData.dataTableConfigurations[datatableId];
            
            if (importedConfig.configuration) {
                dataTableConfigurations[datatableId] = importedConfig.configuration;
                importedConfigs++;
                console.log(`📋 Configuration importée pour: ${importedConfig.datatableName || datatableId}`);
            }
        });
    }
    
    // Importer le mapping des liaisons
    if (importedData.liaisonMapping) {
        Object.keys(importedData.liaisonMapping).forEach(key => {
            const mapping = importedData.liaisonMapping[key];
            
            if (mapping.datatableId) {
                LIAISON_MAPPING[key] = mapping.datatableId;
                importedMappings++;
                console.log(`🔗 Mapping importé: ${key} -> ${mapping.datatableName || mapping.datatableId}`);
            }
        });
    }
    
    console.log(`✅ Import appliqué: ${importedConfigs} configurations, ${importedMappings} mappings`);
}

/**
 * Génération du résumé d'import
 */
function generateImportSummary(importedData, importMode) {
    const configCount = importedData.dataTableConfigurations ? 
        Object.keys(importedData.dataTableConfigurations).length : 0;
    const mappingCount = importedData.liaisonMapping ? 
        Object.keys(importedData.liaisonMapping).length : 0;
    
    let summary = `Import terminé avec succès!\n\n`;
    summary += `Mode: ${importMode === 'replace' ? 'Remplacement' : 'Fusion'}\n`;
    summary += `Configurations de DataTables: ${configCount}\n`;
    summary += `Mappings de liaisons: ${mappingCount}\n`;
    
    if (importedData.metadata) {
        summary += `\nMétadonnées:\n`;
        summary += `- Exporté par: ${importedData.metadata.exportedBy || 'Inconnu'}\n`;
        summary += `- Date d'export: ${importedData.exportTimestamp ? new Date(importedData.exportTimestamp).toLocaleString() : 'Inconnue'}\n`;
    }
    
    return summary;
}

/**
 * Affichage de la barre de progression d'import
 */
function showImportProgress(percent, message) {
    const progressDiv = document.getElementById('importProgress');
    const progressBar = progressDiv.querySelector('.progress-bar');
    const progressText = progressDiv.querySelector('.progress-text');
    
    progressDiv.style.display = 'block';
    progressBar.style.width = percent + '%';
    progressText.textContent = `${percent}% - ${message}`;
}

/**
 * Masquer la barre de progression
 */
function hideImportProgress() {
    const progressDiv = document.getElementById('importProgress');
    progressDiv.style.display = 'none';
}

/**
 * Affichage du résultat d'import
 */
function showImportResultDialog(message, isSuccess) {
    const icon = isSuccess ? '✅' : '❌';
    const title = isSuccess ? 'Import Réussi' : 'Erreur d\'Import';
    
    alert(`${icon} ${title}\n\n${message}`);
}

/**
 * Gestion des dates de sauvegarde
 */
function saveLastExportTime() {
    const now = new Date().toISOString();
    document.cookie = `lastExportTime=${now}; path=/; max-age=31536000`; // 1 an
}

function getLastSaveTime() {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.split('=').map(c => c.trim());
        if (name === 'lastExportTime' && value) {
            return new Date(value).toLocaleString();
        }
    }
    return null;
}

/**
 * Validation de la compatibilité des DataTables
 */
function validateDataTableCompatibility(importedConfigs) {
    const incompatibleTables = [];
    
    Object.keys(importedConfigs).forEach(datatableId => {
        // Vérifier si la DataTable existe dans l'organisation actuelle
        const exists = dataTablesCache.some(dt => dt.id === datatableId);
        if (!exists) {
            incompatibleTables.push({
                id: datatableId,
                name: importedConfigs[datatableId].datatableName || 'Nom inconnu'
            });
        }
    });
    
    return incompatibleTables;
}


/**
 * Export sélectif par DataTable
 */
function exportSpecificDataTable(datatableId) {
    const config = dataTableConfigurations[datatableId];
    if (!config) {
        alert('Aucune configuration trouvée pour cette DataTable');
        return;
    }
    
    const datatableName = getDataTableNameById(datatableId);
    
    const exportData = {
        formatVersion: "1.0",
        exportTimestamp: new Date().toISOString(),
        application: {
            name: "Genesys DataTables Controller",
            version: "1.0"
        },
        dataTableConfiguration: {
            [datatableId]: {
                datatableName: datatableName,
                configuration: config,
                exportTimestamp: new Date().toISOString()
            }
        }
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `genesys-datatable-${datatableName.replace(/[^a-zA-Z0-9]/g, '_')}-config.json`;
    link.click();
    
    console.log(`✅ Configuration exportée pour: ${datatableName}`);
}




//############################        FIN CONFIG        #############################




//############################        START MAPPING        #############################


const LIAISON_MAPPING = {
    // Format: 'VALEUR_DANS_COLONNE_REFERENCE': 'ID_DATATABLE_CIBLE'
    //'MENU': '8c70b169-1233-4878-8d3e-11a71dcd1c2a',
    //'ROUTING': '9e26dac4-f77f-4bd9-8145-1b89853c8b6f',
    //'VOCAL': '87a62cf3-6730-483b-b22f-3896c8e6ec6b'
};

// Variables pour gérer les modifications temporaires
let tempLiaisonMapping = {};
let mappingDisplayed = false;

// Fonction pour afficher/masquer la section de gestion du mapping
function toggleMappingDisplay() {
    const mappingDiv = document.getElementById('mappingManagement');
    
    if (!mappingDisplayed) {
        // Copier le mapping actuel dans la version temporaire
        tempLiaisonMapping = { ...LIAISON_MAPPING };
        
        // Mettre à jour le sélecteur de datatables
        updateMappingDataTableSelector();
        
        // Afficher le mapping actuel
        displayCurrentMapping();
        
        mappingDiv.style.display = 'block';
        mappingDisplayed = true;
        
        // Changer le texte du bouton
        event.target.innerHTML = '<i class="fa fa-times"></i> Fermer';
    } else {
        mappingDiv.style.display = 'none';
        mappingDisplayed = false;
        
        // Restaurer le texte du bouton
        event.target.innerHTML = '<i class="fa fa-cog"></i> Gérer le Mapping';
    }
}

// Fonction pour mettre à jour le sélecteur de datatables dans la section mapping
function updateMappingDataTableSelector() {
    const selector = document.getElementById('newMappingDataTable');
    selector.innerHTML = '<option value="">Sélectionner une DataTable...</option>';
    
    dataTablesCache.forEach(dataTable => {
        const option = document.createElement('option');
        option.value = dataTable.id;
        option.textContent = dataTable.name;
        selector.appendChild(option);
    });
    
    // Réinitialiser Select2 si nécessaire
    $('#newMappingDataTable').select2();
}

// Fonction pour afficher le mapping actuel
function displayCurrentMapping() {
    const mappingList = document.getElementById('currentMappingList');
    mappingList.innerHTML = '';
    
    if (Object.keys(tempLiaisonMapping).length === 0) {
        mappingList.innerHTML = '<p class="text-muted"><i class="fa fa-info-circle"></i> Aucun mapping configuré</p>';
        return;
    }
    
    Object.keys(tempLiaisonMapping).forEach(key => {
        const datatableId = tempLiaisonMapping[key];
        const datatableName = getDataTableNameById(datatableId);
        
        const mappingRow = document.createElement('div');
        mappingRow.className = 'mapping-row';
        mappingRow.innerHTML = `
            <div class="row">
                <div class="col-md-4">
                    <span class="mapping-key">${key}</span>
                </div>
                <div class="col-md-6">
                    <span class="mapping-datatable">${datatableName}</span>
                    <small class="text-muted">(${datatableId})</small>
                </div>
                <div class="col-md-2 text-right">
                    <button type="button" class="btn-remove-mapping" onclick="removeMappingKey('${key}')" 
                            title="Supprimer ce mapping">
                        <i class="fa fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        
        mappingList.appendChild(mappingRow);
    });
}

// Fonction pour ajouter un nouveau mapping
function addNewMapping() {
    const keyInput = document.getElementById('newMappingKey');
    const datatableSelect = document.getElementById('newMappingDataTable');
    
    const newKey = keyInput.value.trim().toUpperCase();
    const selectedDataTable = datatableSelect.value;
    
    // Validation
    if (!newKey) {
        alert('Veuillez saisir une valeur de référence');
        keyInput.focus();
        return;
    }
    
    if (!selectedDataTable) {
        alert('Veuillez sélectionner une DataTable');
        datatableSelect.focus();
        return;
    }
    
    // Vérifier si la clé existe déjà
    if (tempLiaisonMapping[newKey]) {
        if (!confirm(`La valeur "${newKey}" existe déjà. Voulez-vous la remplacer ?`)) {
            return;
        }
    }
    
    // Ajouter le nouveau mapping
    tempLiaisonMapping[newKey] = selectedDataTable;
    
    // Réinitialiser les champs
    keyInput.value = '';
    datatableSelect.value = '';
    $('#newMappingDataTable').trigger('change'); // Pour Select2
    
    // Rafraîchir l'affichage
    displayCurrentMapping();
    
    console.log(`Nouveau mapping ajouté: ${newKey} -> ${selectedDataTable}`);
}

// Fonction pour supprimer un mapping
function removeMappingKey(key) {
    if (confirm(`Êtes-vous sûr de vouloir supprimer le mapping "${key}" ?`)) {
        delete tempLiaisonMapping[key];
        displayCurrentMapping();
        console.log(`Mapping supprimé: ${key}`);
    }
}

// Fonction pour sauvegarder les modifications du mapping
function saveMappingConfiguration() {
    if (Object.keys(tempLiaisonMapping).length === 0) {
        if (!confirm('Aucun mapping configuré. Voulez-vous vraiment vider la configuration ?')) {
            return;
        }
    }
    
    // Appliquer les modifications au mapping principal
    Object.keys(LIAISON_MAPPING).forEach(key => {
        delete LIAISON_MAPPING[key];
    });
    
    Object.keys(tempLiaisonMapping).forEach(key => {
        LIAISON_MAPPING[key] = tempLiaisonMapping[key];
    });
    
    // Sauvegarder dans les cookies
    saveLiaisonMappingToCookie();
    
    alert('Configuration du mapping sauvegardée avec succès !');
    
    // Fermer la section de gestion
    toggleMappingDisplay();
    
    console.log('Mapping sauvegardé:', LIAISON_MAPPING);
}

// Fonction pour annuler les modifications
function cancelMappingChanges() {
    if (confirm('Êtes-vous sûr de vouloir annuler les modifications ?')) {
        // Restaurer le mapping temporaire
        tempLiaisonMapping = { ...LIAISON_MAPPING };
        
        // Rafraîchir l'affichage
        displayCurrentMapping();
        
        // Réinitialiser les champs
        document.getElementById('newMappingKey').value = '';
        document.getElementById('newMappingDataTable').value = '';
        $('#newMappingDataTable').trigger('change');
    }
}

// Fonctions de gestion des cookies pour le mapping
function saveLiaisonMappingToCookie() {
    const mappingString = JSON.stringify(LIAISON_MAPPING);
    const expirationDate = new Date();
    expirationDate.setTime(expirationDate.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 an
    
    document.cookie = `genesysLiaisonMapping=${mappingString}; expires=${expirationDate.toUTCString()}; path=/`;
}

function loadLiaisonMappingFromCookie() {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.split('=').map(c => c.trim());
        if (name === 'genesysLiaisonMapping') {
            try {
                const loadedMapping = JSON.parse(decodeURIComponent(value));
                // Fusionner avec le mapping par défaut
                Object.keys(loadedMapping).forEach(key => {
                    LIAISON_MAPPING[key] = loadedMapping[key];
                });
                console.log('Mapping chargé depuis les cookies:', LIAISON_MAPPING);
            } catch (e) {
                console.error('Erreur lors du chargement du mapping depuis les cookies:', e);
            }
            break;
        }
    }
}

// Fonction pour exporter le mapping (bonus)
function exportMappingConfiguration() {
    const mappingData = {
        timestamp: new Date().toISOString(),
        mapping: LIAISON_MAPPING
    };
    
    const dataStr = JSON.stringify(mappingData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `genesys-liaison-mapping-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
}

// Fonction pour importer le mapping (bonus)
function importMappingConfiguration(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (importedData.mapping) {
                Object.keys(importedData.mapping).forEach(key => {
                    LIAISON_MAPPING[key] = importedData.mapping[key];
                });
                saveLiaisonMappingToCookie();
                alert('Mapping importé avec succès !');
                
                if (mappingDisplayed) {
                    tempLiaisonMapping = { ...LIAISON_MAPPING };
                    displayCurrentMapping();
                }
            }
        } catch (error) {
            alert('Erreur lors de l\'importation : fichier invalide');
            console.error('Erreur d\'importation:', error);
        }
    };
    reader.readAsText(file);
}

// ################################         FIN MAPPING       #######################################