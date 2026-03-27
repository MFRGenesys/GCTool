/**
 * datatables-config.js
 * Gestion des DataTables et de leur configuration
 * Auteur: PS Genesys - Matthieu FRYS
 * Date: 05/2025
 */

function i18nDt(key, fallback, params) {
    if (window.GCToolI18n && typeof window.GCToolI18n.t === 'function') {
        return window.GCToolI18n.t(key, params, fallback);
    }
    return fallback;
}

// Fonction d'initialisation du contrôleur DataTables
function initializeDataTablesController() {
    console.log('🔧 Initialisation du contrôleur DataTables');
    
    // Populer les sélecteurs
    populateDataTableSelectors();
    
    // Afficher la liste des DataTables
    displayDataTables();

    // Initialiser les informations de configuration
    updateCurrentConfigInfo();

    // Initialiser la visualisation du schéma
    if (typeof initializeSchemaVisualization === 'function') {
        initializeSchemaVisualization();
    }
}

/**
 * Rendre la liste des DataTables rétractable
 */
function toggleDataTablesList() {
    const content = document.getElementById('dataTablesListContent');
    const icon = document.getElementById('dataTablesListIcon');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.className = 'fa fa-list';
    } else {
        content.style.display = 'none';
        icon.className = 'fa fa-list-alt';
    }
}

// Variables de configuration
let dataTableConfigurations = {};
const DATATABLE_LIST_FILTER_STORAGE_KEY = 'datatable-controller-list-filter';
let dataTableListFilterValue = '';

function getDataTableListFilterInput() {
    return document.getElementById('datatable-list-filter-input');
}

function getDataTableListFilterCounter() {
    return document.getElementById('datatable-list-filter-counter');
}

function normalizeDataTableListFilterValue(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeDataTableListSearchToken(value) {
    return String(value || '').trim().toLowerCase();
}

function compactDataTableListSearchValue(value) {
    return normalizeDataTableListSearchToken(value).replace(/[^a-z0-9]+/g, '');
}

function getDataTableListFilterTerms(filterValue) {
    const normalizedFilter = normalizeDataTableListFilterValue(filterValue);
    if (!normalizedFilter) {
        return [];
    }

    return normalizedFilter
        .split(' ')
        .map(term => normalizeDataTableListSearchToken(term))
        .filter(Boolean);
}

function doesDataTableMatchListFilter(dataTableName, filterValue) {
    const terms = getDataTableListFilterTerms(filterValue);
    if (!terms.length) {
        return true;
    }

    const normalizedName = normalizeDataTableListSearchToken(dataTableName);
    const compactName = compactDataTableListSearchValue(dataTableName);

    return terms.every(term => {
        const compactTerm = compactDataTableListSearchValue(term);
        return normalizedName.includes(term) || (!!compactTerm && compactName.includes(compactTerm));
    });
}

function loadDataTableListFilterFromStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return '';
    }

    try {
        return localStorage.getItem(DATATABLE_LIST_FILTER_STORAGE_KEY) || '';
    } catch (error) {
        console.warn('[DT Controller] Impossible de lire le filtre de liste depuis localStorage.', error);
        return '';
    }
}

function saveDataTableListFilterToStorage(filterValue) {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }

    const normalizedFilter = normalizeDataTableListFilterValue(filterValue);

    try {
        if (normalizedFilter) {
            localStorage.setItem(DATATABLE_LIST_FILTER_STORAGE_KEY, normalizedFilter);
        } else {
            localStorage.removeItem(DATATABLE_LIST_FILTER_STORAGE_KEY);
        }
    } catch (error) {
        console.warn('[DT Controller] Impossible de sauvegarder le filtre de liste dans localStorage.', error);
    }
}

function updateDataTableListFilterCounter(visibleCount, totalCount) {
    const counter = getDataTableListFilterCounter();
    if (!counter) {
        return;
    }

    counter.textContent = `${visibleCount} / ${totalCount}`;
}

function applyDataTableListFilter() {
    const items = document.querySelectorAll('#dataTablesList .datatable-list-item');
    const totalCount = dataTablesCache.length;
    let visibleCount = 0;

    items.forEach(item => {
        const dataTableName = item.dataset.datatableName || '';
        const isVisible = doesDataTableMatchListFilter(dataTableName, dataTableListFilterValue);

        item.style.display = isVisible ? '' : 'none';
        if (isVisible) {
            visibleCount += 1;
        }
    });

    updateDataTableListFilterCounter(visibleCount, totalCount);
}

function handleDataTableListFilterInput(event) {
    dataTableListFilterValue = event.target.value || '';
    saveDataTableListFilterToStorage(dataTableListFilterValue);
    applyDataTableListFilter();
}

function initializeDataTableListFilter() {
    const input = getDataTableListFilterInput();
    if (!input) {
        return;
    }

    const placeholder = i18nDt('tab.datatables_controller.filter_placeholder', 'Filter by name...');
    input.placeholder = placeholder;
    input.setAttribute('aria-label', placeholder);

    if (!input.dataset.filterInitialized) {
        input.value = dataTableListFilterValue;
        input.addEventListener('input', handleDataTableListFilterInput);
        input.addEventListener('click', event => event.stopPropagation());
        input.addEventListener('mousedown', event => event.stopPropagation());

        const toolbar = input.closest('.datatable-list-toolbar');
        if (toolbar && !toolbar.dataset.filterStopPropagation) {
            toolbar.addEventListener('click', event => event.stopPropagation());
            toolbar.addEventListener('mousedown', event => event.stopPropagation());
            toolbar.dataset.filterStopPropagation = 'true';
        }

        input.dataset.filterInitialized = 'true';
    } else if (input.value !== dataTableListFilterValue) {
        input.value = dataTableListFilterValue;
    }
}

// Gestion de la sélection de DataTable
function initializeDataTablesController() {
    console.log('ðŸ”§ Initialisation du contrÃ´leur DataTables');
    dataTableListFilterValue = loadDataTableListFilterFromStorage();
    initializeDataTableListFilter();

    populateDataTableSelectors();
    displayDataTables();
    updateCurrentConfigInfo();

    if (typeof initializeSchemaVisualization === 'function') {
        initializeSchemaVisualization();
    }
}

function setupDataTableSelector() {
    if (typeof $ !== 'undefined' && $.fn.select2) {
        $('#datatableSelector').on('change', function() {
            const selectedId = $(this).val();
            if (selectedId) {
                loadDataTableColumns(selectedId);
            } else {
                document.getElementById('columnsConfig').style.display = 'none';
                removeDataTablePreview();
            }
        });
    }
}

// Population des sélecteurs de DataTables
function populateDataTableSelectors() {
    const selectors = ['datatableSelector', 'newMappingDataTable'];
    
    selectors.forEach(selectorId => {
        const selector = document.getElementById(selectorId);
        if (!selector) return;
        
        selector.innerHTML = `<option value="">${i18nDt('tab.datatables_controller.select_datatable', 'Choose a DataTable...')}</option>`;
        
        dataTablesCache.forEach(dataTable => {
            const option = document.createElement('option');
            option.value = dataTable.id;
            option.textContent = dataTable.name;
            selector.appendChild(option);
        });
    });
    
    // Initialiser Select2 si disponible
    if (typeof $ !== 'undefined' && $.fn.select2) {
        $('#datatableSelector').select2();
    }
    
    // Setup des événements
    setupDataTableSelector();
}


