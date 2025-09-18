/**
 * Variables globales pour le schéma relationnel
 */
let schemaData = null;
let schemaPositions = new Map();
let schemaScale = 1;
let isDragging = false;
let dragElement = null;
let dragOffset = { x: 0, y: 0 };

/**
 * Configuration des icônes par type
 */
const CONFIG_ICONS = {
    'liste': 'fa-list',
    'regex': 'fa-code', 
    'queue': 'fa-phone',
    'skill': 'fa-star',
    'schedulegroup': 'fa-calendar',
    'liaison': 'fa-link',
    'liaison_auto': 'fa-magic',
    'key': 'fa-key'
};

/**
 * Gestion de l'affichage/masquage du schéma
 */
function toggleDataTableSchemaSection() {
    const section = document.getElementById('schemaSection');
    const button = event.target;
    
    if (section.style.display === 'none') {
        section.style.display = 'block';
        generateDataTableSchema();
        button.innerHTML = '<i class="fa fa-eye-slash"></i> Masquer le Schéma';
    } else {
        section.style.display = 'none';
        button.innerHTML = '<i class="fa fa-sitemap"></i> Afficher le Schéma';
    }
}

/**
 * Génération du schéma relationnel
 */
async function generateDataTableSchema() {
    console.log('🎨 Génération du schéma relationnel...');
    
    try{
        // Analyser les configurations pour créer les données du schéma
        schemaData = await analyzeConfigurations();
        
        if (schemaData.tables.length === 0) {
            showDataTableEmptySchema();
            return;
        }
        
        // Calculer les positions des tables
        calculateTablePositions();
        
        // Dessiner le schéma
        drawDataTableSchema();
        
        // Mettre à jour les informations
        updateDataTableSchemaInfo();
        
        console.log('✅ Schéma généré avec succès');
    
    } catch (error) {
        console.error('❌ Erreur lors de la génération du schéma:', error);
        showDataTableEmptySchema();
    }
}

/**
 * Analyse des configurations pour créer les données du schéma
 */
async function analyzeConfigurations() {
    const tables = [];
    const connections = [];
    const tableToAdd = [];
    const processedTables = new Set();

    // Parcourir toutes les configurations
    Object.keys(dataTableConfigurations).forEach(dataTableId => {
        const config = dataTableConfigurations[dataTableId];
        
        if (!config.columns || Object.keys(config.columns).length === 0) {
            return; // Ignorer les tables sans configuration
        }
        
        addDataTableToConfig(dataTableId,tables,connections,processedTables,tableToAdd);
    });

    // Ajouter les tables du mapping qui manquent
    Object.values(LIAISON_MAPPING).forEach(targetTableId => {
        if (!processedTables.has(targetTableId)) {
            const targetTable = dataTablesCache.find(dt => dt.id === targetTableId);
            if (targetTable) {
                addDataTableToConfig(targetTableId,tables,connections,processedTables,tableToAdd);
            }
        }
    });

    tableToAdd.forEach(dataTableId => {
            addDataTableToConfig(dataTableId,tables,connections,processedTables,tableToAdd);
    });
    
    return { tables, connections };
}

function addDataTableToConfig(dataTableId,tables,connections,processedTables,tableToAdd){
    if (processedTables.has(dataTableId)) return;

    const config = dataTableConfigurations[dataTableId];
    const dataTableName = getDataTableNameById(dataTableId);
    
    const tableData = {
        id: dataTableId,
        name: dataTableName,
        columns: []
    };
    processedTables.add(dataTableId);
    tables.push(tableData);

    //Extraction de Key
    const dataTable = getDataTableById(dataTableId);
    
    if (!dataTable?.schema?.properties) return;

    // Récupération de la colonne key
    const keyProperty = dataTable.schema.properties['key'];
    tableData.columns.push({
        name: keyProperty.title,
        title: keyProperty.title,
        icon: CONFIG_ICONS['key'] || fa-question,
        details : ''
    });
    
    // Analyser chaque colonne configurée
    if(!config) return;
    Object.keys(config.columns).forEach(columnName => {
        const columnConfig = config.columns[columnName];
        
        const columnData = {
            name: columnName,
            type: columnConfig.type,
            icon: CONFIG_ICONS[columnConfig.type] || 'fa-question',
            details: getColumnDetails(columnConfig)
        };
        
        tableData.columns.push(columnData);
        
        // Créer les connexions pour les liaisons
        if (columnConfig.type === 'liaison' && columnConfig.liaisonTarget) {
            connections.push({
                fromTable: dataTableId,
                fromColumn: columnName,
                toTable: columnConfig.liaisonTarget,
                toColumn: 'key', // Toujours vers la colonne 'key'
                type: 'liaison'
            });
            tableToAdd.push(columnConfig.liaisonTarget)
        } else if (columnConfig.type === 'liaison_auto' && columnConfig.liaisonAutoColumn) {
            // Pour les liaisons auto, il faut créer une connexion pour toutes les liaisons
            Object.values(LIAISON_MAPPING).forEach(targetTableId =>{
                connections.push({
                    fromTable: dataTableId,
                    fromColumn: columnName,
                    toTable: targetTableId,
                    toColumn: 'key',
                    type: 'liaison_auto',
                    referenceColumn: columnConfig.liaisonAutoColumn
                });
            });
        }
    });
}


