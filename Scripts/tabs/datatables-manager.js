
// Cache pour optimiser les validations de liaisons
let liaisonDataCache = new Map();
let liaisonPromiseCache = new Map(); // Cache de la promesse pour que si la DT est déjà demandée on attende la première réponse

// Fonction pour récupérer les données d'une DataTable avec cache
async function getDataTableRowsWithCache(datatableId) {
    if (liaisonPromiseCache.has(datatableId)) {
        //console.log(`⏳ Attente de la promesse en cours pour DataTable: ${datatableId}`);
        return liaisonPromiseCache.get(datatableId);
    }
    if (liaisonDataCache.has(datatableId)) {
        //console.log(`📂 Utilisation du cache pour DataTable: ${datatableId}`);
        return liaisonDataCache.get(datatableId);
    }
    
    console.log(`🔄 Chargement des données pour DataTable: ${datatableId}`);
    // Créer et cacher la promesse
    const dataPromise = getAllDataTableRows(datatableId)
        .then((rows) => {
            // Mettre les données en cache une fois récupérées
            liaisonDataCache.set(datatableId, rows);
            console.log(`✅ ${rows.length} lignes mises en cache pour: ${datatableId}`);
            return rows;
        })
        .catch((error) => {
            console.error(`❌ Erreur lors du chargement de ${datatableId}:`, error);
            // Supprimer la promesse du cache en cas d'erreur
            liaisonPromiseCache.delete(datatableId);
            throw error;
        })
        .finally(() => {
            // Supprimer la promesse du cache une fois terminée (succès ou échec)
            liaisonPromiseCache.delete(datatableId);
        });
    
    // Mettre la promesse en cache
    liaisonPromiseCache.set(datatableId, dataPromise);
        
    return dataPromise;
}


/**
 * Limitation du nombre de lignes selon la sélection
 */
function getLimitedRows(rows, selectedCount) {
    if (selectedCount === 'all') {
        return rows;
    }
    
    const count = parseInt(selectedCount, 10);
    if (isNaN(count) || count <= 0) {
        console.warn('Nombre invalide, utilisation de 1 par défaut');
        return rows.slice(0, 1);
    }
    
    return rows.slice(0, count);
}

// Fonction utilitaire pour récupérer le nom d'une datatable par ID
function getDataTableNameById(id) {
    const dataTable = dataTablesCache.find(dt => dt.id === id);
    return dataTable ? dataTable.name : 'DataTable inconnue';
}

// Fonction utilitaire pour récupérer le nom d'une datatable par ID
function getDataTableById(id) {
    const dataTable = dataTablesCache.find(dt => dt.id === id);
    return dataTable ? dataTable : 'DataTable inconnue';
}

function getOrderedColumnsWithKeyFirst(schema) {
    if (!schema || !schema.properties) return [];
    const properties = schema.properties;
    const columns = Object.keys(properties);
    let columnsWithOrder = columns.map(columnName => {
        const property = properties[columnName];
        return {
            name: columnName,
            title: property.title,
            displayOrder: property.displayOrder || 999,
            type: property.type || 'string'
        };
    });
    const keyColumn = columnsWithOrder.find(col => col.name === 'key');
    const otherColumns = columnsWithOrder.filter(col => col.name !== 'key');
    otherColumns.sort((a, b) => a.displayOrder - b.displayOrder);
    return keyColumn ? [keyColumn, ...otherColumns] : otherColumns;
}


/**
 * Récupération des colonnes d'une DataTable
 */
function getDataTableColumns(dataTableId) {
    if (!dataTableId) {
        return [];
    }
    const dataTable = dataTablesCache.find(dt => dt.id === dataTableId);
    if (!dataTable || !dataTable.schema || !dataTable.schema.properties) {
        console.warn(`DataTable ${dataTableId} non trouvée ou sans schéma`);
        return [];
    }
    // Récupérer la liste des colonnes pour les sélecteurs
    const columnNames = getOrderedColumns(dataTable.schema.properties);
    return columnNames;
}

/**
 * Récupérer les colonnes dans l'ordre de Genesys Cloud
 */
function getOrderedColumns(properties) {
   
    // Trier par ordre de création/modification si disponible
    const columnsWithOrder = Object.keys(properties).map(key => ({
        name: key,
        property: properties[key],
        // Essayer d'extraire un ordre depuis les métadonnées
        order: properties[key].displayOrder || properties[key].position || 0
    }));
    
    // Trier par ordre si disponible, sinon par nom
    columnsWithOrder.sort((a, b) => {
        if (a.order !== b.order) {
            return a.order - b.order;
        }
        return a.name.localeCompare(b.name);
    });
    
    return columnsWithOrder.map(col => col.name);
}

function getColumnTitle(dataTableId, columnName) {
    const dataTable = getDataTableById(dataTableId);
    return dataTable?.schema?.properties?.[columnName]?.title || columnName;
}

/**
 * Extraction de l'ordre des colonnes depuis le schéma
 */
