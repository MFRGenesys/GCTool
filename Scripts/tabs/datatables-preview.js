
/**
 * Affichage de l'aperçu des 10 premières lignes d'une DataTable
 */
function displayDataTablePreview(datatableId, datatableName) {
    console.log(`👀 Affichage de l'aperçu in Config pour: ${datatableName}`);
    
    // Créer ou récupérer le conteneur d'aperçu
    let previewDiv = document.getElementById('datatablePreview');
    if (!previewDiv) {
        previewDiv = createDataTablePreviewContainer();
    }
    
    // Afficher un indicateur de chargement
    previewDiv.innerHTML = `
        <div class="box box-info">
            <div class="box-header with-border">
                <h3 class="box-title">
                    <i class="fa fa-eye"></i> Aperçu des données - ${datatableName}
                </h3>
                <div class="box-tools pull-right">
                    <button type="button" class="btn btn-box-tool" onclick="togglePreviewVisibility()">
                        <i class="fa fa-minus"></i>
                    </button>
                </div>
            </div>
            <div class="box-body" id="previewContent">
                <div class="text-center">
                    <i class="fa fa-spinner fa-spin"></i> Chargement des données...
                </div>
            </div>
        </div>
    `;
    
    Promise.all([
        getDataTableRowsWithCache(datatableId),
        getDataTableSchemaWithCache(datatableId)
    ])
    .then(([allRows, dataTableSchema]) => {
            const previewRows = allRows.slice(0,10);
            const columnOrder = getSchemaOrderedColumns(dataTableSchema.schema);
            displayPreviewDataWithOrder(previewRows, datatableName, allRows.length, columnOrder);
        })
        .catch((error) => {
            console.error('❌ Erreur lors de la récupération des données:', error);
            displayPreviewError(error);
        });
}

/**
 * Affichage de l'aperçu des 10 premières lignes d'une DataTable
 */
function displayDataTablePreviewInList(datatableId, datatableName) {
    console.log(`👀 Affichage de l'aperçu in Config pour: ${datatableName}`);
    
    // Créer ou récupérer le conteneur d'aperçu
    let previewDiv = document.getElementById(`configPreview-${datatableId}`);
    //const previewIcon = headerElement.querySelector('.config-icon');

    // Afficher un indicateur de chargement
    previewDiv.innerHTML = `
        <div class="box box-info">
            <div class="box-header with-border">
                <h3 class="box-title">
                    <i class="fa fa-eye"></i> Aperçu des données - ${datatableName}
                </h3>
                <div class="box-tools pull-right">
                    <button type="button" class="btn btn-box-tool" onclick="togglePreviewVisibility()">
                        <i class="fa fa-minus"></i>
                    </button>
                </div>
            </div>
            <div class="box-body" id="previewContent-${datatableId}">
                <div class="text-center">
                    <i class="fa fa-spinner fa-spin"></i> Chargement des données...
                </div>
            </div>
        </div>
    `;
    
    Promise.all([
        getDataTableRowsWithCache(datatableId),
        getDataTableSchemaWithCache(datatableId)
    ])
    .then(([allRows, dataTableSchema]) => {
            const previewRows = allRows.slice(0,10);
            const columnOrder = getSchemaOrderedColumns(dataTableSchema.schema);
            displayPreviewDataWithOrderInList(previewRows,datatableId, datatableName, allRows.length, columnOrder);
        })
        .catch((error) => {
            console.error('❌ Erreur lors de la récupération des données:', error);
            displayPreviewError(error,datatableId);
        });
    
    previewDiv.style.display = 'block';
}

/**
 * Création du conteneur d'aperçu
 */
function createDataTablePreviewContainer() {
    const columnsConfig = document.getElementById('columnsConfig');
    const previewDiv = document.createElement('div');
    previewDiv.id = 'datatablePreview';
    previewDiv.style.marginBottom = '20px';
    
    // Insérer avant la configuration des colonnes
    columnsConfig.parentNode.insertBefore(previewDiv, columnsConfig);
    
    return previewDiv;
}

/**
 * Affichage des données avec ordre des colonnes et slider horizontal
 */
