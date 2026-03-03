
function i18nExport(key, fallback, params) {
    if (window.GCToolI18n && typeof window.GCToolI18n.t === 'function') {
        return window.GCToolI18n.t(key, params || {}, fallback);
    }
    if (!params || typeof fallback !== 'string') return fallback;
    return fallback.replace(/\{(\w+)\}/g, function (_, token) {
        return Object.prototype.hasOwnProperty.call(params, token) ? String(params[token]) : '';
    });
}

function normalizeDrawioXmlForExport(xmlContent) {
    if (typeof normalizeDrawioXmlTagCase === 'function') {
        return normalizeDrawioXmlTagCase(xmlContent);
    }
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

function exportAllVisualsToDrawio() {
    const xmlElements = document.querySelectorAll('[id^=visual-xml-]');
    
    if (xmlElements.length === 0) {
        alert(i18nExport('tab.flow.export.no_xml_visual', 'Aucun visuel XML trouve a exporter'));
        return;
    }
    console.log(`📊 ${xmlElements.length} visuel(s) XML trouvé(s) : `,xmlElements);
    
    
    // Tableau pour stocker tous les diagrammes
    const allDiagrams = [];
    
    // Parcourir chaque élément XML
    xmlElements.forEach((element, index) => {
        // Récupérer le contenu XML
        const xmlContent = normalizeDrawioXmlForExport((element.textContent || element.innerHTML || '').trim());
        //console.log(`xml content `,index,` : `,xmlContent);

        if (xmlContent && xmlContent.trim()) {
            // Extraire l'index depuis l'ID (visual-xml-0, visual-xml-1, etc.)
            const idMatch = element.id.match(/visual-xml-(\d+)/);
            const visualIndex = idMatch ? parseInt(idMatch[1]) + 1 : index + 1;
            
            allDiagrams.push({
                name: `Visuel ${visualIndex}`,
                xml: xmlContent.trim()
            });
            
            console.log(`✅ Visuel ${visualIndex} ajouté (${xmlContent.length} caractères)`);
        } else {
            console.warn(`⚠️ Élément ${element.id} vide ou sans contenu XML`);
        }
    });
    
    if (allDiagrams.length === 0) {
        alert(i18nExport('tab.flow.export.no_valid_xml', 'Aucun contenu XML valide trouve'));
        return;
    }
    
    // Générer le fichier draw.io multipage
    generateMultipageDrawioFile(allDiagrams);
}

function exportFlowValidationToExcel() {
    if (typeof XLSX === 'undefined') {
        alert(i18nExport('tab.flow.export.validation_excel.missing_lib', 'Librairie XLSX non chargee. Rechargez la page puis recommencez.'));
        return;
    }

    const visuals = readGeneratedVisualsFromStorage();
    if (!visuals.length) {
        alert(i18nExport('tab.flow.export.validation_excel.no_data', 'Aucun visuel genere a exporter.'));
        return;
    }

    const workbook = XLSX.utils.book_new();
    const usedSheetNames = new Set();

    visuals.forEach((visual, visualIndex) => {
        const rows = buildValidationRowsForVisual(visual, visualIndex);
        const header = [
            'Test Id',
            'Nom du Test',
            "Action de l'utilisateur",
            'Resultat attendu',
            'OK / NOK',
            'Commentaires'
        ];

        const aoa = [header].concat(rows.map(row => ([
            row.testId,
            row.testName,
            row.userAction,
            row.expectedResult,
            row.status,
            row.comment
        ])));

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [
            { wch: 18 },
            { wch: 34 },
            { wch: 45 },
            { wch: 45 },
            { wch: 12 },
            { wch: 40 }
        ];

        const lastRow = Math.max(aoa.length, 2);
        ws['!autofilter'] = { ref: `A1:F${lastRow}` };

        applyHeaderStyle(ws, header.length);
        applyStatusColumnFormatting(ws, rows);
        addStatusDataValidation(ws, 2, rows.length + 1);

        const sourceName = (visual && visual.row && visual.row.key) || `Flow ${visualIndex + 1}`;
        const safeSheetName = ensureUniqueSheetName(getSafeExcelSheetName(sourceName), usedSheetNames);
        usedSheetNames.add(safeSheetName);
        XLSX.utils.book_append_sheet(workbook, ws, safeSheetName);
    });

    if (!workbook.SheetNames.length) {
        alert(i18nExport('tab.flow.export.validation_excel.no_sheet', 'Aucune feuille a exporter.'));
        return;
    }

    const now = new Date();
    const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        '-',
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
    ].join('');

    XLSX.writeFile(workbook, `flow-validation-export-${stamp}.xlsx`, { cellStyles: true });
}

