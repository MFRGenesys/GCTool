/**
 * Variables globales pour la gestion des tâches dans le panneau
 */
let editingTaskBoxId = null;
let editingTaskIndex = -1;

function i18nTask(key, fallback, params) {
    if (window.GCToolI18n && typeof window.GCToolI18n.t === 'function') {
        return window.GCToolI18n.t(key, params || {}, fallback);
    }
    if (!params || typeof fallback !== 'string') return fallback;
    return fallback.replace(/\{(\w+)\}/g, function (_, token) {
        return Object.prototype.hasOwnProperty.call(params, token) ? String(params[token]) : '';
    });
}

/**
 * Afficher le formulaire d'ajout de tâche
 */
function showTaskForm(boxId) {
    const form = document.getElementById(`taskForm_${boxId}`);
    form.style.display = 'block';
    editingTaskBoxId = boxId;
    editingTaskIndex = -1;
    clearTaskForm(boxId);
}

/**
 * Éditer une tâche existante
 */
function editTask(boxId, taskIndex) {
    const box = flowBoxes.get(boxId);
    const task = box.tasks[taskIndex];
    
    editingTaskBoxId = boxId;
    editingTaskIndex = taskIndex;
    
    const form = document.getElementById(`taskForm_${boxId}`);
    form.style.display = 'block';
    
    // Remplir le formulaire avec les données de la tâche
    document.getElementById(`taskAction_${boxId}`).value = task.action;
    updateTaskParameters(boxId);
    
    // Attendre que les paramètres soient créés puis les remplir
    setTimeout(() => {
        populateTaskFormWithData(boxId, task);
    }, 100);
}

/**
 * Mettre à jour les paramètres selon l'action sélectionnée
 */
function updateTaskParameters(boxId) {
    const actionSelect = document.getElementById(`taskAction_${boxId}`);
    const parametersDiv = document.getElementById(`taskParameters_${boxId}`);
    const selectedAction = actionSelect.value;
    
    if (!selectedAction) {
        parametersDiv.innerHTML = '';
        return;
    }
    
    const box = flowBoxes.get(boxId);
    console.log(`DEBUG box de la Task :`,box);
    console.log(`DEBUG paramDiv`, parametersDiv);
    let html = '';
    
    switch (selectedAction) {
        case 'play_message':
            const columns = getDataTableColumns(box.dataTable);            
            html = `
                <div class="form-group">
                    <label>Colonne du message :</label>
                    <select id="taskColumn_${boxId}" class="form-control" required>
                        <option value="">Sélectionner une colonne</option>
                        ${columns.map(col => 
                            `<option value="${col}" ${col === "" ? 'selected' : ''}>${getColumnTitle(box.dataTable,col)}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
            break;
            
        case 'identification':
            html = `
                <div class="form-group">
                    <label>Texte d'identification :</label>
                    <input type="text" id="taskText_${boxId}" class="form-control" 
                           placeholder="Ex: Authentification requise" required>
                </div>
            `;
            break;
            
        case 'client_data':
            html = `
                <div class="form-group">
                    <label>Paires Clé/Valeur :</label>
                    <div id="keyValuePairs_${boxId}">
                        <div class="key-value-pair">
                            <div class="row">
                                <div class="col-md-5">
                                    <input type="text" class="form-control key-input" placeholder="Clé">
                                </div>
                                <div class="col-md-5">
                                    <input type="text" class="form-control value-input" placeholder="Valeur">
                                </div>
                                <div class="col-md-2">
                                    <button type="button" class="btn btn-danger btn-sm" 
                                            onclick="removeKeyValuePair(this)">
                                        <i class="fa fa-minus"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <button type="button" class="btn btn-success btn-sm" 
                            onclick="addKeyValuePair('${boxId}')">
                        <i class="fa fa-plus"></i> Ajouter une paire
                    </button>
                </div>
            `;
            break;
            
        case 'activation':
            const columnsActivation = getDataTableColumns(box.dataTable);            
            html = `
                <div class="form-group">
                    <label>Colonne de contrôle :</label>
                    <select id="taskColumn_${boxId}" class="form-control" required>
                        <option value="">Sélectionner une colonne</option>
                        ${columnsActivation.map(col => 
                            `<option value="${col}" ${col === parametersDiv.parameters.column ? 'selected' : ''}>${getColumnTitle(box.dataTable,col)}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Libellé :</label>
                    <input type="text" id="taskLabel_${boxId}" class="form-control" 
                           placeholder="Ex: Fonction activée" required>
                </div>
            `;
            break;
    }
    
    parametersDiv.innerHTML = html;
}

/**
 * Ajouter une nouvelle paire clé/valeur
 */
function addKeyValuePair(boxId) {
    const container = document.getElementById(`keyValuePairs_${boxId}`);
    const newPair = document.createElement('div');
    newPair.className = 'key-value-pair';
    newPair.innerHTML = `
        <div class="row">
            <div class="col-md-5">
                <input type="text" class="form-control key-input" placeholder="Clé">
            </div>
            <div class="col-md-5">
                <input type="text" class="form-control value-input" placeholder="Valeur">
            </div>
            <div class="col-md-2">
                <button type="button" class="btn btn-danger btn-sm" onclick="removeKeyValuePair(this)">
                    <i class="fa fa-minus"></i>
                </button>
            </div>
        </div>
    `;
    container.appendChild(newPair);
}

/**
 * Sauvegarder la tâche
 */
function saveTask(boxId) {
    const actionSelect = document.getElementById(`taskAction_${boxId}`);
    const selectedAction = actionSelect.value;
    
    if (!selectedAction) {
        alert(i18nTask('tab.flow.tasks.alert.select_action', 'Veuillez selectionner une action'));
        return;
    }
    
    const taskData = {
        action: selectedAction,
        parameters: {}
    };
    
    // Collecter les paramètres selon l'action
    switch (selectedAction) {
        case 'play_message':
            const column = document.getElementById(`taskColumn_${boxId}`).value;
            if (!column) {
                alert(i18nTask('tab.flow.tasks.alert.select_column', 'Veuillez selectionner une colonne'));
                return;
            }
            taskData.parameters.column = column;
            break;
            
        case 'identification':
            const text = document.getElementById(`taskText_${boxId}`).value;
            if (!text) {
                alert(i18nTask('tab.flow.tasks.alert.enter_text', 'Veuillez saisir un texte'));
                return;
            }
            taskData.parameters.text = text;
            break;
            
        case 'client_data':
            const pairs = [];
            document.querySelectorAll(`#keyValuePairs_${boxId} .key-value-pair`).forEach(pairDiv => {
                const key = pairDiv.querySelector('.key-input').value;
                const value = pairDiv.querySelector('.value-input').value;
                if (key && value) {
                    pairs.push({ key, value });
                }
            });
            if (pairs.length === 0) {
                alert(i18nTask('tab.flow.tasks.alert.add_pair', 'Veuillez ajouter au moins une paire cle/valeur'));
                return;
            }
            taskData.parameters.keyValuePairs = pairs;
            break;
            
        case 'activation':
            const activationColumn = document.getElementById(`taskColumn_${boxId}`).value;
            const label = document.getElementById(`taskLabel_${boxId}`).value;
            if (!activationColumn || !label) {
                alert(i18nTask('tab.flow.tasks.alert.fill_all_fields', 'Veuillez remplir tous les champs'));
                return;
            }
            taskData.parameters.column = activationColumn;
            taskData.parameters.label = label;
            break;
    }
    
    // Sauvegarder la tâche
    const box = flowBoxes.get(boxId);
    if (!box.tasks) {
        box.tasks = [];
    }
    
    if (editingTaskIndex >= 0) {
        box.tasks[editingTaskIndex] = taskData;
    } else {
        box.tasks.push(taskData);
    }
    
    console.log(`DEBUG TaskSaved Box : `, box);
    // Rafraîchir l'affichage du panneau
    refreshBoxConfigPanel(boxId);
    
    // Mettre à jour l'affichage de la boîte dans le canvas
    recreateBoxSVG(boxId);
}