function displayPreviewDataWithOrder(rows, datatableName, totalRows, orderedColumns) {
    const previewContent = document.getElementById(`previewContent`);
    
    if (!rows || rows.length === 0) {
        previewContent.innerHTML = `
            <div class="alert alert-info">
                <i class="fa fa-info-circle"></i> Aucune donnée trouvée dans cette DataTable
            </div>
        `;
        return;
    }
    
    if (!orderedColumns || orderedColumns.length === 0) {
        // Fallback vers l'ancien système si pas de schéma
        const columns = Object.keys(rows[0]);
        orderedColumns = columns.map(name => ({ name, displayOrder: 0, type: 'string' }));
    }
    
    const rowCount = rows.length;
    const totalColumns = orderedColumns.length;
    const maxVisibleColumns = 10;
    let currentColumnOffset = 0;
    
    // Générer le HTML avec slider
    const htmlContent = generatePreviewWithSlider(
        rows, 
        orderedColumns, 
        datatableName, 
        rowCount, 
        totalRows, 
        currentColumnOffset, 
        maxVisibleColumns
    );
    
    previewContent.innerHTML = htmlContent;
    
    // Configurer les événements du slider
    setupColumnSlider(rows, orderedColumns, datatableName, rowCount, totalRows, maxVisibleColumns);
    
    console.log(`✅ Aperçu ordonné affiché: ${rowCount} lignes, ${totalColumns} colonnes (${Math.min(maxVisibleColumns, totalColumns)} visibles)`);
}
/**
 * Affichage des données avec ordre des colonnes et slider horizontal
 */
function displayPreviewDataWithOrderInList(rows,datatableId, datatableName, totalRows, orderedColumns) {
    const previewContent = document.getElementById(`previewContent-${datatableId}`);
    
    if (!rows || rows.length === 0) {
        previewContent.innerHTML = `
            <div class="alert alert-info">
                <i class="fa fa-info-circle"></i> Aucune donnée trouvée dans cette DataTable
            </div>
        `;
        return;
    }
    
    if (!orderedColumns || orderedColumns.length === 0) {
        // Fallback vers l'ancien système si pas de schéma
        const columns = Object.keys(rows[0]);
        orderedColumns = columns.map(name => ({ name, displayOrder: 0, type: 'string' }));
    }
    
    const rowCount = rows.length;
    const totalColumns = orderedColumns.length;
    const maxVisibleColumns = 10;
    let currentColumnOffset = 0;
    
    // Générer le HTML avec slider
    const htmlContent = generatePreviewWithSlider(
        rows, 
        orderedColumns, 
        datatableName, 
        rowCount, 
        totalRows, 
        currentColumnOffset, 
        maxVisibleColumns
    );
    
    previewContent.innerHTML = htmlContent;
    
    // Configurer les événements du slider
    setupColumnSliderInList(rows, orderedColumns,datatableId, datatableName, rowCount, totalRows, maxVisibleColumns);
    
    console.log(`✅ Aperçu ordonné affiché: ${rowCount} lignes, ${totalColumns} colonnes (${Math.min(maxVisibleColumns, totalColumns)} visibles)`);
}

/**
 * Génération du HTML avec slider horizontal
 */