/**
 * Obtention des détails d'une colonne selon son type
 */
function getColumnDetails(columnConfig) {
    switch (columnConfig.type) {
        case 'liste':
            return `${columnConfig.listeValues ? columnConfig.listeValues.length : 0} valeurs${columnConfig.allowNull ? ', null OK' : ''}`;
        case 'regex':
            return `Pattern: ${columnConfig.regexPattern ? columnConfig.regexPattern.substring(0, 20) + '...' : 'Non défini'}`;
        case 'liaison':
            return `→ ${getDataTableNameById(columnConfig.liaisonTarget) || 'Table inconnue'}`;
        case 'liaison_auto':
            return `Auto via ${columnConfig.liaisonAutoColumn}`;
        default:
            return 'Validation ' + columnConfig.type;
    }
}

/**
 * Récupération d'une valeur de référence pour une colonne donnée
 * Utilisée pour déterminer les liaisons automatiques dans le schéma
 */
function getReferenceValueForColumn(dataTableId, columnName) {
    try {
        // Vérifier si on a déjà des données en cache pour cette DataTable
        if (typeof dataTableRowsCache !== 'undefined' && dataTableRowsCache[dataTableId]) {
            const rows = dataTableRowsCache[dataTableId];
            
            // Parcourir les lignes pour trouver une valeur non vide dans cette colonne
            for (let row of rows) {
                if (row[columnName] && row[columnName].toString().trim() !== '') {
                    return row[columnName].toString().trim();
                }
            }
        }
        
        // Si pas de cache, essayer de récupérer quelques lignes
        return getFirstValueFromColumn(dataTableId, columnName);
        
    } catch (error) {
        console.warn(`Erreur lors de la récupération de la valeur de référence pour ${dataTableId}.${columnName}:`, error);
        return null;
    }
}

/**
 * Récupération de la première valeur non vide d'une colonne
 */
function getFirstValueFromColumn(dataTableId, columnName) {
    // Pour le schéma, on va utiliser les valeurs connues du mapping
    // ou essayer de deviner à partir des clés du LIAISON_MAPPING
    
    // D'abord vérifier si cette colonne fait référence à des valeurs connues
    const knownMappingKeys = Object.keys(LIAISON_MAPPING);
    
    // Retourner la première clé de mapping comme valeur d'exemple
    if (knownMappingKeys.length > 0) {
        return knownMappingKeys[0];
    }
    
    return null;
}

/**
 * Version asynchrone pour récupérer la valeur de référence
 * (optionnelle, pour une analyse plus précise)
 */
async function getReferenceValueForColumnAsync(dataTableId, columnName) {
    try {
        const data = await cacheDataTableRows(dataTableId)
        
        if (data.entities && data.entities.length > 0) {
            // Chercher la première valeur non vide dans cette colonne
            for (let row of data.entities) {
                if (row[columnName] && row[columnName].toString().trim() !== '') {
                    return row[columnName].toString().trim();
                }
            }
        }
        
        return null;
        
    } catch (error) {
        console.warn(`Erreur lors de la récupération asynchrone pour ${dataTableId}.${columnName}:`, error);
        return null;
    }
}

/**
 * Calcul des positions automatiques des tables
 */