function getSchemaOrderedColumns(schema) {
    if (!schema || !schema.properties) {
        return [];
    }
    
        console.log(`DEBUG getSchemaOrderedColumns`)
    const properties = schema.properties;
    const columns = Object.keys(properties);
    
    // Créer un tableau avec les colonnes et leur displayOrder
    const columnsWithOrder = columns.map(columnName => {
        const property = properties[columnName];
        console.log(`DEBUG Property : ${property}`)
        return {
            name: columnName,
            title: property.title,
            displayOrder: property.displayOrder || 0, // 999 pour les colonnes sans ordre défini
            type: property.type || 'string'
        };
    });
    
    // Trier par displayOrder
    columnsWithOrder.sort((a, b) => a.displayOrder - b.displayOrder);
    
    console.log(`📋 Ordre des colonnes récupéré:`, columnsWithOrder.map(col => `${col.name} (${col.displayOrder})`));
    
    return columnsWithOrder;
}


/**
 * Cache pour optimiser les accès aux données des DataTables
 */
let dataTableRowsCache = {};

/**
 * Fonction pour charger et mettre en cache les données d'une DataTable
 */
async function cacheDataTableRows(dataTableId, maxRows = 50) {
    try {
        if (dataTableRowsCache[dataTableId]) {
            return dataTableRowsCache[dataTableId]; // Déjà en cache
        }
        
        const opts = {
            pageSize: maxRows,
            pageNumber: 1
        };
        
        const data = await architectApi.getFlowsDatatableRows(dataTableId, opts);
        
        if (data.entities) {
            dataTableRowsCache[dataTableId] = data.entities;
            console.log(`📋 ${data.entities.length} lignes mises en cache pour ${dataTableId}`);
        }
        
        return data.entities || [];
        
    } catch (error) {
        console.warn(`Erreur lors de la mise en cache de ${dataTableId}:`, error);
        return [];
    }
}

/**
 * Fonction pour vider le cache
 */
function clearDataTableRowsCache() {
    dataTableRowsCache = {};
    console.log('🗑️ Cache des lignes DataTable vidé');
}

// Chargement des colonnes d'une DataTable
function loadDataTableColumns(datatableId) {
    /*let opts = { 
        expand: "schema" // String | Expand instructions for the result
    };
    architectApi.getFlowsDatatable(datatableId,opts)*/
    getDataTableSchemaWithCache(datatableId)
        .then((dataTable) => {
            console.log('DataTable détaillée:', dataTable);
            // Afficher l'aperçu des données
            displayDataTablePreview(datatableId, dataTable.name);
            displayColumnsConfiguration(datatableId, dataTable.schema.properties);
        })
        .catch((err) => {
            console.error('Erreur lors du chargement des colonnes:', err);
        });
}

// Fonction pour vider le cache (à appeler si nécessaire)
function clearLiaisonCache() {
    liaisonDataCache.clear();
    console.log('🗑️ Cache des liaisons vidé');
}

/**
 * Cache pour les schémas de DataTable
 */
let dataTableSchemaCache = new Map();

/**
 * Récupération du schéma avec cache
 */
async function getDataTableSchemaWithCache(datatableId) {
    // Vérifier le cache
    if (dataTableSchemaCache.has(datatableId)) {
        console.log(`📂 Schéma récupéré depuis le cache pour: ${datatableId}`);
        return dataTableSchemaCache.get(datatableId);
    }
    
    try {
        console.log(`🔄 Récupération du schéma depuis l'API pour: ${datatableId}`);
        let opts = { 
        expand: "schema" // String | Expand instructions for the result
        };
        const dataTableSchema = await architectApi.getFlowsDatatable(datatableId, opts);
        
        // Vérifier la validité avant de mettre en cache
        if (dataTableSchema && dataTableSchema.schema) {
            dataTableSchemaCache.set(datatableId, dataTableSchema);
            console.log(`✅ Schéma mis en cache pour: ${datatableId}`);
        } else {
            console.warn(`⚠️ Schéma invalide reçu pour: ${datatableId}`);
        }
        
        return dataTableSchema;
        
    } catch (error) {
        console.error(`❌ Erreur lors de la récupération du schéma pour ${datatableId}:`, error);
        
        // Retourner un schéma par défaut sans le mettre en cache
        return {
            id: datatableId,
            name: 'Erreur de récupération',
            schema: { properties: {} }
        };
    }
}

/**
 * Fonction pour vider le cache des schémas
 */
function clearDataTableSchemaCache() {
    dataTableSchemaCache.clear();
    console.log('🗑️ Cache des schémas DataTable vidé');
}


// Récupération complète des lignes d'une DataTable
function getAllDataTableRows(datatableId) {
    let allRows = [];
    let pageNumber = 1;
    const pageSize = 100;
    
    function fetchPage() {
        let opts = {
            pageSize: pageSize,
            pageNumber: pageNumber,
            showbrief: false
        };
        
        return architectApi.getFlowsDatatableRows(datatableId, opts)
            .then((data) => {
                //console.log(`DEBUG DataTable ${datatableId} page ${pageNumber} récupérée:`, data.entities.length, 'lignes');
                
                // Ajouter les lignes de cette page
                allRows = allRows.concat(data.entities);
                
                // Vérifier s'il y a d'autres pages
                if (data.pageNumber < data.pageCount) {
                    pageNumber++;
                    return fetchPage();
                } else {
                    console.log(`Toutes les lignes récupérées pour ${datatableId}:`, allRows.length, 'au total');
                    return allRows;
                }
            })
            .catch((err) => {
                console.error(`Erreur lors de la récupération des lignes page ${pageNumber}:`, err);
                throw err;
            });
    }
    
    return fetchPage();
}
