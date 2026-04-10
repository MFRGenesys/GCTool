

//############################        START CONFIG        #############################

function i18nConfig(key, fallback, params) {
    if (window.GCToolI18n && typeof window.GCToolI18n.t === 'function') {
        return window.GCToolI18n.t(key, params, fallback);
    }
    return fallback;
}

const DATATABLE_CONTROLLER_STORAGE_KEY = 'gctool.datatableController.orgCapsules';
const DATATABLE_CONTROLLER_STORAGE_VERSION = 1;
const LEGACY_DATATABLE_CONFIG_KEY = 'genesysDataTableConfigs';
const LEGACY_LIAISON_MAPPING_KEY = 'genesysLiaisonMapping';

function getDataTableControllerStorageBackend() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return null;
    }

    try {
        return window.localStorage;
    } catch (error) {
        console.warn('[DT Controller] LocalStorage indisponible.', error);
        return null;
    }
}

function getAvailableDataTablesCache() {
    return typeof dataTablesCache !== 'undefined' && Array.isArray(dataTablesCache)
        ? dataTablesCache
        : [];
}

function getExistingDataTableNameById(datatableId) {
    if (!datatableId) {
        return '';
    }

    const dataTable = getAvailableDataTablesCache().find(dt => dt && dt.id === datatableId);
    return dataTable && typeof dataTable.name === 'string' ? dataTable.name : '';
}

function normalizeDataTableControllerStorageKeyPart(value, fallback) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    return normalized || fallback;
}

function buildCurrentDataTableControllerOrgContext() {
    const appOrganization = typeof appState !== 'undefined'
        && appState
        && appState.currentUser
        && appState.currentUser.organization
        ? appState.currentUser.organization
        : null;
    const selectedConfig = typeof selectedOrgConfig !== 'undefined' && selectedOrgConfig
        ? selectedOrgConfig
        : (typeof appState !== 'undefined' && appState && appState.currentUser
            ? appState.currentUser.selectedOrgConfig
            : null);
    const orgId = (typeof currentOrgId === 'string' && currentOrgId)
        || (appOrganization && typeof appOrganization.id === 'string' ? appOrganization.id : '');
    const orgName = (appOrganization && typeof appOrganization.name === 'string' && appOrganization.name)
        || (selectedConfig && typeof selectedConfig.name === 'string' ? selectedConfig.name : '')
        || 'Organisation inconnue';
    const orgKey = typeof selectedOrgKey === 'string' && selectedOrgKey ? selectedOrgKey : '';
    const region = typeof ORGREGION === 'string' && ORGREGION ? ORGREGION : '';
    const clientId = selectedConfig && typeof selectedConfig.clientId === 'string'
        ? selectedConfig.clientId
        : '';

    let capsuleKey = '';
    if (orgId) {
        capsuleKey = `orgId:${orgId}`;
    } else if (orgKey) {
        capsuleKey = `orgKey:${orgKey}`;
    } else {
        capsuleKey = [
            'org',
            normalizeDataTableControllerStorageKeyPart(orgName, 'unknown'),
            normalizeDataTableControllerStorageKeyPart(region, 'default'),
            normalizeDataTableControllerStorageKeyPart(clientId, 'client')
        ].join(':');
    }

    return {
        capsuleKey,
        orgId,
        orgKey,
        orgName,
        region,
        clientId
    };
}

function deepCloneDataTableControllerValue(value) {
    return JSON.parse(JSON.stringify(value || {}));
}

function normalizeStoredColumnConfiguration(columnConfig) {
    if (!columnConfig || typeof columnConfig !== 'object' || Array.isArray(columnConfig)) {
        return null;
    }

    const normalized = { ...columnConfig };
    if (normalized.type === 'liaison') {
        const liaisonTargetId = typeof normalized.liaisonTarget === 'string' ? normalized.liaisonTarget : '';
        const liaisonTargetName = typeof normalized.liaisonTargetName === 'string'
            ? normalized.liaisonTargetName
            : getExistingDataTableNameById(liaisonTargetId);

        normalized.liaisonTarget = liaisonTargetId;
        normalized.liaisonTargetName = liaisonTargetName || '';
    }

    return normalized;
}

function normalizeStoredDataTableConfiguration(configuration, fallbackDatatableId, fallbackDatatableName) {
    if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
        return null;
    }

    const normalizedColumns = {};
    const sourceColumns = configuration.columns && typeof configuration.columns === 'object'
        ? configuration.columns
        : {};

    Object.keys(sourceColumns).forEach(columnName => {
        const normalizedColumn = normalizeStoredColumnConfiguration(sourceColumns[columnName]);
        if (normalizedColumn) {
            normalizedColumns[columnName] = normalizedColumn;
        }
    });

    const datatableId = typeof configuration.datatableId === 'string' && configuration.datatableId
        ? configuration.datatableId
        : (typeof fallbackDatatableId === 'string' ? fallbackDatatableId : '');
    const datatableName = typeof configuration.datatableName === 'string' && configuration.datatableName
        ? configuration.datatableName
        : (typeof fallbackDatatableName === 'string' && fallbackDatatableName
            ? fallbackDatatableName
            : getExistingDataTableNameById(datatableId));

    return {
        ...configuration,
        datatableId,
        datatableName: datatableName || '',
        columns: normalizedColumns
    };
}

