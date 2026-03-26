function i18nVisual(key, fallback, params) {
    if (window.GCToolI18n && typeof window.GCToolI18n.t === 'function') {
        return window.GCToolI18n.t(key, params || {}, fallback);
    }
    if (!params || typeof fallback !== 'string') return fallback;
    return fallback.replace(/\{(\w+)\}/g, function (_, token) {
        return Object.prototype.hasOwnProperty.call(params, token) ? String(params[token]) : '';
    });
}

function normalizeDrawioXmlTagCase(xmlContent) {
    if (!xmlContent) return '';
    return String(xmlContent)
        .replace(/<\s*\/\s*mxgraphmodel\b/gi, '</mxGraphModel')
        .replace(/<\s*mxgraphmodel\b/gi, '<mxGraphModel')
        .replace(/<\s*\/\s*mxcell\b/gi, '</mxCell')
        .replace(/<\s*mxcell\b/gi, '<mxCell')
        .replace(/<\s*\/\s*mxgeometry\b/gi, '</mxGeometry')
        .replace(/<\s*mxgeometry\b/gi, '<mxGeometry')
        .replace(/<\s*\/\s*mxpoint\b/gi, '</mxPoint')
        .replace(/<\s*mxpoint\b/gi, '<mxPoint');
}

/**
 * Génération de l'entête des visuels avec résumé de validation
 */
function generateVisualsHeader(generatedCount, selectedCount, generatedDate) {
    const container = document.getElementById('generatedVisualsContent');
    const headerDiv = document.createElement('div');
    headerDiv.className = 'visuals-header';
    headerDiv.innerHTML = `
        <div class="alert alert-info">
            <h4><i class="fa fa-info-circle"></i> ${i18nVisual('tab.flow.visuals.generated_title', 'Visuels generes')}</h4>
            <div class="row">
                <div class="col-md-6">
                    <strong>${generatedCount}</strong> ${i18nVisual('tab.flow.visuals.generated_count', 'visuel(s) genere(s)')}
                    ${selectedCount !== 'all'
                        ? i18nVisual('tab.flow.visuals.generated_on_requested', 'sur les {count} demande(s)', { count: selectedCount })
                        : i18nVisual('tab.flow.visuals.generated_all_available', '(tous les visuels disponibles)')}
                </div>
                <div class="col-md-6">
                    <small><strong>${i18nVisual('tab.flow.visuals.generated_at', 'Genere le:')}</strong> ${generatedDate}</small>
                </div>
            </div>
            <hr>
            <div class="validation-summary">
                <h5><i class="fa fa-check-circle"></i> ${i18nVisual('tab.flow.visuals.validation_summary', 'Resume des validations')}</h5>
                <div class="loading-indicator">
                    <i class="fa fa-spinner fa-spin"></i> ${i18nVisual('tab.flow.visuals.loading_stats', 'Chargement des statistiques...')}
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
        <h5><i class="fa fa-check-circle"></i> ${i18nVisual('tab.flow.visuals.validation_summary', 'Resume des validations')}</h5>
        <div class="row">
            <div class="col-md-12">
                <div class="progress" style="margin: 10px 0;">
                    <div class="progress-bar progress-bar-success" style="width: ${(stats.ok/stats.total)*100}%"></div>
                    <div class="progress-bar progress-bar-danger" style="width: ${(stats.ko/stats.total)*100}%"></div>
                    <div class="progress-bar progress-bar-warning" style="width: ${(stats.untested/stats.total)*100}%"></div>
                </div>
                <div class="validation-stats">
                    <span class="badge badge-info">${stats.flows} ${i18nVisual('tab.flow.visuals.flows', 'Parcours')}</span>
                    <span class="badge badge-success">${stats.ok} ${i18nVisual('tab.flow.visuals.steps_ok', 'Etapes reussies')}</span>
                    <span class="badge badge-danger">${stats.ko} ${i18nVisual('tab.flow.visuals.steps_ko', 'Etapes en echec')}</span>
                    <span class="badge badge-warning">${stats.untested} ${i18nVisual('tab.flow.visuals.steps_untested', 'Etapes non testees')}</span>
                    <span class="badge badge-primary">${stats.progress}% ${i18nVisual('tab.flow.visuals.completed', 'Complete')}</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Génération de l'élément visuel à partir des données sauvegardées
 */
function generateVisualElement(flowPath, row, index, data) {
    const container = document.createElement('div');
    container.className = 'generated-visual';
    const rawXml = normalizeDrawioXmlTagCase(flowPath?.xml || '');
    
    container.innerHTML = `
        <div class="visual-container">
            <div class="visual-header">
                <h5>
                    <span class="visual-title">${i18nVisual('tab.flow.visuals.flow_label', 'Parcours')} ${index + 1}</span>
                    <span class="visual-key">${i18nVisual('tab.flow.visuals.key_label', 'Cle')}: <code>${row.key}</code></span>
                    <button class="btn btn-xs btn-success export-drawio-btn">
                        <i class="fa fa-download"></i> ${i18nVisual('common.export', 'Exporter')}
                    </button>
                    <button class="btn btn-xs btn-info toggle-details-btn">
                        <i class="fa fa-info-circle"></i> ${i18nVisual('tab.flow.visuals.details', 'Details')}
                    </button>
                    <button class="btn btn-xs btn-info toggle-validation-btn">
                        <i class="fa fa-list-check"></i> ${i18nVisual('tab.flow.visuals.validation', 'Validation')}
                    </button>
                </h5>
            </div>
            
            <div class="visual-flow">
                ${flowPath.html}
            </div>
            
            <div class="visual-details" id="visual-details-${index}" style="display: none;">
                <div class="path-details">
                    <h6><i class="fa fa-list"></i> ${i18nVisual('tab.flow.visuals.path_details', 'Details du parcours :')}</h6>
                    <ul class="list-unstyled">
                        ${flowPath.details.map(detail => `<li><small>${detail}</small></li>`).join('')}
                    </ul>
                </div>
            </div>
            <div class="visual-xml" id="visual-xml-${index}" style="display: none;">
            </div>
            <div class="visual-validation-report" id="visual-validation-report-${index}" style="display: none;">
                ${generateValidationReport(flowPath, index)}
            </div>
        </div>
        <hr>
    `;

    const xmlContainer = container.querySelector(`#visual-xml-${index}`);
    if (xmlContainer) {
        // Keep XML as plain text to avoid HTML parser lowercasing draw.io tags.
        xmlContainer.textContent = rawXml;
    }

    // Ajouter les event listeners
    const toggleBtn = container.querySelector('.toggle-details-btn');
    const detailsDiv = container.querySelector('.visual-details');
    const validationBtn = container.querySelector('.toggle-validation-btn');
    const validationReportDiv = container.querySelector('.visual-validation-report');
    
    // Affichage initial des détails
    toggleBtn.addEventListener('click', () => {
        if (detailsDiv.style.display === 'none') {
            detailsDiv.style.display = 'block';
            toggleBtn.innerHTML = `<i class="fa fa-eye-slash"></i> ${i18nVisual('tab.flow.visuals.hide', 'Masquer')}`;
        } else {
            detailsDiv.style.display = 'none';
            toggleBtn.innerHTML = `<i class="fa fa-info-circle"></i> ${i18nVisual('tab.flow.visuals.details', 'Details')}`;
        }
    });
    
    validationBtn.addEventListener('click', () => {
        if (validationReportDiv.style.display === 'none') {
            validationReportDiv.style.display = 'block';
            validationBtn.innerHTML = `<i class="fa fa-eye-slash"></i> ${i18nVisual('tab.flow.visuals.hide_validation', 'Masquer validation')}`;
        } else {
            validationReportDiv.style.display = 'none';
            validationBtn.innerHTML = `<i class="fa fa-list-check"></i> ${i18nVisual('tab.flow.visuals.validation', 'Validation')}`;
        }
    });

    // Event listener pour l'export draw.io
    const exportBtn = container.querySelector('.export-drawio-btn');
    exportBtn.addEventListener('click', () => {
        exportFlowPathToDrawio(rawXml, `parcours-${index + 1}-${row.key}.drawio`);
    });

    return container;
}