function calculateTablePositions() {
    const canvas = document.getElementById('DataTableSchemaCanvas');
    const canvasWidth = canvas.clientWidth || 800;
    const canvasHeight = 600;
    
    const tableWidth = 200;
    const tableHeight = 120;
    const margin = 50;
    
    // Calculer le nombre de colonnes et lignes
    const tablesCount = schemaData.tables.length;
    const cols = Math.ceil(Math.sqrt(tablesCount));
    const rows = Math.ceil(tablesCount / cols);
    
    // Calculer l'espacement
    const availableWidth = canvasWidth - (2 * margin);
    const availableHeight = canvasHeight - (2 * margin);
    const spacingX = availableWidth / cols;
    const spacingY = availableHeight / rows;
    
    // Positionner chaque table
    schemaData.tables.forEach((table, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        
        const x = margin + (col * spacingX) + (spacingX - tableWidth) / 2;
        const y = margin + (row * spacingY) + (spacingY - tableHeight) / 2;
        
        schemaPositions.set(table.id, { x, y, width: tableWidth, height: tableHeight });
    });
}

/**
 * Dessin du schéma complet
 */
function drawDataTableSchema() {
    const tablesGroup = document.getElementById('DataTableSchemaTables');
    const connectionsGroup = document.getElementById('DataTableSchemaConnections');
    
    // Vider les groupes
    tablesGroup.innerHTML = '';
    connectionsGroup.innerHTML = '';
    
    // Dessiner les tables
    schemaData.tables.forEach(table => {
        drawTable(table, tablesGroup);
    });
    
    // Dessiner les connexions
    schemaData.connections.forEach(connection => {
        drawDataTableConnection(connection, connectionsGroup);
    });
}

/**
 * Dessin d'une table
 */
function drawTable(table, parent) {
    console.log(`Dessin de la DT ${table.name}`)
    const position = schemaPositions.get(table.id);
    if (!position) return;
    
    // Groupe principal de la table
    const tableGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    tableGroup.setAttribute('class', 'schema-table');
    tableGroup.setAttribute('data-table-id', table.id);
    tableGroup.setAttribute('transform', `translate(${position.x}, ${position.y})`);
    
    // Rectangle principal
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', position.width);
    rect.setAttribute('height', position.height);
    rect.setAttribute('fill', '#ffffff');
    rect.setAttribute('stroke', '#337ab7');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('rx', '5');
    rect.setAttribute('class', 'table-rect');
    
    // En-tête de la table
    const headerRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    headerRect.setAttribute('width', position.width);
    headerRect.setAttribute('height', '30');
    headerRect.setAttribute('fill', '#337ab7');
    headerRect.setAttribute('rx', '5');
    
    // Titre de la table
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', position.width / 2);
    title.setAttribute('y', '20');
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('fill', 'white');
    title.setAttribute('font-weight', 'bold');
    title.setAttribute('font-size', '12');
    title.textContent = table.name.length > 23 ? table.name.substring(0, 20) + '...' : table.name;
    
    // Ajouter les éléments de base
    tableGroup.appendChild(rect);
    tableGroup.appendChild(headerRect);
    tableGroup.appendChild(title);
    
    // Ajouter les colonnes
    table.columns.forEach((column, index) => {
        const y = 40 + (index * 22);
        
        // Icône du type
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        icon.setAttribute('x', '10');
        icon.setAttribute('y', y);
        icon.setAttribute('font-family', 'FontAwesome');
        icon.setAttribute('font-size', '10');
        icon.setAttribute('fill', getColumnColor(column.type));
        icon.textContent = getIconUnicode(column.icon);
        
        // Nom de la colonne
        const columnText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        columnText.setAttribute('x', '25');
        columnText.setAttribute('y', y);
        columnText.setAttribute('font-size', '10');
        columnText.setAttribute('fill', '#333');
        columnText.textContent = column.name.length > 25 ? column.name.substring(0, 22) + '...' : column.name;
        
        // Tooltip avec les détails
        const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        tooltip.textContent = `${column.name} (${column.type}): ${column.details}`;
        columnText.appendChild(tooltip);

        // Ligne de séparation
        const newLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        newLine.setAttribute('x1','0');
        newLine.setAttribute('y1',y+6);
        newLine.setAttribute('x2','200');
        newLine.setAttribute('y2',y+6);
        newLine.setAttribute("stroke", "#337ab7")
        
        tableGroup.appendChild(icon);
        tableGroup.appendChild(columnText);
        
        tableGroup.appendChild(newLine);
    });
    
    // Événements de drag & drop
    setupTableDragEvents(tableGroup, table.id);
    
    parent.appendChild(tableGroup);
}