function generatePreviewWithSlider(rows, orderedColumns, datatableName, rowCount, totalRows, columnOffset, maxVisible) {
    const totalColumns = orderedColumns.length;
    const visibleColumns = orderedColumns.slice(columnOffset, columnOffset + maxVisible);
    const hasMoreColumns = totalColumns > maxVisible;
    
    let html = `
        <!-- Contrôles du slider de colonnes -->
        ${hasMoreColumns ? `
        <div class="column-slider-controls" style="margin-bottom: 10px; text-align: center;">
            <div class="btn-group" role="group">
                <button type="button" class="btn btn-xs btn-default" id="prevColumns" 
                        ${columnOffset === 0 ? 'disabled' : ''}>
                    <i class="fa fa-chevron-left"></i> Précédent
                </button>
                <span class="btn btn-xs btn-info" style="cursor: default;">
                    Colonnes ${columnOffset + 1}-${Math.min(columnOffset + maxVisible, totalColumns)} sur ${totalColumns}
                </span>
                <button type="button" class="btn btn-xs btn-default" id="nextColumns"
                        ${columnOffset + maxVisible >= totalColumns ? 'disabled' : ''}>
                    Suivant <i class="fa fa-chevron-right"></i>
                </button>
            </div>
        </div>
        ` : ''}
        
        <!-- Tableau avec colonnes ordonnées -->
        <div class="table-responsive">
            <table class="table table-bordered table-condensed table-hover" style="font-size: 12px; margin-bottom: 0;">
                <thead style="background-color: #f5f5f5;">
                    <tr>
                        <th style="width: 40px; position: sticky; left: 0; background-color: #f5f5f5; z-index: 10;">#</th>
    `;
    
    // En-têtes des colonnes visibles
    visibleColumns.forEach((column, index) => {
        const isKeyColumn = column.name.toLowerCase() === 'key';
        const columnClass = isKeyColumn ? 'sticky-key-column' : '';
        html += `
            <th class="${columnClass}" style="max-width: 150px; word-wrap: break-word; ${isKeyColumn ? 'background-color: #e8f4fd;' : ''}">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span>${column.name}</span>
                    <small class="text-muted" style="margin-left: 5px;">#${column.displayOrder}</small>
                </div>
                <small class="text-info" style="font-weight: normal;">${column.type}</small>
            </th>
        `;
    });
    
    html += `</tr></thead><tbody>`;
    
    // Lignes de données
    rows.forEach((row, index) => {
        html += `<tr>`;
        html += `<td style="text-align: center; background-color: #f9f9f9; position: sticky; left: 0; z-index: 5;"><strong>${index + 1}</strong></td>`;
        
        visibleColumns.forEach(column => {
            let cellValue = row[column.name];
            const isKeyColumn = column.name.toLowerCase() === 'key';
            const cellClass = isKeyColumn ? 'sticky-key-column' : '';
            
            // Formatage de la valeur
            if (cellValue === null || cellValue === undefined) {
                cellValue = '<span class="text-muted"><em>null</em></span>';
            } else if (typeof cellValue === 'string' && cellValue.length > 50) {
                cellValue = `<span title="${cellValue}">${cellValue.substring(0, 47)}...</span>`;
            } else if (typeof cellValue === 'object') {
                cellValue = `<span class="text-info" title="${JSON.stringify(cellValue)}">[Objet]</span>`;
            }
            
            html += `<td class="${cellClass}" style="max-width: 150px; word-wrap: break-word; ${isKeyColumn ? 'background-color: #f0f8ff;' : ''}">${cellValue}</td>`;
        });
        
        html += `</tr>`;
    });
    
    html += `
                </tbody>
            </table>
        </div>
        
        <!-- Informations sur l'aperçu -->
        <div class="preview-footer" style="margin-top: 10px; padding: 8px; background-color: #f9f9f9; border-radius: 3px;">
            <div class="row">
                <div class="col-md-6">
                    <small class="text-muted">
                        <i class="fa fa-info-circle"></i> 
                        ${rowCount} ligne(s) ${totalRows > rowCount ? `sur ${totalRows} total` : ''}
                    </small>
                </div>
                <div class="col-md-6 text-right">
                    <small class="text-muted">
                        <strong>${visibleColumns.length}</strong>/${totalColumns} colonne(s) affichée(s)
                        ${totalRows > rowCount ? ` • <span class="text-info">${totalRows} total en cache</span>` : ''}
                    </small>
                </div>
            </div>
        </div>
    `;
    
    return html;
}

/**
 * Configuration des événements du slider de colonnes
 */
function setupColumnSlider(rows, orderedColumns, datatableName, rowCount, totalRows, maxVisible) {
    let currentOffset = 0;
    const totalColumns = orderedColumns.length;
    
    // Fonction pour mettre à jour l'affichage
    function updateColumnView(newOffset) {
        currentOffset = Math.max(0, Math.min(newOffset, totalColumns - maxVisible));
        
        const newHtml = generatePreviewWithSlider(
            rows, 
            orderedColumns, 
            datatableName, 
            rowCount, 
            totalRows, 
            currentOffset, 
            maxVisible
        );
        
        document.getElementById('previewContent').innerHTML = newHtml;
        
        // Reconfigurer les événements
        setupColumnSlider(rows, orderedColumns, datatableName, rowCount, totalRows, maxVisible);
    }
    
    // Bouton précédent
    const prevBtn = document.getElementById('prevColumns');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            updateColumnView(currentOffset - maxVisible);
        });
    }
    
    // Bouton suivant
    const nextBtn = document.getElementById('nextColumns');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            updateColumnView(currentOffset + maxVisible);
        });
    }
    
    // ✅ NOUVEAU : Support du clavier pour la navigation
    document.addEventListener('keydown', function(e) {
        const previewContent = document.getElementById('previewContent');
        if (!previewContent || !previewContent.contains(document.activeElement)) return;
        
        if (e.key === 'ArrowLeft' && currentOffset > 0) {
            e.preventDefault();
            updateColumnView(currentOffset - 1);
        } else if (e.key === 'ArrowRight' && currentOffset + maxVisible < totalColumns) {
            e.preventDefault();
            updateColumnView(currentOffset + 1);
        }
    });
}