function normalizeStoredDataTableConfigurationsMap(configurationsMap) {
    if (!configurationsMap || typeof configurationsMap !== 'object' || Array.isArray(configurationsMap)) {
        return {};
    }

    const normalizedMap = {};
    Object.keys(configurationsMap).forEach(datatableId => {
        const configuration = configurationsMap[datatableId];
        const fallbackName = configuration && typeof configuration.datatableName === 'string'
            ? configuration.datatableName
            : getExistingDataTableNameById(datatableId);
        const normalizedConfiguration = normalizeStoredDataTableConfiguration(configuration, datatableId, fallbackName);
        if (normalizedConfiguration) {
            normalizedMap[datatableId] = normalizedConfiguration;
        }
    });

    return normalizedMap;
}

function normalizeStoredLiaisonMappingEntry(mappingValue) {
    if (typeof mappingValue === 'string') {
        return {
            datatableId: mappingValue,
            datatableName: getExistingDataTableNameById(mappingValue) || ''
        };
    }

    if (!mappingValue || typeof mappingValue !== 'object' || Array.isArray(mappingValue)) {
        return null;
    }

    const datatableId = typeof mappingValue.datatableId === 'string' ? mappingValue.datatableId : '';
    const datatableName = typeof mappingValue.datatableName === 'string' && mappingValue.datatableName
        ? mappingValue.datatableName
        : getExistingDataTableNameById(datatableId);

    return {
        datatableId,
        datatableName: datatableName || ''
    };
}

function normalizeStoredLiaisonMappingMap(mappingMap) {
    if (!mappingMap || typeof mappingMap !== 'object' || Array.isArray(mappingMap)) {
        return {};
    }

    const normalizedMap = {};
    Object.keys(mappingMap).forEach(key => {
        const normalizedEntry = normalizeStoredLiaisonMappingEntry(mappingMap[key]);
        if (normalizedEntry) {
            normalizedMap[key] = normalizedEntry;
        }
    });

    return normalizedMap;
}

function normalizeDataTableControllerOrgCapsule(capsuleKey, rawCapsule) {
    const capsule = rawCapsule && typeof rawCapsule === 'object' && !Array.isArray(rawCapsule)
        ? rawCapsule
        : {};
    const rawOrg = capsule.org && typeof capsule.org === 'object' && !Array.isArray(capsule.org)
        ? capsule.org
        : {};
    const currentContext = buildCurrentDataTableControllerOrgContext();

    return {
        org: {
            capsuleKey,
            orgId: typeof rawOrg.orgId === 'string' ? rawOrg.orgId : '',
            orgKey: typeof rawOrg.orgKey === 'string' ? rawOrg.orgKey : '',
            orgName: typeof rawOrg.orgName === 'string' && rawOrg.orgName
                ? rawOrg.orgName
                : (capsuleKey === currentContext.capsuleKey ? currentContext.orgName : ''),
            region: typeof rawOrg.region === 'string' ? rawOrg.region : '',
            clientId: typeof rawOrg.clientId === 'string' ? rawOrg.clientId : ''
        },
        dataTableConfigurations: normalizeStoredDataTableConfigurationsMap(capsule.dataTableConfigurations),
        liaisonMapping: normalizeStoredLiaisonMappingMap(capsule.liaisonMapping),
        createdAt: typeof capsule.createdAt === 'string' ? capsule.createdAt : '',
        updatedAt: typeof capsule.updatedAt === 'string' ? capsule.updatedAt : ''
    };
}

function normalizeDataTableControllerStorageState(rawState) {
    const parsed = rawState && typeof rawState === 'object' && !Array.isArray(rawState)
        ? rawState
        : {};
    const rawCapsules = parsed.orgCapsules && typeof parsed.orgCapsules === 'object' && !Array.isArray(parsed.orgCapsules)
        ? parsed.orgCapsules
        : {};
    const normalizedCapsules = {};

    Object.keys(rawCapsules).forEach(capsuleKey => {
        normalizedCapsules[capsuleKey] = normalizeDataTableControllerOrgCapsule(capsuleKey, rawCapsules[capsuleKey]);
    });

    return {
        version: DATATABLE_CONTROLLER_STORAGE_VERSION,
        orgCapsules: normalizedCapsules
    };
}

function readDataTableControllerStorageState() {
    const storage = getDataTableControllerStorageBackend();
    if (!storage) {
        return normalizeDataTableControllerStorageState(null);
    }

    try {
        const rawValue = storage.getItem(DATATABLE_CONTROLLER_STORAGE_KEY);
        if (!rawValue) {
            return normalizeDataTableControllerStorageState(null);
        }
        return normalizeDataTableControllerStorageState(JSON.parse(rawValue));
    } catch (error) {
        console.error('[DT Controller] Erreur de lecture du stockage par org.', error);
        return normalizeDataTableControllerStorageState(null);
    }
}

function writeDataTableControllerStorageState(state) {
    const storage = getDataTableControllerStorageBackend();
    if (!storage) {
        return false;
    }

    try {
        storage.setItem(
            DATATABLE_CONTROLLER_STORAGE_KEY,
            JSON.stringify(normalizeDataTableControllerStorageState(state))
        );
        return true;
    } catch (error) {
        console.error('[DT Controller] Erreur d\'écriture du stockage par org.', error);
        return false;
    }
}