// Affichage de la configuration des colonnes
/*function displayColumnsConfiguration(datatableId, properties) {
    
    const configDiv = document.getElementById('columnsConfig');
    configDiv.style.display = 'block';
    const columnsDiv = document.getElementById('columnsList');
    
    
    columnsDiv.innerHTML = '';
    
    // Récupérer la liste des colonnes pour les sélecteurs
    const columnNames = getOrderedColumns(properties);

    columnNames.forEach(columnName => {
        const columnDiv = document.createElement('div');
        columnDiv.className = 'column-config';
        
        columnDiv.innerHTML = `
            <div class="row">
                <div class="col-md-3">
                    <strong>Colonne: ${columnName}</strong>
                    <small class="text-muted">(${properties[columnName].type})</small>
                </div>
                <div class="col-md-3">
                    <select class="form-control column-type" data-column="${columnName}">
                        <option value="">Sélectionner un type...</option>
                        <option value="queue">Queue</option>
                        <option value="skill">Skill</option>
                        <option value="schedulegroup">Schedule Group</option>
                        <option value="prompt">Prompt</option>
                        <option value="liste">Liste de valeurs</option>
                        <option value="regex">Expression Régulière</option>
                        <option value="liaison">Liaison</option>
                        <option value="liaison_auto">Liaison Automatique</option>
                    </select>
                </div>
                <div class="col-md-6">
                    <!-- Sélecteur de datatable pour liaison normale -->
                    <select class="form-control liaison-target" data-column="${columnName}" style="display: none;">
                        <option value="">Sélectionner une DataTable...</option>
                        ${dataTablesCache.map(dt => `<option value="${dt.id}">${dt.name}</option>`).join('')}
                    </select>
                    <!-- Sélecteur de colonne pour liaison automatique -->
                    <select class="form-control liaison-auto-column" data-column="${columnName}" style="display: none;">
                        <option value="">Sélectionner une colonne de référence...</option>
                        ${columnNames.filter(col => col !== columnName).map(col => `<option value="${col}">${col}</option>`).join('')}
                    </select>
                    <div class="liste-values-container" data-column="${columnName}" style="display: none;">
                        <textarea class="form-control liste-values" data-column="${columnName}" 
                                  placeholder="Saisissez les valeurs possibles séparées par des point-virgules (;)&#10;Exemple: ACTIF;INACTIF;EN_ATTENTE;SUSPENDU" 
                                  rows="3"></textarea>
                        <!-- Case à cocher pour autoriser les valeurs null -->
                        <div class="checkbox" style="margin-top: 10px;">
                            <label>
                                <input type="checkbox" class="liste-allow-null" data-column="${columnName}">
                                <i class="fa fa-check-square-o"></i> Autoriser les valeurs vides/null
                            </label>
                        </div>
                        <!-- Case à cocher pour ignorer la case -->
                        <div class="checkbox" style="margin-top: 10px;">
                            <label>
                                <input type="checkbox" class="liste-ignore-case" data-column="${columnName}">
                                <i class="fa fa-check-square-o"></i> Ignorer la casse
                            </label>
                        </div>
                        ${buildListQuickExamplesHtml()}
                        <small class="text-muted">
                            <i class="fa fa-info-circle"></i> 
                            Séparez chaque valeur par un point-virgule (;). Les espaces en début/fin seront supprimés automatiquement.
                        </small>
                    </div>
                    
                    <!-- Configuration pour expression régulière -->
                    <div class="regex-container" data-column="${columnName}" style="display: none;">
                        <div class="form-group">
                            <label>Expression régulière :</label>
                            <input type="text" class="form-control regex-pattern" data-column="${columnName}" 
                                   placeholder="Exemple: ^[A-Z][0-9]{4}$ ou ^\\d{4,10}$">
                        </div>
                        
                        <div class="form-group">
                            <label>Description du pattern :</label>
                            <input type="text" class="form-control regex-description" data-column="${columnName}" 
                                   placeholder="Exemple: Code postal français (5 chiffres)">
                        </div>
                        
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" class="regex-allow-null" data-column="${columnName}">
                                <i class="fa fa-check-square-o"></i> Autoriser les valeurs vides/null
                            </label>
                        </div>
                        
                        ${buildRegexQuickExamplesHtml()}
                    </div>
                </div>
                <div class="col-md-12">
                    <!-- Affichage du mapping pour liaison automatique -->
                    <div class="liaison-auto-info" data-column="${columnName}" style="display: none;">
                        <small class="text-muted">
                            <strong>Mapping disponible:</strong><br>
                            ${Object.keys(LIAISON_MAPPING).map(key => `${key} → ${getDataTableNameById(LIAISON_MAPPING[key])}`).join('<br>')}
                        </small>
                    </div>
                    <!-- Aperçu des valeurs pour liste -->
                    <div class="liste-preview" data-column="${columnName}" style="display: none;">
                        <small class="text-muted">
                            <strong>Valeurs configurées:</strong> <span class="preview-values"></span><br>
                            <strong>Valeurs vides:</strong> <span class="preview-null-policy"></span>
                            <strong>Gestion de la casse:</strong> <span class="preview-case-policy"></span>
                        </small>
                    </div>
                    <!-- Testeur d'expression régulière -->
                    <div class="regex-tester" data-column="${columnName}" style="display: none;">
                        <div class="well well-sm">
                            <strong>🧪 Testeur d'expression régulière :</strong>
                            <div class="input-group" style="margin-top: 10px;">
                                <input type="text" class="form-control regex-test-input" data-column="${columnName}" 
                                       placeholder="Saisissez une valeur de test...">
                                <span class="input-group-btn">
                                    <button class="btn btn-primary" type="button" onclick="testRegexPattern('${columnName}', this)">
                                        <i class="fa fa-play"></i> Tester
                                    </button>
                                </span>
                            </div>
                            <div class="regex-test-result" data-column="${columnName}" style="margin-top: 10px;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        columnsDiv.appendChild(columnDiv);
    });
    
    // Setup des événements pour les types de colonnes
    setupColumnTypeEvents();

    // Charger la configuration existante si elle existe
    loadExistingConfiguration(datatableId, configDiv);
    
    configDiv.style.display = 'block';
}*/

