/**
 * Variables globales pour la gestion des tâches dans le panneau
 */
let editingTaskBoxId = null;
let editingTaskIndex = -1;

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
        alert('Veuillez sélectionner une action');
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
                alert('Veuillez sélectionner une colonne');
                return;
            }
            taskData.parameters.column = column;
            break;
            
        case 'identification':
            const text = document.getElementById(`taskText_${boxId}`).value;
            if (!text) {
                alert('Veuillez saisir un texte');
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
                alert('Veuillez ajouter au moins une paire clé/valeur');
                return;
            }
            taskData.parameters.keyValuePairs = pairs;
            break;
            
        case 'activation':
            const activationColumn = document.getElementById(`taskColumn_${boxId}`).value;
            const label = document.getElementById(`taskLabel_${boxId}`).value;
            if (!activationColumn || !label) {
                alert('Veuillez remplir tous les champs');
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
    if (confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
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
    const box = flowBoxes.get(boxId);
    const configPanel = document.getElementById('boxConfigPanel'); // Ajustez l'ID selon votre structure
    
    if (configPanel && selectedBox === boxId) {
        configPanel.innerHTML = generateBoxConfigHTML(box);
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

/**
 * Fonction utilitaire pour déterminer si une valeur d'activation est positive
 */
function isActivationPositive(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        return lowerValue === 'yes' || lowerValue === 'oui' || lowerValue === 'true' || lowerValue === '1';
    }
    return false;
}



/**
 * Génération des sous-étapes de tâches dans les visuels
 */
function generateTaskSubSteps(box, rowData) {
    if (!box.tasks || box.tasks.length === 0) {
        return '';
    }
    
    let subStepsHtml = '';
    console.log(`DEBUG Generate SubTask `,box.tasks);


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