/**
 * Configuration des événements du slider de colonnes
 */
function setupColumnSliderInList(rows, orderedColumns,datatableId, datatableName, rowCount, totalRows, maxVisible) {
    let currentOffset = 0;
    const totalColumns = orderedColumns.length;
    
    // Fonction pour mettre à jour l'affichage
    function updateColumnView(newOffset) {
        currentOffset = Math.max(0, Math.min(newOffset, totalColumns - maxVisible));
        
        const newHtml = generatePreviewWithSlider(
            rows, 
            orderedColumns, 
            datatableName, 
            rowCount, 
            totalRows, 
            currentOffset, 
            maxVisible
        );
        
        document.getElementById(`previewContent-${datatableId}`).innerHTML = newHtml;
        
        // Reconfigurer les événements
        setupColumnSlider(rows, orderedColumns, datatableName, rowCount, totalRows, maxVisible);
    }
    
    // Bouton précédent
    const prevBtn = document.getElementById('prevColumns');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            updateColumnView(currentOffset - maxVisible);
        });
    }
    
    // Bouton suivant
    const nextBtn = document.getElementById('nextColumns');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            updateColumnView(currentOffset + maxVisible);
        });
    }
    
    // ✅ NOUVEAU : Support du clavier pour la navigation
    document.addEventListener('keydown', function(e) {
        const previewContent = document.getElementById(`previewContent-${datatableId}`);
        if (!previewContent || !previewContent.contains(document.activeElement)) return;
        
        if (e.key === 'ArrowLeft' && currentOffset > 0) {
            e.preventDefault();
            updateColumnView(currentOffset - 1);
        } else if (e.key === 'ArrowRight' && currentOffset + maxVisible < totalColumns) {
            e.preventDefault();
            updateColumnView(currentOffset + 1);
        }
    });
}

/**
 * Affichage d'une erreur dans l'aperçu
 */
function displayPreviewError(error,datatableId) {
    const previewContent = document.getElementById(`previewContent-${datatableId}`);
    
    let errorMessage = 'Erreur lors du chargement des données';
    if (error.status === 404) {
        errorMessage = 'DataTable non trouvée ou supprimée';
    } else if (error.status === 403) {
        errorMessage = 'Accès refusé à cette DataTable';
    } else if (error.status >= 500) {
        errorMessage = 'Erreur serveur lors du chargement';
    }
    
    previewContent.innerHTML = `
        <div class="alert alert-danger">
            <i class="fa fa-exclamation-triangle"></i> ${errorMessage}
            <br><small>Code d'erreur: ${error.status || 'Inconnu'}</small>
        </div>
    `;
}

/**
 * Suppression de l'aperçu
 */
function removeDataTablePreview() {
    const previewDiv = document.getElementById('datatablePreview');
    if (previewDiv) {
        previewDiv.remove();
        console.log('🗑️ Aperçu supprimé');
    }
}

/**
 * Basculer la visibilité de l'aperçu
 */
function togglePreviewVisibility() {
    const previewContent = document.getElementById('previewContent');
    const toggleButton = event.target;
    
    if (previewContent.style.display === 'none') {
        previewContent.style.display = 'block';
        toggleButton.innerHTML = '<i class="fa fa-minus"></i>';
    } else {
        previewContent.style.display = 'none';
        toggleButton.innerHTML = '<i class="fa fa-plus"></i>';
    }
}


/**
 * Affichage de l'aperçu et de la config d'une DataTable
 */
function toggleConfigDatatable(datatableId,headerElement) {
    getDataTableSchemaWithCache(datatableId)
        .then((dataTable) => {
            console.log('DataTable détaillée:', dataTable);
            // Créer ou récupérer le conteneur d'aperçu
            let configDiv = document.getElementById(`config-${datatableId}`);
            const previewIcon = headerElement.querySelector('#config-icon');
            console.log('Element:',headerElement);
            console.log('Icon:',previewIcon);

            // Si l'aperçu est déjà affiché, le masquer
            if (configDiv.style.display !== 'none') {
                hideDataTableConfigPreviewInList(datatableId, headerElement);
                return;
            }

            // Afficher l'aperçu des données
            displayDataTablePreviewInList(datatableId, dataTable.name);
            displayColumnsConfigurationInList(datatableId, dataTable.schema.properties,headerElement);
        })
        .catch((err) => {
            console.error('Erreur lors du chargement des colonnes:', err);
        });
}