// Affichage de la configuration des colonnes
function displayColumnsConfigurationInList(datatableId, properties,icon) {
    let configDiv = document.getElementById(`config-${datatableId}`);
    let columnsDiv = configDiv.querySelector(`#columnsList`);
    if(!columnsDiv){
        configDiv.innerHTML = `                
                <h5>Configuration des colonnes :</h5>
                <div id="columnsList"></div>
                <button type="button" class="btn btn-primary" onclick="saveConfiguration('${datatableId}')">Enregistrer Configuration</button>
                `
        columnsDiv = configDiv.querySelector(`#columnsList`);
    }
    columnsDiv.innerHTML = '';
    
    // Récupérer la liste des colonnes pour les sélecteurs
    const columnNames = getOrderedColumns(properties);

    columnNames.forEach(columnName => {
        const columnDiv = document.createElement('div');
        columnDiv.className = 'column-config';
        
        columnDiv.innerHTML = `
            <div class="row">
                <div class="col-md-3">
                    <strong>Colonne: ${columnName}</strong>
                    <small class="text-muted">(${properties[columnName].type})</small>
                </div>
                <div class="col-md-3">
                    <select class="form-control column-type" data-column="${columnName}">
                        <option value="">Sélectionner un type...</option>
                        <option value="queue">Queue</option>
                        <option value="skill">Skill</option>
                        <option value="schedulegroup">Schedule Group</option>
                        <option value="prompt">Prompt</option>
                        <option value="liste">Liste de valeurs</option>
                        <option value="regex">Expression Régulière</option>
                        <option value="liaison">Liaison</option>
                        <option value="liaison_auto">Liaison Automatique</option>
                    </select>
                </div>
                <div class="col-md-6">
                    <!-- Sélecteur de datatable pour liaison normale -->
                    <select class="form-control liaison-target" data-column="${columnName}" style="display: none;">
                        <option value="">Sélectionner une DataTable...</option>
                        ${dataTablesCache.map(dt => `<option value="${dt.id}">${dt.name}</option>`).join('')}
                    </select>
                    <!-- Sélecteur de colonne pour liaison automatique -->
                    <select class="form-control liaison-auto-column" data-column="${columnName}" style="display: none;">
                        <option value="">Sélectionner une colonne de référence...</option>
                        ${columnNames.filter(col => col !== columnName).map(col => `<option value="${col}">${col}</option>`).join('')}
                    </select>
                    <div class="liste-values-container" data-column="${columnName}" style="display: none;">
                        <textarea class="form-control liste-values" data-column="${columnName}" 
                                  placeholder="Saisissez les valeurs possibles séparées par des point-virgules (;)&#10;Exemple: ACTIF;INACTIF;EN_ATTENTE;SUSPENDU" 
                                  rows="3"></textarea>
                        <!-- Case à cocher pour autoriser les valeurs null -->
                        <div class="checkbox" style="margin-top: 10px;">
                            <label>
                                <input type="checkbox" class="liste-allow-null" data-column="${columnName}">
                                <i class="fa fa-check-square-o"></i> Autoriser les valeurs vides/null
                            </label>
                        </div>
                        <!-- Case à cocher pour ignorer la case -->
                        <div class="checkbox" style="margin-top: 10px;">
                            <label>
                                <input type="checkbox" class="liste-ignore-case" data-column="${columnName}">
                                <i class="fa fa-check-square-o"></i> Ignorer la casse
                            </label>
                        </div>
                        ${buildListQuickExamplesHtml()}
                        <small class="text-muted">
                            <i class="fa fa-info-circle"></i> 
                            Séparez chaque valeur par un point-virgule (;). Les espaces en début/fin seront supprimés automatiquement.
                        </small>
                    </div>
                    
                    <!-- Configuration pour expression régulière -->
                    <div class="regex-container" data-column="${columnName}" style="display: none;">
                        <div class="form-group">
                            <label>Expression régulière :</label>
                            <input type="text" class="form-control regex-pattern" data-column="${columnName}" 
                                   placeholder="Exemple: ^[A-Z][0-9]{4}$ ou ^\\d{4,10}$">
                        </div>
                        
                        <div class="form-group">
                            <label>Description du pattern :</label>
                            <input type="text" class="form-control regex-description" data-column="${columnName}" 
                                   placeholder="Exemple: Code postal français (5 chiffres)">
                        </div>
                        
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" class="regex-allow-null" data-column="${columnName}">
                                <i class="fa fa-check-square-o"></i> Autoriser les valeurs vides/null
                            </label>
                        </div>
                        
                        ${buildRegexQuickExamplesHtml()}
                    </div>
                </div>
                <div class="col-md-12">
                    <!-- Affichage du mapping pour liaison automatique -->
                    <div class="liaison-auto-info" data-column="${columnName}" style="display: none;">
                        <small class="text-muted">
                            <strong>Mapping disponible:</strong><br>
                            ${Object.keys(LIAISON_MAPPING).map(key => `${key} → ${getDataTableNameById(LIAISON_MAPPING[key])}`).join('<br>')}
                        </small>
                    </div>
                    <!-- Aperçu des valeurs pour liste -->
                    <div class="liste-preview" data-column="${columnName}" style="display: none;">
                        <small class="text-muted">
                            <strong>Valeurs configurées:</strong> <span class="preview-values"></span><br>
                            <strong>Valeurs vides:</strong> <span class="preview-null-policy"></span>
                            <strong>Gestion de la casse:</strong> <span class="preview-case-policy"></span>
                        </small>
                    </div>
                    <!-- Testeur d'expression régulière -->
                    <div class="regex-tester" data-column="${columnName}" style="display: none;">
                        <div class="well well-sm">
                            <strong>🧪 Testeur d'expression régulière :</strong>
                            <div class="input-group" style="margin-top: 10px;">
                                <input type="text" class="form-control regex-test-input" data-column="${columnName}" 
                                       placeholder="Saisissez une valeur de test...">
                                <span class="input-group-btn">
                                    <button class="btn btn-primary" type="button" onclick="testRegexPattern('${columnName}', this)">
                                        <i class="fa fa-play"></i> Tester
                                    </button>
                                </span>
                            </div>
                            <div class="regex-test-result" data-column="${columnName}" style="margin-top: 10px;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        columnsDiv.appendChild(columnDiv);
    });
    
    icon.className = 'fa fa-sliders config-icon';
    icon.style.color = '#d9534f';
    icon.title = 'Cliquez pour masquer la config';

    // Setup des événements pour les types de colonnes
    setupColumnTypeEvents();

    // Charger la configuration existante si elle existe
    loadExistingConfiguration(datatableId, configDiv);
    
    configDiv.style.display = 'block';
}

// Configuration des événements pour les types de colonnes
function setupColumnTypeEvents() {
    if (typeof $ === 'undefined') {
        document.querySelectorAll('.column-type').forEach(select => {
            select.addEventListener('change', handleColumnTypeChange);
        });
        document.querySelectorAll('.regex-example-btn').forEach(button => {
            if (button.dataset.boundRegexExample !== '1') {
                button.addEventListener('click', applyRegexExample);
                button.dataset.boundRegexExample = '1';
            }
        });
        document.querySelectorAll('.liste-example-btn').forEach(button => {
            if (button.dataset.boundListeExample !== '1') {
                button.addEventListener('click', applyListeExample);
                button.dataset.boundListeExample = '1';
            }
        });
    } else {
        $('.column-type').off('change').on('change', handleColumnTypeChange);
        $(document)
            .off('click.dtRegexExample', '.regex-example-btn')
            .on('click.dtRegexExample', '.regex-example-btn', applyRegexExample);
        $(document)
            .off('click.dtListeExample', '.liste-example-btn')
            .on('click.dtListeExample', '.liste-example-btn', applyListeExample);
    }

    document.querySelectorAll('.column-type').forEach((select) => {
        updateColumnConfigVisualState(select);
    });
}

// Gestion du changement de type de colonne
function handleColumnTypeChange(event) {
    const select = event.target;
    const columnName = select.getAttribute('data-column');
    const selectedType = select.value;

    const scopeRoot = select.closest('.column-config') || document;
    const queryInScope = (selector) => scopeRoot.querySelector(selector);

    const liaisonSelect = queryInScope(`.liaison-target[data-column="${columnName}"]`) || queryInScope('.liaison-target');
    const liaisonAutoColumn = queryInScope(`.liaison-auto-column[data-column="${columnName}"]`) || queryInScope('.liaison-auto-column');
    const liaisonAutoInfo = queryInScope(`.liaison-auto-info[data-column="${columnName}"]`) || queryInScope('.liaison-auto-info');
    const listeContainer = queryInScope(`.liste-values-container[data-column="${columnName}"]`) || queryInScope('.liste-values-container');
    const listePreview = queryInScope(`.liste-preview[data-column="${columnName}"]`) || queryInScope('.liste-preview');
    const regexContainer = queryInScope(`.regex-container[data-column="${columnName}"]`) || queryInScope('.regex-container');
    const regexTester = queryInScope(`.regex-tester[data-column="${columnName}"]`) || queryInScope('.regex-tester');

    if (liaisonSelect) liaisonSelect.style.display = 'none';
    if (liaisonAutoColumn) liaisonAutoColumn.style.display = 'none';
    if (liaisonAutoInfo) liaisonAutoInfo.style.display = 'none';
    if (listeContainer) listeContainer.style.display = 'none';
    if (listePreview) listePreview.style.display = 'none';
    if (regexContainer) regexContainer.style.display = 'none';
    if (regexTester) regexTester.style.display = 'none';

    if (selectedType === 'liaison' && liaisonSelect) {
        liaisonSelect.style.display = 'block';
    } else if (selectedType === 'liaison_auto') {
        if (liaisonAutoColumn) liaisonAutoColumn.style.display = 'block';
        if (liaisonAutoInfo) liaisonAutoInfo.style.display = 'block';
    } else if (selectedType === 'liste') {
        if (listeContainer) listeContainer.style.display = 'block';
        if (listePreview) listePreview.style.display = 'block';
        setupListePreview(columnName, scopeRoot);
    } else if (selectedType === 'regex') {
        if (regexContainer) regexContainer.style.display = 'block';
        if (regexTester) regexTester.style.display = 'block';
        setupRegexEvents(columnName, scopeRoot);
    }

    updateColumnConfigVisualState(select);
}

function updateColumnConfigVisualState(selectElement) {
    if (!selectElement) {
        return;
    }

    const row = selectElement.closest('.column-config');
    if (!row) {
        return;
    }

    const isConfigured = !!(selectElement.value && selectElement.value.trim());
    if (isConfigured) {
        row.style.background = '#f4fbf6';
        row.style.borderLeft = '4px solid #5cb85c';
        row.style.paddingLeft = '8px';
    } else {
        row.style.background = '#fff9e8';
        row.style.borderLeft = '4px solid #f0ad4e';
        row.style.paddingLeft = '8px';
    }
}

function applyRegexExample(event) {
    event.preventDefault();
    const trigger = event.currentTarget || event.target;
    const scopeRoot = trigger.closest('.column-config') || document;
    const pattern = trigger.getAttribute('data-pattern') || '';
    const description = trigger.getAttribute('data-description') || '';

    const regexInput = scopeRoot.querySelector('.regex-pattern');
    const descriptionInput = scopeRoot.querySelector('.regex-description');

    if (regexInput) {
        regexInput.value = pattern;
        regexInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (descriptionInput) {
        descriptionInput.value = description;
    }
}

function applyListeExample(event) {
    event.preventDefault();
    const trigger = event.currentTarget || event.target;
    const scopeRoot = trigger.closest('.column-config') || document;
    const values = trigger.getAttribute('data-values') || '';
    const ignoreCase = trigger.getAttribute('data-ignore-case') === 'true';

    const listeTextarea = scopeRoot.querySelector('.liste-values');
    const ignoreCaseCheckbox = scopeRoot.querySelector('.liste-ignore-case');

    if (listeTextarea) {
        listeTextarea.value = values;
        listeTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (ignoreCaseCheckbox) {
        ignoreCaseCheckbox.checked = ignoreCase;
        ignoreCaseCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

// Configuration des événements pour les expressions régulières
function setupRegexEvents(columnName, scopeRoot) {
    const root = scopeRoot || document;
    const regexInput = root.querySelector(`.regex-pattern[data-column="${columnName}"]`) || root.querySelector('.regex-pattern');
    const testInput = root.querySelector(`.regex-test-input[data-column="${columnName}"]`) || root.querySelector('.regex-test-input');

    if (regexInput && regexInput.dataset.boundRegexEvents !== '1') {
        regexInput.addEventListener('input', function() {
            if (testInput && testInput.value) {
                testRegexPattern(columnName, root);
            }
        });
        regexInput.dataset.boundRegexEvents = '1';
    }

    if (testInput && testInput.dataset.boundRegexEvents !== '1') {
        testInput.addEventListener('input', function() {
            if (regexInput && regexInput.value) {
                testRegexPattern(columnName, root);
            }
        });

        testInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                testRegexPattern(columnName, root);
            }
        });
        testInput.dataset.boundRegexEvents = '1';
    }
}

// Configuration de l'aperçu en temps réel pour les listes
function setupListePreview(columnName, scopeRoot) {
    const root = scopeRoot || document;
    const listeTextarea = root.querySelector(`.liste-values[data-column="${columnName}"]`) || root.querySelector('.liste-values');
    const allowNullCheckbox = root.querySelector(`.liste-allow-null[data-column="${columnName}"]`) || root.querySelector('.liste-allow-null');
    const ignoreCaseCheckbox = root.querySelector(`.liste-ignore-case[data-column="${columnName}"]`) || root.querySelector('.liste-ignore-case');
    const listePreviewRoot = root.querySelector(`.liste-preview[data-column="${columnName}"]`) || root.querySelector('.liste-preview');
    const previewValuesSpan = listePreviewRoot ? listePreviewRoot.querySelector('.preview-values') : null;
    const previewNullSpan = listePreviewRoot ? listePreviewRoot.querySelector('.preview-null-policy') : null;
    const ignoreCaseSpan = listePreviewRoot ? listePreviewRoot.querySelector('.preview-case-policy') : null;

    function updatePreview() {
        if (previewValuesSpan && previewNullSpan) {
            const values = parseListeValues(listeTextarea ? listeTextarea.value : '');
            if (values.length > 0) {
                previewValuesSpan.innerHTML = values.map(v => `<span class="badge badge-info">${v}</span>`).join(' ');
            } else {
                previewValuesSpan.textContent = 'Aucune valeur';
            }

            const allowNull = allowNullCheckbox ? allowNullCheckbox.checked : false;
            previewNullSpan.innerHTML = allowNull
                ? '<span class="badge badge-success">Autorisées</span>'
                : '<span class="badge badge-danger">Interdites</span>';

            const ignoreCaseValue = ignoreCaseCheckbox ? ignoreCaseCheckbox.checked : false;
            ignoreCaseSpan.innerHTML = ignoreCaseValue
                ? '<span class="badge badge-success">Casse Ignorée</span>'
                : '<span class="badge badge-danger">Casse Importante</span>';
        }
    }

    if (listeTextarea && listeTextarea.dataset.boundListePreview !== '1') {
        listeTextarea.addEventListener('input', updatePreview);
        listeTextarea.dataset.boundListePreview = '1';
    }

    if (allowNullCheckbox && allowNullCheckbox.dataset.boundListePreview !== '1') {
        allowNullCheckbox.addEventListener('change', updatePreview);
        allowNullCheckbox.dataset.boundListePreview = '1';
    }

    if (ignoreCaseCheckbox && ignoreCaseCheckbox.dataset.boundListePreview !== '1') {
        ignoreCaseCheckbox.addEventListener('change', updatePreview);
        ignoreCaseCheckbox.dataset.boundListePreview = '1';
    }

    updatePreview();
}

// Fonction utilitaire pour parser les valeurs de liste
function parseListeValues(rawValues) {
    if (!rawValues || rawValues.trim() === '') {
        return [];
    }
    
    return rawValues
        .split(';')
        .map(value => value.trim())
        .filter(value => value !== '');
}

function buildDataTableConfigBadgeHtml(datatableId) {
    const hasConfig = !!dataTableConfigurations[datatableId];
    return hasConfig
        ? `<span class="badge badge-success">${i18nDt('tab.datatables_controller.configured', 'Configured')}</span>`
        : `<span class="badge badge-warning">${i18nDt('tab.datatables_controller.not_configured', 'Not configured')}</span>`;
}

function buildDataTableControlButtonHtml(datatableId) {
    const hasConfig = !!dataTableConfigurations[datatableId];
    return hasConfig
        ? `<button class="btn btn-control btn-sm" onclick="validateDataTable('${datatableId}')">${i18nDt('tab.datatables_controller.control', 'Control')}</button>`
        : '';
}

function updateDataTableListItemState(datatableId) {
    const badgeElement = document.getElementById(`config-badge-${datatableId}`);
    const controlElement = document.getElementById(`control-btn-${datatableId}`);

    if (badgeElement) {
        badgeElement.innerHTML = buildDataTableConfigBadgeHtml(datatableId);
    }
    if (controlElement) {
        controlElement.innerHTML = buildDataTableControlButtonHtml(datatableId);
    }
}


// Affichage des DataTables avec boutons de contrôle
function displayDataTables() {
    const dataTablesList = document.getElementById('dataTablesList');
    dataTablesList.innerHTML = '';
    
    dataTablesCache.forEach(dataTable => {
        const div = document.createElement('div');
        div.className = 'datatable-item datatable-list-item';
        div.dataset.datatableId = dataTable.id;
        div.dataset.datatableName = dataTable.name;
        div.style.margin = '10px 0';
        div.style.padding = '10px';
        div.style.border = '1px solid #ddd';
        div.style.borderRadius = '5px';
        
        const controlButton = buildDataTableControlButtonHtml(dataTable.id);
        const configBadge = buildDataTableConfigBadgeHtml(dataTable.id);

        div.innerHTML = `
            <div class="datatable-header" style="padding: 10px; cursor: pointer;" >
                <div class="row">
                    <div class="col-md-5">
                        <strong class="datatable-name">${dataTable.name}</strong>
                        <small class="text-muted">(${dataTable.id})</small>
                    </div>
                    <div class="col-md-1">
                        <i class="fa fa-eye preview-icon" style="margin-left: 10px; color: #337ab7;" onclick="toggleDataTablePreview('${dataTable.id}', '${dataTable.name}', this)" title="${i18nDt('tab.datatables_controller.help.preview', 'Cliquez pour voir l\'aperçu des données')}"></i>
                    </div>
                    <div class="col-md-1">
                        <i class="fa fa-gear config-icon" style="margin-left: 10px; color: #337ab7;" onclick="toggleConfigDatatable('${dataTable.id}',this)" title="${i18nDt('tab.datatables_controller.help.config', 'Configuration de la DT')}"></i>
                    </div>
                    <div class="col-md-1">
                        <i class="fa fa-check-to-slot" style="margin-left: 10px; color: #337ab7;" onclick="searchUnusedRows('${dataTable.id}')" title="${i18nDt('tab.datatables_controller.help.unusedlines', 'Lignes Non utilisées')}"></i>
                    </div>
                    <div class="col-md-4 text-right">
                        <span id="config-badge-${dataTable.id}">${configBadge}</span>
                        <span id="control-btn-${dataTable.id}">${controlButton}</span>
                    </div>
                </div>
            </div>
            <!-- Conteneur pour l'aperçu (initialement masqué) -->
            <div id="preview-${dataTable.id}" class="datatable-preview-container" style="display: none; border-top: 1px solid #eee;">
                <!-- L'aperçu sera inséré ici -->
            </div>
            <!-- Conteneur du preview configuration (initialement masqué) -->
            <div id="configPreview-${dataTable.id}" class="datatable-preview-container" style="display: none; border-top: 1px solid #eee;">
                <!-- L'aperçu sera inséré ici -->
            </div>
            <!-- Conteneur de la configuration (initialement masqué) -->
            <div id="config-${dataTable.id}" class="datatable-preview-container" style="display: none; border-top: 1px solid #eee;">
                <!-- L'aperçu sera inséré ici -->
                <h5>Configuration des colonnes :</h5>
                <div id="columnsList"></div>
                <button type="button" class="btn btn-primary" onclick="saveConfiguration('${dataTable.id}')">Enregistrer Configuration</button>
            </div>
        `;
        
        dataTablesList.appendChild(div);
    });

    initializeDataTableListFilter();
    applyDataTableListFilter();

    // Actualisation du schéma si il est visible
    const schemaSection = document.getElementById('schemaSection');
    if (schemaSection && schemaSection.style.display !== 'none') {
        setTimeout(() => {
            generateDataTableSchema();
        }, 100);
    }
    
    console.log('📋 Liste des DataTables mise à jour');
}

async function checkAllDataTablesConfigured() {
    const feedback = document.getElementById('globalControllerFeedback');
    const resultsDiv = document.getElementById('validationResults');

    if (feedback) {
        feedback.innerHTML = `<i class="fa fa-spinner fa-spin"></i> ${i18nDt('tab.datatables_controller.validation_checking', 'Checking in progress...')}`;
    }

    if(resultsDiv){
        console.log(`DEBUG - Vidage des résultats précédents`);
        resultsDiv.innerHTML = `
                        <h4>${i18nDt('tab.datatables_controller.results_title', 'Validation results')}</h4>
                        <div id="validationContent"></div>
                        `;
    }

    let pageNum = 0
    dataTablesCache.forEach(dataTable => {
        const hasConfig = dataTableConfigurations[dataTable.id];
        if(hasConfig){
            pageNum++;
            validateDataTable(dataTable.id,pageNum);
        }
    });
    if (feedback) {
        feedback.innerHTML = 'Vérification terminée';
    }
}

async function checkAllUnusedData(){
    let page = 0;
    dataTablesCache.forEach(datatable => {
        if (datatable.id){
            page++;
            searchUnusedRows(datatable.id,page);
        }
    });
    console.log(`source schedule`,scheduleGroupsCache);
    if (unusedSchedules.length > 0) {
        const listUnusedSchedules = [];
        unusedSchedules.forEach(schedule => {
            listUnusedSchedules.push({
                type: 'warning',
                message: `Schedule "${schedule.name}" non utilisé`
            });
        });
        console.log(`Schedules non utilisés`,unusedSchedules);
        displayValidationResults('unusedSchedules', listUnusedSchedules, 1);
    } else {
        console.log(`Aucun schedule non utilisé trouvé`);
    }
}

function buildAllSourceConfigs(targetDatatableId) {
    const allSourceConfigs = [];
    console.log('Build SourceConfig for UnusedRows',targetDatatableId);
    for (const [datatableId, config] of Object.entries(dataTableConfigurations)) {
        // Vérification : la config déclare une liaison vers targetDatatableId
        Object.keys(config.columns).forEach(columnName => {
            const columnConfig = config.columns[columnName];
            if (columnConfig.type === 'liaison' && columnConfig.liaisonTarget === targetDatatableId)
            {            
                allSourceConfigs.push({
                    datatableId : `${datatableId}`,
                    columnName : `${columnName}`,
                    type : `${columnConfig.type}`
                });
            }
            if  (columnConfig.type === 'liaison_auto' && Object.values(LIAISON_MAPPING).includes(targetDatatableId))
            {            
                allSourceConfigs.push({
                    datatableId : `${datatableId}`,
                    columnName : `${columnName}`,
                    type : `${columnConfig.type}`
                });
            }
            if  (columnConfig.type === 'schedulegroup' && datatableId === targetDatatableId )
            {            
                allSourceConfigs.push({
                    datatableId : ``,
                    columnName : `${columnName}`,
                    type : `${columnConfig.type}`
                });
            }
        });
    }
    console.log(`unusedRows config for ${getDataTableNameById(targetDatatableId)}`,allSourceConfigs);
    return allSourceConfigs;
}

async function searchUnusedRows(datatableId,pageNum=1){
    try{
        if (!(unusedSchedules.length > 0)){
            unusedSchedules = scheduleGroupsCache;
        }
        const allSourceConfigs = buildAllSourceConfigs(datatableId);
        const listUnusedRows = [];
        if (allSourceConfigs.length > 0)
        {
            unusedRows = await listUnusedTargetRows(datatableId, allSourceConfigs);
            console.log(`✅ liste des lignes non utilisée de ${getDataTableNameById(datatableId)}`,unusedRows);
            unusedRows.forEach(row => {
                listUnusedRows.push({
                                type: 'warning',
                                message: `clé "${row.key}" non utilisée`
                            });
            });
        }
        displayValidationResults(datatableId, listUnusedRows, pageNum);
    } catch (error) {
        return {
            type: 'warning',
            message: `Erreur sur la DT ${getDataTableNameById(datatableId)}`,
        };
    }
}


/**
 * Liste toutes les lignes non utilisées d'une DataTable cible
 * @param {string} targetDatatableId L'id de la DataTable cible
 * @param {Array<Object>} allSourceConfigs Tableau des configs des DataTables sources (celles qui font des liaisons)
 * @return {Promise<Array<Object>>} Lignes inutilisées
 */
let unusedSchedules = new Set();
async function listUnusedTargetRows(targetDatatableId, allSourceConfigs) {
    console.log(`vérification des unused target rows sur ${getDataTableNameById(targetDatatableId)} : `,allSourceConfigs)
    const targetRows = await getDataTableRowsWithCache(targetDatatableId); // Fonction existante
    if (!targetRows || !targetRows.length) return [];

    let usedSchedules = new Set();
    let usedValues = new Set();
    for (const { datatableId, columnName, type } of allSourceConfigs) {
        console.log(`verif : ${type}`);
        if(type === 'schedulegroup'){
            const sourceRows = await getDataTableRowsWithCache(targetDatatableId);
            sourceRows?.forEach(row => {
                if (row[columnName]) usedSchedules.add(row[columnName].toString());
            });
        }else{
            const sourceRows = await getDataTableRowsWithCache(datatableId);
            sourceRows?.forEach(row => {
                if (row[columnName]) usedValues.add(row[columnName].toString());
            });
        }
    }

    unusedSchedules = unusedSchedules.filter(
        schedule => !usedSchedules.has(schedule.name)
    );
    console.log(`verif terminée`, unusedSchedules);
    
    const unusedRows = targetRows.filter(row =>
        !usedValues.has(row.key?.toString())
    );

    return unusedRows; 
}

// Validation d'une DataTable - Version corrigée pour gérer l'asynchronisme
async function validateDataTable(datatableId, pageNum=1) {
    const config = dataTableConfigurations[datatableId];
    if (!config) {
        alert(i18nDt('tab.datatables_controller.alert.no_config', 'No configuration found for this DataTable'));
        return;
    }
    
    console.log('🔍 Début de la validation pour:', datatableId);
    console.log('Config de la DataTable',config);
    
    // Afficher un indicateur de chargement
    //if(pageNum == 1) showValidationLoading(datatableId);
    showValidationLoading(datatableId);

    try {
        const allRows = await getDataTableRowsWithCache(datatableId);
        console.log(`📊 ${allRows.length} lignes récupérées pour validation`);
        
        // Créer un tableau de promesses pour toutes les validations
        const validationPromises = [];
        
        allRows.forEach((row, rowIndex) => {
            Object.keys(config.columns).forEach(columnName => {
                const columnConfig = config.columns[columnName];
                const cellValue = row[columnName];
                
                if (cellValue) {
                    const validationPromise = validateCellAsync(
                        cellValue, 
                        columnConfig, 
                        columnName, 
                        rowIndex + 1, 
                        row
                    );
                    validationPromises.push(validationPromise);
                }
            });
        });
        
        console.log(`⏳ Attente de ${validationPromises.length} validations...`);
        
        // Attendre que toutes les validations soient terminées
        const allValidationResults = await Promise.all(validationPromises);
        
        // Filtrer les résultats null (validations réussies)
        const validationResults = allValidationResults.filter(result => result !== null);
        
        console.log(`✅ Validation ${pageNum} terminée: ${validationResults.length} problème(s) détecté(s)`);
        console.log(`DEBUG validation results : `,validationResults);

        displayValidationResults(datatableId, validationResults, pageNum);
        
        //hideValidationLoading();
    } catch (err) {
        console.error('❌ Erreur lors de la validation:', err);
        alert(i18nDt('tab.datatables_controller.alert.fetch_error', 'Error while retrieving DataTable data'));
        hideValidationLoading();
    }
}

// Validation d'une cellule - Version asynchrone
async function validateCellAsync(value, columnConfig, columnName, rowNumber, currentRow) {
    try {
        //console.log(`Controle de ${columnName} la ligne ${rowNumber} colonne ${currentRow} avec la config ${columnConfig.type}`);
        switch (columnConfig.type) {
            case 'queue':
                const queueExists = queuesCache.some(queue => queue.name === value || queue.id === value);
                if (!queueExists) {
                    return {
                        type: 'error',
                        message: `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": Queue "${value}" ${i18nDt('tab.datatables_controller.results.notfound', 'introuvable')}`,
                        row: rowNumber,
                        column: columnName,
                        value: value
                    };
                }
                break;
                
            case 'skill':
                const skillExists = skillsCache.some(skill => skill.name === value || skill.id === value);
                if (!skillExists) {
                    return {
                        type: 'error',
                        message: `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": Skill "${value}" ${i18nDt('tab.datatables_controller.results.notfound', 'introuvable')}`,
                        row: rowNumber,
                        column: columnName,
                        value: value
                    };
                }
                break;
                
            case 'schedulegroup':
                const scheduleGroupExists = scheduleGroupsCache.some(sg => sg.name === value || sg.id === value);
                if (!scheduleGroupExists) {
                    return {
                        type: 'error',
                        message: `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": Schedule Group "${value}" ${i18nDt('tab.datatables_controller.results.notfound', 'introuvable')}`,
                        row: rowNumber,
                        column: columnName,
                        value: value
                    };
                }
                break;
                
            case 'prompt':
                const promptExists = promptsCache.some(prompt => prompt.name === value || prompt.id === value);
                if (!promptExists) {
                    return {
                        type: 'error',
                        message: `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": Prompt "${value}" ${i18nDt('tab.datatables_controller.results.notfound', 'introuvable')}`,
                        row: rowNumber,
                        column: columnName,
                        value: value
                    };
                }
                break;
                
            case 'liaison':
                // Attendre le résultat de la validation de liaison
                return await validateLiaisonAsync(value, columnConfig.liaisonTarget, columnName, rowNumber);
                
            case 'liaison_auto':
                // Attendre le résultat de la validation de liaison automatique
                return await validateLiaisonAutoAsync(value, columnConfig.liaisonAutoColumn, columnName, rowNumber, currentRow);

            case 'liste':
                return validateListe(value, columnConfig.listeValues, columnName, rowNumber,columnConfig.allowNull||false,columnConfig.ignoreCase||false);

            case 'regex':
                return validateRegex(value,columnConfig.regexPattern,columnName,rowNumber,columnConfig.allowNull || false,columnConfig.regexDescription || '');
        }
        
        return null; // Validation réussie
        
    } catch (error) {
        console.error(`❌ Erreur lors de la validation de la cellule ${columnName}:`, error);
        return {
            type: 'warning',
            message:  `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": Erreur lors de la validation de "${value}"`,
            row: rowNumber,
            column: columnName,
            value: value
        };
    }
}

