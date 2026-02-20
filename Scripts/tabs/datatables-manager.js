// Cache pour optimiser les validations de liaisons
let liaisonDataCache = new Map();
let liaisonDataPromiseCache = new Map();

// Fonction pour récupérer les données d'une DataTable avec cache
async function getDataTableRowsWithCache(datatableId) {
    if (!datatableId) {
        return [];
    }
    if (liaisonDataCache.has(datatableId)) {
        console.log(`Récupération des données de la DT `,datatableId,` déjà en cache.`)
        return liaisonDataCache.get(datatableId);
    }
    if (liaisonDataPromiseCache.has(datatableId)) {
        console.log(`Reutilisation du chargement en cours pour la DT ${datatableId}`);
        return liaisonDataPromiseCache.get(datatableId);
    }

    console.log(`Chargement des donnees pour DataTable: ${datatableId}`);
    // Charger toutes les pages une seule fois et reutiliser le resultat ensuite.
    const dataPromise = (async () => {
        try {
            let allRows = [];
            let pageNumber = 1;
            const pageSize = 100;

            while (true) {
                const opts = {
                    pageSize: pageSize,
                    pageNumber: pageNumber,
                    showbrief: false
                };

                const data = await architectApi.getFlowsDatatableRows(datatableId, opts);
                const entities = Array.isArray(data && data.entities) ? data.entities : [];
                allRows = allRows.concat(entities);

                const pageCount = (data && typeof data.pageCount === "number") ? data.pageCount : pageNumber;
                if (pageNumber >= pageCount) {
                    break;
                }

                pageNumber += 1;
            }

            liaisonDataCache.set(datatableId, allRows);
            console.log(`Lignes mises en cache pour ${datatableId}:`, allRows.length);
            return allRows;
        } catch (error) {
            console.error(`Erreur lors du chargement de ${datatableId}:`, error);
            throw error;
        }
    })().finally(() => {
        liaisonDataPromiseCache.delete(datatableId);
    });
    liaisonDataPromiseCache.set(datatableId, dataPromise);
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
    
    const properties = schema.properties;
    const columns = Object.keys(properties);
    
    // Créer un tableau avec les colonnes et leur displayOrder
    const columnsWithOrder = columns.map(columnName => {
        const property = properties[columnName];
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
    liaisonDataPromiseCache.clear();
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

