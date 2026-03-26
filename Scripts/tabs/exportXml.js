
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
    console.log('🚀 Export validation vers Excel : Demarrage de l\'export') ;
    const visuals = readGeneratedVisualsFromStorage();
    if (!visuals.length) {
        alert(i18nExport('tab.flow.export.validation_excel.no_data', 'Aucun visuel genere a exporter.'));
        return;
    }

    if (typeof ExcelJS !== 'undefined' && ExcelJS && typeof ExcelJS.Workbook === 'function') {
        exportFlowValidationToExcelWithExcelJS(visuals)
            .catch(error => {
                console.error('[FLOW-EXCEL] Export ExcelJS en echec, bascule vers XLSX', error);
                exportFlowValidationToExcelWithXlsxFallback(visuals);
            });
        return;
    }

    exportFlowValidationToExcelWithXlsxFallback(visuals);
}

// [FLOW-EXCEL] Fallback export based on SheetJS (styles mostly preserved, validations may be limited).
function exportFlowValidationToExcelWithXlsxFallback(visuals) {
    if (typeof XLSX === 'undefined') {
        alert(i18nExport('tab.flow.export.validation_excel.missing_lib', 'Librairie XLSX non chargee. Rechargez la page puis recommencez.'));
        return;
    }
    console.warn('[FLOW-EXCEL] ExcelJS indisponible, export via XLSX. Les listes de validation peuvent ne pas etre appliquees selon la librairie.');

    const workbook = XLSX.utils.book_new();
    const usedSheetNames = new Set();
    const testSheetNames = [];

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
        addStatusConditionalFormatting(ws, 2, rows.length + 1);

        const sourceName = (visual && visual.row && visual.row.key) || `Flow ${visualIndex + 1}`;
        const safeSheetName = ensureUniqueSheetName(getSafeExcelSheetName(sourceName), usedSheetNames);
        usedSheetNames.add(safeSheetName);
        testSheetNames.push(safeSheetName);
        XLSX.utils.book_append_sheet(workbook, ws, safeSheetName);
    });

    if (!workbook.SheetNames.length) {
        alert(i18nExport('tab.flow.export.validation_excel.no_sheet', 'Aucune feuille a exporter.'));
        return;
    }

    // [FLOW-EXCEL] Insert summary sheet as the first workbook tab.
    addValidationSummarySheet(workbook, testSheetNames, usedSheetNames);

    const stamp = buildExportTimestamp();
    XLSX.writeFile(workbook, `flow-validation-export-${stamp}.xlsx`, { cellStyles: true });
}