/**
 * Supprimer une tâche
 */
function deleteTask(boxId, taskIndex) {
    if (confirm(i18nTask('tab.flow.tasks.confirm.delete_task', 'Etes-vous sur de vouloir supprimer cette tache ?'))) {
        const box = flowBoxes.get(boxId);
        box.tasks.splice(taskIndex, 1);
        refreshBoxConfigPanel(boxId);
        recreateBoxSVG(boxId);
    }
}

/**
 * Annuler l'édition de tâche
 */
function cancelTaskEdit(boxId) {
    const form = document.getElementById(`taskForm_${boxId}`);
    form.style.display = 'none';
    clearTaskForm(boxId);
}

/**
 * Nettoyer le formulaire de tâche
 */
function clearTaskForm(boxId) {
    const actionSelect = document.getElementById(`taskAction_${boxId}`);
    const parametersDiv = document.getElementById(`taskParameters_${boxId}`);
    
    if (actionSelect) actionSelect.value = '';
    if (parametersDiv) parametersDiv.innerHTML = '';
    
    editingTaskBoxId = null;
    editingTaskIndex = -1;
}

/**
 * Rafraîchir le panneau de configuration
 */
function refreshBoxConfigPanel(boxId) {
    if (selectedBox !== boxId) {
        return;
    }
    if (typeof showBoxConfigPanel === 'function') {
        console.log('[TASK] Rafraichissement panneau configuration via showBoxConfigPanel', boxId);
        showBoxConfigPanel(boxId);
        return;
    }
    const box = flowBoxes.get(boxId);
    const configContent = document.getElementById('boxConfigContent');
    if (box && configContent) {
        console.log('[TASK] Rafraichissement panneau configuration via boxConfigContent', boxId);
        configContent.innerHTML = generateBoxConfigHTML(box);
    }
}

/**
 * Remplir le formulaire avec les données d'une tâche (fonction utilitaire)
 */
function populateTaskFormWithData(boxId, task) {
    switch (task.action) {
        case 'play_message':
            const columnSelect = document.getElementById(`taskColumn_${boxId}`);
            if (columnSelect) columnSelect.value = task.parameters.column;
            break;
        case 'identification':
            const textInput = document.getElementById(`taskText_${boxId}`);
            if (textInput) textInput.value = task.parameters.text;
            break;
        case 'client_data':
            const container = document.getElementById(`keyValuePairs_${boxId}`);
            if (container) {
                container.innerHTML = '';
                task.parameters.keyValuePairs.forEach(pair => {
                    addKeyValuePair(boxId);
                    const lastPair = container.lastElementChild;
                    lastPair.querySelector('.key-input').value = pair.key;
                    lastPair.querySelector('.value-input').value = pair.value;
                });
            }
            break;
        case 'activation':
            const activationColumnSelect = document.getElementById(`taskColumn_${boxId}`);
            const labelInput = document.getElementById(`taskLabel_${boxId}`);
            if (activationColumnSelect) activationColumnSelect.value = task.parameters.column;
            if (labelInput) labelInput.value = task.parameters.label;
            break;
        case 'calendar_task':
            const calendarColumnSelect = document.getElementById(`taskColumn_${boxId}`);
            if (calendarColumnSelect) calendarColumnSelect.value = task.parameters.column;
            break;
        case 'routing_task':
            const routingColumnSelect = document.getElementById(`taskColumn_${boxId}`);
            if (routingColumnSelect) routingColumnSelect.value = task.parameters.column;
            break;
    }
}

/**
 * Formater les détails d'une tâche pour l'affichage
 */
function formatTaskDetails(task) {
    const action = TASK_ACTIONS[task.action];
    let details = '';
    
    switch (task.action) {
        case 'play_message':
            details = `Colonne: ${task.parameters.column}`;
            break;
        case 'identification':
            details = `Texte: ${task.parameters.text}`;
            break;
        case 'client_data':
            const pairs = task.parameters.keyValuePairs || [];
            details = `${pairs.length} paire(s) clé/valeur`;
            break;
        case 'activation':
            details = `Colonne: ${task.parameters.column}, Libellé: ${task.parameters.label}`;
            break;
    }
    
    return `<small class="text-muted">${details}</small>`;
}


/**
 * Génération de la section de configuration des tâches
 */