// Validation des liaisons normales - Version asynchrone
async function validateLiaisonAsync(value, targetDatatableId, columnName, rowNumber) {
    try {
        const targetRows = await getDataTableRowsWithCache(targetDatatableId);
        //console.log(`🔍 Vérification de la liaison "${value}" dans la DataTable cible ${targetDatatableId}`);
        //console.log(`📊 ${targetRows.length} lignes récupérées pour la DataTable cible`);
        //console.log(`liste des valeurs de la DataTable cible: ${targetRows.map(row => row.key || JSON.stringify(row))}`);
        const valueExists = targetRows.some(row => 
            row.key === value || Object.values(row).includes(value)
        );
        
        if (!valueExists) {
            const valueNotCaseExists = targetRows.some(row => 
                row.key.toLowerCase() === value.toLowerCase() || Object.values(row).includes(value)
            );
            if (valueNotCaseExists) {
                return {
                    type: 'warning',
                    message:  `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": ${i18nDt('tab.datatables_controller.results.liaison', 'Liaison')} "${value}" ${i18nDt('tab.datatables_controller.results.incorrectspell', 'n\'a pas la bonne casse dans la DataTable')} ${getDataTableNameById(targetDatatableId)}`,
                    row: rowNumber,
                    column: columnName,
                    value: value
                };
            }else{
                return {
                    type: 'error',
                    message:  `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": ${i18nDt('tab.datatables_controller.results.liaison', 'Liaison')} "${value}" ${i18nDt('tab.datatables_controller.results.notfoundonDT', 'introuvable dans la DataTable')} ${getDataTableNameById(targetDatatableId)}`,
                    row: rowNumber,
                    column: columnName,
                    value: value
                };
            }
        }
        
        return null; // Validation réussie
        
    } catch (err) {
        console.error('❌ Erreur lors de la validation de liaison:', err);
        return {
            type: 'warning',
            message:  `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": Impossible de vérifier la liaison "${value}"`,
            row: rowNumber,
            column: columnName,
            value: value
        };
    }
}