/**
 * Basculer l'affichage de l'aperçu pour une DataTable dans la liste
 */
function toggleDataTablePreview(datatableId, datatableName, headerElement) {
    const previewContainer = document.getElementById(`preview-${datatableId}`);
    //const previewIcon = headerElement.querySelector('.preview-icon');
    
    if (!previewContainer) {
        console.error('Conteneur d\'aperçu introuvable pour:', datatableId);
        return;
    }
    
    // Si l'aperçu est déjà affiché, le masquer
    if (previewContainer.style.display !== 'none') {
        hideDataTablePreviewInList(datatableId, headerElement);
        return;
    }
    
    // Afficher l'aperçu pour cette DataTable
    showDataTablePreviewInList(datatableId, datatableName, previewContainer, headerElement);
}

/**
 * Affichage de l'aperçu dans la liste
 */
function showDataTablePreviewInList(datatableId, datatableName, container, icon) {
    console.log(`👀 Affichage de l'aperçu in List dans la liste pour: ${datatableName}`);
        
    // Afficher le conteneur avec un indicateur de chargement
    container.style.display = 'block';
    container.innerHTML = `
        <div style="padding: 15px; text-align: center;">
            <i class="fa fa-spinner fa-spin"></i> Chargement de l'aperçu des données...
            <br><small class="text-muted">Utilisation du cache si disponible</small>
        </div>
    `;
    
        Promise.all([
            getDataTableRowsWithCache(datatableId),
            getDataTableSchemaWithCache(datatableId)
        ])
        .then(([allRows, dataTableSchema]) => {
            console.log('📊 Données reçues:', {
            rowsCount: allRows ? allRows.length : 0,
            first5Rows: allRows.slice(0,5),
            schemaValid: !!(dataTableSchema && dataTableSchema.schema),
            schema: dataTableSchema
            });
            const previewRows = allRows.slice(0, 5);
            const columnOrder = getSchemaOrderedColumns(dataTableSchema.schema);
            displayPreviewInListWithOrder(previewRows, datatableName, allRows.length, container, datatableId, columnOrder);
            
            //icon.className = 'fa fa-eye-slash preview-icon';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
            icon.style.color = '#d9534f';
            icon.title = 'Cliquez pour masquer l\'aperçu';
        })
        .catch((error) => {
            console.error('❌ Erreur lors de la récupération des données:', error);
            displayPreviewErrorInList(error, container);
            
            // Remettre l'icône normale en cas d'erreur
            icon.className = 'fa fa-eye preview-icon';
            icon.style.color = '#337ab7';
        });
}

/**
 * Affichage dans la liste avec ordre des colonnes
 */