async function exportFlowValidationToExcelWithExcelJS(visuals) {
    console.log('[FLOW-EXCEL] Export via ExcelJS (dropdown OK/NOK et conditional formatting)');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'gcTool';
    workbook.created = new Date();
    workbook.modified = new Date();

    const usedSheetNames = new Set();
    const summarySheetName = ensureUniqueSheetName(getSafeExcelSheetName('Synthese'), usedSheetNames);
    usedSheetNames.add(summarySheetName);
    const summarySheet = workbook.addWorksheet(summarySheetName);

    const testSheetNames = [];
    visuals.forEach((visual, visualIndex) => {
        const sourceName = (visual && visual.row && visual.row.key) || `Flow ${visualIndex + 1}`;
        const safeSheetName = ensureUniqueSheetName(getSafeExcelSheetName(sourceName), usedSheetNames);
        usedSheetNames.add(safeSheetName);
        testSheetNames.push(safeSheetName);

        const rows = buildValidationRowsForVisual(visual, visualIndex);
        const ws = workbook.addWorksheet(safeSheetName);
        ws.columns = [
            { header: 'Test Id', key: 'testId', width: 18 },
            { header: 'Nom du Test', key: 'testName', width: 34 },
            { header: "Action de l'utilisateur", key: 'userAction', width: 45 },
            { header: 'Resultat attendu', key: 'expectedResult', width: 45 },
            { header: 'OK / NOK', key: 'status', width: 12 },
            { header: 'Commentaires', key: 'comment', width: 40 }
        ];

        rows.forEach(row => {
            ws.addRow({
                testId: row.testId,
                testName: row.testName,
                userAction: row.userAction,
                expectedResult: row.expectedResult,
                status: row.status,
                comment: row.comment
            });
        });

        styleExcelJsHeaderRow(ws.getRow(1));
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        ws.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: Math.max(rows.length + 1, 2), column: 6 }
        };

        const lastRow = Math.max(rows.length + 1, 2);
        for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
            const statusCell = ws.getCell(`E${rowNumber}`);
            statusCell.dataValidation = {
                type: 'list',
                allowBlank: false,
                formulae: ['"OK,NOK,N/A"'],
                showErrorMessage: true,
                errorStyle: 'error',
                errorTitle: 'Valeur invalide',
                error: 'Choisir uniquement OK, NOK ou N/A'
            };
            applyExcelJsStatusCellStyle(statusCell, rows[rowNumber - 2] ? rows[rowNumber - 2].status : 'N/A');
        }

        ws.addConditionalFormatting({
            ref: `E2:E${lastRow}`,
            rules: [
                {
                    type: 'expression',
                    formulae: ['UPPER($E2)="OK"'],
                    style: {
                        font: { bold: true, color: { argb: 'FF1F5E2C' } },
                        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } },
                        alignment: { horizontal: 'center' }
                    }
                },
                {
                    type: 'expression',
                    formulae: ['UPPER($E2)="NOK"'],
                    style: {
                        font: { bold: true, color: { argb: 'FF8B0000' } },
                        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } },
                        alignment: { horizontal: 'center' }
                    }
                },
                {
                    type: 'expression',
                    formulae: ['UPPER($E2)="N/A"'],
                    style: {
                        font: { bold: true, color: { argb: 'FF333333' } },
                        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } },
                        alignment: { horizontal: 'center' }
                    }
                }
            ]
        });
    });

    fillExcelJsSummarySheet(summarySheet, testSheetNames);

    const stamp = buildExportTimestamp();
    const outputBuffer = await workbook.xlsx.writeBuffer();
    downloadExcelBlob(outputBuffer, `flow-validation-export-${stamp}.xlsx`);
    console.log('[FLOW-EXCEL] Export ExcelJS termine', { testSheetCount: testSheetNames.length });
}

function styleExcelJsHeaderRow(row) {
    if (!row) return;
    row.height = 22;
    row.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
}

function applyExcelJsStatusCellStyle(cell, status) {
    if (!cell) return;
    const normalized = String(status || '').toUpperCase();
    let fontColor = 'FF333333';
    let fillColor = 'FFFFFFFF';

    if (normalized === 'OK') {
        fontColor = 'FF1F5E2C';
        fillColor = 'FFC6EFCE';
    } else if (normalized === 'NOK') {
        fontColor = 'FF8B0000';
        fillColor = 'FFFFC7CE';
    }

    cell.font = { bold: true, color: { argb: fontColor } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function fillExcelJsSummarySheet(summarySheet, testSheetNames) {
    if (!summarySheet) return;
    const generatedAtLabel = new Date().toLocaleString('fr-FR');

    summarySheet.columns = [
        { width: 40 },
        { width: 16 },
        { width: 10 },
        { width: 10 },
        { width: 16 }
    ];

    summarySheet.mergeCells('A1:E1');
    summarySheet.getCell('A1').value = 'Synthese Validation Flow';
    summarySheet.getCell('A2').value = `Genere le ${generatedAtLabel}`;
    summarySheet.getRow(4).values = ['Feuille', 'Total tests', 'OK', 'NOK', 'Avancement %'];
    summarySheet.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: Math.max(5, 4 + testSheetNames.length), column: 5 }
    };
    summarySheet.views = [{ state: 'frozen', ySplit: 4 }];

    testSheetNames.forEach((sheetName, index) => {
        const rowNumber = index + 5;
        const escaped = escapeSheetNameForFormula(sheetName);
        summarySheet.getCell(`A${rowNumber}`).value = { text: sheetName, hyperlink: `#'${escaped}'!A1` };
        summarySheet.getCell(`B${rowNumber}`).value = { formula: `MAX(COUNTA('${escaped}'!A:A)-1,0)` };
        summarySheet.getCell(`C${rowNumber}`).value = { formula: `COUNTIF('${escaped}'!E:E,"OK")` };
        summarySheet.getCell(`D${rowNumber}`).value = { formula: `COUNTIF('${escaped}'!E:E,"NOK")` };
        summarySheet.getCell(`E${rowNumber}`).value = { formula: `IF(B${rowNumber}=0,0,C${rowNumber}/B${rowNumber})` };
        summarySheet.getCell(`E${rowNumber}`).numFmt = '0%';
    });

    styleExcelJsSummarySheet(summarySheet, testSheetNames.length);
}