function ensureDataTableControllerCurrentOrgCapsule(state) {
    const orgContext = buildCurrentDataTableControllerOrgContext();
    if (!state.orgCapsules[orgContext.capsuleKey]) {
        state.orgCapsules[orgContext.capsuleKey] = normalizeDataTableControllerOrgCapsule(orgContext.capsuleKey, {
            org: orgContext,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }

    const capsule = state.orgCapsules[orgContext.capsuleKey];
    capsule.org = {
        capsuleKey: orgContext.capsuleKey,
        orgId: orgContext.orgId,
        orgKey: orgContext.orgKey,
        orgName: orgContext.orgName,
        region: orgContext.region,
        clientId: orgContext.clientId
    };
    if (!capsule.createdAt) {
        capsule.createdAt = new Date().toISOString();
    }
    capsule.updatedAt = new Date().toISOString();

    return {
        orgContext,
        capsule
    };
}

function applyStoredDataTableControllerCapsuleToRuntime(capsule) {
    dataTableConfigurations = deepCloneDataTableControllerValue(capsule.dataTableConfigurations);

    Object.keys(LIAISON_MAPPING).forEach(key => {
        delete LIAISON_MAPPING[key];
    });

    Object.keys(capsule.liaisonMapping).forEach(key => {
        const mappingEntry = capsule.liaisonMapping[key];
        if (mappingEntry && mappingEntry.datatableId) {
            LIAISON_MAPPING[key] = mappingEntry.datatableId;
        }
    });
}

function buildStoredDataTableConfigurationsSnapshot() {
    return normalizeStoredDataTableConfigurationsMap(dataTableConfigurations);
}

function buildStoredLiaisonMappingSnapshot() {
    return normalizeStoredLiaisonMappingMap(LIAISON_MAPPING);
}

function getLegacyCookieValue(cookieName) {
    const cookies = String(document.cookie || '').split(';');
    for (let i = 0; i < cookies.length; i += 1) {
        const part = cookies[i].trim();
        if (!part) {
            continue;
        }

        const separatorIndex = part.indexOf('=');
        if (separatorIndex === -1) {
            continue;
        }

        const name = part.substring(0, separatorIndex).trim();
        const value = part.substring(separatorIndex + 1);
        if (name === cookieName) {
            return value;
        }
    }

    return '';
}

function readLegacyFlatDataTableControllerStorage() {
    const storage = getDataTableControllerStorageBackend();
    let rawConfigurations = null;
    let rawMapping = null;

    if (storage) {
        try {
            const storedConfigurations = storage.getItem(LEGACY_DATATABLE_CONFIG_KEY);
            if (storedConfigurations) {
                rawConfigurations = JSON.parse(storedConfigurations);
            }
        } catch (error) {
            console.warn('[DT Controller] Erreur de lecture du legacy localStorage pour les configurations.', error);
        }

        try {
            const storedMapping = storage.getItem(LEGACY_LIAISON_MAPPING_KEY);
            if (storedMapping) {
                rawMapping = JSON.parse(storedMapping);
            }
        } catch (error) {
            console.warn('[DT Controller] Erreur de lecture du legacy localStorage pour le mapping.', error);
        }
    }

    if (!rawConfigurations) {
        try {
            const cookieValue = getLegacyCookieValue(LEGACY_DATATABLE_CONFIG_KEY);
            if (cookieValue) {
                rawConfigurations = JSON.parse(decodeURIComponent(cookieValue));
            }
        } catch (error) {
            console.warn('[DT Controller] Erreur de lecture du cookie legacy pour les configurations.', error);
        }
    }

    if (!rawMapping) {
        try {
            const cookieValue = getLegacyCookieValue(LEGACY_LIAISON_MAPPING_KEY);
            if (cookieValue) {
                rawMapping = JSON.parse(decodeURIComponent(cookieValue));
            }
        } catch (error) {
            console.warn('[DT Controller] Erreur de lecture du cookie legacy pour le mapping.', error);
        }
    }

    const configurations = normalizeStoredDataTableConfigurationsMap(rawConfigurations);
    const liaisonMapping = normalizeStoredLiaisonMappingMap(rawMapping);

    return {
        dataTableConfigurations: configurations,
        liaisonMapping,
        hasLegacyData: Object.keys(configurations).length > 0 || Object.keys(liaisonMapping).length > 0
    };
}

function clearLegacyDataTableControllerStorage() {
    const storage = getDataTableControllerStorageBackend();
    if (storage) {
        try {
            storage.removeItem(LEGACY_DATATABLE_CONFIG_KEY);
            storage.removeItem(LEGACY_LIAISON_MAPPING_KEY);
        } catch (error) {
            console.warn('[DT Controller] Nettoyage legacy localStorage incomplet.', error);
        }
    }

    document.cookie = `${LEGACY_DATATABLE_CONFIG_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    document.cookie = `${LEGACY_LIAISON_MAPPING_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

function migrateLegacyDataTableControllerStorageIntoCurrentCapsule(state, capsule) {
    const legacyData = readLegacyFlatDataTableControllerStorage();
    if (!legacyData.hasLegacyData) {
        return false;
    }

    const capsuleHasConfigurations = Object.keys(capsule.dataTableConfigurations).length > 0;
    const capsuleHasMappings = Object.keys(capsule.liaisonMapping).length > 0;

    if (!capsuleHasConfigurations && Object.keys(legacyData.dataTableConfigurations).length > 0) {
        capsule.dataTableConfigurations = deepCloneDataTableControllerValue(legacyData.dataTableConfigurations);
    }

    if (!capsuleHasMappings && Object.keys(legacyData.liaisonMapping).length > 0) {
        capsule.liaisonMapping = deepCloneDataTableControllerValue(legacyData.liaisonMapping);
    }

    capsule.updatedAt = new Date().toISOString();
    writeDataTableControllerStorageState(state);
    clearLegacyDataTableControllerStorage();
    console.log('[DT Controller] Migration du stockage legacy vers la capsule org courante terminée.');
    return true;
}

function persistCurrentDataTableControllerOrgCapsule() {
    const state = readDataTableControllerStorageState();
    const { capsule } = ensureDataTableControllerCurrentOrgCapsule(state);
    capsule.dataTableConfigurations = buildStoredDataTableConfigurationsSnapshot();
    capsule.liaisonMapping = buildStoredLiaisonMappingSnapshot();
    capsule.updatedAt = new Date().toISOString();
    return writeDataTableControllerStorageState(state);
}

function loadCurrentDataTableControllerOrgCapsule() {
    const state = readDataTableControllerStorageState();
    const { capsule } = ensureDataTableControllerCurrentOrgCapsule(state);
    migrateLegacyDataTableControllerStorageIntoCurrentCapsule(state, capsule);
    writeDataTableControllerStorageState(state);
    applyStoredDataTableControllerCapsuleToRuntime(capsule);
    return capsule;
}

function buildDataTableIndexByNormalizedName() {
    const map = new Map();
    getAvailableDataTablesCache().forEach(dataTable => {
        if (!dataTable || typeof dataTable.name !== 'string') {
            return;
        }
        const key = normalizeDataTableControllerStorageKeyPart(dataTable.name, '');
        if (key && !map.has(key)) {
            map.set(key, dataTable);
        }
    });
    return map;
}

function buildDataTableControllerCapsuleLabel(capsule) {
    if (!capsule || !capsule.org) {
        return 'Organisation inconnue';
    }

    return capsule.org.orgName
        || capsule.org.orgKey
        || capsule.org.orgId
        || 'Organisation inconnue';
}

function getStoredDatatableNameFromCapsule(capsule, datatableId) {
    if (!capsule || !datatableId) {
        return '';
    }

    if (capsule.dataTableConfigurations && capsule.dataTableConfigurations[datatableId]) {
        return capsule.dataTableConfigurations[datatableId].datatableName || '';
    }

    if (capsule.liaisonMapping) {
        const mappingEntry = Object.values(capsule.liaisonMapping).find(entry => entry && entry.datatableId === datatableId);
        if (mappingEntry && mappingEntry.datatableName) {
            return mappingEntry.datatableName;
        }
    }

    return '';
}

function buildCopiedConfigurationForCurrentOrg(sourceConfiguration, sourceCapsule, targetDataTableIndex) {
    const sourceNameKey = normalizeDataTableControllerStorageKeyPart(sourceConfiguration.datatableName, '');
    const targetDataTable = sourceNameKey ? targetDataTableIndex.get(sourceNameKey) : null;

    if (!targetDataTable) {
        return {
            success: false,
            reason: 'DataTable absente sur l\'org cible'
        };
    }

    const copiedConfiguration = deepCloneDataTableControllerValue(sourceConfiguration);
    copiedConfiguration.datatableId = targetDataTable.id;
    copiedConfiguration.datatableName = targetDataTable.name;

    const sourceColumns = copiedConfiguration.columns && typeof copiedConfiguration.columns === 'object'
        ? copiedConfiguration.columns
        : {};

    for (const columnName of Object.keys(sourceColumns)) {
        const columnConfiguration = sourceColumns[columnName];
        if (!columnConfiguration || columnConfiguration.type !== 'liaison') {
            continue;
        }

        const sourceTargetName = columnConfiguration.liaisonTargetName
            || getStoredDatatableNameFromCapsule(sourceCapsule, columnConfiguration.liaisonTarget);
        const targetNameKey = normalizeDataTableControllerStorageKeyPart(sourceTargetName, '');
        const targetLinkedDataTable = targetNameKey ? targetDataTableIndex.get(targetNameKey) : null;

        if (!targetLinkedDataTable) {
            return {
                success: false,
                reason: `Liaison "${sourceTargetName || columnConfiguration.liaisonTarget || columnName}" introuvable sur l'org cible`
            };
        }

        columnConfiguration.liaisonTarget = targetLinkedDataTable.id;
        columnConfiguration.liaisonTargetName = targetLinkedDataTable.name;
    }

    return {
        success: true,
        datatableId: targetDataTable.id,
        datatableName: targetDataTable.name,
        configuration: normalizeStoredDataTableConfiguration(
            copiedConfiguration,
            targetDataTable.id,
            targetDataTable.name
        )
    };
}

function formatCopySummaryList(title, items, emptyLabel) {
    let content = `${title} (${items.length})`;
    if (!items.length) {
        return `${content}\n- ${emptyLabel}`;
    }

    items.forEach(item => {
        content += `\n- ${item}`;
    });
    return content;
}

function showDataTableControllerCopyResult(sourceLabel, copiedTables, failedTables, copiedMappings, failedMappings) {
    const currentContext = buildCurrentDataTableControllerOrgContext();
    const lines = [
        'Copie terminée',
        '',
        `Source : ${sourceLabel}`,
        `Cible : ${currentContext.orgName}`,
        '',
        formatCopySummaryList('Configurations copiées', copiedTables, 'aucune'),
        '',
        formatCopySummaryList('Configurations en échec', failedTables, 'aucune'),
        '',
        `Mappings copiés : ${copiedMappings}`,
        formatCopySummaryList('Mappings en échec', failedMappings, 'aucun')
    ];

    alert(lines.join('\n'));
}

function refreshDataTableControllerCopySourceOptions() {
    const select = document.getElementById('dtControllerCopySourceSelect');
    const button = document.getElementById('dtControllerCopySourceBtn');
    const help = document.getElementById('dtControllerCopySourceHelp');

    if (!select || !button || !help) {
        return;
    }

    const state = readDataTableControllerStorageState();
    const { orgContext } = ensureDataTableControllerCurrentOrgCapsule(state);
    const availableSources = Object.values(state.orgCapsules)
        .filter(capsule => capsule && capsule.org && capsule.org.capsuleKey !== orgContext.capsuleKey)
        .filter(capsule => Object.keys(capsule.dataTableConfigurations).length > 0 || Object.keys(capsule.liaisonMapping).length > 0)
        .sort((left, right) => buildDataTableControllerCapsuleLabel(left).localeCompare(buildDataTableControllerCapsuleLabel(right)));

    select.innerHTML = '';
    if (!availableSources.length) {
        select.innerHTML = '<option value="">Aucune autre org disponible</option>';
        select.disabled = true;
        button.disabled = true;
        help.textContent = `Org courante : ${orgContext.orgName}. Connecte-toi à une autre org et sauvegarde une configuration pour la rendre copiable ici.`;
        return;
    }

    select.disabled = false;
    button.disabled = false;
    select.appendChild(new Option('Sélectionner une org source...', '', true, false));

    availableSources.forEach(capsule => {
        const configCount = Object.keys(capsule.dataTableConfigurations).length;
        const mappingCount = Object.keys(capsule.liaisonMapping).length;
        const optionLabel = `${buildDataTableControllerCapsuleLabel(capsule)} (${configCount} DT / ${mappingCount} mappings)`;
        select.appendChild(new Option(optionLabel, capsule.org.capsuleKey));
    });

    if (!select.value) {
        select.selectedIndex = 0;
    }
    help.textContent = `Org courante : ${orgContext.orgName}. La copie rattache les DataTables par nom, puis met à jour les IDs de l'org cible.`;
}

function copyDataTableControllerDataFromSelectedOrg() {
    const select = document.getElementById('dtControllerCopySourceSelect');
    if (!select || !select.value) {
        alert('Sélectionne d\'abord une org source à copier.');
        return;
    }

    const state = readDataTableControllerStorageState();
    const { orgContext, capsule: currentCapsule } = ensureDataTableControllerCurrentOrgCapsule(state);
    const sourceCapsule = state.orgCapsules[select.value];

    if (!sourceCapsule) {
        alert('La capsule source sélectionnée est introuvable.');
        refreshDataTableControllerCopySourceOptions();
        return;
    }

    if (sourceCapsule.org && sourceCapsule.org.capsuleKey === orgContext.capsuleKey) {
        alert('La copie depuis l\'org courante n\'est pas nécessaire.');
        return;
    }

    const targetDataTableIndex = buildDataTableIndexByNormalizedName();
    const nextConfigurations = deepCloneDataTableControllerValue(dataTableConfigurations);
    const copiedTables = [];
    const failedTables = [];
    const failedMappings = [];
    let copiedMappings = 0;

    Object.keys(sourceCapsule.dataTableConfigurations).forEach(sourceDatatableId => {
        const sourceConfiguration = sourceCapsule.dataTableConfigurations[sourceDatatableId];
        const sourceDatatableName = sourceConfiguration && sourceConfiguration.datatableName
            ? sourceConfiguration.datatableName
            : sourceDatatableId;
        const copyResult = buildCopiedConfigurationForCurrentOrg(sourceConfiguration, sourceCapsule, targetDataTableIndex);

        if (!copyResult.success) {
            failedTables.push(`${sourceDatatableName} : ${copyResult.reason}`);
            return;
        }

        nextConfigurations[copyResult.datatableId] = copyResult.configuration;
        copiedTables.push(copyResult.datatableName);
    });

    const nextMapping = { ...LIAISON_MAPPING };
    Object.keys(sourceCapsule.liaisonMapping).forEach(mappingKey => {
        const mappingEntry = sourceCapsule.liaisonMapping[mappingKey];
        const sourceDatatableName = mappingEntry && mappingEntry.datatableName
            ? mappingEntry.datatableName
            : mappingEntry && mappingEntry.datatableId
                ? getStoredDatatableNameFromCapsule(sourceCapsule, mappingEntry.datatableId)
                : '';
        const normalizedName = normalizeDataTableControllerStorageKeyPart(sourceDatatableName, '');
        const targetDataTable = normalizedName ? targetDataTableIndex.get(normalizedName) : null;

        if (!targetDataTable) {
            failedMappings.push(`${mappingKey} -> ${sourceDatatableName || 'DataTable introuvable'}`);
            return;
        }

        nextMapping[mappingKey] = targetDataTable.id;
        copiedMappings += 1;
    });

    dataTableConfigurations = normalizeStoredDataTableConfigurationsMap(nextConfigurations);
    Object.keys(LIAISON_MAPPING).forEach(key => {
        delete LIAISON_MAPPING[key];
    });
    Object.keys(nextMapping).forEach(key => {
        LIAISON_MAPPING[key] = nextMapping[key];
    });

    currentCapsule.dataTableConfigurations = buildStoredDataTableConfigurationsSnapshot();
    currentCapsule.liaisonMapping = buildStoredLiaisonMappingSnapshot();
    currentCapsule.updatedAt = new Date().toISOString();
    writeDataTableControllerStorageState(state);

    if (mappingDisplayed) {
        tempLiaisonMapping = { ...LIAISON_MAPPING };
        displayCurrentMapping();
    }

    displayDataTables();
    updateCurrentConfigInfo();
    if (typeof refreshAllAutoLinkBoxes === 'function') {
        refreshAllAutoLinkBoxes();
    }

    showDataTableControllerCopyResult(
        buildDataTableControllerCapsuleLabel(sourceCapsule),
        copiedTables,
        failedTables,
        copiedMappings,
        failedMappings
    );
}


// Chargement d'une configuration existante - Version mise à jour
function loadExistingConfiguration(datatableId, scopeRoot) {
    const config = dataTableConfigurations[datatableId];
    if (!config || !config.columns) return;
    const root = scopeRoot || document;
    
    Object.keys(config.columns).forEach(columnName => {
        const columnConfig = config.columns[columnName];
        const typeSelect = root.querySelector(`.column-type[data-column="${columnName}"]`) || root.querySelector('.column-type');
        
        if (typeSelect) {
            typeSelect.value = columnConfig.type;
            
            // Déclencher l'événement change pour afficher les bons sélecteurs
            typeSelect.dispatchEvent(new Event('change'));
            
            // Charger les valeurs spécifiques selon le type
            if (columnConfig.type === 'liaison' && columnConfig.liaisonTarget) {
                const liaisonSelect = root.querySelector(`.liaison-target[data-column="${columnName}"]`) || root.querySelector('.liaison-target');
                if (liaisonSelect) {
                    liaisonSelect.value = columnConfig.liaisonTarget;
                }
            } else if (columnConfig.type === 'liaison_auto' && columnConfig.liaisonAutoColumn) {
                const liaisonAutoSelect = root.querySelector(`.liaison-auto-column[data-column="${columnName}"]`) || root.querySelector('.liaison-auto-column');
                if (liaisonAutoSelect) {
                    liaisonAutoSelect.value = columnConfig.liaisonAutoColumn;
                }
            } else if (columnConfig.type === 'liste' && columnConfig.listeValues) {
                const listeTextarea = root.querySelector(`.liste-values[data-column="${columnName}"]`) || root.querySelector('.liste-values');
                const allowNullCheckbox = root.querySelector(`.liste-allow-null[data-column="${columnName}"]`) || root.querySelector('.liste-allow-null');
                const ignoreCaseCheckbox = root.querySelector(`.liste-ignore-case[data-column="${columnName}"]`) || root.querySelector('.liste-ignore-case');
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
                const regexInput = root.querySelector(`.regex-pattern[data-column="${columnName}"]`) || root.querySelector('.regex-pattern');
                const descriptionInput = root.querySelector(`.regex-description[data-column="${columnName}"]`) || root.querySelector('.regex-description');
                const allowNullCheckbox = root.querySelector(`.regex-allow-null[data-column="${columnName}"]`) || root.querySelector('.regex-allow-null');
                
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
function saveConfiguration(datatableId) {
    const resolvedDatatableId = datatableId;
    if (!resolvedDatatableId) {
        alert(i18nConfig('tab.datatables_controller.config.alert.internal_missing_datatable', 'Internal error: DataTable not found for save.'));
        return;
    }

    const scopeRoot = document.getElementById(`config-${resolvedDatatableId}`) || document.getElementById('columnsConfig');
    if (!scopeRoot) {
        alert(i18nConfig('tab.datatables_controller.config.alert.internal_missing_config_zone', 'Internal error: configuration zone not found.'));
        return;
    }

    const configuration = {
        datatableId: resolvedDatatableId,
        datatableName: getExistingDataTableNameById(resolvedDatatableId),
        columns: {}
    };

    let hasErrors = false;

    scopeRoot.querySelectorAll('.column-type').forEach(select => {
        if (hasErrors) {
            return;
        }

        const columnName = select.getAttribute('data-column');
        const columnType = select.value;

        if (columnType) {
            configuration.columns[columnName] = { type: columnType };
            
            if (columnType === 'liaison') {
                const liaisonTarget = scopeRoot.querySelector(`.liaison-target[data-column="${columnName}"]`);
                if (liaisonTarget && liaisonTarget.value) {
                    configuration.columns[columnName].liaisonTarget = liaisonTarget.value;
                    configuration.columns[columnName].liaisonTargetName = getExistingDataTableNameById(liaisonTarget.value);
                }
            } else if (columnType === 'liaison_auto') {
                const liaisonAutoColumn = scopeRoot.querySelector(`.liaison-auto-column[data-column="${columnName}"]`);
                if (liaisonAutoColumn && liaisonAutoColumn.value) {
                    configuration.columns[columnName].liaisonAutoColumn = liaisonAutoColumn.value;
                }
            } else if (columnType === 'liste') {
                const listeTextarea = scopeRoot.querySelector(`.liste-values[data-column="${columnName}"]`);
                const allowNullCheckbox = scopeRoot.querySelector(`.liste-allow-null[data-column="${columnName}"]`);
                const ignoreCaseCheckbox = scopeRoot.querySelector(`.liste-ignore-case[data-column="${columnName}"]`);
                if (listeTextarea && listeTextarea.value.trim()) {
                    const values = parseListeValues(listeTextarea.value);
                    if (values.length > 0) {
                        configuration.columns[columnName].listeValues = values;
                        // Ajouter l'option pour les valeurs null
                        configuration.columns[columnName].allowNull = allowNullCheckbox ? allowNullCheckbox.checked : false;
                        // Ajouter l'option pour la casse
                        configuration.columns[columnName].ignoreCase = ignoreCaseCheckbox ? ignoreCaseCheckbox.checked : false;
                    } else {
                        alert(i18nConfig('tab.datatables_controller.config.alert.list_min_one_value', 'Please enter at least one value for column "{column}"', { column: columnName }));
                        listeTextarea.focus();
                        hasErrors = true;
                        return;
                    }
                } else {
                    alert(i18nConfig('tab.datatables_controller.config.alert.list_missing_values', 'Please configure possible values for column "{column}"', { column: columnName }));
                    hasErrors = true;
                    return;
                }
            } else if (columnType === 'regex') {
                const regexInput = scopeRoot.querySelector(`.regex-pattern[data-column="${columnName}"]`);
                const descriptionInput = scopeRoot.querySelector(`.regex-description[data-column="${columnName}"]`);
                const allowNullCheckbox = scopeRoot.querySelector(`.regex-allow-null[data-column="${columnName}"]`);
                
                if (regexInput && regexInput.value.trim()) {
                    const pattern = regexInput.value.trim();
                    
                    // Valider l'expression régulière
                    try {
                        new RegExp(pattern);
                        configuration.columns[columnName].regexPattern = pattern;
                        configuration.columns[columnName].regexDescription = descriptionInput ? descriptionInput.value.trim() : '';
                        configuration.columns[columnName].allowNull = allowNullCheckbox ? allowNullCheckbox.checked : false;
                    } catch (error) {
                        alert(i18nConfig('tab.datatables_controller.config.alert.regex_invalid', 'Invalid regex for column "{column}": {error}', { column: columnName, error: error.message }));
                        regexInput.focus();
                        hasErrors = true;
                        return;
                    }
                } else {
                    alert(i18nConfig('tab.datatables_controller.config.alert.regex_required', 'Please enter a regex for column "{column}"', { column: columnName }));
                    hasErrors = true;
                    return;
                }
            }
        }
    });

    if (hasErrors) {
        return;
    }
    
    // Sauvegarder dans les configurations et la capsule locale de l'org courante
    dataTableConfigurations[resolvedDatatableId] = normalizeStoredDataTableConfiguration(
        configuration,
        resolvedDatatableId,
        configuration.datatableName
    );
    saveConfigurationsToCookie();

    if (typeof updateDataTableListItemState === 'function') {
        updateDataTableListItemState(resolvedDatatableId);
    }
    updateCurrentConfigInfo();

    console.log('Configuration sauvegardee pour:', resolvedDatatableId);
}



// Gestion du stockage par org
function saveConfigurationsToCookie() {
    persistCurrentDataTableControllerOrgCapsule();
}

function loadSavedConfigurations() {
    loadCurrentDataTableControllerOrgCapsule();
}

/**
 * Gestion de l'affichage de la section import/export
 */
function toggleImportExportSection() {
    const section = document.getElementById('importExportSection');
    const button = event.target;
    
    if (section.style.display === 'none') {
        section.style.display = 'block';
        button.innerHTML = `<i class="fa fa-times"></i> ${i18nConfig('tab.datatables_controller.import_export.close', 'Close import/export')}`;
        updateCurrentConfigInfo();
    } else {
        section.style.display = 'none';
        button.innerHTML = `<i class="fa fa-exchange"></i> ${i18nConfig('tab.datatables_controller.import_export.manage', 'Manage import/export')}`;
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
    refreshDataTableControllerCopySourceOptions();
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
            const storedConfigurations = buildStoredDataTableConfigurationsSnapshot();
            exportData.dataTableConfigurations = {};

            Object.keys(storedConfigurations).forEach(datatableId => {
                const config = storedConfigurations[datatableId];
                exportData.dataTableConfigurations[datatableId] = {
                    datatableName: config.datatableName || getDataTableNameById(datatableId),
                    configuration: config,
                    exportTimestamp: new Date().toISOString()
                };
            });

            console.log(`📊 ${Object.keys(exportData.dataTableConfigurations).length} configurations de DataTables exportées`);
        }
        
        // Ajouter le mapping des liaisons si demandé
        if (exportOptions.liaisonMapping) {
            exportData.liaisonMapping = buildStoredLiaisonMappingSnapshot();
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
        
        alert(i18nConfig('tab.datatables_controller.config.alert.export_success', 'Configuration exported successfully to file: {filename}', { filename }));
        console.log('✅ Export terminé avec succès');
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'export:', error);
        alert(i18nConfig('tab.datatables_controller.config.alert.export_error', 'Error while exporting configuration. Check console for details.'));
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
                dataTableConfigurations: deepCloneDataTableControllerValue(dataTableConfigurations),
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
            
            // Sauvegarder dans la capsule de l'org courante
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
        alert(i18nConfig('tab.datatables_controller.config.alert.read_file_error', 'Error while reading file'));
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
                const normalizedConfiguration = normalizeStoredDataTableConfiguration(
                    importedConfig.configuration,
                    datatableId,
                    importedConfig.datatableName || ''
                );
                if (normalizedConfiguration) {
                    dataTableConfigurations[datatableId] = normalizedConfiguration;
                }
                importedConfigs++;
                console.log(`📋 Configuration importée pour: ${importedConfig.datatableName || datatableId}`);
            }
        });
    }
    
    // Importer le mapping des liaisons
    if (importedData.liaisonMapping) {
        Object.keys(importedData.liaisonMapping).forEach(key => {
            const mapping = importedData.liaisonMapping[key];

            const normalizedMapping = normalizeStoredLiaisonMappingEntry(mapping);
            if (normalizedMapping && normalizedMapping.datatableId) {
                LIAISON_MAPPING[key] = normalizedMapping.datatableId;
                importedMappings++;
                console.log(`🔗 Mapping importé: ${key} -> ${normalizedMapping.datatableName || normalizedMapping.datatableId}`);
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
    const icon = isSuccess ? '[OK]' : '[ERR]';
    const title = isSuccess
        ? i18nConfig('tab.datatables_controller.config.import.success_title', 'Import successful')
        : i18nConfig('tab.datatables_controller.config.import.error_title', 'Import error');
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
    const config = normalizeStoredDataTableConfiguration(
        dataTableConfigurations[datatableId],
        datatableId,
        getDataTableNameById(datatableId)
    );
    if (!config) {
        alert(i18nConfig('tab.datatables_controller.config.alert.no_config_for_datatable', 'No configuration found for this DataTable'));
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
function toggleMappingDisplay(triggerElement) {
    const mappingDiv = document.getElementById('mappingManagement');
    const toggleBtn = triggerElement || document.getElementById('toggleMappingBtn');
    
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
        if (toggleBtn) {
            toggleBtn.innerHTML = `<i class="fa fa-times"></i> ${i18nConfig('tab.datatables_controller.mapping.close', 'Close')}`;
        }
    } else {
        mappingDiv.style.display = 'none';
        mappingDisplayed = false;
        
        // Restaurer le texte du bouton
        if (toggleBtn) {
            toggleBtn.innerHTML = `<i class="fa fa-cog"></i> ${i18nConfig('tab.datatables_controller.mapping.manage', 'Manage mapping')}`;
        }
    }
}

// Fonction pour mettre à jour le sélecteur de datatables dans la section mapping
function updateMappingDataTableSelector() {
    const selector = document.getElementById('newMappingDataTable');
    selector.innerHTML = `<option value="">${i18nConfig('tab.datatables_controller.mapping.select_datatable', 'Select a DataTable...')}</option>`;
    
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
        mappingList.innerHTML = `<p class="text-muted"><i class="fa fa-info-circle"></i> ${i18nConfig('tab.datatables_controller.mapping.none_configured', 'No mapping configured')}</p>`;
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
                    <button type="button" class="btn-remove-mapping"
                            title="${i18nConfig('tab.datatables_controller.mapping.delete_title', 'Delete this mapping')}">
                        <i class="fa fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        const removeBtn = mappingRow.querySelector('.btn-remove-mapping');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => removeMappingKey(key));
        }

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
        alert(i18nConfig('tab.datatables_controller.mapping.alert.enter_reference', 'Please enter a reference value'));
        keyInput.focus();
        return;
    }
    
    if (!selectedDataTable) {
        alert(i18nConfig('tab.datatables_controller.mapping.alert.select_datatable', 'Please select a DataTable'));
        datatableSelect.focus();
        return;
    }
    
    // Vérifier si la clé existe déjà 
    if (tempLiaisonMapping[newKey]) {
        if (!confirm(i18nConfig('tab.datatables_controller.mapping.confirm.replace_existing', 'Value "{key}" already exists. Replace it?', { key: newKey }))) {
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
    if (confirm(i18nConfig('tab.datatables_controller.mapping.confirm.delete_mapping', 'Are you sure you want to delete mapping "{key}"?', { key }))) {
        delete tempLiaisonMapping[key];
        displayCurrentMapping();
        console.log(`Mapping supprimé: ${key}`);
    }
}

// Fonction pour sauvegarder les modifications du mapping
function saveMappingConfiguration() {
    if (Object.keys(tempLiaisonMapping).length === 0) {
        if (!confirm(i18nConfig('tab.datatables_controller.mapping.confirm.clear_empty', 'No mapping configured. Do you really want to clear configuration?'))) {
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
    
    // Sauvegarder dans la capsule de l'org courante
    saveLiaisonMappingToCookie();
    updateCurrentConfigInfo();
    if (typeof refreshAllAutoLinkBoxes === 'function') {
        console.log('[FLOW] Refresh boites Liaison Auto depuis Config Manager');
        refreshAllAutoLinkBoxes();
    }
    
    alert(i18nConfig('tab.datatables_controller.mapping.alert.save_success', 'Mapping configuration saved successfully!'));
    
    // Fermer la section de gestion
    toggleMappingDisplay(document.getElementById('toggleMappingBtn'));
    
    console.log('Mapping sauvegardé:', LIAISON_MAPPING);
}

// Fonction pour annuler les modifications
function cancelMappingChanges() {
    if (confirm(i18nConfig('tab.datatables_controller.mapping.confirm.cancel_changes', 'Are you sure you want to cancel changes?'))) {
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

// Fonctions de gestion du stockage par org pour le mapping
function saveLiaisonMappingToCookie() {
    persistCurrentDataTableControllerOrgCapsule();
}

function loadLiaisonMappingFromCookie() {
    loadCurrentDataTableControllerOrgCapsule();
    console.log('Mapping chargé depuis la capsule org:', LIAISON_MAPPING);
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
                    const normalizedMapping = normalizeStoredLiaisonMappingEntry(importedData.mapping[key]);
                    if (normalizedMapping && normalizedMapping.datatableId) {
                        LIAISON_MAPPING[key] = normalizedMapping.datatableId;
                    }
                });
                saveLiaisonMappingToCookie();
                alert(i18nConfig('tab.datatables_controller.mapping.alert.import_success', 'Mapping imported successfully!'));
                
                if (mappingDisplayed) {
                    tempLiaisonMapping = { ...LIAISON_MAPPING };
                    displayCurrentMapping();
                }
                updateCurrentConfigInfo();
            }
        } catch (error) {
            alert(i18nConfig('tab.datatables_controller.mapping.alert.import_error', 'Error while importing: invalid file'));
            console.error('Erreur d\'importation:', error);
        }
    };
    reader.readAsText(file);
}

// ################################         FIN MAPPING       #######################################