function displayPreviewInListWithOrder(rows, datatableName, totalRows, container, datatableId, orderedColumns) {
    if (!rows || rows.length === 0) {
        container.innerHTML = `
            <div style="padding: 15px;">
                <div class="alert alert-info" style="margin: 0;">
                    <i class="fa fa-info-circle"></i> Aucune donnée trouvée dans cette DataTable
                </div>
            </div>
        `;
        return;
    }
    
    // Utiliser les colonnes ordonnées ou fallback
    let displayColumns;
    if (orderedColumns && orderedColumns.length > 0) {
        displayColumns = orderedColumns.slice(0, 10); // Limiter à 4 pour la liste
    } else {
        const allColumns = Object.keys(rows[0]);
        displayColumns = allColumns.slice(0, 10).map(name => ({ name, displayOrder: 0, type: 'string' }));
    }
    
    const rowCount = rows.length;
    
    let tableHTML = `
        <div style="padding: 10px;">
            <div class="row" style="margin-bottom: 10px;">
                <div class="col-md-8">
                    <h6 style="margin: 0; color: #337ab7;">
                        <i class="fa fa-table"></i> Aperçu ordonné - ${datatableName}
                    </h6>
                </div>
                <div class="col-md-4 text-right">
                    <button class="btn btn-xs btn-default" onclick="openFullPreview('${datatableId}', '${datatableName}')">
                        <i class="fa fa-expand"></i> Aperçu complet
                    </button>
                </div>
            </div>
            
            <div class="table-responsive">
                <table class="table table-bordered table-condensed" style="font-size: 11px; margin-bottom: 0;">
                    <thead style="background-color: #f5f5f5;">
                        <tr>
                            <th style="width: 30px;">#</th>
    `;
    
    // En-têtes avec ordre d'affichage
    displayColumns.forEach(column => {
        tableHTML += `
            <th style="max-width: 120px;">
                ${column.title}
                <br><small class="text-muted">#${column.displayOrder}</small>
            </th>
        `;
    });
    
    if (orderedColumns && orderedColumns.length > 10) {
        tableHTML += `<th style="text-align: center;">...</th>`;
    }
    
    tableHTML += `</tr></thead><tbody>`;
    
    // Lignes de données
    rows.forEach((row, index) => {
        tableHTML += `<tr>`;
        tableHTML += `<td style="text-align: center; background-color: #f9f9f9;"><small><strong>${index + 1}</strong></small></td>`;
        
        displayColumns.forEach(column => {
            let cellValue = row[column.name];
            
            if (cellValue === null || cellValue === undefined) {
                cellValue = '<span class="text-muted"><em>null</em></span>';
            } else if (typeof cellValue === 'string' && cellValue.length > 20) {
                cellValue = `<span title="${cellValue}">${cellValue.substring(0, 17)}...</span>`;
            } else if (typeof cellValue === 'object') {
                cellValue = '<span class="text-info">[Obj]</span>';
            }
            
            tableHTML += `<td style="max-width: 120px; word-wrap: break-word;"><small>${cellValue}</small></td>`;
        });
        
        if (orderedColumns && orderedColumns.length > 10) {
            tableHTML += `<td style="text-align: center;"><small class="text-muted">+${orderedColumns.length - 10}</small></td>`;
        }
        
        tableHTML += `</tr>`;
    });
    
    tableHTML += `
                    </tbody>
                </table>
            </div>
            
            <div style="margin-top: 8px; padding: 5px; background-color: #f9f9f9; border-radius: 3px;">
                <small class="text-muted">
                    <i class="fa fa-sort-amount-asc"></i> 
                    Colonnes triées par displayOrder • ${rowCount}/${totalRows} lignes
                </small>
            </div>
        </div>
    `;
    
    container.innerHTML = tableHTML;
    container.style.animation = 'slideDown 0.3s ease-out';
}


/**
 * Affichage d'erreur dans la liste
 */
function displayPreviewErrorInList(error, container) {
    let errorMessage = 'Erreur lors du chargement des données';
    if (error.status === 404) {
        errorMessage = 'DataTable non trouvée';
    } else if (error.status === 403) {
        errorMessage = 'Accès refusé';
    }
    
    container.innerHTML = `
        <div style="padding: 15px;">
            <div class="alert alert-danger" style="margin: 0;">
                <i class="fa fa-exclamation-triangle"></i> ${errorMessage}
            </div>
        </div>
    `;
}

/**
 * Masquer l'aperçu dans la liste
 */
function hideDataTablePreviewInList(datatableId, icon) {
    const container = document.getElementById(`preview-${datatableId}`);
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
        
        // Remettre l'icône normale
        icon.className = 'fa fa-eye preview-icon';
        icon.style.color = '#337ab7';
        icon.title = 'Cliquez pour voir l\'aperçu des données';
        
        console.log(`🙈 Aperçu masqué pour: ${datatableId}`);
    }
}

/**
 * Masquer l'aperçu dans la liste
 */
function hideDataTableConfigPreviewInList(datatableId, icon) {
    const container = document.getElementById(`configPreview-${datatableId}`);
    const containerConfig = document.getElementById(`config-${datatableId}`);
    
    if (container) {
        container.style.display = 'none';
        containerConfig.style.display = 'none';
        container.innerHTML = '';
        containerConfig.innerHTML = '';
        
        // Remettre l'icône normale
        icon.className = 'fa fa-gear';
        icon.style.color = '#337ab7';
        icon.title = 'Cliquez pour voir l\'aperçu des données';
        
        console.log(`🙈 Aperçu Config masqué pour: ${datatableId}`);
    }
}

/**
 * Fermer tous les aperçus ouverts
 */