/**
 * Ajout d'un bouton pour générer plus de visuels
 */
// function addGenerateMoreButton(container, currentCount) {
//     const moreButtonDiv = document.createElement('div');
//     moreButtonDiv.className = 'text-center';
//     moreButtonDiv.style.marginTop = '20px';
//     moreButtonDiv.innerHTML = `
//         <div class="well">
//             <p>Vous avez généré ${currentCount} visuel(s). Voulez-vous en générer plus ?</p>
//             <div class="btn-group" role="group">
//                 <button class="btn btn-info" onclick="generateMoreVisuals(10)">
//                     <i class="fa fa-plus"></i> 10 de plus
//                 </button>
//                 <button class="btn btn-info" onclick="generateMoreVisuals(50)">
//                     <i class="fa fa-plus"></i> 50 de plus
//                 </button>
//                 <button class="btn btn-success" onclick="generateAllVisuals()">
//                     <i class="fa fa-list"></i> Tous
//                 </button>
//             </div>
//         </div>
//     `;
    
//     container.appendChild(moreButtonDiv);
// }

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
                                <h4>${i18nVisual('tab.flow.generated_visuals.loading_title', 'Generation des visuels en cours...')}</h4>
                                <p>${i18nVisual('tab.flow.generated_visuals.loading_desc', 'Analyse des parcours avec gestion des menus...')}</p>
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
            <option value="1" selected>1 ${i18nVisual('tab.flow.visuals.visual', 'visuel')}</option>
            <option value="10">10 ${i18nVisual('tab.flow.visuals.visuals', 'visuels')}</option>
            <option value="50">50 ${i18nVisual('tab.flow.visuals.visuals', 'visuels')}</option>
            <option value="all" disabled>${i18nVisual('tab.flow.visuals.all_disabled_no_datatable', 'Tous les visuels (DataTable non selectionnee)')}</option>
        `;
        return;
    }
    
    // Récupérer le nombre total de lignes (si en cache)
    getDataTableRowsWithCache(startBox.dataTable)
        .then(rows => {
            const totalRows = rows.length;
            selector.innerHTML = `
                <option value="1" selected>1 ${i18nVisual('tab.flow.visuals.visual', 'visuel')}</option>
                <option value="10">10 ${i18nVisual('tab.flow.visuals.visuals', 'visuels')}</option>
                <option value="50">50 ${i18nVisual('tab.flow.visuals.visuals', 'visuels')}</option>
                <option value="all">${i18nVisual('tab.flow.visuals.all_with_total', 'Tous les visuels ({total} total)', { total: totalRows })}</option>
            `;
            
            // Ajouter des avertissements pour les gros volumes
            if (totalRows > 100) {
                const allOption = selector.querySelector('option[value="all"]');
                allOption.textContent += ` ${i18nVisual('tab.flow.visuals.performance_warning', '⚠️ Performance')}`;
                allOption.style.color = '#d9534f';
            }
        })
        .catch(error => {
            console.warn('Impossible de récupérer le nombre de lignes:', error);
        });
}


/**
 * Fonction pour réduire/agrandir la section de création de graph
 */
function toggleDesignerSection(force) {
    const DesignerContainer = document.getElementById('designerContent');
    if (force){
        DesignerContainer.style.display = 'block';
        return;
    }
    
    if (DesignerContainer.style.display === 'none') {
        DesignerContainer.style.display = 'block';
    } else {
        DesignerContainer.style.display = 'none';
    }
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
// function generateTaskValidationTests(box, rowData) {
//     if (!box.tasks || box.tasks.length === 0) {
//         return [];
//     }
    
//     const tests = [];
    
//     box.tasks.forEach(task => {
//         switch (task.action) {
//             case 'play_message':
//                 const messageValue = rowData[task.parameters.column];
//                 const promptExists = promptsCache.some(prompt => prompt.name === messageValue);
                
//                 if (promptExists) {
//                     tests.push({
//                         type: 'listen',
//                         description: `Vérifier que le message "${messageValue}" est joué`,
//                         automated: false
//                     });
//                 }
//                 break;
                
//             case 'identification':
//                 tests.push({
//                     type: 'action',
//                     description: `S'authentifier: ${task.parameters.text}`,
//                     automated: false
//                 });
//                 break;
                