// Validation des liaisons automatiques - Version asynchrone
async function validateLiaisonAutoAsync(value, referenceColumnName, columnName, rowNumber, currentRow) {
    const referenceValue = currentRow[referenceColumnName];
    
    if (!referenceValue) {
        return {
            type: 'warning',
            message:  `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": Colonne de référence "${referenceColumnName}" vide`,
            row: rowNumber,
            column: columnName,
            value: value
        };
    }
    
    const targetDataTableId = LIAISON_MAPPING[referenceValue];
    
    if (!targetDataTableId) {
        return {
            type: 'error',
            message:  `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": Aucune DataTable configurée pour "${referenceValue}" (colonne ${referenceColumnName})`,
            row: rowNumber,
            column: columnName,
            value: value
        };
    }
    
    // Déléguer à la validation de liaison normale
    return await validateLiaisonAsync(value, targetDataTableId, columnName, rowNumber);
}

// Validation pour les listes - Version mise à jour avec gestion des valeurs null
function validateListe(value, allowedValues, columnName, rowNumber, allowNull = false, ignoreCase = false) {
    // Vérifier si la valeur est null/vide
    const isEmptyValue = value === null || value === undefined || value === '' || value.toString().trim() === '';
    
    if (isEmptyValue) {
        if (allowNull) {
            return null; // Validation réussie - valeur vide autorisée
        } else {
            return {
                type: 'error',
                message:  `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": Valeur vide non autorisée`,
                row: rowNumber,
                column: columnName,
                value: value || '(vide)'
            };
        }
    }
    
    if (!allowedValues || allowedValues.length === 0) {
        return {
            type: 'warning',
            message:  `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": Aucune valeur configurée pour la validation`,
            row: rowNumber,
            column: columnName,
            value: value
        };
    }
    
    // Convertir la valeur en string pour la comparaison
    const stringValue = value.toString().trim();
    const valueUpperCase = stringValue.toUpperCase();
    const allowedValuesUpperCase = parseListeValues(allowedValues.join(';').toUpperCase());

    if (!(allowedValues.includes(stringValue) || (allowedValuesUpperCase.includes(valueUpperCase) && ignoreCase))){
        // Vérification insensible à la casse pour suggérer des corrections
        const possibleMatches = allowedValues.filter(allowed => 
            allowed.toUpperCase() === valueUpperCase
        );
        
        let errorMessage =  `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": Valeur "${stringValue}" non autorisée`;
        
        if (possibleMatches.length > 0) {
            errorMessage += ` (${i18nDt('tab.datatables_controller.results.proposal', 'Suggestion')}: "${possibleMatches[0]}")`;
        }
        
        errorMessage += `. ${i18nDt('tab.datatables_controller.results.authorizedvalue', 'Valeurs autorisées')}: ${allowedValues.join(', ')}`;
        
        if (allowNull) {
            errorMessage += ` (${i18nDt('tab.datatables_controller.results.nullauthorized', 'valeurs vides autorisées')})`;
        }
        
        return {
            type: 'error',
            message: errorMessage,
            row: rowNumber,
            column: columnName,
            value: stringValue,
            allowedValues: allowedValues,
            allowNull: allowNull
        };
    }
    
    return null; // Validation réussie
}