function closeAllDataTablePreviews() {
    const previewContainers = document.querySelectorAll('.datatable-preview-container');
    const previewIcons = document.querySelectorAll('.preview-icon');
    
    previewContainers.forEach(container => {
        container.style.display = 'none';
        container.innerHTML = '';
    });
    
    previewIcons.forEach(icon => {
        icon.className = 'fa fa-eye preview-icon';
        icon.style.color = '#337ab7';
        icon.title = 'Cliquez pour voir l\'aperçu des données';
    });
}

/**
 * Ouverture de l'aperçu complet dans une modal
 */
function openFullPreview(datatableId, datatableName) {
    // Créer une modal pour l'aperçu complet
    const modalId = 'fullPreviewModal';
    
    // Supprimer la modal existante si elle existe
    $(`#${modalId}`).remove();
    
    const modalHTML = `
        <div class="modal fade" id="${modalId}" tabindex="-1" role="dialog">
            <div class="modal-dialog modal-lg" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <button type="button" class="close" data-dismiss="modal">&times;</button>
                        <h4 class="modal-title">
                            <i class="fa fa-table"></i> Aperçu complet - ${datatableName}
                        </h4>
                    </div>
                    <div class="modal-body" id="fullPreviewContent">
                        <div class="text-center">
                            <i class="fa fa-spinner fa-spin"></i> Chargement des données complètes...
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-default" data-dismiss="modal">Fermer</button>
                        <button type="button" class="btn btn-primary" onclick="exportPreviewData('${datatableId}')">
                            <i class="fa fa-download"></i> Exporter CSV
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    $(`#${modalId}`).modal('show');
    
    // Charger les données complètes
    getDataTableRowsWithCache(datatableId)
        .then((allRows) => {
            const previewRows = allRows.slice(0, 20); // Plus de lignes pour la modal
            displayFullPreviewInModal(previewRows, datatableName, allRows.length);
        })
        .catch((error) => {
            document.getElementById('fullPreviewContent').innerHTML = `
                <div class="alert alert-danger">
                    <i class="fa fa-exclamation-triangle"></i> Erreur lors du chargement: ${error.message}
                </div>
            `;
        });
}

/**
 * Affichage de l'aperçu complet dans la modal
 */
function displayFullPreviewInModal(rows, datatableName, totalRows) {
    const content = document.getElementById('fullPreviewContent');
    
    if (!rows || rows.length === 0) {
        content.innerHTML = `
            <div class="alert alert-info">
                <i class="fa fa-info-circle"></i> Aucune donnée trouvée dans cette DataTable
            </div>
        `;
        return;
    }
    
    const columns = Object.keys(rows[0]);
    
    let tableHTML = `
        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
            <table class="table table-bordered table-hover" style="font-size: 12px;">
                <thead style="background-color: #f5f5f5; position: sticky; top: 0;">
                    <tr>
                        <th style="width: 40px;">#</th>
    `;
    
    columns.forEach(column => {
        tableHTML += `<th>${column}</th>`;
    });
    
    tableHTML += `</tr></thead><tbody>`;
    
    rows.forEach((row, index) => {
        tableHTML += `<tr>`;
        tableHTML += `<td style="text-align: center; background-color: #f9f9f9;"><strong>${index + 1}</strong></td>`;
        
        columns.forEach(column => {
            let cellValue = row[column];
            
            if (cellValue === null || cellValue === undefined) {
                cellValue = '<span class="text-muted"><em>null</em></span>';
            } else if (typeof cellValue === 'string' && cellValue.length > 100) {
                cellValue = `<span title="${cellValue}">${cellValue.substring(0, 97)}...</span>`;
            } else if (typeof cellValue === 'object') {
                cellValue = `<span class="text-info" title="${JSON.stringify(cellValue)}">[Objet]</span>`;
            }
            
            tableHTML += `<td>${cellValue}</td>`;
        });
        
        tableHTML += `</tr>`;
    });
    
    tableHTML += `</tbody></table></div>`;
    
    tableHTML += `
        <div class="alert alert-info" style="margin-top: 15px;">
            <i class="fa fa-info-circle"></i> 
            <strong>${rows.length}</strong> ligne(s) affichée(s) sur <strong>${totalRows}</strong> total • 
            <strong>${columns.length}</strong> colonne(s)
        </div>
    `;
    
    content.innerHTML = tableHTML;
}