function readGeneratedVisualsFromStorage() {
    try {
        const raw = localStorage.getItem('generatedVisuals');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed && parsed.visuals) ? parsed.visuals : [];
    } catch (_error) {
        return [];
    }
}

function buildValidationRowsForVisual(visual, visualIndex) {
    const flowPath = (visual && visual.flowPath) || {};
    const validator = flowPath.validator || {};
    const boxes = Array.isArray(validator.boxes) ? validator.boxes : [];
    const taskGroups = Array.isArray(validator.tasks) ? validator.tasks : [];
    const validationGroups = Array.isArray(flowPath.validationGroups) ? flowPath.validationGroups : [];

    const groupIndex = buildValidationGroupIndex(validationGroups);
    const stepNumbersById = buildMainStepNumbers(boxes, groupIndex);
    const branchCountersByMenu = new Map();
    const normalizedGroups = validationGroups.map((group, groupIdx) => {
        const menuKey = normalizeIdentifier(group && group.menuBoxId) || `group_${groupIdx}`;
        const currentBranchOrder = (branchCountersByMenu.get(menuKey) || 0) + 1;
        branchCountersByMenu.set(menuKey, currentBranchOrder);
        return {
            group,
            groupIdx,
            branchOrder: currentBranchOrder,
            menuStep: resolveMenuStepNumber(group, stepNumbersById, boxes)
        };
    });

    const branchStepCounters = new Map();
    const rows = [];

    boxes.forEach((box, boxIndex) => {
        const stepName = getBoxDisplayName(box, boxIndex);
        const expectedResult = getStringValue(box && box.testConfig && box.testConfig.expectedResult);
        const comment = getStringValue(box && box.testConfig && box.testConfig.comment);
        const taskGroup = findTaskGroupForBox(taskGroups, box);
        const tasks = Array.isArray(taskGroup && taskGroup.tasks) ? taskGroup.tasks.filter(Boolean) : [];
        const matchedBranch = findBranchGroupForBox(box, groupIndex, normalizedGroups);

        let stepPrefix = '';
        if (matchedBranch) {
            const currentBranchStep = (branchStepCounters.get(matchedBranch.groupIdx) || 0) + 1;
            branchStepCounters.set(matchedBranch.groupIdx, currentBranchStep);
            stepPrefix = `${matchedBranch.menuStep}.${matchedBranch.branchOrder}.${currentBranchStep}`;
        } else {
            const stepNumber = resolveStepNumberForBox(box, stepNumbersById, boxIndex + 1);
            stepPrefix = `${stepNumber}`;
        }

        if (!tasks.length) {
            if (matchedBranch) {
                rows.push({
                    testId: `${stepPrefix}.1`,
                    testName: stepName,
                    userAction: getStringValue(matchedBranch.group && matchedBranch.group.branchLabel) || getStringValue(matchedBranch.group && matchedBranch.group.menuLabel) || 'Scenario menu',
                    expectedResult,
                    status: mapBoxStatusToExcel(box),
                    comment
                });
            }
            return;
        }

        tasks.forEach((task, taskIndex) => {
            const taskLabel = getTaskLabel(task);
            const branchPrefix = matchedBranch
                ? (getStringValue(matchedBranch.group && matchedBranch.group.branchLabel) || getStringValue(matchedBranch.group && matchedBranch.group.menuLabel))
                : '';

            rows.push({
                testId: `${stepPrefix}.${taskIndex + 1}`,
                testName: stepName,
                userAction: branchPrefix ? `${branchPrefix} -> ${taskLabel}` : taskLabel,
                expectedResult,
                status: mapTaskStatusToExcel(task, box),
                comment
            });
        });
    });

    if (!rows.length) {
        rows.push({
            testId: `${visualIndex + 1}.1`,
            testName: `Flow ${visualIndex + 1}`,
            userAction: '',
            expectedResult: '',
            status: 'N/A',
            comment: ''
        });
    }

    return rows;
}