//             case 'client_data':
//                 task.parameters.keyValuePairs.forEach(pair => {
//                     tests.push({
//                         type: 'verify',
//                         description: `Vérifier ${pair.key}: ${pair.value}`,
//                         automated: false
//                     });
//                 });
//                 break;
                
//             case 'activation':
//                 const activationValue = rowData[task.parameters.column];
//                 const isActive = isActivationPositive(activationValue);
                
//                 if (isActive) {
//                     tests.push({
//                         type: 'verify',
//                         description: `Vérifier: ${task.parameters.label}`,
//                         automated: false
//                     });
//                 }
//                 break;
//         }
//     });
    
//     return tests;
// }


/**
 * Mise à jour du statut de test et de l'UI associée
 */
function getValidatorIdentifierCandidates(item) {
    if (!item) return [];
    const ids = [];
    if (Array.isArray(item.xmlIds)) ids.push(...item.xmlIds);
    ids.push(item.id, item.instanceId, item.xmlId, item.logicalId);
    return Array.from(new Set(ids.filter(Boolean)));
}

function findValidatorBoxByIdentifier(validator, boxId) {
    if (!validator || !Array.isArray(validator.boxes)) return null;
    return validator.boxes.find(box => getValidatorIdentifierCandidates(box).includes(boxId)) || null;
}

function findValidatorTaskByIdentifier(validator, boxId) {
    if (!validator || !Array.isArray(validator.tasks)) return null;
    return validator.tasks.find(task => getValidatorIdentifierCandidates(task).includes(boxId)) || null;
}