// Validation par expression régulière
function validateRegex(value, regexPattern, columnName, rowNumber, allowNull = false, description = '') {
    // Vérifier si la valeur est null/vide
    const isEmptyValue = value === null || value === undefined || value === '' || value.toString().trim() === '';
    
    if (isEmptyValue) {
        if (allowNull) {
            return null; // Validation réussie - valeur vide autorisée
        } else {
            return {
                type: 'error',
                message:  `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": Valeur vide non autorisée`,
                row: rowNumber,
                column: columnName,
                value: value || '(vide)'
            };
        }
    }

    if (!regexPattern) {
        return {
            type: 'warning',
            message:  `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": Aucune expression régulière configurée`,
            row: rowNumber,
            column: columnName,
            value: value
        };
    }
    
    try {
        const regex = new RegExp(regexPattern);
        const stringValue = value.toString();
        
        if (!regex.test(stringValue)) {
            let errorMessage =  `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": La valeur "${stringValue}" ne respecte pas le format requis`;
            
            if (description) {
                errorMessage += ` (${description})`;
            }
            
            errorMessage += `. ${i18nDt('tab.datatables_controller.results.expectedpattern', 'Pattern attendu')}: ${regexPattern}`;
            
            return {
                type: 'error',
                message: errorMessage,
                row: rowNumber,
                column: columnName,
                value: stringValue,
                regexPattern: regexPattern,
                description: description
            };
        }
        
        return null; // Validation réussie
        
    } catch (error) {
        return {
            type: 'warning',
            message:  `${i18nDt('tab.datatables_controller.results.line', 'Ligne')} ${rowNumber}, ${i18nDt('tab.datatables_controller.results.column', 'Colonne')} "${columnName}": Expression régulière invalide (${error.message})`,
            row: rowNumber,
            column: columnName,
            value: value
        };
    }
}