function generateTasksConfigSection(box) {
    const tasks = box.tasks || [];
    
    let html = `
        <div class="config-section">
            <div class="row">
                <div class="col-md-8">
                <h5>
                    <i class="fa fa-tasks"></i> Gestion des Tâches 
                    <span class="badge badge-info">${tasks.length}</span>
                </h5>
                </div>
                <div class="col-md-4 text-right">
                    <button type="button" class="btn btn-xs btn-success" 
                        onclick="showTaskForm('${box.id}')">
                        <i class="fa fa-plus"></i>
                    </button>
                </div>
            </div>
            <div id="tasksContainer">
    `;

    console.log(`DEBUG liste des Task :`,tasks);
    // Liste des tâches existantes
    if (tasks.length > 0) {
        html += `<div class="existing-tasks">`;
        tasks.forEach((task, index) => {
            const action = TASK_ACTIONS[task.action];
            html += `
                <div class="task-item" data-task-index="${index}">
                    <div class="task-header">
                        <span class="task-type">
                            <i class="fa ${action.icon}" style="color: ${action.color}"></i>
                            <strong>${action.name}</strong>
                        </span>
                        <div class="task-actions">
                            <button type="button" class="btn btn-xs btn-primary" 
                                    onclick="editTask('${box.id}', ${index})">
                                <i class="fa fa-edit"></i>
                            </button>
                            <button type="button" class="btn btn-xs btn-danger" 
                                    onclick="deleteTask('${box.id}', ${index})">
                                <i class="fa fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="task-details">
                        <small class="text-muted">${formatTaskDetails(task)}</small>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    } else {
        html += `<p class="text-muted">Aucune tâche configurée</p>`;
    }

    // Formulaire d'ajout/édition de tâche
    html += `
            <div class="task-form" id="taskForm_${box.id}" style="display: none;">
                <h6>Configuration de la tâche</h6>
                <div class="form-group">
                    <label>Action :</label>
                    <select id="taskAction_${box.id}" class="form-control" 
                            onchange="updateTaskParameters('${box.id}')">
                        <option value="">Sélectionner une action</option>
                        ${generateTaskActionOptions()}
                    </select>
                </div>
                <div id="taskParameters_${box.id}">
                    <!-- Paramètres dynamiques selon l'action -->
                </div>
                <div class="form-group">
                    <button type="button" class="btn btn-success btn-sm" 
                            onclick="saveTask('${box.id}')">
                        <i class="fa fa-save"></i> Sauvegarder
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" 
                            onclick="cancelTaskEdit('${box.id}')">
                        <i class="fa fa-times"></i> Annuler
                    </button>
                </div>
            </div>
            
            <!--<button type="button" class="btn btn-primary btn-sm" 
                    onclick="showTaskForm('${box.id}')">
                <i class="fa fa-plus"></i> Ajouter une tâche
            </button>-->
        </div>
    </div>
    `;

    return html;
}

/**
 * Génération des options d'actions pour les tâches
 */
function generateTaskActionOptions() {
    let options = '';
    Object.keys(TASK_ACTIONS).forEach(actionKey => {
        const action = TASK_ACTIONS[actionKey];
        options += `<option value="${actionKey}">${action.name}</option>`;
    });
    return options;
}


/**
 * Génération des tâches pour une étape
 */
function generateStepTasks(box, row) {
    if (!box.tasks || box.tasks.length === 0) {
        return {
            id: box.id,
            hasTasks: false,
            tasks: [],
            validTasks: 0,
            totalTasks: 0,
            html: ''
        };
    }
    
    console.log(`📋 Traitement des tâches pour la boîte ${box.description || box.id}`);
    
    const processedTasks = [];
    let validTasks = 0;
    
    box.tasks.forEach((task, index) => {
        const processedTask = processTask(task, row, box, index);
        processedTasks.push(processedTask);
        
        if (processedTask.isValid) {
            validTasks++;
        }
    });

    let htmlTask = generateTaskSubSteps(box, row);
    
    return {
        id: box.id,
        hasTasks: true,
        tasks: processedTasks,
        validTasks: validTasks,
        totalTasks: processedTasks.length,
        hasValidationItems: processedTasks.some(task => task.requiresValidation),
        html: htmlTask
    };
}

/**
 * Traitement d'une tâche individuelle
 */
function processTask(task, row, box, taskIndex) {
    const processedTask = {
        originalTask: task,
        index: taskIndex,
        action: task.action,
        isValid: false,
        requiresValidation: false,
        errorMessage: null,
        processedData: {},
        taskValidated: false,
        validationData: {}
    };
    
    try {
        switch (task.action) {
            case 'play_message':
                processPlayMessageTask(processedTask, task, row);
                break;
                
            case 'identification':
                processIdentificationTask(processedTask, task, row);
                break;
                
            case 'client_data':
                processClientDataTask(processedTask, task, row);
                break;
                
            case 'activation':
                processActivationTask(processedTask, task, row);
                break;

            case 'calendar_task':
                processCalendarTask(processedTask, task, row);
                break;

            case 'routing_task':
                processRoutingTask(processedTask, task, row);
                break;

            default:
                processedTask.errorMessage = `Type de tâche non géré: ${task.action}`;
                console.warn(processedTask.errorMessage);
        }
    } catch (error) {
        processedTask.errorMessage = `Erreur lors du traitement de la tâche: ${error.message}`;
        console.error(processedTask.errorMessage, error);
    }
    
    return processedTask;
}

/**
 * Traitement d'une tâche "jouer un message"
 */
function processPlayMessageTask(processedTask, task, row) {
    const columnName = task.parameters.column;
    const messageValue = row[columnName];
    
    // Valider que la colonne existe et a une valeur
    if (!messageValue) {
        processedTask.errorMessage = `Aucune valeur trouvée dans la colonne "${columnName}"`;
        return;
    }
    
    // Vérifier si le prompt existe dans le cache
    const promptExists = promptsCache && promptsCache.some(prompt => prompt.name === messageValue);
    
    processedTask.processedData = {
        column: columnName,
        messageValue: messageValue,
        promptExists: promptExists
    };
    
    // La tâche est valide si le prompt existe
    processedTask.isValid = promptExists;
    processedTask.requiresValidation = promptExists; // On ne demande validation que si le prompt existe
    
    if (!promptExists) {
        processedTask.errorMessage = `Message "${messageValue}" non trouvé dans les prompts`;
    }
    
    // Données pour la validation
    if (promptExists) {
        processedTask.validationData = {
            type: 'checkbox',
            label: `Audio: ${messageValue}`,
            icon: 'fa-volume-up',
            description: 'Vérifier que le message audio a été joué correctement'
        };
    }
    
    console.log(`🔊 Tâche audio traitée: ${messageValue} (${promptExists ? 'trouvé' : 'non trouvé'})`);
}

/**
 * Traitement d'une tâche "identification"
 */
function processIdentificationTask(processedTask, task, row) {
    const identificationText = task.parameters.text;
    
    if (!identificationText) {
        processedTask.errorMessage = 'Texte d\'identification manquant';
        return;
    }
    
    processedTask.processedData = {
        text: identificationText
    };
    
    // La tâche d'identification est toujours valide si elle a un texte
    processedTask.isValid = true;
    processedTask.requiresValidation = true;
    
    // Données pour la validation
    processedTask.validationData = {
        type: 'ok_ko',
        label: `Authentification: ${identificationText}`,
        icon: 'fa-user-circle',
        description: 'Valider si l\'authentification s\'est déroulée correctement'
    };
    
    console.log(`🔐 Tâche identification traitée: ${identificationText}`);
}

/**
 * Traitement d'une tâche "données client"
 */
function processClientDataTask(processedTask, task, row) {
    const keyValuePairs = task.parameters.keyValuePairs || [];
    
    if (keyValuePairs.length === 0) {
        processedTask.errorMessage = 'Aucune paire clé/valeur configurée';
        return;
    }
    
    processedTask.processedData = {
        keyValuePairs: keyValuePairs,
        pairsCount: keyValuePairs.length
    };
    
    // La tâche données client est toujours valide si elle a des paires
    processedTask.isValid = true;
    processedTask.requiresValidation = true;
    
    // Données pour la validation
    processedTask.validationData = {
        type: 'checkbox_list',
        label: 'Données Client',
        icon: 'fa-database',
        description: 'Cocher les données client vérifiées',
        items: keyValuePairs.map(pair => ({
            key: pair.key,
            value: pair.value,
            label: `${pair.key}: ${pair.value}`
        }))
    };
    
    console.log(`📊 Tâche données client traitée: ${keyValuePairs.length} paires`);
}

/**
 * Traitement d'une tâche "activation"
 */
function processActivationTask(processedTask, task, row) {
    const columnName = task.parameters.column;
    const label = task.parameters.label;
    const activationValue = row[columnName];
    
    if (!label) {
        processedTask.errorMessage = 'Libellé d\'activation manquant';
        return;
    }
    
    // Déterminer si la fonctionnalité est active
    const isActive = isActivationPositive(activationValue);
    
    processedTask.processedData = {
        column: columnName,
        label: label,
        activationValue: activationValue,
        isActive: isActive
    };
    
    // La tâche est toujours valide (même si désactivée)
    processedTask.isValid = true;
    // On ne demande validation que si la fonctionnalité est active
    processedTask.requiresValidation = isActive;
    
    if (isActive) {
        // Données pour la validation (seulement si actif)
        processedTask.validationData = {
            type: 'checkbox',
            label: `Activation: ${label}`,
            icon: 'fa-toggle-on',
            description: 'Vérifier que la fonctionnalité est bien activée'
        };
    }
    
    console.log(`⚡ Tâche activation traitée: ${label} (${isActive ? 'active' : 'inactive'})`);
}

function processRoutingTask(processedTask, task, row) {
    const columnName = task.parameters.column;
    const rawQueueName = columnName ? row[columnName] : undefined;
    const queueName = (rawQueueName === undefined || rawQueueName === null || String(rawQueueName).trim() === '')
        ? ''
        : String(rawQueueName).trim();
    const queueExists = Array.isArray(queuesCache)
        ? queuesCache.some(queue => String(queue && queue.name ? queue.name : '').trim() === queueName)
        : false;

    if (!queueName) {
        processedTask.errorMessage = `Aucune valeur trouvée dans la colonne "${columnName}"`;
        return;
    }

    processedTask.processedData = {
        column: columnName,
        queueName: queueName,
        queueExists: queueExists
    };
    processedTask.isValid = true;
    processedTask.requiresValidation = true;
    processedTask.validationData = {
        type: 'checkbox',
        label: `Routage: ${queueName}`,
        icon: 'fa-bullseye',
        description: `Distribution vers : ${queueName}`
    };

    console.log('[TASK][ROUTING] Tache de routage traitee', {
        column: columnName,
        queueName,
        queueExists
    });
}

/**
 * Fonction utilitaire pour déterminer si une valeur d'activation est positive
 */
function normalizeScheduleLookupValue(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim().toLowerCase();
}

function parseRRuleParts(rrule) {
    const parts = {};
    if (!rrule || typeof rrule !== 'string') return parts;
    rrule.split(';').forEach(pair => {
        const sepIndex = pair.indexOf('=');
        if (sepIndex <= 0) return;
        const key = pair.substring(0, sepIndex).trim().toUpperCase();
        const value = pair.substring(sepIndex + 1).trim();
        parts[key] = value;
    });
    return parts;
}

function parseByDayToIndexes(byDayValue) {
    if (!byDayValue) return [];
    const dayMap = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
    return String(byDayValue)
        .split(',')
        .map(token => token.trim().toUpperCase())
        .map(token => dayMap[token])
        .filter(index => index !== undefined)
        .sort((a, b) => a - b);
}

function convertHHmmToMinutes(hhmm) {
    if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
    const parts = hhmm.split(':');
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return (hour * 60) + minute;
}

function formatMinutesToDisplay(totalMinutes) {
    if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return '-';
    if (totalMinutes >= 1440) return '24h00';
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h${String(minutes).padStart(2, '0')}`;
}

function buildWeeklyDayIntervalsFromSchedules(scheduleRefs) {
    const dayIntervals = new Map();
    if (!Array.isArray(scheduleRefs) || scheduleRefs.length === 0) {
        return dayIntervals;
    }

    scheduleRefs.forEach(scheduleRef => {
        const fullSchedule = resolveScheduleFromCache(scheduleRef);
        if (!fullSchedule) return;

        const rruleParts = parseRRuleParts(fullSchedule.rrule);
        let dayIndexes = parseByDayToIndexes(rruleParts.BYDAY);
        if (!dayIndexes.length) {
            dayIndexes = [0, 1, 2, 3, 4, 5, 6];
        }

        const startTime = extractHHmmFromIsoDate(fullSchedule.start);
        const endTime = extractHHmmFromIsoDate(fullSchedule.end);
        const startMinutes = convertHHmmToMinutes(startTime);
        const endMinutes = convertHHmmToMinutes(endTime);
        if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
            return;
        }

        dayIndexes.forEach(dayIndex => {
            if (!dayIntervals.has(dayIndex)) {
                dayIntervals.set(dayIndex, []);
            }
            dayIntervals.get(dayIndex).push({ start: startMinutes, end: endMinutes });
        });
    });

    dayIntervals.forEach((intervals, dayIndex) => {
        const mergedIntervals = intervals
            .sort((left, right) => left.start - right.start)
            .reduce((accumulator, interval) => {
                if (!accumulator.length) {
                    accumulator.push({ start: interval.start, end: interval.end });
                    return accumulator;
                }
                const last = accumulator[accumulator.length - 1];
                if (interval.start <= last.end) {
                    last.end = Math.max(last.end, interval.end);
                    return accumulator;
                }
                accumulator.push({ start: interval.start, end: interval.end });
                return accumulator;
            }, []);
        dayIntervals.set(dayIndex, mergedIntervals);
    });

    return dayIntervals;
}

function buildWeeklyRangesFromDayIntervals(dayIntervals) {
    if (!(dayIntervals instanceof Map) || dayIntervals.size === 0) {
        return '-';
    }

    const groupedRanges = new Map();
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const intervals = Array.isArray(dayIntervals.get(dayIndex)) ? dayIntervals.get(dayIndex) : [];
        const normalizedIntervals = intervals
            .map(interval => `${formatMinutesToDisplay(interval.start)}-${formatMinutesToDisplay(interval.end)}`)
            .filter(intervalText => intervalText !== '--');
        if (!normalizedIntervals.length) continue;

        const intervalKey = normalizedIntervals.join('/');
        if (!groupedRanges.has(intervalKey)) {
            groupedRanges.set(intervalKey, {
                dayIndexes: [],
                intervalText: intervalKey
            });
        }
        groupedRanges.get(intervalKey).dayIndexes.push(dayIndex);
    }

    const segments = Array.from(groupedRanges.values()).map(group => {
        const dayLabel = formatDayIndexesCompact(group.dayIndexes);
        return `${dayLabel}-${group.intervalText}`;
    });

    return segments.length ? segments.join(' / ') : '-';
}

function buildComplementaryClosingDayIntervals(openDayIntervals) {
    const closingIntervals = new Map();
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const openIntervals = Array.isArray(openDayIntervals.get(dayIndex)) ? openDayIntervals.get(dayIndex) : [];
        let cursor = 0;
        const complements = [];

        openIntervals.forEach(interval => {
            if (interval.start > cursor) {
                complements.push({ start: cursor, end: interval.start });
            }
            cursor = Math.max(cursor, interval.end);
        });

        if (cursor < 1440) {
            complements.push({ start: cursor, end: 1440 });
        }

        if (!openIntervals.length) {
            complements.push({ start: 0, end: 1440 });
        }

        closingIntervals.set(dayIndex, complements.filter(interval => interval.end > interval.start));
    }
    return closingIntervals;
}

