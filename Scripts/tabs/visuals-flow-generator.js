
/**
 * Génération de l'entête des visuels avec résumé de validation
 */
function generateVisualsHeader(generatedCount, selectedCount, generatedDate) {
    const container = document.getElementById('generatedVisualsContent');
    const headerDiv = document.createElement('div');
    headerDiv.className = 'visuals-header';
    headerDiv.innerHTML = `
        <div class="alert alert-info">
            <h4><i class="fa fa-info-circle"></i> Visuels générés</h4>
            <div class="row">
                <div class="col-md-6">
                    <strong>${generatedCount}</strong> visuel(s) généré(s) 
                    ${selectedCount !== 'all' ? `sur les ${selectedCount} demandé(s)` : '(tous les visuels disponibles)'}
                </div>
                <div class="col-md-6">
                    <small><strong>Généré le:</strong> ${generatedDate}</small>
                </div>
            </div>
            <hr>
            <div class="validation-summary">
                <h5><i class="fa fa-check-circle"></i> Résumé des validations</h5>
                <div class="loading-indicator">
                    <i class="fa fa-spinner fa-spin"></i> Chargement des statistiques...
                </div>
            </div>
        </div>
    `;
    
    container.appendChild(headerDiv);
}

/**
 * Génération du HTML pour le résumé des validations
 */