// Affichage des résultats de validation
function displayValidationResults(datatableId, results,pageNum) {
    const resultsDiv = document.getElementById('validationResults');
    const contentDiv = document.getElementById('validationContent');
    
    const dataTableName = dataTablesCache.find(dt => dt.id === datatableId)?.name || datatableId;
    
    console.log(`Analyse de la validation ${pageNum}`)
    let html = `<h5>${i18nDt('tab.datatables_controller.results.resultstitle', 'Résultats')} ${pageNum} ${i18nDt('tab.datatables_controller.results.authorizedvalue', 'pour')}: ${dataTableName}</h5>`;
    
    if (results.length === 0) {
        html += `<div class="validation-result validation-success">✅ ${i18nDt('tab.datatables_controller.results.noerrors', 'Aucune erreur détectée')}</div>`;
    } else {
        const errors = results.filter(r => r.type === 'error');
        const warnings = results.filter(r => r.type === 'warning');
        if (errors.length > 0) {
            html += `<div class="validation-result validation-error">
                <strong>❌ ${errors.length} ${i18nDt('tab.datatables_controller.results.error.detected', 'erreur(s) détectée(s)')}:</strong>
                <ul>${errors.map(e => `<li>${e.message}</li>`).join('')}</ul>
            </div>`;
        }
        if (warnings.length > 0) {
            html += `<div class="validation-result validation-warning">
                <strong>⚠️ ${warnings.length} ${i18nDt('tab.datatables_controller.results.error.warning', 'avertissement(s)')}:</strong>
                <ul>${warnings.map(w => `<li>${w.message}</li>`).join('')}</ul>
            </div>`;
        }
    }
    
    const loadingDiv = document.getElementById('datatableAnalyseLoading-'+datatableId);
    if(loadingDiv) loadingDiv.remove();
    contentDiv.innerHTML += html;
    
    resultsDiv.style.display = 'block';
    
    // Scroll vers les résultats
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}

// Fonctions utilitaires pour l'interface - Améliorées
function showValidationLoading(datatableId) {
    const resultsDiv = document.getElementById('validationResults');
    const contentDiv = document.getElementById('validationContent');
    
    if (resultsDiv && contentDiv) {
        const dataTableName = getDataTableNameById(datatableId);
        contentDiv.innerHTML += `
            <div class="text-center" id="datatableAnalyseLoading-${datatableId}">
                <i class="fa fa-spinner fa-spin fa-3x text-primary"></i>
                <h4>${i18nDt('tab.datatables_controller.validation_in_progress', 'Validation in progress...')}</h4>
                <p>${i18nDt('tab.datatables_controller.validation_analyzing', 'Analyzing DataTable:')} <strong>${dataTableName}</strong></p>
                <p><small>${i18nDt('tab.datatables_controller.validation_wait', 'Please wait while checking data...')}</small></p>
                <div class="progress">
                    <div class="progress-bar progress-bar-striped active" role="progressbar" style="width: 100%">
                        <span class="sr-only">${i18nDt('tab.datatables_controller.validation_in_progress', 'Validation in progress...')}</span>
                    </div>
                </div>
            </div>
        `;
        resultsDiv.style.display = 'block';
        resultsDiv.scrollIntoView({ behavior: 'smooth' });
    }
}

function hideValidationLoading() {
    const resultsDiv = document.getElementById('validationResults');
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
    }
}

// Testeur d'expression régulière en temps réel
function testRegexPattern(columnName, triggerElement) {
    const scopeRoot = (triggerElement && typeof triggerElement.closest === 'function')
        ? triggerElement.closest('.column-config')
        : null;
    const root = scopeRoot || document;
    const regexInput = root.querySelector(`.regex-pattern[data-column="${columnName}"]`) || root.querySelector('.regex-pattern');
    const testInput = root.querySelector(`.regex-test-input[data-column="${columnName}"]`) || root.querySelector('.regex-test-input');
    const resultDiv = root.querySelector(`.regex-test-result[data-column="${columnName}"]`) || root.querySelector('.regex-test-result');
    
    if (!regexInput || !testInput || !resultDiv) return;
    
    const pattern = regexInput.value.trim();
    const testValue = testInput.value;
    
    resultDiv.innerHTML = '';
    
    if (!pattern) {
        resultDiv.innerHTML = `<small class="text-muted">${i18nDt('tab.datatables_controller.rules.regex', 'Saisissez une expression régulière pour tester')}</small>`;
        return;
    }
    
    if (!testValue) {
        resultDiv.innerHTML = `<small class="text-muted">${i18nDt('tab.datatables_controller.rules.regex1', 'Saisissez une valeur de test')}</small>`;
        return;
    }
    
    try {
        const regex = new RegExp(pattern);
        const isMatch = regex.test(testValue);
        
        if (isMatch) {
            resultDiv.innerHTML = `
                <div class="alert alert-success" style="padding: 5px; margin: 0;">
                    <i class="fa fa-check"></i> <strong>✅ ${i18nDt('tab.datatables_controller.rules.match', 'Correspond')}</strong> - ${i18nDt('tab.datatables_controller.rules.value', 'La valeur')} "${testValue}" ${i18nDt('tab.datatables_controller.rules.patternok', 'respecte le pattern')}
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div class="alert alert-danger" style="padding: 5px; margin: 0;">
                    <i class="fa fa-times"></i> <strong>❌ ${i18nDt('tab.datatables_controller.rules.donotmatch', 'Ne correspond pas')}</strong> - ${i18nDt('tab.datatables_controller.rules.value', 'La valeur')} "${testValue}" ${i18nDt('tab.datatables_controller.results.patternko', 'ne respecte pas le pattern')}
                </div>
            `;
        }
        
        // Ajouter des informations sur les captures si disponibles
        if (isMatch) {
            const matches = testValue.match(regex);
            if (matches && matches.length > 1) {
                resultDiv.innerHTML += `
                    <small class="text-info">
                        <strong>${i18nDt('tab.datatables_controller.rules.groupedcapture', 'Groupes capturés')}:</strong> ${matches.slice(1).join(', ')}
                    </small>
                `;
            }
        }
        
    } catch (error) {
        resultDiv.innerHTML = `
            <div class="alert alert-warning" style="padding: 5px; margin: 0;">
                <i class="fa fa-exclamation-triangle"></i> <strong>⚠️ ${i18nDt('tab.datatables_controller.rules.invalideExpression', 'Expression invalide')}</strong><br>
                <small>${error.message}</small>
            </div>
        `;
    }
}