function resolveScheduleGroupFromCache(scheduleGroupNameOrId) {
    const normalizedValue = normalizeScheduleLookupValue(scheduleGroupNameOrId);
    if (!normalizedValue || !Array.isArray(scheduleGroupsCache)) return null;
    return scheduleGroupsCache.find(group =>
        normalizeScheduleLookupValue(group?.name) === normalizedValue
        || normalizeScheduleLookupValue(group?.id) === normalizedValue
    ) || null;
}

function resolveScheduleFromCache(scheduleRef) {
    if (!scheduleRef || !Array.isArray(schedulesCache)) return null;
    const refId = normalizeScheduleLookupValue(scheduleRef.id);
    const refName = normalizeScheduleLookupValue(scheduleRef.name);
    return schedulesCache.find(schedule =>
        (refId && normalizeScheduleLookupValue(schedule?.id) === refId)
        || (refName && normalizeScheduleLookupValue(schedule?.name) === refName)
    ) || null;
}

function formatHHmmToDisplay(hhmm) {
    if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return '-';
    const parts = hhmm.split(':');
    const hour = parseInt(parts[0], 10);
    return `${Number.isNaN(hour) ? parts[0] : String(hour)}h${parts[1]}`;
}

function extractHHmmFromIsoDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function formatDayIndexesCompact(dayIndexes) {
    if (!Array.isArray(dayIndexes) || dayIndexes.length === 0) return '-';
    const tokens = ['L', 'Ma', 'Me', 'J', 'V', 'S', 'D'];
    const uniqueSorted = Array.from(new Set(dayIndexes)).sort((a, b) => a - b);
    const ranges = [];
    let rangeStart = uniqueSorted[0];
    let prev = uniqueSorted[0];

    for (let i = 1; i < uniqueSorted.length; i++) {
        const current = uniqueSorted[i];
        if (current === prev + 1) {
            prev = current;
            continue;
        }
        ranges.push([rangeStart, prev]);
        rangeStart = current;
        prev = current;
    }
    ranges.push([rangeStart, prev]);

    return ranges.map(([start, end]) => {
        if (start === end) return tokens[start];
        return `${tokens[start]}${tokens[end]}`;
    }).join(',');
}