function updateTestStatusFromSelect(boxId, status, visualIndex) {
    const testCases = document.querySelectorAll(`[data-box-id="${boxId}"][data-visual-index="${visualIndex}"]`);
    if (!testCases || testCases.length === 0) return;

    const storedData = JSON.parse(localStorage.getItem('generatedVisuals'));
    if (storedData && storedData.visuals[visualIndex]) {
        const visual = storedData.visuals[visualIndex];
        const box = findValidatorBoxByIdentifier(visual.flowPath.validator, boxId);
        const tasks = findValidatorTaskByIdentifier(visual.flowPath.validator, boxId);
        let tasksValidated = 0;
        if (tasks && tasks.hasTasks) {
            tasks.tasks.forEach(task => {
                if (isTaskValidationResolved(task.taskValidated)) tasksValidated++;
            });
        }

        if (status === 'ok' && tasks && tasks.hasTasks && tasksValidated < tasks.validTasks) {
            console.log(`⚠️ Impossible de marquer comme OK car toutes les tâches ne sont pas validées pour la boîte ${boxId}`);
            flashElementBackground(boxId);
            status = 'ko';
        }

        if (box) {
            if (!box.testConfig) box.testConfig = {};
            const oldStatus = box.testConfig.status || 'untested';
            box.testConfig.status = status;

            testCases.forEach(testCase => {
                testCase.setAttribute('data-status', status);
                const badge = testCase.querySelector('.badge');
                if (badge) {
                    badge.className = `badge badge-${status}`;
                    badge.textContent = getStatusLabel(status);
                }
                const triSwitch = testCase.querySelector('.tri-switch[data-switch-kind="step-status"]');
                if (triSwitch) {
                    setTriSwitchValue(triSwitch, status);
                }
            });

            updateValidatorCounters(visual.flowPath.validator, oldStatus, status);
            updateValidationReportUI(testCases[0], visual.flowPath.validator);
            localStorage.setItem('generatedVisuals', JSON.stringify(storedData));
            updateVisualsHeaderStats(storedData.visuals);
        }
    }
}


function updateTestField(boxId, field, value, visualIndex) {
    const storedData = JSON.parse(localStorage.getItem('generatedVisuals'));
    if (storedData && storedData.visuals[visualIndex]) {
        const visual = storedData.visuals[visualIndex];
        const box = findValidatorBoxByIdentifier(visual.flowPath.validator, boxId);
        if (box) {
            if (!box.testConfig) box.testConfig = {};
            box.testConfig[field] = value;
            localStorage.setItem('generatedVisuals', JSON.stringify(storedData));
            
            updateStoredValidation(boxId, { [field]: value }, visualIndex);
        }
    }
}

function updateTaskValidation(boxId, subTaskId, value, visualIndex, stateKey) {
    //console.log(`DEBUG updateTaskValidation`, boxId, subTaskId, value, visualIndex);
    const storedData = JSON.parse(localStorage.getItem('generatedVisuals'));
    if (storedData && storedData.visuals[visualIndex]) {
        const visual = storedData.visuals[visualIndex];
        const taskGroup = findValidatorTaskByIdentifier(visual.flowPath.validator, boxId);
        if (taskGroup && Array.isArray(taskGroup.tasks)) {
            const taskIndex = parseInt((subTaskId || '').split('_task_')[1], 10);
            if (!Number.isNaN(taskIndex) && taskGroup.tasks[taskIndex]) {
                if (stateKey) {
                    if (!taskGroup.tasks[taskIndex].taskValidated
                        || typeof taskGroup.tasks[taskIndex].taskValidated !== 'object'
                        || Array.isArray(taskGroup.tasks[taskIndex].taskValidated)) {
                        taskGroup.tasks[taskIndex].taskValidated = {};
                    }
                    taskGroup.tasks[taskIndex].taskValidated[stateKey] = value;
                    console.log('[TASK][VALIDATION] Mise a jour etat calendrier', {
                        boxId,
                        taskIndex,
                        stateKey,
                        value
                    });
                } else {
                    taskGroup.tasks[taskIndex].taskValidated = value;
                }
            }
            localStorage.setItem('generatedVisuals', JSON.stringify(storedData));

            document.querySelectorAll(`.tri-switch[data-switch-kind="task-status"][data-task-id="${subTaskId}"][data-visual-index="${visualIndex}"]`).forEach(switchEl => {
                setTriSwitchValue(switchEl, normalizeTaskStatusValue(value));
            });

            updateStoredValidation(boxId, { [subTaskId]: value }, visualIndex);
        }
    }
}
function isTaskValidationResolved(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const calendarStates = ['open', 'closed', 'vacation'];
        return calendarStates.every(state => {
            const normalizedState = normalizeTaskStatusValue(value[state]);
            return normalizedState === 'ok' || normalizedState === 'ko';
        });
    }
    const normalized = normalizeTaskStatusValue(value);
    return normalized === 'ok' || normalized === 'ko';
}

function normalizeTaskStatusValue(value) {
    if (value === 'ok' || value === true) return 'ok';
    if (value === 'ko') return 'ko';
    return 'untested';
}