// Bibliothèque de patterns regex couramment utilisés
const REGEX_PATTERNS_LIBRARY = {
    'email': {
        pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
        description: 'Adresse email valide'
    },
    'phone_fr': {
        pattern: '^(?:(?:\\+|00)33|0)\\s*[1-9](?:[\\s.-]*\\d{2}){4}$',
        description: 'Numéro de téléphone français'
    },
    'postal_code_fr': {
        pattern: '^\\d{5}$',
        description: 'Code postal français (5 chiffres)'
    },
    'siret': {
        pattern: '^\\d{14}$',
        description: 'Numéro SIRET (14 chiffres)'
    },
    'integers_only': {
        pattern: '^\\d+$',
        description: 'Nombres entiers uniquement'
    },
    'alphanumeric': {
        pattern: '^[a-zA-Z0-9]+$',
        description: 'Caractères alphanumériques uniquement'
    },
    'sentence_case': {
        pattern: '^[A-Z][a-z]*$',
        description: 'Première lettre majuscule, reste en minuscules'
    },
    'uuid': {
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        description: 'UUID/GUID standard'
    },
    'ip_address': {
        pattern: '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$',
        description: 'Adresse IP v4'
    },
    'date_dd_mm_yyyy': {
        pattern: '^\\d{2}/\\d{2}/\\d{4}$',
        description: 'Date au format DD/MM/YYYY'
    }
};

// Fonction pour afficher la bibliothèque de patterns
function showRegexLibrary(columnName) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h4 class="modal-title">📚 Bibliothèque d'expressions régulières</h4>
                    <button type="button" class="close" data-dismiss="modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="row">
                        ${Object.keys(REGEX_PATTERNS_LIBRARY).map(key => {
                            const item = REGEX_PATTERNS_LIBRARY[key];
                            return `
                                <div class="col-md-6" style="margin-bottom: 15px;">
                                    <div class="panel panel-default">
                                        <div class="panel-body">
                                            <h5>${item.description}</h5>
                                            <code>${item.pattern}</code>
                                            <br><br>
                                            <button class="btn btn-sm btn-primary" onclick="useRegexPattern('${columnName}', '${item.pattern}', '${item.description}')">
                                                <i class="fa fa-copy"></i> Utiliser
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-default" data-dismiss="modal">Fermer</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    $(modal).modal('show');
    
    $(modal).on('hidden.bs.modal', function() {
        document.body.removeChild(modal);
    });
}

// Fonction pour utiliser un pattern de la bibliothèque
function useRegexPattern(columnName, pattern, description) {
    const regexInput = document.querySelector(`.regex-pattern[data-column="${columnName}"]`);
    const descriptionInput = document.querySelector(`.regex-description[data-column="${columnName}"]`);
    
    if (regexInput) regexInput.value = pattern;
    if (descriptionInput) descriptionInput.value = description;
    
    // Fermer la modal
    $('.modal').modal('hide');
    
    console.log(`📋 Pattern appliqué pour ${columnName}: ${pattern}`);
}


const QUICK_REGEX_EXAMPLES = [
    {
        label: 'Entier',
        pattern: '^\\d+$',
        description: 'Nombres entiers uniquement'
    },
    {
        label: '0-999',
        pattern: '^\\d{1,4}$',
        description: 'Nombre entre 0 et 9999'
    },
    {
        label: '0-100',
        pattern: '^(?:100(?:\\.0)?|(?:[1-9]\\d|\\d)(?:\\.\\d)?)$',
        description: 'Nombre entre 0 et 100'
    },
    {
        label: 'tel +33',
        pattern: '^(\\+33)[0-9]{9}$',
        description: 'Numero de tel en +33'
    },
    {
        label: 'email',
        pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
        description: 'Adresse email valide'
    },
    {
        label: 'postal_code_fr',
        pattern: '^\\d{5}$',
        description: 'Code postal français (5 chiffres)'
    },
    {
        label: 'siret',
        pattern: '^\\d{14}$',
        description: 'Numéro SIRET (14 chiffres)'
    },
    {
        label: 'alphanumeric',
        pattern: '^[a-zA-Z0-9]+$',
        description: 'Caractères alphanumériques uniquement'
    },
    {
        label: 'sentence_case',
        pattern: '^[A-Z][a-z]*$',
        description: 'Première lettre majuscule, reste en minuscules'
    },
    {
        label: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        description: 'UUID/GUID standard'
    },
    {
        label: 'ip_address',
        pattern: '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$',
        description: 'Adresse IP v4'
    },
    {
        label: 'date_dd_mm_yyyy',
        pattern: '^\\d{2}/\\d{2}/\\d{4}$',
        description: 'Date au format DD/MM/YYYY'
    }
];

const QUICK_LIST_EXAMPLES = [
    {
        label: 'TRUE;FALSE',
        values: 'TRUE;FALSE',
        ignoreCase: true,
        description: '(casse ignoree)'
    },
    {
        label: 'DISSUASION;DISTRIBUTION',
        values: 'DISSUASION;DISTRIBUTION',
        ignoreCase: false,
        description: ''
    },
    {
        label: 'MOTIF;MENU;ACCUEIL;ROUTAGE',
        values: 'MOTIF;MENU;ACCUEIL;ROUTAGE',
        ignoreCase: false,
        description: ''
    }
];

function buildRegexQuickExamplesHtml() {
    return `
        <div class="regex-quick-examples" style="margin-top: 8px;">
            <small class="text-muted"><strong>${i18nDt('tab.datatables_controller.rules.regexinfo', 'Utilisez les expressions régulières JavaScript standard. Exemples :')}</strong></small><br>
            ${QUICK_REGEX_EXAMPLES.map((item) => `
                <button type="button"
                        class="btn btn-default btn-xs regex-example-btn"
                        data-pattern="${item.pattern}"
                        data-description="${item.description}"
                        style="margin: 2px 4px 2px 0;">
                    ${item.label}
                </button>
                 : ${item.description}<br>
            `).join('')}
        </div>
    `;
}

function buildListQuickExamplesHtml() {
    return `
        <div class="liste-quick-examples" style="margin-top: 8px;">
            <small class="text-muted"><strong>${i18nDt('tab.datatables_controller.rules.listinfo', 'Exemples cliquables:')}</strong></small><br>
            ${QUICK_LIST_EXAMPLES.map((item) => `
                <button type="button"
                        class="btn btn-default btn-xs liste-example-btn"
                        data-values="${item.values}"
                        data-ignore-case="${item.ignoreCase ? 'true' : 'false'}"
                        style="margin: 2px 4px 2px 0;">
                    ${item.label}${item.description ? ` ${item.description}` : ''}
                </button>
            `).join('')}
        </div>
    `;
}

/**
 * Gestionnaire d'événements pour éviter les conflits de clic
 */
document.addEventListener('DOMContentLoaded', function() {
    // Empêcher la propagation des clics sur les boutons de contrôle
    document.addEventListener('click', function(e) {
        if (e.target.closest('.btn-control')) {
            e.stopPropagation();
        }
    });
});