// [FLOW-CALENDAR HELPER] Build a compact weekly schedule string (same format for opening and closing).
function buildWeeklyRangesFromSchedules(scheduleRefs) {
    const dayIntervals = buildWeeklyDayIntervalsFromSchedules(scheduleRefs);
    return buildWeeklyRangesFromDayIntervals(dayIntervals);
}

function buildWeeklyOpeningFromSchedules(scheduleGroup) {
    if (!scheduleGroup || !Array.isArray(scheduleGroup.openSchedules) || scheduleGroup.openSchedules.length === 0) {
        return '-';
    }
    return buildWeeklyRangesFromSchedules(scheduleGroup.openSchedules);
}

function buildWeeklyClosingFromSchedules(scheduleGroup) {
    if (!scheduleGroup) {
        return '-';
    }

    if (Array.isArray(scheduleGroup.closedSchedules) && scheduleGroup.closedSchedules.length > 0) {
        return buildWeeklyRangesFromSchedules(scheduleGroup.closedSchedules);
    }

    if (Array.isArray(scheduleGroup.openSchedules) && scheduleGroup.openSchedules.length > 0) {
        const openDayIntervals = buildWeeklyDayIntervalsFromSchedules(scheduleGroup.openSchedules);
        const complementaryClosingIntervals = buildComplementaryClosingDayIntervals(openDayIntervals);
        const computedClosing = buildWeeklyRangesFromDayIntervals(complementaryClosingIntervals);
        console.log('[TASK][CALENDAR] Fermetures calculees depuis le complement des ouvertures', {
            scheduleGroupName: scheduleGroup.name,
            computedClosing
        });
        return computedClosing;
    }

    return '-';
}

function buildDateAtLocalTime(year, month, day, sourceDate) {
    const safeDate = sourceDate instanceof Date && !Number.isNaN(sourceDate.getTime()) ? sourceDate : new Date();
    return new Date(
        year,
        month - 1,
        day,
        safeDate.getHours(),
        safeDate.getMinutes(),
        safeDate.getSeconds(),
        safeDate.getMilliseconds()
    );
}

function computeNextScheduleOccurrence(schedule, referenceDate = new Date()) {
    if (!schedule) return null;
    const startDate = new Date(schedule.start);
    if (Number.isNaN(startDate.getTime())) return null;

    const ref = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
        ? referenceDate
        : new Date();

    if (!schedule.rrule) {
        return startDate >= ref ? startDate : null;
    }

    const rruleParts = parseRRuleParts(schedule.rrule);
    const freq = (rruleParts.FREQ || '').toUpperCase();

    if (freq === 'YEARLY' && rruleParts.BYMONTH && rruleParts.BYMONTHDAY) {
        const months = String(rruleParts.BYMONTH).split(',').map(v => parseInt(v, 10)).filter(v => !Number.isNaN(v));
        const days = String(rruleParts.BYMONTHDAY).split(',').map(v => parseInt(v, 10)).filter(v => !Number.isNaN(v));
        for (let year = ref.getFullYear(); year <= ref.getFullYear() + 6; year++) {
            for (let i = 0; i < months.length; i++) {
                for (let j = 0; j < days.length; j++) {
                    const candidate = buildDateAtLocalTime(year, months[i], days[j], startDate);
                    if (candidate >= ref) {
                        return candidate;
                    }
                }
            }
        }
        return null;
    }

    if (freq === 'WEEKLY') {
        const byDays = parseByDayToIndexes(rruleParts.BYDAY);
        const allowedDays = byDays.length ? byDays : [0, 1, 2, 3, 4, 5, 6];
        for (let offset = 0; offset < 14; offset++) {
            const candidate = new Date(ref);
            candidate.setDate(ref.getDate() + offset);
            const candidateDay = (candidate.getDay() + 6) % 7;
            if (!allowedDays.includes(candidateDay)) continue;
            candidate.setHours(startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), 0);
            if (candidate >= ref) return candidate;
        }
        return null;
    }

    if (freq === 'DAILY') {
        const candidate = new Date(ref);
        candidate.setHours(startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), 0);
        if (candidate >= ref) return candidate;
        candidate.setDate(candidate.getDate() + 1);
        return candidate;
    }

    return startDate >= ref ? startDate : null;
}

function formatDateToLocale(value, timeZone) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '-';
    const options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    };
    if (timeZone) options.timeZone = timeZone;
    return new Intl.DateTimeFormat('fr-FR', options).format(value);
}