function setTriSwitchValue(switchElement, value) {
    if (!switchElement) return;
    switchElement.dataset.value = value;
    switchElement.querySelectorAll('.tri-switch-option').forEach(option => {
        const isActive = option.dataset.value === value;
        option.classList.toggle('is-active', isActive);
        option.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function createTriSwitchHtml(options) {
    const orientationClass = options.orientation === 'vertical' ? 'tri-switch-vertical' : 'tri-switch-horizontal';
    const values = ['ok', 'untested', 'ko'];
    const labels = {
        ok: i18nVisual('tab.flow.validation.ok_short', 'OK'),
        untested: i18nVisual('tab.flow.validation.untested_short', 'Non teste'),
        ko: i18nVisual('tab.flow.validation.ko_short', 'KO')
    };
    const icons = {
        ok: 'fa-check',
        untested: 'fa-minus',
        ko: 'fa-times'
    };

    return `
        <div class="tri-switch ${orientationClass} ${options.extraClass || ''}"
             data-switch-kind="${options.switchKind}"
             data-value="${options.currentValue}"
             ${options.dataTaskId ? `data-task-id="${options.dataTaskId}"` : ''}
             ${options.dataVisualIndex !== undefined && options.dataVisualIndex !== null ? `data-visual-index="${options.dataVisualIndex}"` : ''}
             role="group"
             aria-label="${options.ariaLabel || i18nVisual('tab.flow.validation.three_position_switch', 'Selecteur 3 positions')}">
            ${values.map(value => `
                <button type="button"
                        class="tri-switch-option tri-switch-option-${value} ${options.currentValue === value ? 'is-active' : ''}"
                        data-value="${value}"
                        title="${labels[value]}"
                        aria-label="${labels[value]}"
                        aria-pressed="${options.currentValue === value ? 'true' : 'false'}"
                        onclick="${options.onChangeFactory(value)}">
                    <i class="fa ${icons[value]}" aria-hidden="true"></i>
                </button>
            `).join('')}
        </div>
    `;
}


 
 















/**
 * Génération du rapport de validation basé sur les tâches traitées
 */
function generateValidationReport(flowPath, flowIndex) {
    console.log('📋 Génération du rapport de validation avec tâches traitées...');
    const validator = flowPath.validator;

    if (!flowPath || flowPath.length === 0) {
        return `<div class="alert alert-warning">${i18nVisual('tab.flow.validation.no_flow_to_validate', 'Aucun parcours a valider')}</div>`;
    }

    let validationHTML = `
        <div class="validation-report validation-report-flowpath">
            <div class="report-header">
                <div class="row">
                    <div class="col-md-8">
                        <h4><i class="fa fa-clipboard"></i> ${i18nVisual('tab.flow.validation.report_title', 'Rapport de validation du parcours')}</h4>
                        <small class="text-muted">${i18nVisual('tab.flow.validation.generated_on', 'Genere le')} ${new Date().toLocaleString()}</small>
                    </div>
                </div>
                <div class="progress" style="margin: 15px 0;">
                    <div class="progress-bar progress-bar-success" style="width: ${(validator.okCount/validator.total)*100}%"></div>
                    <div class="progress-bar progress-bar-danger" style="width: ${(validator.koCount/validator.total)*100}%"></div>
                    <div class="progress-bar progress-bar-warning" style="width: ${(validator.untestedCount/validator.total)*100}%"></div>
                </div>
                <div class="status-summary">
                    <span class="badge badge-success">${validator.okCount} ${i18nVisual('tab.flow.validation.ok', 'Reussis')}</span>
                    <span class="badge badge-danger">${validator.koCount} ${i18nVisual('tab.flow.validation.ko', 'Echoues')}</span>
                    <span class="badge badge-warning">${validator.untestedCount} ${i18nVisual('tab.flow.validation.untested', 'Non testes')}</span>
                    <span class="badge badge-info">${validator.progress}% ${i18nVisual('tab.flow.validation.completed', 'Complete')}</span>
                </div>
            </div>
            <div class="test-cases-container">
    `;

    const menuBranchIndex = buildMenuBranchIdIndex(flowPath.validationGroups);
    validator.boxes.forEach((step, stepIndex) => {
        if (isValidatorItemInMenuBranch(step, menuBranchIndex)) return;
        validationHTML += generateStepValidationFromTasks(step, validator.tasks[stepIndex], flowIndex, stepIndex);
    });

    validationHTML += generateMenuBranchValidationGroups(flowPath, flowIndex);

    validationHTML += `
            </div>
        </div>
        `;

    return validationHTML;
}

function buildMenuBranchIdIndex(validationGroups) {
    const rawIds = [];
    (validationGroups || []).forEach(group => {
        (group?.boxIds || []).forEach(id => {
            if (id) rawIds.push(String(id));
        });
    });

    const exact = new Set(rawIds);
    const normalized = new Set();
    rawIds.forEach(rawId => {
        let candidate = rawId;
        normalized.add(candidate);
        while (candidate.includes('_')) {
            candidate = candidate.substring(0, candidate.lastIndexOf('_'));
            normalized.add(candidate);
        }
    });

    return {
        rawIds,
        exact,
        normalized
    };
}

function isValidatorItemInMenuBranch(item, menuBranchIndex) {
    if (!item || !menuBranchIndex || !menuBranchIndex.rawIds || !menuBranchIndex.rawIds.length) {
        return false;
    }

    const ids = getValidatorIdentifierCandidates(item);
    if (!ids.length) return false;

    for (const id of ids) {
        if (menuBranchIndex.exact.has(id) || menuBranchIndex.normalized.has(id)) {
            return true;
        }
    }

    return menuBranchIndex.rawIds.some(rawId =>
        ids.some(id => rawId.startsWith(`${id}_`) || id.startsWith(`${rawId}_`))
    );
}

function generateMenuBranchValidationGroups(flowPath, flowIndex) {
    //console.log(`DEBUG flowPath : `,flowPath);
    const groups = flowPath.validationGroups || [];
    if (!groups.length || !flowPath.validator) {
        return '';
    }

    const validatorEntries = flowPath.validator.boxes.map((box, index) => ({
        box,
        tasks: flowPath.validator.tasks[index],
        index,
        used: false
    }));

    let groupsHtml = `<div class="menu-branch-validations-container">`;
    groups.forEach((group, groupIndex) => {
        const uniqueGroupId = `flow_${flowIndex}_menu_branch_${groupIndex}`;
        const uniqueIds = Array.from(new Set(group.boxIds || []));
        const branchSteps = [];

        uniqueIds.forEach(rawBoxId => {
            const entry = resolveValidatorEntry(rawBoxId, validatorEntries);
            if (!entry) return;
            entry.used = true;
            branchSteps.push(generateStepValidationFromTasks(
                entry.box,
                entry.tasks,
                flowIndex,
                entry.index,
                {
                    compact: true,
                    hideStepDetails: true,
                    extraClass: 'branch-validation-step',
                    renderKey: uniqueGroupId
                }
            ));
        });

        if (!branchSteps.length) {
            console.warn(i18nVisual('tab.flow.validation.no_branch_steps', 'Aucune etape de validation trouvee pour la branche menu'), group);
            return;
        }

        groupsHtml += `
            <div class="menu-branch-validation-group">
                <button type="button"
                        class="menu-branch-validation-toggle"
                        onclick="toggleMenuBranchValidationGroup('${uniqueGroupId}', this)">
                    <i class="fa fa-chevron-down"></i>
                    <span class="menu-branch-validation-title">${group.menuLabel || i18nVisual('tab.flow.validation.menu', 'Menu')} - ${group.branchLabel || i18nVisual('tab.flow.validation.branch', 'Branche')}</span>
                </button>
                <div id="${uniqueGroupId}" class="menu-branch-validation-body">
                    ${branchSteps.join('')}
                </div>
            </div>
        `;
    });

    groupsHtml += `</div>`;
    return groupsHtml;
}

function toggleMenuBranchValidationGroup(groupId, toggleButton) {
    const body = document.getElementById(groupId);
    if (!body) return;
    const icon = toggleButton.querySelector('i');
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? 'block' : 'none';
    if (icon) {
        icon.className = collapsed ? 'fa fa-chevron-down' : 'fa fa-chevron-right';
    }
}



/**
 * Génération de la validation pour une étape basée sur ses tâches
 */
function generateStepValidationFromTasks(box, tasks, flowIndex, stepIndex, options = {}) {
    const boxValidationId = box.instanceId || box.id;
    const status = box.testConfig?.status || 'untested';
    const keyColumn = box.displayColumn;
    const boxData = box.data || {};
    const description = `${i18nVisual('tab.flow.validation.step', 'Etape')} ${stepIndex + 1} - ${box.displayName}`;
    const stepClasses = ['test-case'];
    if (options.extraClass) stepClasses.push(options.extraClass);
    const renderKey = options.renderKey || 'main';
    console.log(`Generation validation for step ${boxValidationId} with tasks`, { box, tasks, flowIndex, stepIndex });

    let stepHTML = `
        <div class="${stepClasses.join(' ')}" data-status="${status}" data-box-id="${boxValidationId}" data-visual-index="${flowIndex}">
            <div class="test-controls">
                ${createTriSwitchHtml({
                    orientation: 'vertical',
                    currentValue: status,
                    switchKind: 'step-status',
                    extraClass: 'step-status-switch',
                    dataVisualIndex: flowIndex,
                    ariaLabel: i18nVisual('tab.flow.validation.test_status', 'Statut de test'),
                    onChangeFactory: value => `updateTestStatusFromSelect('${boxValidationId}', '${value}', '${flowIndex}')`
                })}
            </div>
            <div class="test-content">
                <div class="step-header">
                    <div class="step-info">
                        <span class="step-name">${description}</span>
                        <small class="text-muted">(${getDataTableNameById(box.dataTable)})</small>
                    </div>
                    <span class="badge badge-${status}">${getStatusLabel(status)}</span>
                </div>
                <div class="tasks-details">
    `;

    if (tasks && tasks.hasTasks) {
        stepHTML += generateTasksValidationFromProcessed(tasks, boxValidationId, flowIndex, renderKey);
    }

    const expectedResult = box.description + boxData[keyColumn];

    stepHTML += `
                </div>
                ${options.hideStepDetails ? '' : `
                <div class="step-details">
                    <div class="row">
                        <div class="col-md-6">
                            <label>${i18nVisual('tab.flow.validation.expected_result', 'Resultat attendu :')}</label>
                            <textarea class="form-control expected-result" rows="2"
                                      placeholder="${expectedResult != '' ? expectedResult : i18nVisual('tab.flow.validation.expected_result_placeholder', 'Decrivez le resultat attendu...')}"
                                      onchange="updateTestField('${boxValidationId}', 'expectedResult', '${flowIndex}')">${box.testConfig?.expectedResult || ''}</textarea>
                        </div>
                        <div class="col-md-6">
                            <label>${i18nVisual('tab.flow.validation.actual_result', 'Resultat obtenu :')}</label>
                            <textarea class="form-control actual-result" rows="2"
                                      placeholder="${i18nVisual('tab.flow.validation.actual_result_placeholder', 'Decrivez le resultat observe...')}"
                                      onchange="updateTestField('${boxValidationId}', 'actualResult', '${flowIndex}')">${box.testConfig?.actualResult || ''}</textarea>
                        </div>
                    </div>
                    <div class="row" style="margin-top: 10px;">
                        <div class="col-md-12">
                            <label>${i18nVisual('tab.flow.validation.comments', 'Commentaires de test :')}</label>
                            <textarea class="form-control test-comment" rows="2"
                                      placeholder="${i18nVisual('tab.flow.validation.comments_placeholder', 'Ajoutez vos observations, remarques...')}"
                                      onchange="updateTestField('${boxValidationId}', 'comment', '${flowIndex}')">${box.testConfig?.comment || ''}</textarea>
                        </div>
                    </div>
                </div>
                `}
            </div>
        </div>
    `;

    return stepHTML;
}


/**
 * Génération des validations à partir des tâches traitées
 */
function generateTasksValidationFromProcessed(taskData, boxId, flowIndex, renderKey = 'main') {
    if (!taskData.hasValidationItems) {
        return '';
    }

    let tasksHTML = `
        <div class="tasks-validation-section">
            <h6><i class="fa fa-tasks"></i> ${i18nVisual('tab.flow.validation.tasks_validation', 'Validation des taches')} (${taskData.validTasks}/${taskData.totalTasks} ${i18nVisual('tab.flow.validation.valid', 'valides')})</h6>
            <div class="tasks-validation-list">
    `;

    taskData.tasks.forEach((task, index) => {
        if (task.requiresValidation) {
            tasksHTML += generateValidationItemFromTask(task, boxId, index, flowIndex, renderKey);
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
function generateValidationItemFromTask(task, boxId, taskIndex, flowIndex, renderKey = 'main') {
    const taskId = `${boxId}_task_${taskIndex}`;
    const domTaskId = `${taskId}_${renderKey}`;
    const validationData = task.validationData;
    const isTaskValidated = task.taskValidated === true;
    let validationHTML = '';
    console.log(`Generation TASK :`, { task, validationData, taskId, boxId, flowIndex });

    switch (validationData.type) {
        case 'checkbox':
            validationHTML = `
                <div class="task-validation-item" task-id="${taskId}">
                    <div class="form-check">
                        <input class="form-check-input validation-checkbox task-validation"
                               type="checkbox"
                               id="${domTaskId}"
                               data-task-type="${task.action}"
                               data-step-id="${boxId}"
                               onchange="updateTaskValidation('${boxId}','${taskId}', this.checked, '${flowIndex}')"
                               ${isTaskValidated ? 'checked' : ''}>
                        <label class="form-check-label" for="${domTaskId}">
                            <i class="fa ${validationData.icon} text-primary"></i>
                            <strong>${validationData.label}</strong>
                        </label>
                    </div>
                    <small class="text-muted">${validationData.description}</small>
                </div>
            `;
            break;

        case 'ok_ko': {
            const taskStatus = normalizeTaskStatusValue(task.taskValidated);
            validationHTML = `
                <div class="task-validation-item" task-id="${taskId}">
                    <div class="identification-validation">
                        <label class="validation-label">
                            <i class="fa ${validationData.icon} text-info"></i>
                            <strong>${validationData.label}</strong>
                        </label>
                        ${createTriSwitchHtml({
                            orientation: 'horizontal',
                            currentValue: taskStatus,
                            switchKind: 'task-status',
                            extraClass: 'validation-choice-switch',
                            dataTaskId: taskId,
                            dataVisualIndex: flowIndex,
                            ariaLabel: 'Validation identification',
                            onChangeFactory: value => `updateTaskValidation('${boxId}','${taskId}','${value}', '${flowIndex}')`
                        })}
                    </div>
                    <small class="text-muted">${validationData.description}</small>
                </div>
            `;
            break;
        }

        case 'calendar_statuses': {
            const statuses = Array.isArray(validationData.statuses)
                ? validationData.statuses
                : [
                    { key: 'open', label: i18nVisual('tab.flow.validation.calendar.behavior_open', 'Ouvert') },
                    { key: 'closed', label: i18nVisual('tab.flow.validation.calendar.behavior_closed', 'Ferme') },
                    { key: 'vacation', label: i18nVisual('tab.flow.validation.calendar.behavior_vacation', 'Vacances') }
                ];

            const calendarTitle = validationData.label
                || `${i18nVisual('tab.flow.validation.calendar.schedule_group', 'Schedule Group')}: ${validationData.scheduleGroupName || '-'}`;

            validationHTML = `
                <div class="task-validation-item" task-id="${taskId}">
                    <div class="calendar-task-validation">
                        <label class="validation-label calendar-task-title">
                            <i class="fa ${validationData.icon || 'fa-calendar'} text-warning"></i>
                            <strong>${calendarTitle}</strong>
                        </label>
                        <small class="text-muted">${validationData.description || ''}</small>
                        <div class="calendar-task-info">
                            <div class="calendar-task-info-row">
                                <span class="calendar-task-info-label">${i18nVisual('tab.flow.validation.calendar.weekly_opening', 'Ouverture standard :')}</span>
                                <span class="calendar-task-info-value">${validationData.weeklyOpening || '-'}</span>
                            </div>
                            <div class="calendar-task-info-row">
                                <span class="calendar-task-info-label">${i18nVisual('tab.flow.validation.calendar.weekly_closing', 'Fermeture standard :')}</span>
                                <span class="calendar-task-info-value">${validationData.weeklyClosing || '-'}</span>
                            </div>
                            <div class="calendar-task-info-row">
                                <span class="calendar-task-info-label">${i18nVisual('tab.flow.validation.calendar.next_holiday', 'Prochain holiday :')}</span>
                                <span class="calendar-task-info-value">${validationData.nextHolidayDisplay || '-'}</span>
                            </div>
                        </div>
                        <div class="calendar-task-status-list">
            `;

            statuses.forEach((statusItem) => {
                const statusKey = statusItem.key;
                const statusLabel = statusItem.label || statusKey;
                const statusTaskId = `${taskId}_state_${statusKey}`;
                const currentStatus = normalizeTaskStatusValue(
                    task.taskValidated && typeof task.taskValidated === 'object'
                        ? task.taskValidated[statusKey]
                        : 'untested'
                );

                validationHTML += `
                    <div class="calendar-task-status-row">
                        <span class="calendar-task-status-label">${statusLabel}</span>
                        ${createTriSwitchHtml({
                            orientation: 'horizontal',
                            currentValue: currentStatus,
                            switchKind: 'task-status',
                            extraClass: 'validation-choice-switch',
                            dataTaskId: statusTaskId,
                            dataVisualIndex: flowIndex,
                            ariaLabel: `Validation ${statusLabel}`,
                            onChangeFactory: value => `updateTaskValidation('${boxId}','${statusTaskId}','${value}', '${flowIndex}', '${statusKey}')`
                        })}
                    </div>
                `;
            });

            validationHTML += `
                        </div>
                    </div>
                </div>
            `;
            break;
        }

        case 'checkbox_list': {
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
                            id="${domTaskId}_item_${itemIndex}"
                            data-task-type="${task.action}"
                            data-step-id="${boxId}"
                            onchange="updateTaskValidation('${boxId}','${taskId}', this.checked, '${flowIndex}')"
                            ${isListValidated ? 'checked' : ''}>
                        <label class="form-check-label" for="${domTaskId}_item_${itemIndex}">
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
            <span class="text-muted">${i18nVisual('tab.flow.validation.task', 'Tache')} ${taskIndex + 1} (${task.action}): ${task.errorMessage}</span>
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

function resolveValidatorEntry(rawBoxId, entries) {
    if (!rawBoxId || !Array.isArray(entries)) return null;

    const available = entries.filter(entry => !entry.used);
    if (!available.length) return null;

    const strictEntry = available.find(entry => {
        const ids = getValidatorIdentifierCandidates(entry.box);
        return ids.includes(rawBoxId);
    });
    if (strictEntry) return strictEntry;

    let candidate = rawBoxId;
    const normalized = new Set([rawBoxId]);
    while (candidate.includes('_')) {
        candidate = candidate.substring(0, candidate.lastIndexOf('_'));
        normalized.add(candidate);
    }

    const normalizedEntry = available.find(entry => {
        const ids = getValidatorIdentifierCandidates(entry.box);
        return ids.some(id => normalized.has(id));
    });
    if (normalizedEntry) return normalizedEntry;

    return available.find(entry => {
        const ids = getValidatorIdentifierCandidates(entry.box);
        return ids.some(id => rawBoxId.startsWith(`${id}_`) || id.startsWith(`${rawBoxId}_`));
    }) || null;
}