function generateValidationSummaryHTML(stats) {
    return `
        <h5><i class="fa fa-check-circle"></i> Résumé des validations</h5>
        <div class="row">
            <div class="col-md-12">
                <div class="progress" style="margin: 10px 0;">
                    <div class="progress-bar progress-bar-success" style="width: ${(stats.ok/stats.total)*100}%"></div>
                    <div class="progress-bar progress-bar-danger" style="width: ${(stats.ko/stats.total)*100}%"></div>
                    <div class="progress-bar progress-bar-warning" style="width: ${(stats.untested/stats.total)*100}%"></div>
                </div>
                <div class="validation-stats">
                    <span class="badge badge-info">${stats.flows} Parcours</span>
                    <span class="badge badge-success">${stats.ok} Étapes réussies</span>
                    <span class="badge badge-danger">${stats.ko} Étapes en échec</span>
                    <span class="badge badge-warning">${stats.untested} Étapes non testées</span>
                    <span class="badge badge-primary">${stats.progress}% Complété</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Génération de l'élément visuel à partir des données sauvegardées
 */
function generateVisualElement(flowPath, row, index, data) {
    console.log(`DEBUG data`, data);
    const container = document.createElement('div');
    container.className = 'generated-visual';
    
    container.innerHTML = `
        <div class="visual-container">
            <div class="visual-header">
                <h5>
                    <span class="visual-title">Parcours ${index + 1}</span>
                    <span class="visual-key">Clé: <code>${row.key}</code></span>
                    <button class="btn btn-xs btn-success export-drawio-btn">
                        <i class="fa fa-download"></i> Export
                    </button>
                    <button class="btn btn-xs btn-info toggle-details-btn">
                        <i class="fa fa-info-circle"></i> Détails
                    </button>
                    <button class="btn btn-xs btn-info toggle-validation-btn">
                        <i class="fa fa-list-check"></i> validation
                    </button>
                </h5>
            </div>
            
            <div class="visual-flow">
                ${flowPath.html}
            </div>
            
            <div class="visual-details" id="visual-details-${index}" style="display: none;">
                <div class="path-details">
                    <h6><i class="fa fa-list"></i> Détails du parcours :</h6>
                    <ul class="list-unstyled">
                        ${flowPath.details.map(detail => `<li><small>${detail}</small></li>`).join('')}
                    </ul>
                </div>
            </div>
            <div class="visual-xml" id="visual-xml-${index}" style="display: none;">
                ${flowPath.xml}
            </div>
            <div class="visual-validation-report" id="visual-validation-report-${index}" style="display: none;">
                ${generateValidationReport(flowPath, index)}
            </div>
        </div>
        <hr>
    `;

    // Ajouter les event listeners
    const toggleBtn = container.querySelector('.toggle-details-btn');
    const detailsDiv = container.querySelector('.visual-details');
    const validationBtn = container.querySelector('.toggle-validation-btn');
    const validationReportDiv = container.querySelector('.visual-validation-report');
    
    // Affichage initial des détails
    toggleBtn.addEventListener('click', () => {
        if (detailsDiv.style.display === 'none') {
            detailsDiv.style.display = 'block';
            toggleBtn.innerHTML = '<i class="fa fa-eye-slash"></i> Masquer';
        } else {
            detailsDiv.style.display = 'none';
            toggleBtn.innerHTML = '<i class="fa fa-info-circle"></i> Détails';
        }
    });
    
    validationBtn.addEventListener('click', () => {
        if (validationReportDiv.style.display === 'none') {
            validationReportDiv.style.display = 'block';
            validationBtn.innerHTML = '<i class="fa fa-eye-slash"></i> Masquer validation';
        } else {
            validationReportDiv.style.display = 'none';
            validationBtn.innerHTML = '<i class="fa fa-list-check"></i> validation';
        }
    });

    // Event listener pour l'export draw.io
    const exportBtn = container.querySelector('.export-drawio-btn');
    exportBtn.addEventListener('click', () => {
        exportFlowPathToDrawio(flowPath.xml, `parcours-${index + 1}-${row.key}.drawio`);
    });

    return container;
}

/**
 * Ajout d'un bouton pour générer plus de visuels
 */
function addGenerateMoreButton(container, currentCount) {
    const moreButtonDiv = document.createElement('div');
    moreButtonDiv.className = 'text-center';
    moreButtonDiv.style.marginTop = '20px';
    moreButtonDiv.innerHTML = `
        <div class="well">
            <p>Vous avez généré ${currentCount} visuel(s). Voulez-vous en générer plus ?</p>
            <div class="btn-group" role="group">
                <button class="btn btn-info" onclick="generateMoreVisuals(10)">
                    <i class="fa fa-plus"></i> 10 de plus
                </button>
                <button class="btn btn-info" onclick="generateMoreVisuals(50)">
                    <i class="fa fa-plus"></i> 50 de plus
                </button>
                <button class="btn btn-success" onclick="generateAllVisuals()">
                    <i class="fa fa-list"></i> Tous
                </button>
            </div>
        </div>
    `;
    
    container.appendChild(moreButtonDiv);
}

/**
 * Génération de visuels supplémentaires
 */
function generateMoreVisuals(additionalCount) {
    // Changer temporairement la sélection
    const visualsCountSelect = document.getElementById('visualsCount');
    const currentVisualsCount = document.querySelectorAll('.generated-visual').length;
    const newTotal = currentVisualsCount + additionalCount;
    
    // Créer temporairement une option pour le nouveau total
    const tempOption = document.createElement('option');
    tempOption.value = newTotal.toString();
    tempOption.textContent = `${newTotal} visuels`;
    tempOption.selected = true;
    
    // Remplacer temporairement les options
    const originalHTML = visualsCountSelect.innerHTML;
    visualsCountSelect.innerHTML = '';
    visualsCountSelect.appendChild(tempOption);
    
    // Générer les visuels
    generateFlowVisuals();
    
    // Restaurer les options originales après un délai
    setTimeout(() => {
        visualsCountSelect.innerHTML = originalHTML;
    }, 1000);
}

/**
 * Génération de tous les visuels
 */
function generateAllVisuals() {
    const visualsCountSelect = document.getElementById('visualsCount');
    visualsCountSelect.value = 'all';
    generateFlowVisuals();
}

function clearGeneratedVisuals() {
    const visualsContainer = document.getElementById('generatedVisualsContent');
    clearGeneratedVisualsFromStorage();
    if (visualsContainer) {
        visualsContainer.innerHTML = `
                            <div class="text-center" id="generatingVisuals">
                                <i class="fa fa-spinner fa-spin fa-2x"></i>
                                <h4>Génération des visuels en cours...</h4>
                                <p>Analyse des parcours avec gestion des menus...</p>
                            </div>`;
    }
    // Si vous avez une section à masquer :
    const section = document.getElementById('generatedVisualsSection');
    if (section) {
        section.style.display = 'none';
    }
}

/**
 * Mise à jour du sélecteur avec indicateurs de performance
 */
function updateVisualsCountSelector() {
    const selector = document.getElementById('visualsCount');
    const startBox = Array.from(flowBoxes.values()).find(box => box.type === 'start');
    
    if (!startBox || !startBox.dataTable) {
        selector.innerHTML = `
            <option value="1" selected>1 visuel</option>
            <option value="10">10 visuels</option>
            <option value="50">50 visuels</option>
            <option value="all" disabled>Tous les visuels (DataTable non sélectionnée)</option>
        `;
        return;
    }
    
    // Récupérer le nombre total de lignes (si en cache)
    getDataTableRowsWithCache(startBox.dataTable)
        .then(rows => {
            const totalRows = rows.length;
            selector.innerHTML = `
                <option value="1" selected>1 visuel</option>
                <option value="10">10 visuels</option>
                <option value="50">50 visuels</option>
                <option value="all">Tous les visuels (${totalRows} total)</option>
            `;
            
            // Ajouter des avertissements pour les gros volumes
            if (totalRows > 100) {
                const allOption = selector.querySelector('option[value="all"]');
                allOption.textContent += ' ⚠️ Performance';
                allOption.style.color = '#d9534f';
            }
        })
        .catch(error => {
            console.warn('Impossible de récupérer le nombre de lignes:', error);
        });
}

/**
 * Fonction pour réduire/agrandir la section des visuels
 */
function toggleVisualsSection(force) {
    const visualsContainer = document.getElementById('generatedVisualsContent');
    if (force){
        visualsContainer.style.display = 'block';
        return;
    }
    
    if (visualsContainer.style.display === 'none') {
        visualsContainer.style.display = 'block';
    } else {
        visualsContainer.style.display = 'none';
    }
}

/**
 * Fonction pour afficher masque le chargement
 */
function toggleGeneratingVisuals(force){
    // Afficher un indicateur de chargement
    const visualsContainer = document.getElementById('generatingVisuals');
    if (!force){
        visualsContainer.style.display = 'none';
        return;
    }
    if (visualsContainer.style.display === 'none') {
        visualsContainer.style.display = 'block';
    } else {
        visualsContainer.style.display = 'none';
    }
}



/**
 * Génération des tests de validation pour les tâches
 */
function generateTaskValidationTests(box, rowData) {
    if (!box.tasks || box.tasks.length === 0) {
        return [];
    }
    
    const tests = [];
    
    box.tasks.forEach(task => {
        switch (task.action) {
            case 'play_message':
                const messageValue = rowData[task.parameters.column];
                const promptExists = promptsCache.some(prompt => prompt.name === messageValue);
                
                if (promptExists) {
                    tests.push({
                        type: 'listen',
                        description: `Vérifier que le message "${messageValue}" est joué`,
                        automated: false
                    });
                }
                break;
                
            case 'identification':
                tests.push({
                    type: 'action',
                    description: `S'authentifier: ${task.parameters.text}`,
                    automated: false
                });
                break;
                
            case 'client_data':
                task.parameters.keyValuePairs.forEach(pair => {
                    tests.push({
                        type: 'verify',
                        description: `Vérifier ${pair.key}: ${pair.value}`,
                        automated: false
                    });
                });
                break;
                
            case 'activation':
                const activationValue = rowData[task.parameters.column];
                const isActive = isActivationPositive(activationValue);
                
                if (isActive) {
                    tests.push({
                        type: 'verify',
                        description: `Vérifier: ${task.parameters.label}`,
                        automated: false
                    });
                }
                break;
        }
    });
    
    return tests;
}