function buildNextHolidayFromSchedules(scheduleGroup) {
    if (!scheduleGroup || !Array.isArray(scheduleGroup.holidaySchedules) || scheduleGroup.holidaySchedules.length === 0) {
        return {
            date: null,
            name: null,
            display: i18nTask('tab.flow.validation.calendar.no_holiday', 'Aucun holiday a venir')
        };
    }

    let nextHoliday = null;
    scheduleGroup.holidaySchedules.forEach(holidayRef => {
        const fullSchedule = resolveScheduleFromCache(holidayRef);
        if (!fullSchedule) return;
        const nextOccurrence = computeNextScheduleOccurrence(fullSchedule, new Date());
        if (!nextOccurrence) return;
        if (!nextHoliday || nextOccurrence < nextHoliday.date) {
            nextHoliday = {
                date: nextOccurrence,
                name: fullSchedule.name || holidayRef.name || '-'
            };
        }
    });

    if (!nextHoliday) {
        return {
            date: null,
            name: null,
            display: i18nTask('tab.flow.validation.calendar.no_holiday', 'Aucun holiday a venir')
        };
    }

    const formattedDate = formatDateToLocale(nextHoliday.date, scheduleGroup.timeZone || 'Europe/Paris');
    return {
        date: nextHoliday.date,
        name: nextHoliday.name,
        display: `${formattedDate} (${nextHoliday.name})`
    };
}

/**
 * [FLOW-CALENDAR HELPER] Resolution des informations calendrier a partir du nom/ID de Schedule Group.
 */
function resolveScheduleGroupCalendarInsights(scheduleGroupNameOrId) {
    const scheduleGroup = resolveScheduleGroupFromCache(scheduleGroupNameOrId);
    if (!scheduleGroup) {
        console.warn('[TASK][CALENDAR] Schedule Group introuvable dans le cache', {
            input: scheduleGroupNameOrId
        });
        return {
            found: false,
            scheduleGroup: null,
            weeklyOpening: '-',
            weeklyClosing: '-',
            nextHolidayDisplay: i18nTask('tab.flow.validation.calendar.not_found', 'Schedule Group introuvable'),
            nextHolidayName: null
        };
    }

    const weeklyOpening = buildWeeklyOpeningFromSchedules(scheduleGroup);
    const weeklyClosing = buildWeeklyClosingFromSchedules(scheduleGroup);
    const nextHoliday = buildNextHolidayFromSchedules(scheduleGroup);
    console.log('[TASK][CALENDAR] Insights calendrier resolves', {
        scheduleGroupName: scheduleGroup.name,
        weeklyOpening,
        weeklyClosing,
        nextHoliday: nextHoliday.display
    });

    return {
        found: true,
        scheduleGroup: scheduleGroup,
        weeklyOpening: weeklyOpening,
        weeklyClosing: weeklyClosing,
        nextHolidayDisplay: nextHoliday.display,
        nextHolidayName: nextHoliday.name
    };
}

function processCalendarTask(processedTask, task, row) {
    const columnName = task.parameters.column;
    const rawScheduleGroupValue = columnName ? row[columnName] : undefined;
    const scheduleGroupName = (rawScheduleGroupValue === undefined || rawScheduleGroupValue === null || String(rawScheduleGroupValue).trim() === '')
        ? '-'
        : String(rawScheduleGroupValue);
    const calendarInsights = resolveScheduleGroupCalendarInsights(scheduleGroupName);

    processedTask.processedData = {
        column: columnName,
        value: rawScheduleGroupValue,
        scheduleGroupName: scheduleGroupName,
        weeklyOpening: calendarInsights.weeklyOpening,
        weeklyClosing: calendarInsights.weeklyClosing,
        nextHolidayDisplay: calendarInsights.nextHolidayDisplay,
        nextHolidayName: calendarInsights.nextHolidayName
    };

    processedTask.isValid = true;
    processedTask.requiresValidation = true;
    processedTask.taskValidated = {
        open: 'untested',
        closed: 'untested',
        vacation: 'untested'
    };
    processedTask.validationData = {
        type: 'calendar_statuses',
        label: `Schedule Group: ${scheduleGroupName}`,
        icon: 'fa-calendar',
        description: i18nTask(
            'tab.flow.validation.calendar.description',
            'Valider le comportement du Schedule Group pour les etats Ouvert, Ferme et Vacances'
        ),
        scheduleGroupName: scheduleGroupName,
        weeklyOpening: calendarInsights.weeklyOpening,
        weeklyClosing: calendarInsights.weeklyClosing,
        nextHolidayDisplay: calendarInsights.nextHolidayDisplay,
        nextHolidayName: calendarInsights.nextHolidayName,
        statuses: [
            { key: 'open', label: i18nTask('tab.flow.validation.calendar.behavior_open', 'Ouvert') },
            { key: 'closed', label: i18nTask('tab.flow.validation.calendar.behavior_closed', 'Ferme') },
            { key: 'vacation', label: i18nTask('tab.flow.validation.calendar.behavior_vacation', 'Vacances') }
        ]
    };

    console.log('[TASK][CALENDAR] Tache calendrier traitee avec validation 3 etats', {
        column: columnName,
        scheduleGroupName: scheduleGroupName,
        weeklyOpening: calendarInsights.weeklyOpening,
        weeklyClosing: calendarInsights.weeklyClosing,
        nextHoliday: calendarInsights.nextHolidayDisplay
    });
}

function isActivationPositive(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        return lowerValue === 'yes' || lowerValue === 'oui' || lowerValue === 'true' || lowerValue === '1';
    }
    return false;
}