function styleExcelJsSummarySheet(summarySheet, dataCount) {
    const titleCell = summarySheet.getCell('A1');
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    const subtitleCell = summarySheet.getCell('A2');
    subtitleCell.font = { italic: true, color: { argb: 'FF1F4E78' } };
    subtitleCell.alignment = { horizontal: 'left', vertical: 'middle' };

    const headerRow = summarySheet.getRow(4);
    headerRow.height = 22;
    headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F75B5' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    for (let index = 0; index < dataCount; index += 1) {
        const rowNumber = index + 5;
        const row = summarySheet.getRow(rowNumber);
        const rowColor = (index % 2 === 0) ? 'FFF7FBFF' : 'FFFFFFFF';
        row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowColor } };
            cell.alignment = { vertical: 'middle' };
        });

        const linkCell = summarySheet.getCell(`A${rowNumber}`);
        linkCell.font = { color: { argb: 'FF0563C1' }, underline: true };
        linkCell.alignment = { horizontal: 'left', vertical: 'middle' };

        ['B', 'C', 'D', 'E'].forEach(col => {
            const cell = summarySheet.getCell(`${col}${rowNumber}`);
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
        summarySheet.getCell(`E${rowNumber}`).font = { bold: true, color: { argb: 'FF1F5E2C' } };
    }
}