function generateValidationReport_old(flowpath,visualIndex) {
    console.log('📋 Génération du rapport de validation avec tâches...');
    validator = flowpath.validator
    tasks = flowpath.tasks
    const reportHtml = validator.boxes.map((box, index) => {
        const status = box.testConfig?.status || 'untested';
        const description = box.description || `Étape ${index + 1} - ${box.displayName}`;
        const uniqueBoxId = `visual_${visualIndex}_${box.id}`; // Création d'un ID unique
        
        return `
        <div class="test-case" data-status="${status}" data-box-id="${box.id}" data-visual-index="${visualIndex}">
            <div class="test-controls">
                <select class="status-select form-control" 
                        onchange="updateTestStatusFromSelect('${box.id}', this.value, ${visualIndex})">
                    <option value="untested" ${status === 'untested' ? 'selected' : ''}>Non testé</option>
                    <option value="ok" ${status === 'ok' ? 'selected' : ''}>✅ OK</option>
                    <option value="ko" ${status === 'ko' ? 'selected' : ''}>❌ KO</option>
                </select>
            </div>
            <div class="test-content">
                <div class="step-header">
                    <div class="step-info">
                        <span class="step-name">${description}</span>
                        <small class="text-muted">(${getDataTableNameById(box.datatable)})</small>
                    </div>
                    <span class="badge badge-${status}">${getStatusLabel(status)}</span>
                </div>
                <div class="step-details">
                    <div class="row">
                        <div class="col-md-6">
                            <label>Résultat attendu :</label>
                            <textarea class="form-control expected-result" rows="2"
                                      placeholder="Décrivez le comportement attendu..."
                                      onchange="updateTestField('${box.id}', 'expectedResult', this.value)">${box.testConfig?.expectedResult || ''}</textarea>
                        </div>
                        <div class="col-md-6">
                            <label>Résultat obtenu :</label>
                            <textarea class="form-control actual-result" rows="2"
                                      placeholder="Décrivez le résultat observé..."
                                      onchange="updateTestField('${box.id}', 'actualResult', this.value)">${box.testConfig?.actualResult || ''}</textarea>
                        </div>
                    </div>
                    <div class="row" style="margin-top: 10px;">
                        <div class="col-md-12">
                            <label>Commentaires de test :</label>
                            <textarea class="form-control test-comment" rows="2"
                                      placeholder="Ajoutez vos observations, remarques..."
                                      onchange="updateTestField('${box.id}', 'comment', this.value)">${box.testConfig?.comment || ''}</textarea>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');

    return `
    <div class="validation-report validation-report-flowpath">
        <div class="report-header">
            <div class="row">
                <div class="col-md-8">
                    <h4><i class="fa fa-clipboard"></i> Rapport de validation du parcours</h4>
                    <small class="text-muted">Généré le ${new Date().toLocaleString()}</small>
                </div>
            </div>
            <div class="progress" style="margin: 15px 0;">
                <div class="progress-bar progress-bar-success" style="width: ${(validator.okCount/validator.total)*100}%"></div>
                <div class="progress-bar progress-bar-danger" style="width: ${(validator.koCount/validator.total)*100}%"></div>
                <div class="progress-bar progress-bar-warning" style="width: ${(validator.untestedCount/validator.total)*100}%"></div>
            </div>
            <div class="status-summary">
                <span class="badge badge-success">${validator.okCount} Réussis</span>
                <span class="badge badge-danger">${validator.koCount} Échoués</span>
                <span class="badge badge-warning">${validator.untestedCount} Non testés</span>
                <span class="badge badge-info">${validator.progress}% Complété</span>
            </div>
        </div>
        <div class="test-cases-container">
            ${reportHtml}
        </div>
    </div>`;
}

/**
 * Mise à jour du statut de test et de l'UI associée
 */
function updateTestStatusFromSelect(boxId, status, visualIndex) {
    // Trouver l'élément spécifique à ce visuel
    const testCase = document.querySelector(`[data-box-id="${boxId}"][data-visual-index="${visualIndex}"]`);
    if (!testCase) return;

    // Mettre à jour les données stockées pour ce visuel spécifique
    const storedData = JSON.parse(localStorage.getItem('generatedVisuals'));
    if (storedData && storedData.visuals[visualIndex]) {
        const visual = storedData.visuals[visualIndex];
        const box = visual.flowPath.validator.boxes.find(b => b.id === boxId);
        const tasks = visual.flowPath.validator.tasks.find(b => b.id === boxId);
        let tasksValidated = 0;
        if(tasks){
            if (tasks.hasTasks){
                tasks.tasks.forEach(task => {
                    if (task.taskValidated) tasksValidated++;
                });
            }
        }

        if (status === 'ok' && tasks && tasks.hasTasks && tasksValidated < tasks.validTasks) {
            console.log(`⚠️ Impossible de marquer comme OK car toutes les tâches ne sont pas validées pour la boîte ${boxId}`);
            flashElementBackground(boxId);
            status = 'ko'; // Forcer à KO si les tâches ne sont pas toutes validées
            return;
        }
        if (box) {
            console.log(`DEBUG tasks`, tasks);
            if (!box.testConfig) box.testConfig = {};
            const oldStatus = box.testConfig.status || 'untested';
            box.testConfig.status = status;

            // Mettre à jour l'UI
            testCase.setAttribute('data-status', status);
            const badge = testCase.querySelector('.badge');
            if (badge) {
                badge.className = `badge badge-${status}`;
                badge.textContent = getStatusLabel(status);
            }

            // Mettre à jour les compteurs pour ce visuel
            updateValidatorCounters(visual.flowPath.validator, oldStatus, status);
            updateValidationReportUI(testCase, visual.flowPath.validator);
            
            // Sauvegarder les modifications
            localStorage.setItem('generatedVisuals', JSON.stringify(storedData));
            
            // Mettre à jour le résumé global
            updateVisualsHeaderStats(storedData.visuals);
        }
    }
}

function updateTestField(boxId, field, value, visualIndex) {
    const storedData = JSON.parse(localStorage.getItem('generatedVisuals'));
    if (storedData && storedData.visuals[visualIndex]) {
        const visual = storedData.visuals[visualIndex];
        const box = visual.flowPath.validator.boxes.find(b => b.id === boxId);
        if (box) {
            if (!box.testConfig) box.testConfig = {};
            box.testConfig[field] = value;
            localStorage.setItem('generatedVisuals', JSON.stringify(storedData));
            
            updateStoredValidation(boxId, { [field]: value }), visualIndex;
        }
    }
}

function updateTaskValidation(taksId,subTaskId, value, visualIndex) {
    console.log(`DEBUG updateTaskValidation`, taksId,subTaskId, value, visualIndex);
    const storedData = JSON.parse(localStorage.getItem('generatedVisuals'));
    if (storedData && storedData.visuals[visualIndex]) {
        
    console.log(`DEBUG storedData`, storedData);
        const visual = storedData.visuals[visualIndex];
        const task = visual.flowPath.validator.tasks.find(b => b.id === taksId);
        if (task) {
            task.taskValidated = value;
            localStorage.setItem('generatedVisuals', JSON.stringify(storedData));
            
            updateStoredValidation(boxId, { [field]: value }), visualIndex;
        }
    }
}

















/**
 * Génération du rapport de validation basé sur les tâches traitées
 */
function generateValidationReport(flowPath, flowIndex) {
    console.log('📋 Génération du rapport de validation avec tâches traitées...');
    console.log(`DEBUG flowPath`, flowPath);
    validator = flowPath.validator
    
    if (!flowPath || flowPath.length === 0) {
        return '<div class="alert alert-warning">Aucun parcours à valider</div>';
    }

    let validationHTML = `
        <div class="validation-report validation-report-flowpath">
            <div class="report-header">
                <div class="row">
                    <div class="col-md-8">
                        <h4><i class="fa fa-clipboard"></i> Rapport de validation du parcours</h4>
                        <small class="text-muted">Généré le ${new Date().toLocaleString()}</small>
                    </div>
                </div>
                <div class="progress" style="margin: 15px 0;">
                    <div class="progress-bar progress-bar-success" style="width: ${(validator.okCount/validator.total)*100}%"></div>
                    <div class="progress-bar progress-bar-danger" style="width: ${(validator.koCount/validator.total)*100}%"></div>
                    <div class="progress-bar progress-bar-warning" style="width: ${(validator.untestedCount/validator.total)*100}%"></div>
                </div>
                <div class="status-summary">
                    <span class="badge badge-success">${validator.okCount} Réussis</span>
                    <span class="badge badge-danger">${validator.koCount} Échoués</span>
                    <span class="badge badge-warning">${validator.untestedCount} Non testés</span>
                    <span class="badge badge-info">${validator.progress}% Complété</span>
                </div>
            </div>
            <div class="test-cases-container">
    `;

    // Parcourir chaque étape du flowPath
    validator.boxes.forEach((step, stepIndex) => {
        validationHTML += generateStepValidationFromTasks(step,validator.tasks[stepIndex], flowIndex, stepIndex);
    });

    validationHTML += `
            </div>
        </div>
        `;

    return validationHTML;
}

/**
 * Génération de la validation pour une étape basée sur ses tâches
 */
function generateStepValidationFromTasks(box,tasks, flowIndex, stepIndex) {
    const stepId = `flow_${flowIndex}_step_${stepIndex}`;
    
    console.log(`DEBUG génération de la step avec les tasks `, tasks);

    const status = box.testConfig?.status || 'untested';
    const description =`Étape ${stepIndex + 1} - ${box.displayName} (${(box.description || '')})`;
    let stepHTML = `
        <div class="test-case" data-status="${status}" data-box-id="${box.id}" data-visual-index="${flowIndex}">
            <div class="test-controls">
                <select class="status-select form-control" 
                        onchange="updateTestStatusFromSelect('${box.id}', this.value, '${flowIndex}')">
                    <option value="untested" ${status === 'untested' ? 'selected' : ''}>Non testé</option>
                    <option value="ok" ${status === 'ok' ? 'selected' : ''}>✅ OK</option>
                    <option value="ko" ${status === 'ko' ? 'selected' : ''}>❌ KO</option>
                </select>
            </div>
            <div class="test-content">
                <div class="step-header">
                    <div class="step-info">
                        <span class="step-name">${description}</span>
                        <small class="text-muted">(${getDataTableNameById(box.datatable)})</small>
                    </div>
                    <span class="badge badge-${status}">${getStatusLabel(status)}</span>
                </div>
                <div class="tasks-details">
    `;

    // Génération des validations pour les tâches
    if (tasks && tasks.hasTasks) {
        stepHTML += generateTasksValidationFromProcessed(tasks, box.id, flowIndex);
    }

    stepHTML += `
                </div>
                <div class="step-details">
                    <div class="row">
                        <div class="col-md-6">
                            <label>Résultat attendu :</label>
                            <textarea class="form-control expected-result" rows="2"
                                      placeholder="Décrivez le comportement attendu..."
                                      onchange="updateTestField('${box.id}', 'expectedResult', '${flowIndex}')">${box.testConfig?.expectedResult || ''}</textarea>
                        </div>
                        <div class="col-md-6">
                            <label>Résultat obtenu :</label>
                            <textarea class="form-control actual-result" rows="2"
                                      placeholder="Décrivez le résultat observé..."
                                      onchange="updateTestField('${box.id}', 'actualResult', '${flowIndex}')">${box.testConfig?.actualResult || ''}</textarea>
                        </div>
                    </div>
                    <div class="row" style="margin-top: 10px;">
                        <div class="col-md-12">
                            <label>Commentaires de test :</label>
                            <textarea class="form-control test-comment" rows="2"
                                      placeholder="Ajoutez vos observations, remarques..."
                                      onchange="updateTestField('${box.id}', 'comment', '${flowIndex}')">${box.testConfig?.comment || ''}</textarea>
                        </div>
                    </div>
                </div>
            </div>
        </div>    `;

    return stepHTML;
}

/**
 * Génération des validations à partir des tâches traitées
 */
function generateTasksValidationFromProcessed(taskData, boxId,flowIndex) {
    if (!taskData.hasValidationItems) {
        return ''; // Aucune validation nécessaire
    }

    let tasksHTML = `
        <div class="tasks-validation-section">
            <h6><i class="fa fa-tasks"></i> Validation des Tâches (${taskData.validTasks}/${taskData.totalTasks} valides)</h6>
            <div class="tasks-validation-list">
    `;

    taskData.tasks.forEach((task, index) => {
        if (task.requiresValidation) {
            tasksHTML += generateValidationItemFromTask(task, boxId, index, flowIndex);
        } else if (task.errorMessage) {
            tasksHTML += generateTaskErrorItem(task, index);
        }
    });

    tasksHTML += `
            </div>
        </div>
    `;

    return tasksHTML;
}

/**
 * Génération d'un élément de validation à partir d'une tâche traitée
 */
function generateValidationItemFromTask(task, boxId, taskIndex, flowIndex) {
    const taskId = `${boxId}_task_${taskIndex}`;
    const validationData = task.validationData;
    const isTaskValidated = task.taskValidated === true;
    let validationHTML = '';

    switch (validationData.type) {
        case 'checkbox':
            validationHTML = `
                <div class="task-validation-item" task-id="${taskId}">
                    <div class="form-check">
                        <input class="form-check-input validation-checkbox task-validation" 
                               type="checkbox" 
                               id="${taskId}" 
                               data-task-type="${task.action}"
                               data-step-id="${boxId}"
                               onchange="updateTaskValidation('${boxId}','${taskId}', this.checked, '${flowIndex}')"
                               ${isTaskValidated ? 'checked' : ''}>
                        <label class="form-check-label" for="${taskId}">
                            <i class="fa ${validationData.icon} text-primary"></i>
                            <strong>${validationData.label}</strong>
                        </label>
                    </div>
                    <small class="text-muted">${validationData.description}</small>
                </div>
            `;
            break;

        case 'ok_ko':
            // Vérifier si la tâche est déjà validée
            const isAuthValidated = task.taskValidated === true;
            const okButtonClass = isAuthValidated ? 'btn btn-success btn-sm validation-btn' : 'btn btn-outline-success btn-sm validation-btn';
            const koButtonClass = 'btn btn-outline-danger btn-sm validation-btn';
            const groupDataAttribute = isAuthValidated ? `data-selected-value="ok"` : '';
            
            validationHTML = `
                <div class="task-validation-item" task-id="${taskId}">
                    <div class="identification-validation">
                        <label class="validation-label">
                            <i class="fa ${validationData.icon} text-info"></i>
                            <strong>${validationData.label}</strong>
                        </label>
                        <div class="btn-group validation-choice" role="group" data-task-id="${taskId}" ${groupDataAttribute}>
                            <button type="button" 
                                    class="${okButtonClass}" 
                                    data-value="ok"
                                    onclick="updateTaskValidation('${boxId}','${taskId}','ok', '${flowIndex}');">
                                <i class="fa fa-check"></i> OK
                            </button>
                            <button type="button" 
                                    class="${koButtonClass}" 
                                    data-value="ko"
                                    onclick="updateTaskValidation('${boxId}','${taskId}','ko', '${flowIndex}');">
                                <i class="fa fa-times"></i> KO
                            </button>
                        </div>
                    </div>
                    <small class="text-muted">${validationData.description}</small>
                </div>
            `;
            break;

        case 'checkbox_list':
            // Vérifier si la tâche est déjà validée
            const isListValidated = task.taskValidated === true;
            
            validationHTML = `
                <div class="task-validation-item" task-id="${taskId}">
                    <label class="validation-label">
                        <i class="fa ${validationData.icon} text-purple"></i>
                        <strong>${validationData.label}:</strong>
                    </label>
                    <div class="client-data-validation">
            `;

            validationData.items.forEach((item, itemIndex) => {
                validationHTML += `
                    <div class="form-check">
                        <input class="form-check-input validation-checkbox task-validation" 
                            type="checkbox" 
                            id="${taskId}_item_${itemIndex}" 
                            data-task-type="${task.action}"
                            data-step-id="${boxId}"
                            onchange="updateTaskValidation('${boxId}','${taskId}', this.checked, '${flowIndex}')"
                            ${isListValidated ? 'checked' : ''}>
                        <label class="form-check-label" for="${taskId}_item_${itemIndex}">
                            <strong>${item.key}:</strong> ${item.value}
                        </label>
                    </div>
                `;
            });

            validationHTML += `
                    </div>
                    <small class="text-muted">${validationData.description}</small>
                </div>
            `;
            break;
    }

    return validationHTML;
}

/**
 * Génération d'un élément d'erreur pour une tâche
 */
function generateTaskErrorItem(task, taskIndex) {
    return `
        <div class="task-validation-item warning">
            <i class="fa fa-exclamation-triangle text-warning"></i>
            <span class="text-muted">Tâche ${taskIndex + 1} (${task.action}): ${task.errorMessage}</span>
        </div>
    `;
}

/**
 * Déclenche un clignotement rouge personnalisable
 * @param {string} selector - Sélecteur CSS de l'élément cible (par défaut '.tasks-validation-section')
 * @param {string} color - Couleur de clignotement (par défaut '#dc3545' - rouge Bootstrap)
 * @param {number} duration - Durée de chaque clignotement en ms (par défaut 150)
 * @param {number} count - Nombre de clignotements (par défaut 4 pour double clignotement)
 */
function flashElementBackground(dataBoxId,selector = '.tasks-validation-section', color = '#dc3545', duration = 150, count = 4) {
  const parentDiv = document.querySelector(`[data-box-id="${dataBoxId}"]`);
  const element = parentDiv.querySelector(selector);
  if (!element) {
    console.warn(`Élément ${selector} non trouvé`);
    return;
  }

  // Créer une animation CSS dynamique
  const animationName = `flashBg_${Date.now()}`;
  const style = document.createElement('style');
  style.textContent = `
    .${animationName} {
      animation: ${animationName} ${duration}ms ease-in-out ${count};
    }
    
    @keyframes ${animationName} {
      0%, 100% { background-color: transparent; }
      50% { background-color: ${color}; }
    }
  `;
  
  document.head.appendChild(style);

  // Appliquer l'animation
  element.classList.add(animationName);

  // Nettoyer après l'animation
  const totalDuration = duration * count;
  setTimeout(() => {
    element.classList.remove(animationName);
    document.head.removeChild(style);
  }, totalDuration);
}