// i18n overrides for task editor UI (same function names on purpose).
function updateTaskParameters(boxId) {
    const actionSelect = document.getElementById(`taskAction_${boxId}`);
    const parametersDiv = document.getElementById(`taskParameters_${boxId}`);
    const selectedAction = actionSelect.value;

    if (!selectedAction) {
        parametersDiv.innerHTML = '';
        return;
    }

    const box = flowBoxes.get(boxId);
    let html = '';

    switch (selectedAction) {
        case 'play_message': {
            const columns = getDataTableColumns(box.dataTable);
            html = `
                <div class="form-group">
                    <label>${i18nTask('tab.flow.tasks.column_message', 'Colonne du message :')}</label>
                    <select id="taskColumn_${boxId}" class="form-control" required>
                        <option value="">${i18nTask('tab.flow.tasks.select_column', 'Selectionner une colonne')}</option>
                        ${columns.map(col =>
                            `<option value="${col}">${getColumnTitle(box.dataTable, col)}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
            break;
        }
        case 'identification':
            html = `
                <div class="form-group">
                    <label>${i18nTask('tab.flow.tasks.identification_text', "Texte d'identification :")}</label>
                    <input type="text" id="taskText_${boxId}" class="form-control"
                           placeholder="${i18nTask('tab.flow.tasks.identification_placeholder', 'Ex: Authentification requise')}" required>
                </div>
            `;
            break;
        case 'client_data':
            html = `
                <div class="form-group">
                    <label>${i18nTask('tab.flow.tasks.key_value_pairs', 'Paires Cle/Valeur :')}</label>
                    <div id="keyValuePairs_${boxId}">
                        <div class="key-value-pair">
                            <div class="row">
                                <div class="col-md-5">
                                    <input type="text" class="form-control key-input" placeholder="${i18nTask('tab.flow.tasks.key', 'Cle')}">
                                </div>
                                <div class="col-md-5">
                                    <input type="text" class="form-control value-input" placeholder="${i18nTask('tab.flow.tasks.value', 'Valeur')}">
                                </div>
                                <div class="col-md-2">
                                    <button type="button" class="btn btn-danger btn-sm" onclick="removeKeyValuePair(this)">
                                        <i class="fa fa-minus"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <button type="button" class="btn btn-success btn-sm" onclick="addKeyValuePair('${boxId}')">
                        <i class="fa fa-plus"></i> ${i18nTask('tab.flow.tasks.add_pair', 'Ajouter une paire')}
                    </button>
                </div>
            `;
            break;
        case 'activation': {
            const columns = getDataTableColumns(box.dataTable);
            html = `
                <div class="form-group">
                    <label>${i18nTask('tab.flow.tasks.control_column', 'Colonne de controle :')}</label>
                    <select id="taskColumn_${boxId}" class="form-control" required>
                        <option value="">${i18nTask('tab.flow.tasks.select_column', 'Selectionner une colonne')}</option>
                        ${columns.map(col =>
                            `<option value="${col}">${getColumnTitle(box.dataTable, col)}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>${i18nTask('tab.flow.tasks.label', 'Libelle :')}</label>
                    <input type="text" id="taskLabel_${boxId}" class="form-control"
                           placeholder="${i18nTask('tab.flow.tasks.label_placeholder', 'Ex: Fonction activee')}" required>
                </div>
            `;
            break;
        }
        case 'calendar_task': {
            const columns = getDataTableColumns(box.dataTable);
            html = `
                <div class="form-group">
                    <label>${i18nTask('tab.flow.tasks.calendar_column', 'Colonne calendrier :')}</label>
                    <select id="taskColumn_${boxId}" class="form-control" required>
                        <option value="">${i18nTask('tab.flow.tasks.select_column', 'Selectionner une colonne')}</option>
                        ${columns.map(col =>
                            `<option value="${col}">${getColumnTitle(box.dataTable, col)}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
            break;
        }
        case 'routing_task': {
            const columns = getDataTableColumns(box.dataTable);
            html = `
                <div class="form-group">
                    <label>${i18nTask('tab.flow.tasks.routing_column', 'Colonne de routage :')}</label>
                    <select id="taskColumn_${boxId}" class="form-control" required>
                        <option value="">${i18nTask('tab.flow.tasks.select_column', 'Selectionner une colonne')}</option>
                        ${columns.map(col =>
                            `<option value="${col}">${getColumnTitle(box.dataTable, col)}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
            break;
        }
    }

    parametersDiv.innerHTML = html;
}

function addKeyValuePair(boxId) {
    const container = document.getElementById(`keyValuePairs_${boxId}`);
    const newPair = document.createElement('div');
    newPair.className = 'key-value-pair';
    newPair.innerHTML = `
        <div class="row">
            <div class="col-md-5">
                <input type="text" class="form-control key-input" placeholder="${i18nTask('tab.flow.tasks.key', 'Cle')}">
            </div>
            <div class="col-md-5">
                <input type="text" class="form-control value-input" placeholder="${i18nTask('tab.flow.tasks.value', 'Valeur')}">
            </div>
            <div class="col-md-2">
                <button type="button" class="btn btn-danger btn-sm" onclick="removeKeyValuePair(this)">
                    <i class="fa fa-minus"></i>
                </button>
            </div>
        </div>
    `;
    container.appendChild(newPair);
}

function saveTask(boxId) {
    const actionSelect = document.getElementById(`taskAction_${boxId}`);
    const selectedAction = actionSelect.value;

    if (!selectedAction) {
        alert(i18nTask('tab.flow.tasks.alert.select_action', 'Veuillez selectionner une action'));
        return;
    }

    const taskData = { action: selectedAction, parameters: {} };

    switch (selectedAction) {
        case 'play_message': {
            const column = document.getElementById(`taskColumn_${boxId}`).value;
            if (!column) {
                alert(i18nTask('tab.flow.tasks.alert.select_column', 'Veuillez selectionner une colonne'));
                return;
            }
            taskData.parameters.column = column;
            break;
        }
        case 'identification': {
            const text = document.getElementById(`taskText_${boxId}`).value;
            if (!text) {
                alert(i18nTask('tab.flow.tasks.alert.enter_text', 'Veuillez saisir un texte'));
                return;
            }
            taskData.parameters.text = text;
            break;
        }
        case 'client_data': {
            const pairs = [];
            document.querySelectorAll(`#keyValuePairs_${boxId} .key-value-pair`).forEach((pairDiv) => {
                const key = pairDiv.querySelector('.key-input').value;
                const value = pairDiv.querySelector('.value-input').value;
                if (key && value) pairs.push({ key, value });
            });
            if (pairs.length === 0) {
                alert(i18nTask('tab.flow.tasks.alert.add_pair', 'Veuillez ajouter au moins une paire cle/valeur'));
                return;
            }
            taskData.parameters.keyValuePairs = pairs;
            break;
        }
        case 'activation': {
            const activationColumn = document.getElementById(`taskColumn_${boxId}`).value;
            const label = document.getElementById(`taskLabel_${boxId}`).value;
            if (!activationColumn || !label) {
                alert(i18nTask('tab.flow.tasks.alert.fill_all_fields', 'Veuillez remplir tous les champs'));
                return;
            }
            taskData.parameters.column = activationColumn;
            taskData.parameters.label = label;
            break;
        }
        case 'calendar_task': {
            const calendarColumn = document.getElementById(`taskColumn_${boxId}`).value;
            if (!calendarColumn) {
                alert(i18nTask('tab.flow.tasks.alert.select_column', 'Veuillez selectionner une colonne'));
                return;
            }
            taskData.parameters.column = calendarColumn;
            break;
        }
        case 'routing_task': {
            const routingColumn = document.getElementById(`taskColumn_${boxId}`).value;
            if (!routingColumn) {
                alert(i18nTask('tab.flow.tasks.alert.select_column', 'Veuillez selectionner une colonne'));
                return;
            }
            taskData.parameters.column = routingColumn;
            break;
        }
    }

    const box = flowBoxes.get(boxId);
    if (!box.tasks) box.tasks = [];
    if (editingTaskIndex >= 0) box.tasks[editingTaskIndex] = taskData;
    else box.tasks.push(taskData);
    refreshBoxConfigPanel(boxId);
    recreateBoxSVG(boxId);
}

function deleteTask(boxId, taskIndex) {
    if (!confirm(i18nTask('tab.flow.tasks.confirm.delete_task', 'Etes-vous sur de vouloir supprimer cette tache ?'))) {
        return;
    }
    const box = flowBoxes.get(boxId);
    box.tasks.splice(taskIndex, 1);
    refreshBoxConfigPanel(boxId);
    recreateBoxSVG(boxId);
}

function formatTaskDetails(task) {
    const labels = {
        column: i18nTask('tab.flow.tasks.detail.column', 'Colonne'),
        text: i18nTask('tab.flow.tasks.detail.text', 'Texte'),
        pairs: i18nTask('tab.flow.tasks.detail.pairs', 'paire(s) cle/valeur'),
        label: i18nTask('tab.flow.tasks.detail.label', 'Libelle'),
        calendar: i18nTask('tab.flow.tasks.detail.calendar', 'Calendrier'),
        routing: i18nTask('tab.flow.tasks.detail.routing', 'Routage')
    };

    let details = '';
    switch (task.action) {
        case 'play_message':
            details = `${labels.column}: ${task.parameters.column}`;
            break;
        case 'identification':
            details = `${labels.text}: ${task.parameters.text}`;
            break;
        case 'client_data': {
            const pairs = task.parameters.keyValuePairs || [];
            details = `${pairs.length} ${labels.pairs}`;
            break;
        }
        case 'activation':
            details = `${labels.column}: ${task.parameters.column}, ${labels.label}: ${task.parameters.label}`;
            break;
        case 'calendar_task':
            details = `${labels.calendar} - ${labels.column}: ${task.parameters.column || '-'}`;
            break;
        case 'routing_task':
            details = `${labels.routing} - ${labels.column}: ${task.parameters.column || '-'}`;
            break;
    }
    return `<small class="text-muted">${details}</small>`;
}

function generateTasksConfigSection(box) {
    const tasks = box.tasks || [];
    let html = `
        <div class="config-section">
            <div class="row">
                <div class="col-md-8">
                <h5>
                    <i class="fa fa-tasks"></i> ${i18nTask('tab.flow.tasks.management', 'Gestion des Taches')}
                    <span class="badge badge-info">${tasks.length}</span>
                </h5>
                </div>
                <div class="col-md-4 text-right">
                    <button type="button" class="btn btn-xs btn-success" onclick="showTaskForm('${box.id}')">
                        <i class="fa fa-plus"></i>
                    </button>
                </div>
            </div>
            <div id="tasksContainer">
    `;

    if (tasks.length > 0) {
        html += `<div class="existing-tasks">`;
        tasks.forEach((task, index) => {
            const action = TASK_ACTIONS[task.action];
            html += `
                <div class="task-item" data-task-index="${index}">
                    <div class="task-header">
                        <span class="task-type">
                            <i class="fa ${action.icon}" style="color: ${action.color}"></i>
                            <strong>${action.name}</strong>
                        </span>
                        <div class="task-actions">
                            <button type="button" class="btn btn-xs btn-primary" onclick="editTask('${box.id}', ${index})">
                                <i class="fa fa-edit"></i>
                            </button>
                            <button type="button" class="btn btn-xs btn-danger" onclick="deleteTask('${box.id}', ${index})">
                                <i class="fa fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="task-details">
                        <small class="text-muted">${formatTaskDetails(task)}</small>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    } else {
        html += `<p class="text-muted">${i18nTask('tab.flow.tasks.none_configured', 'Aucune tache configuree')}</p>`;
    }

    html += `
            <div class="task-form" id="taskForm_${box.id}" style="display: none;">
                <h6>${i18nTask('tab.flow.tasks.task_configuration', 'Configuration de la tache')}</h6>
                <div class="form-group">
                    <label>${i18nTask('tab.flow.tasks.action', 'Action :')}</label>
                    <select id="taskAction_${box.id}" class="form-control" onchange="updateTaskParameters('${box.id}')">
                        <option value="">${i18nTask('tab.flow.tasks.select_action', 'Selectionner une action')}</option>
                        ${generateTaskActionOptions()}
                    </select>
                </div>
                <div id="taskParameters_${box.id}"></div>
                <div class="form-group">
                    <button type="button" class="btn btn-success btn-sm" onclick="saveTask('${box.id}')">
                        <i class="fa fa-save"></i> ${i18nTask('tab.flow.tasks.save', 'Sauvegarder')}
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="cancelTaskEdit('${box.id}')">
                        <i class="fa fa-times"></i> ${i18nTask('tab.flow.tasks.cancel', 'Annuler')}
                    </button>
                </div>
            </div>
        </div>
    </div>
    `;

    return html;
}



/**
 * Génération des sous-étapes de tâches dans les visuels
 */
function generateTaskSubSteps(box, rowData) {
    if (!box.tasks || box.tasks.length === 0) {
        return '';
    }
    
    let subStepsHtml = '';
    //console.log(`DEBUG Generate SubTask `,box.tasks);


    box.tasks.forEach(task => {
        const action = TASK_ACTIONS[task.action];
        let subStepContent = '';
        let subStepClass = 'task-substep';
        
        switch (task.action) {
            case 'play_message':
                const messageValue = rowData[task.parameters.column];
                const promptExists = promptsCache.some(prompt => prompt.name === messageValue);
                
                subStepContent = `
                    <div class="${subStepClass} ${promptExists ? 'valid' : 'invalid'}">
                        <i class="fa fa-play-circle"></i>
                        <span>Message: ${messageValue || 'Non défini'}</span>
                        ${!promptExists ? '<i class="fa fa-exclamation-triangle text-warning"></i>' : ''}
                    </div>
                `;
                break;
                
            case 'identification':
                subStepContent = `
                    <div class="${subStepClass}">
                        <i class="fa fa-user-circle"></i>
                        <span>Identification: ${task.parameters.text}</span>
                    </div>
                `;
                break;
                
            case 'client_data':
                let dataDisplay = '';
                task.parameters.keyValuePairs.forEach(pair => {
                    dataDisplay += `${pair.key}: ${pair.value}<br>`;
                });
                
                subStepContent = `
                    <div class="${subStepClass}">
                        <i class="fa fa-database"></i>
                        <span>Données Client:<br>${dataDisplay}</span>
                    </div>
                `;
                break;
                
            case 'activation':
                const activationValue = rowData[task.parameters.column];
                const isActive = isActivationPositive(activationValue);
                
                subStepContent = `
                    <div class="${subStepClass} ${isActive ? 'active' : 'inactive'}">
                        <i class="fa fa-toggle-${isActive ? 'on' : 'off'}"></i>
                        <span style="${isActive ? 'color: green' : 'color: gray'}">
                            ${task.parameters.label}
                            ${isActive ? '' : ' (Désactivé)'}
                        </span>
                    </div>
                `;
                break;
            case 'calendar_task':
                // Pas d'impact visuel pour le moment.
                subStepContent = '';
                break;
            case 'routing_task':
                const routingQueueName = rowData ? rowData[task.parameters.column] : '';
                subStepContent = `
                    <div class="${subStepClass}">
                        <i class="fa fa-bullseye"></i>
                        <span>Distribution vers : ${routingQueueName || 'Non defini'}</span>
                    </div>
                `;
                break;
        }
        
        subStepsHtml += subStepContent;
    });
    //console.log(`DEBUG SubSteps HTML`,subStepsHtml);
    return subStepsHtml;
}

/**
 * Vérifier si une valeur d'activation est positive
 */
function isActivationPositive(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        return lowerValue === 'yes' || lowerValue === 'oui' || lowerValue === 'true' || lowerValue === '1';
    }
    return false;
}