function downloadExcelBlob(buffer, fileName) {
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function buildExportTimestamp() {
    const now = new Date();
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        '-',
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
    ].join('');
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
    console.log(`EXPORT XLS : Processing visual ${visualIndex + 1} with `,boxes)

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

        // [FLOW-EXCEL] Always create a parent test line for the box itself.
        const boxUserAction = buildBoxUserActionForExcel(box);
        rows.push({
            testId: stepPrefix,
            testName: stepName,
            userAction: boxUserAction,
            expectedResult,
            status: mapBoxStatusToExcel(box),
            comment
        });
        console.log('[FLOW-EXCEL] Box test row created', {
            visualIndex,
            stepPrefix,
            stepName,
            boxUserAction
        });

        if (!tasks.length) {
            return;
        }

        // [FLOW-EXCEL] Task rows are exported as sub-tests: <boxTestId>.<numTask>.
        let subTestCounter = 1;
        tasks.forEach((task) => {
            const taskRows = buildTaskRowsForExcel(task, box);
            taskRows.forEach(taskRow => {
                rows.push({
                    testId: `${stepPrefix}.${subTestCounter}`,
                    testName: '',
                    userAction: taskRow.userAction,
                    expectedResult: taskRow.expectedResult || '',
                    status: taskRow.status || 'N/A',
                    comment: taskRow.comment || ''
                });
                subTestCounter += 1;
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

// [FLOW-EXCEL] Build the parent box action using box description + display value.
function buildBoxUserActionForExcel(box) {
    const description = getStringValue(box && box.description).trim();
    const displayColumn = getStringValue(box && box.displayColumn).trim();
    const boxData = (box && box.data) || {};
    const displayValue = displayColumn ? getStringValue(boxData[displayColumn]).trim() : '';

    if (description && displayValue) return `${description} ${displayValue}`;
    if (description) return description;
    return displayValue;
}

// [FLOW-EXCEL] Build one or many task rows (schedule => 3 rows).
function buildTaskRowsForExcel(task, box) {
    if (!task) return [];
    const action = String(task.action || (task.originalTask && task.originalTask.action) || '').trim();
    const status = mapTaskStatusToExcel(task, box);
    const validationData = task.validationData || {};
    const taskDesc = getStringValue(validationData.description).trim();

    if (action === 'play_message') {
        const audioName = resolveAudioTaskNameForExcel(task);
        if (!audioName) {
            console.log('[FLOW-EXCEL][TASK] Audio task skipped (no message name)', { task });
            return [];
        }
        console.log('[FLOW-EXCEL][TASK] Audio task expanded', { task });
        return [{
            userAction: taskDesc,
            expectedResult:  i18nExport('tab.flow.tasks.detail.play_message', 'Lecture d\'un message audio') + audioName,
            status,
            comment: ''
        }];
    }

    if (action === 'identification') {
        console.log('[FLOW-EXCEL][TASK] identification task expanded', { task });
        const authDescription = taskDesc
            || getStringValue(task && task.processedData && task.processedData.text).trim()
            || getTaskLabel(task);
        return [{
            userAction: getTaskLabel(task),
            expectedResult: authDescription,
            status,
            comment: ''
        }];
    }

    if (action === 'routing_task') {
        console.log('[FLOW-EXCEL][TASK] routing task', { task });
        const queueName = getStringValue(task && task.processedData && task.processedData.queueName).trim()
            || getStringValue(task && task.validationData && task.validationData.label).replace(/^Routage:\s*/i, '').trim()
            || getStringValue(task && task.originalTask && task.originalTask.parameters && task.originalTask.parameters.column).trim();
        console.log('[FLOW-EXCEL][TASK] routing task expanded', { queueName, task });
        return [{
            userAction: i18nExport('tab.flow.tasks.routing.action','Vérifier le routage'),
            expectedResult: `${i18nExport('tab.flow.tasks.routing','Distribution vers') } : ${queueName || '-'}`,
            status,
            comment: ''
        }];
    }

    if (action === 'calendar_task' || validationData.type === 'calendar_statuses') {
        console.log('[FLOW-EXCEL][TASK] Schedule task expanded', { task });
        const openValue = getStringValue(validationData.weeklyOpening).trim() || '-';
        const closedValue = getStringValue(validationData.weeklyClosing).trim() || resolveCalendarClosedValueForExcel(task);
        const holidayValue = getStringValue(validationData.nextHolidayDisplay).trim() || '-';
        console.log('[FLOW-EXCEL] Schedule task expanded to 3 rows', {
            openValue,
            closedValue,
            holidayValue
        });
        return [
            {
                userAction: i18nExport('tab.flow.tasks.schedule_group.open','Appel durant les horaires d\'ouverture')  + getTaskLabel(task),
                expectedResult: `Ouvert: ${openValue}`,
                status: mapTaskStateStatusToExcel(task, 'open', box),
                comment: ''
            },
            {
                userAction: i18nExport('tab.flow.tasks.schedule_group.closed','Appel durant les heures de fermeture'),
                expectedResult: `Closed: ${closedValue}`,
                status: mapTaskStateStatusToExcel(task, 'closed', box),
                comment: ''
            },
            {
                userAction: i18nExport('tab.flow.tasks.schedule_group.holiday','Appel durant les jours fériés') + `Holiday: ${holidayValue}`,
                expectedResult: `Holiday: ${holidayValue}`,
                status: mapTaskStateStatusToExcel(task, 'vacation', box),
                comment: ''
            }
        ];
    }

    // Generic fallback for all other task types.
    return [{
        userAction: buildGenericTaskKnownValuesForExcel(task),
        expectedResult: '',
        status,
        comment: ''
    }];
}

function resolveAudioTaskNameForExcel(task) {
    const processedValue = getStringValue(task && task.processedData && task.processedData.messageValue).trim();
    if (processedValue) return processedValue;

    const label = getStringValue(task && task.validationData && task.validationData.label).trim();
    if (!label) return '';
    const audioPrefixIndex = label.toLowerCase().indexOf('audio:');
    if (audioPrefixIndex === 0) {
        return label.substring(6).trim();
    }
    return label;
}

function resolveCalendarClosedValueForExcel(task) {
    const validationData = (task && task.validationData) || {};
    const scheduleGroupKey = getStringValue(validationData.scheduleGroupName).trim()
        || getStringValue(task && task.processedData && task.processedData.scheduleGroupName).trim();
    if (!scheduleGroupKey) return '-';

    const groups = (typeof scheduleGroupsCache !== 'undefined' && Array.isArray(scheduleGroupsCache))
        ? scheduleGroupsCache
        : [];
    if (!groups.length) return '-';

    const normalized = scheduleGroupKey.toLowerCase();
    const scheduleGroup = groups.find(group => {
        const groupName = getStringValue(group && group.name).trim().toLowerCase();
        const groupId = getStringValue(group && group.id).trim().toLowerCase();
        return groupName === normalized || groupId === normalized;
    });
    if (!scheduleGroup || !Array.isArray(scheduleGroup.closedSchedules) || !scheduleGroup.closedSchedules.length) {
        return '-';
    }

    const closedNames = scheduleGroup.closedSchedules
        .map(item => getStringValue(item && (item.name || item.id)).trim())
        .filter(Boolean);
    return closedNames.length ? closedNames.join(', ') : '-';
}

function buildGenericTaskKnownValuesForExcel(task) {
    const chunks = [];
    const validationData = (task && task.validationData) || {};
    const processedData = (task && task.processedData) || {};

    const actionLabel = getTaskLabel(task).trim();
    if (actionLabel) chunks.push(actionLabel);
    const description = getStringValue(validationData.description).trim();
    if (description) chunks.push(description);

    if (Array.isArray(validationData.items) && validationData.items.length) {
        const labels = validationData.items
            .map(item => getStringValue(item && (item.label || `${item.key}: ${item.value}`)).trim())
            .filter(Boolean);
        if (labels.length) chunks.push(labels.join(' | '));
    }

    if (Array.isArray(processedData.keyValuePairs) && processedData.keyValuePairs.length) {
        const pairs = processedData.keyValuePairs
            .map(pair => `${getStringValue(pair && pair.key).trim()}: ${getStringValue(pair && pair.value).trim()}`)
            .filter(text => text !== ':');
        if (pairs.length) chunks.push(pairs.join(' | '));
    }

    const processedLabel = getStringValue(processedData.label).trim();
    if (processedLabel) chunks.push(processedLabel);
    const processedValue = getStringValue(processedData.activationValue).trim();
    if (processedValue) chunks.push(processedValue);

    const uniqueChunks = Array.from(new Set(chunks.filter(Boolean)));
    return uniqueChunks.length ? uniqueChunks.join(' - ') : actionLabel;
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
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const stateValues = Object.keys(value).map(stateKey => mapTaskStateStatusToExcel(task, stateKey, box));
        if (stateValues.includes('NOK')) return 'NOK';
        if (stateValues.length > 0 && stateValues.every(state => state === 'OK')) return 'OK';
        return 'N/A';
    }
    if (value === true || value === 'ok') return 'OK';
    if (value === 'ko') return 'NOK';
    if (value === false || value === 'untested') return 'N/A';
    return mapBoxStatusToExcel(box);
}

function mapTaskStateStatusToExcel(task, stateKey, box) {
    if (!task || !task.taskValidated || typeof task.taskValidated !== 'object' || Array.isArray(task.taskValidated)) {
        return mapTaskStatusToExcel(task, box);
    }

    const raw = task.taskValidated[stateKey];
    if (raw === true || raw === 'ok') return 'OK';
    if (raw === 'ko') return 'NOK';
    return 'N/A';
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
        font: { bold: true, color: { rgb: 'FF333333' } },
        fill: { fgColor: { rgb: 'FFFFFFFF' } },
        alignment: { horizontal: 'center' }
    };
}

function addStatusDataValidation(ws, startRow, endRow) {
    if (!ws || endRow < startRow) return;
    if (!ws['!dataValidation']) ws['!dataValidation'] = [];
    const range = `E${startRow}:E${endRow}`;
    ws['!dataValidation'].push({
        sqref: range,
        type: 'list',
        allowBlank: false,
        showInputMessage: true,
        showErrorMessage: true,
        formula1: '"OK,NOK,N/A"',
        // Keep legacy key as fallback for older parser variants.
        formulas: ['"OK,NOK,N/A"']
    });
    console.log('[FLOW-EXCEL] Data validation applied on status column', { range });
}

function addStatusConditionalFormatting(ws, startRow, endRow) {
    if (!ws || endRow < startRow) return;
    const range = `E${startRow}:E${endRow}`;
    if (!ws['!conditionalFormatting']) ws['!conditionalFormatting'] = [];

    // NOTE: Best-effort structure. If parser ignores this, static style fallback remains applied.
    ws['!conditionalFormatting'].push({
        ref: range,
        rules: [
            {
                type: 'containsText',
                operator: 'containsText',
                text: 'OK',
                priority: 1,
                style: {
                    font: { bold: true, color: { rgb: 'FF1F5E2C' } },
                    fill: { fgColor: { rgb: 'FFC6EFCE' } }
                }
            },
            {
                type: 'containsText',
                operator: 'containsText',
                text: 'NOK',
                priority: 2,
                style: {
                    font: { bold: true, color: { rgb: 'FF8B0000' } },
                    fill: { fgColor: { rgb: 'FFFFC7CE' } }
                }
            },
            {
                type: 'containsText',
                operator: 'containsText',
                text: 'N/A',
                priority: 3,
                style: {
                    font: { bold: true, color: { rgb: 'FF333333' } },
                    fill: { fgColor: { rgb: 'FFFFFFFF' } }
                }
            }
        ]
    });
    console.log('[FLOW-EXCEL] Conditional formatting rules added on status column', { range });
}

// [FLOW-EXCEL] Create a workbook summary sheet with formulas and hyperlinks.
function addValidationSummarySheet(workbook, testSheetNames, usedSheetNames) {
    if (!workbook || !Array.isArray(testSheetNames) || !testSheetNames.length) return;

    const summaryBaseName = getSafeExcelSheetName('Synthese');
    const summarySheetName = ensureUniqueSheetName(summaryBaseName, usedSheetNames || new Set());
    if (usedSheetNames) usedSheetNames.add(summarySheetName);

    const generatedAt = new Date();
    const generatedAtLabel = generatedAt.toLocaleString('fr-FR');
    const header = ['Feuille', 'Total tests', 'OK', 'NOK', 'Avancement %'];
    const aoa = [
        [`Synthese Validation Flow`],
        [`Genere le ${generatedAtLabel}`],
        [''],
        header
    ].concat(testSheetNames.map(sheetName => ([sheetName, 0, 0, 0, 0])));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
        { wch: 40 },
        { wch: 16 },
        { wch: 10 },
        { wch: 10 },
        { wch: 16 }
    ];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];

    testSheetNames.forEach((sheetName, index) => {
        const rowNumber = index + 5;
        const escapedSheetName = escapeSheetNameForFormula(sheetName);
        const linkCellRef = `A${rowNumber}`;
        const totalCellRef = `B${rowNumber}`;
        const okCellRef = `C${rowNumber}`;
        const nokCellRef = `D${rowNumber}`;
        const progressCellRef = `E${rowNumber}`;

        if (!ws[linkCellRef]) ws[linkCellRef] = { t: 's', v: sheetName };
        ws[linkCellRef].l = { Target: `#'${escapedSheetName}'!A1`, Tooltip: `Ouvrir ${sheetName}` };
        ws[linkCellRef].s = {
            font: { color: { rgb: 'FF0563C1' }, underline: true },
            alignment: { horizontal: 'left' }
        };

        ws[totalCellRef] = { t: 'n', f: `MAX(COUNTA('${escapedSheetName}'!A:A)-1,0)` };
        ws[okCellRef] = { t: 'n', f: `COUNTIF('${escapedSheetName}'!E:E,"OK")` };
        ws[nokCellRef] = { t: 'n', f: `COUNTIF('${escapedSheetName}'!E:E,"NOK")` };
        ws[progressCellRef] = { t: 'n', f: `IF(B${rowNumber}=0,0,C${rowNumber}/B${rowNumber})`, z: '0%' };
    });

    styleSummarySheet(ws, testSheetNames.length);

    const lastRow = Math.max(aoa.length, 2);
    ws['!autofilter'] = { ref: `A4:E${lastRow}` };
    XLSX.utils.book_append_sheet(workbook, ws, summarySheetName);

    // Move summary sheet in first position.
    workbook.SheetNames = [summarySheetName].concat(workbook.SheetNames.filter(name => name !== summarySheetName));
    console.log('[FLOW-EXCEL] Summary sheet created', {
        summarySheetName,
        testSheetCount: testSheetNames.length
    });
}

function escapeSheetNameForFormula(sheetName) {
    return String(sheetName || '').replace(/'/g, "''");
}

function styleSummarySheet(ws, sheetCount) {
    if (!ws) return;

    // Title row.
    if (ws.A1) {
        ws.A1.s = {
            font: { bold: true, sz: 16, color: { rgb: 'FFFFFFFF' } },
            fill: { fgColor: { rgb: 'FF1F4E78' } },
            alignment: { horizontal: 'center', vertical: 'center' }
        };
    }

    // Subtitle row.
    if (ws.A2) {
        ws.A2.s = {
            font: { italic: true, color: { rgb: 'FF1F4E78' } },
            alignment: { horizontal: 'left', vertical: 'center' }
        };
    }

    // Header row (row 4).
    for (let col = 0; col < 5; col += 1) {
        const cellRef = XLSX.utils.encode_cell({ c: col, r: 3 });
        if (!ws[cellRef]) continue;
        ws[cellRef].s = {
            font: { bold: true, color: { rgb: 'FFFFFFFF' } },
            fill: { fgColor: { rgb: 'FF2F75B5' } },
            alignment: { horizontal: 'center', vertical: 'center' }
        };
    }

    // Data rows with zebra style.
    for (let rowIndex = 0; rowIndex < sheetCount; rowIndex += 1) {
        const excelRow = rowIndex + 5;
        const isEven = (rowIndex % 2) === 0;
        const rowFill = isEven ? 'FFF7FBFF' : 'FFFFFFFF';

        for (let col = 0; col < 5; col += 1) {
            const cellRef = XLSX.utils.encode_cell({ c: col, r: excelRow - 1 });
            if (!ws[cellRef]) continue;

            const baseStyle = {
                fill: { fgColor: { rgb: rowFill } },
                alignment: { vertical: 'center' }
            };

            if (col === 1 || col === 2 || col === 3) {
                baseStyle.alignment.horizontal = 'center';
            } else if (col === 4) {
                baseStyle.alignment.horizontal = 'center';
                baseStyle.font = { bold: true, color: { rgb: 'FF1F5E2C' } };
            } else {
                baseStyle.alignment.horizontal = 'left';
            }

            // Keep hyperlink style if already set on sheet name cell.
            if (col === 0 && ws[cellRef].s && ws[cellRef].s.font && ws[cellRef].s.font.underline) {
                ws[cellRef].s = {
                    font: ws[cellRef].s.font,
                    fill: baseStyle.fill,
                    alignment: baseStyle.alignment
                };
            } else {
                ws[cellRef].s = baseStyle;
            }
        }
    }
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