/**
 * Dessin d'une connexion entre tables
 */
function drawDataTableConnection(connection, parent) {
    const fromPos = schemaPositions.get(connection.fromTable);
    if (connection.toTable === null || !schemaPositions.get(connection.toTable)) {
        drawDataTableIncompleteConnection(connection, fromPos, parent);
        return;
    }

    const toPos = schemaPositions.get(connection.toTable);
    
    if (!fromPos || !toPos) return;
    
    // Calculer les points de connexion
    const fromPoint = getConnectionPoint(fromPos, connection.fromColumn, 'output');
    const toPoint = getConnectionPoint(toPos, 'key', 'input');
    
    // Créer le path pour la connexion
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const pathData = createConnectionPath(fromPoint, toPoint);
    
    path.setAttribute('d', pathData);
    path.setAttribute('stroke', connection.type === 'liaison_auto' ? '#ff6b6b' : '#337ab7');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arrowhead-schema)');
    path.setAttribute('class', 'schema-connection');
    
    if (connection.type === 'liaison_auto') {
        path.setAttribute('stroke-dasharray', '5,5');
    }
    
    // Tooltip pour la connexion
    const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    const targetName = connection.toTable ? getDataTableNameById(connection.toTable) : 'Table inconnue';
    tooltip.textContent = `${connection.fromColumn} → ${getDataTableNameById(connection.toTable)} (${connection.type})`;
    path.appendChild(tooltip);
    
    parent.appendChild(path);
}

/**
 * Calcul du point de connexion sur une table
 */
function getConnectionPoint(tablePos, columnName, direction) {
    const centerX = tablePos.x + tablePos.width / 2;
    const centerY = tablePos.y + tablePos.height / 2;
    
    if (direction === 'output') {
        return {
            x: tablePos.x + tablePos.width,
            y: centerY
        };
    } else {
        return {
            x: tablePos.x,
            y: centerY
        };
    }
}

/**
 * Création du chemin de connexion
 */
function createConnectionPath(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    
    // Connexion avec courbe
    const controlPointOffset = Math.abs(dx) / 3;
    
    return `M ${from.x} ${from.y} ` +
           `C ${from.x + controlPointOffset} ${from.y} ` +
           `${to.x - controlPointOffset} ${to.y} ` +
           `${to.x} ${to.y}`;
}

/**
 * Couleur selon le type de colonne
 */
function getColumnColor(type) {
    const colors = {
        'liste': '#28a745',
        'regex': '#6f42c1',
        'queue': '#fd7e14',
        'skill': '#ffc107',
        'schedulegroup': '#20c997',
        'liaison': '#007bff',
        'liaison_auto': '#dc3545'
    };
    return colors[type] || '#6c757d';
}

/**
 * Conversion d'icône FontAwesome en Unicode
 */
function getIconUnicode(iconClass) {
    const icons = {
        'fa-list': '\uf03a',
        'fa-code': '\uf121',
        'fa-phone': '\uf095',
        'fa-star': '\uf005',
        'fa-calendar': '\uf073',
        'fa-link': '\uf0c1',
        'fa-magic': '\uf0d0',
        'fa-question': '\uf128'
    };
    return icons[iconClass] || '\uf128';
}

/**
 * Dessin d'une connexion incomplète
 */
function drawDataTableIncompleteConnection(connection, fromPos, parent) {
    if (!fromPos) return;
    
    const fromPoint = getConnectionPoint(fromPos, connection.fromColumn, 'output');
    const endPoint = {
        x: fromPoint.x + 100,
        y: fromPoint.y
    };
    
    // Ligne en pointillés vers nulle part
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', fromPoint.x);
    line.setAttribute('y1', fromPoint.y);
    line.setAttribute('x2', endPoint.x);
    line.setAttribute('y2', endPoint.y);
    line.setAttribute('stroke', '#dc3545');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '10,5');
    line.setAttribute('class', 'schema-connection incomplete');
    
    // Texte d'explication
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', endPoint.x + 5);
    text.setAttribute('y', endPoint.y + 5);
    text.setAttribute('font-size', '10');
    text.setAttribute('fill', '#dc3545');
    text.textContent = 'Table non déterminée';
    
    // Tooltip
    const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    tooltip.textContent = `Liaison auto incomplète: ${connection.referenceColumn} = ${connection.referenceValue || 'valeur inconnue'}`;
    line.appendChild(tooltip);
    
    parent.appendChild(line);
    parent.appendChild(text);
}