function buildValidationGroupIndex(validationGroups) {
    return (validationGroups || []).map(group => {
        const rawIds = [];
        (group && group.boxIds ? group.boxIds : []).forEach(id => {
            if (id) rawIds.push(String(id));
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

        return { group, rawIds, exact, normalized };
    });
}

function buildMainStepNumbers(boxes, groupIndex) {
    const map = new Map();
    let counter = 0;

    (boxes || []).forEach(box => {
        if (isBoxInAnyBranch(box, groupIndex)) return;
        counter += 1;
        getIdentifierCandidates(box).forEach(id => {
            if (id) map.set(String(id), counter);
        });
    });

    return map;
}

function resolveMenuStepNumber(group, stepNumbersById, boxes) {
    const menuIds = [];
    if (group && group.menuBoxId) {
        menuIds.push(String(group.menuBoxId));
        let candidate = String(group.menuBoxId);
        while (candidate.includes('_')) {
            candidate = candidate.substring(0, candidate.lastIndexOf('_'));
            menuIds.push(candidate);
        }
    }

    for (let i = 0; i < menuIds.length; i += 1) {
        if (stepNumbersById.has(menuIds[i])) {
            return stepNumbersById.get(menuIds[i]);
        }
    }

    const fallbackMenu = (boxes || []).find(box => {
        return getIdentifierCandidates(box).some(id => menuIds.includes(id));
    });
    if (fallbackMenu) {
        return resolveStepNumberForBox(fallbackMenu, stepNumbersById, 1);
    }

    return 1;
}

function findBranchGroupForBox(box, groupIndex, normalizedGroups) {
    for (let i = 0; i < groupIndex.length; i += 1) {
        if (isBoxInGroup(box, groupIndex[i])) {
            return normalizedGroups[i];
        }
    }
    return null;
}

function isBoxInAnyBranch(box, groupIndex) {
    for (let i = 0; i < groupIndex.length; i += 1) {
        if (isBoxInGroup(box, groupIndex[i])) {
            return true;
        }
    }
    return false;
}

function isBoxInGroup(box, groupData) {
    if (!box || !groupData || !groupData.rawIds || !groupData.rawIds.length) {
        return false;
    }

    const ids = getIdentifierCandidates(box);
    if (!ids.length) return false;

    for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        if (groupData.exact.has(id) || groupData.normalized.has(id)) {
            return true;
        }
    }

    return groupData.rawIds.some(rawId => ids.some(id => rawId.indexOf(`${id}_`) === 0 || id.indexOf(`${rawId}_`) === 0));
}

function getIdentifierCandidates(item) {
    if (!item) return [];
    const ids = [];
    if (Array.isArray(item.xmlIds)) ids.push.apply(ids, item.xmlIds);
    ids.push(item.id, item.instanceId, item.xmlId, item.logicalId);
    return Array.from(new Set(ids.filter(Boolean).map(v => String(v))));
}

function findTaskGroupForBox(taskGroups, box) {
    if (!Array.isArray(taskGroups) || !box) return null;
    const boxIds = getIdentifierCandidates(box);
    return taskGroups.find(taskGroup => {
        const taskIds = getIdentifierCandidates(taskGroup);
        if (taskIds.some(id => boxIds.includes(id))) return true;
        return taskIds.some(taskId => boxIds.some(boxId => taskId.indexOf(`${boxId}_`) === 0 || boxId.indexOf(`${taskId}_`) === 0));
    }) || null;
}

function resolveStepNumberForBox(box, stepNumbersById, fallback) {
    const candidates = getIdentifierCandidates(box);
    for (let i = 0; i < candidates.length; i += 1) {
        if (stepNumbersById.has(candidates[i])) return stepNumbersById.get(candidates[i]);
    }
    return fallback;
}

function getTaskLabel(task) {
    if (!task) return '';
    if (task.validationData && task.validationData.label) {
        return String(task.validationData.label);
    }
    const actionKey = task.action || (task.originalTask && task.originalTask.action) || '';
    if (actionKey && typeof TASK_ACTIONS !== 'undefined' && TASK_ACTIONS[actionKey] && TASK_ACTIONS[actionKey].name) {
        return TASK_ACTIONS[actionKey].name;
    }
    return String(actionKey || 'Action');
}

function getBoxDisplayName(box, index) {
    if (!box) return `Etape ${index + 1}`;
    if (box.displayName) return String(box.displayName);
    if (box.type) return String(box.type);
    return `Etape ${index + 1}`;
}

function getStringValue(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function mapTaskStatusToExcel(task, box) {
    if (!task) return mapBoxStatusToExcel(box);
    const value = task.taskValidated;
    if (value === true || value === 'ok') return 'OK';
    if (value === 'ko') return 'NOK';
    if (value === false) return 'N/A';
    return mapBoxStatusToExcel(box);
}

function mapBoxStatusToExcel(box) {
    const status = box && box.testConfig ? box.testConfig.status : '';
    if (status === 'ok') return 'OK';
    if (status === 'ko') return 'NOK';
    return 'N/A';
}

function applyHeaderStyle(ws, columnCount) {
    for (let col = 0; col < columnCount; col += 1) {
        const cellRef = XLSX.utils.encode_cell({ c: col, r: 0 });
        if (!ws[cellRef]) continue;
        ws[cellRef].s = {
            font: { bold: true, color: { rgb: 'FFFFFFFF' } },
            fill: { fgColor: { rgb: 'FF4472C4' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
        };
    }
}

function applyStatusColumnFormatting(ws, rows) {
    rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const cellRef = `E${rowNumber}`;
        if (!ws[cellRef]) return;
        ws[cellRef].s = getStatusCellStyle(row.status);
    });
}

function getStatusCellStyle(status) {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'OK') {
        return {
            font: { bold: true, color: { rgb: 'FF1F5E2C' } },
            fill: { fgColor: { rgb: 'FFC6EFCE' } },
            alignment: { horizontal: 'center' }
        };
    }
    if (normalized === 'NOK') {
        return {
            font: { bold: true, color: { rgb: 'FF8B0000' } },
            fill: { fgColor: { rgb: 'FFFFC7CE' } },
            alignment: { horizontal: 'center' }
        };
    }
    return {
        font: { bold: true, color: { rgb: 'FF5E5E5E' } },
        fill: { fgColor: { rgb: 'FFE2E2E2' } },
        alignment: { horizontal: 'center' }
    };
}

function addStatusDataValidation(ws, startRow, endRow) {
    if (!ws || endRow < startRow) return;
    if (!ws['!dataValidation']) ws['!dataValidation'] = [];
    ws['!dataValidation'].push({
        sqref: `E${startRow}:E${endRow}`,
        type: 'list',
        allowBlank: false,
        showInputMessage: true,
        showErrorMessage: true,
        formulas: ['"OK,NOK,N/A"']
    });
}

function normalizeIdentifier(value) {
    return value ? String(value) : '';
}

function getSafeExcelSheetName(value) {
    const raw = getStringValue(value).replace(/[\\\/\?\*\[\]:]/g, ' ').trim();
    const fallback = raw || 'Flow';
    return fallback.substring(0, 31) || 'Flow';
}

function ensureUniqueSheetName(baseName, usedNames) {
    let candidate = baseName || 'Flow';
    if (!usedNames.has(candidate)) return candidate;
    let index = 2;
    while (usedNames.has(candidate)) {
        const suffix = `_${index}`;
        candidate = `${(baseName || 'Flow').substring(0, Math.max(1, 31 - suffix.length))}${suffix}`;
        index += 1;
    }
    return candidate;
}

    
/**
 * Génération du fichier draw.io multipage
 */
function generateMultipageDrawioFile(diagrams) {
    const timestamp = new Date().toISOString();
    
    // En-tête du fichier mxfile
    let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${timestamp}" agent="Genesys Flow Designer" version="1.0">`;
    
    // Ajouter chaque diagramme comme une page
    diagrams.forEach((diagram, index) => {        
        xmlContent += `${diagram.xml}`});
    // Fermeture du fichier
    xmlContent += `
        </mxfile>`;
    
    // Télécharger le fichier
    downloadDrawioFile(xmlContent, diagrams.length);
}

/**
 * Échappement des caractères spéciaux pour les attributs XML
 */
function escapeXmlAttribute(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Téléchargement du fichier draw.io
 */
function downloadDrawioFile(xmlContent, diagramCount) {
    try {
        const blob = new Blob([xmlContent], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `flux-complet-${diagramCount}-pages-${new Date().toISOString().split('T')[0]}.drawio`;
        
        // Ajouter temporairement au DOM pour déclencher le téléchargement
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Nettoyer l'URL
        URL.revokeObjectURL(url);
        
        console.log(`📤 Fichier draw.io généré avec ${diagramCount} page(s)`);
        alert(i18nExport('tab.flow.export.success_message', 'Export reussi ! {count} visuel(s) exporte(s) vers draw.io', { count: diagramCount }));
        
    } catch (error) {
        console.error('❌ Erreur lors du téléchargement:', error);
        alert(i18nExport('tab.flow.export.error_generating_file', 'Erreur lors de la generation du fichier'));
    }
}
function escapeXml(str) {
    return str.replace(/&/g, '&amp;')
              .replace(/"/g, '&quot;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
}

function estimateDrawioBoxWidth(label, defaultWidth = 120) {
    const raw = (label || '').toString().replace(/\\n/g, '\n');
    const lines = raw.split('\n');
    const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const estimated = Math.round(longestLine * 7.2) + 28;
    return Math.max(defaultWidth, Math.min(460, estimated));
}


/**
 * Génération du XML mxGraphModel pour une boîte
 */
function generateBoxXML(box, position,boxLabel, context = '') {
    const boxConfig = BOX_TYPES[box.type];
    if (!boxConfig || !boxConfig.xml) {
        return '';
    }
    
    // Créer un ID unique basé sur le contexte (pour les sorties de menu)
    const uniqueId = context ? `${box.id}_${context}` : box.id;
    
    // Déterminer le label à afficher
    let label = box.description || `${boxConfig.name}`;
    if (box.type === 'error' && box.errorText) {
        label = `Erreur: ${box.errorText}`;
    } else if (box.dataTable && box.displayColumn) {
        
        label = `${boxLabel}`;
    }
    
    // Ajouter le contexte au label si nécessaire
    if (context) {
        label = `${label}\\n(${context})`;
    }
    
    // Remplacer les placeholders dans le template XML
    const xml = boxConfig.xml
        .replace(/{id}/g, uniqueId)
        .replace(/{label}/g, escapeXmlValue(label))
        .replace(/{x}/g, position.x)
        .replace(/{y}/g, position.y);

    const dynamicWidth = estimateDrawioBoxWidth(label, 120);
    return xml.replace(/width=\"[0-9.]+\"/g, `width=\"${dynamicWidth}\"`);
}



/**
 * Échapper les caractères spéciaux pour XML
 */
function escapeXmlValue(value) {
    if (!value) return '';
    return value.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\n/g, '\\n');
}



/**
 * Génération du wrapper mxGraphModel avec boîtes et connexions
 */
function generateMxGraphModelWrapper(boxesXML, connectionsXML) {
    const xmlGraphHeader = `<diagram name="Flow Path" id="flow-diagram">
        <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1200" pageHeight="1600" math="0" shadow="0">
        <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>`;
    const xmlGraphFooter = `</root>
            </mxGraphModel></diagram>`;
    
    const boxesContent = boxesXML.filter(xml => xml && xml.trim()).join('\n        ');
    const connectionsContent = connectionsXML.filter(xml => xml && xml.trim()).join('\n        ');
    
    return (xmlGraphHeader + '\n        ' + boxesContent + '\n        ' + connectionsContent + '\n      ' + xmlGraphFooter);
}

/**
 * Extraction des boîtes et connexions depuis un XML
 */
function extractBoxesAndConnectionsFromXML(xmlString) {
    if (!xmlString) return { boxes: [], connections: [] };
    
    try {
        // Extraire les boîtes (vertex="1")
        const boxMatches = xmlString.match(/<mxCell[^>]*vertex="1"[^>]*>[\s\S]*?<\/mxCell>/g) || [];
        
        // Extraire les connexions (edge="1")
        const connectionMatches = xmlString.match(/<mxCell[^>]*edge="1"[^>]*>[\s\S]*?<\/mxCell>/g) || [];
        
        return {
            boxes: boxMatches,
            connections: connectionMatches
        };
    } catch (error) {
        console.error('Erreur lors de l\'extraction XML:', error);
        return { boxes: [], connections: [] };
    }
}

/**
 * Extraction de l'ID de la première boîte depuis son XML
 */
function extractFirstBoxId(boxXML) {
    if (!boxXML) return null;
    
    const idMatch = boxXML.match(/id="([^"]+)"/);
    return idMatch ? idMatch[1] : null;
}

/**
 * Génération des connexions XML entre boîtes
 */
function generateConnectionXML(fromBoxId, toBoxId, connectionId, label = "") {
    return `<mxCell id="${connectionId}"  value="${label || ''}"
                style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;" edge="1" parent="1" source="${fromBoxId}" target="${toBoxId}">
              <mxGeometry relative="1" as="geometry"/>
            </mxCell>`;
}

/**
 * Export du parcours en format draw.io
 */
function exportFlowPathToDrawio(xmlContent, filename = 'flow-path.drawio') {
    if (!xmlContent) {
        alert(i18nExport('tab.flow.export.no_xml_content', 'Aucun contenu XML a exporter'));
        return;
    }
    const normalizedXmlContent = normalizeDrawioXmlForExport(xmlContent);
        
    const xmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
        <mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="Genesys Flow Designer" version="1.0">`;
    const xmlFooter = `
        </mxfile>`;
    
    xmlContent = xmlHeader + '\n      ' + normalizedXmlContent + xmlFooter;

    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    
    console.log('📤 Parcours exporté au format draw.io');
}