/**
 * Couleur selon le type de connexion
 */
function getConnectionColor(type) {
    const colors = {
        'liaison': '#337ab7',
        'liaison_auto': '#ff6b6b',
        'liaison_auto_incomplete': '#dc3545'
    };
    return colors[type] || '#6c757d';
}

/**
 * Configuration des événements de glisser-déposer pour les tables
 */
function setupTableDragEvents(tableElement, tableId) {
    tableElement.style.cursor = 'move';
    
    tableElement.addEventListener('mousedown', function(e) {
        isDragging = true;
        dragElement = tableElement;
        
        const rect = tableElement.getBoundingClientRect();
        const canvasRect = document.getElementById('DataTableSchemaCanvas').getBoundingClientRect();
        
        dragOffset.x = e.clientX - canvasRect.left - parseFloat(tableElement.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
        dragOffset.y = e.clientY - canvasRect.top - parseFloat(tableElement.getAttribute('transform').match(/,([^)]+)/)[1]);
        
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', function(e) {
        if (isDragging && dragElement) {
            const canvasRect = document.getElementById('DataTableSchemaCanvas').getBoundingClientRect();
            const newX = e.clientX - canvasRect.left - dragOffset.x;
            const newY = e.clientY - canvasRect.top - dragOffset.y;
            
            dragElement.setAttribute('transform', `translate(${newX}, ${newY})`);
            
            // Mettre à jour la position dans schemaPositions
            const tableId = dragElement.getAttribute('data-table-id');
            const currentPos = schemaPositions.get(tableId);
            if (currentPos) {
                currentPos.x = newX;
                currentPos.y = newY;
            }
            
            // Redessiner les connexions
            redrawDataTableConnections();
        }
    });
    
    document.addEventListener('mouseup', function() {
        isDragging = false;
        dragElement = null;
    });
}

/**
 * Redessin des connexions après déplacement
 */
function redrawDataTableConnections() {
    const connectionsGroup = document.getElementById('DataTableSchemaConnections');
    connectionsGroup.innerHTML = '';
    
    schemaData.connections.forEach(connection => {
        drawDataTableConnection(connection, connectionsGroup);
    });
}

/**
 * Affichage du schéma vide
 */
function showDataTableEmptySchema() {
    const tablesGroup = document.getElementById('DataTableSchemaTables');
    const connectionsGroup = document.getElementById('DataTableSchemaConnections');
    
    tablesGroup.innerHTML = '';
    connectionsGroup.innerHTML = '';
    
    // Message d'information
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '50%');
    text.setAttribute('y', '50%');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '16');
    text.setAttribute('fill', '#6c757d');
    text.textContent = 'Aucune configuration de DataTable trouvée';
    
    tablesGroup.appendChild(text);
}

/**
 * Actualisation du schéma
 */
function refreshDataTableSchema() {
    generateDataTableSchema();
}

/**
 * Réorganisation automatique du layout
 */
function resetDataTableSchemaLayout() {
    calculateTablePositions();
    drawDataTableSchema();
}

/**
 * Mise à jour des informations du schéma
 */
function updateDataTableSchemaInfo() {
    const info = document.getElementById('DataTableSchemaInfo');
    const tablesCount = schemaData.tables.length;
    const connectionsCount = schemaData.connections.length;
    
    info.innerHTML = `
        <small class="text-muted">
            ${tablesCount} table(s) configurée(s), ${connectionsCount} liaison(s).
            Cliquez sur une table pour la sélectionner. Glissez pour repositionner.
        </small>
    `;
}

/**
 * Fonctions de zoom
 */
function zoomDataTableSchema(direction) {
    const canvas = document.getElementById('DataTableSchemaCanvas');
    const currentScale = schemaScale;
    
    if (direction === 'in' && currentScale < 2) {
        schemaScale = currentScale * 1.2;
    } else if (direction === 'out' && currentScale > 0.5) {
        schemaScale = currentScale / 1.2;
    }
    
    canvas.style.transform = `scale(${schemaScale})`;
    canvas.style.transformOrigin = 'top left';
}

/**
 * Export du schéma en PNG
 */
function exportDataTableSchema() {
    const svg = document.getElementById('DataTableSchemaCanvas');
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = function() {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        const link = document.createElement('a');
        link.download = `schema-datatables-${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL();
        link.click();
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
}
