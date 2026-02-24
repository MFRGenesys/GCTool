/**
 * datatables-flow.js
 * Concepteur de flux DataTables avec interface graphique
 * Auteur: PS Genesys - Matthieu FRYS
 * Date: 05/2025
 */

// Variables globales pour le flow designer
let flowCanvas = null;
let flowBoxes = new Map();
let flowConnections = [];
let selectedBox = null;
let draggedBoxType = null;
let nextBoxId = 1;
let isConnecting = false;
let connectionStart = null;
let tempLine = null;
const FLOW_CANVAS_PADDING = 50;
const FLOW_CANVAS_MIN_WIDTH = 700;
const FLOW_CANVAS_MIN_HEIGHT = 740;

let flowDesignerInitialized = false;

function i18nFlow(key, fallback, params) {
    if (window.GCToolI18n && typeof window.GCToolI18n.t === 'function') {
        return window.GCToolI18n.t(key, params || {}, fallback);
    }
    if (!params || typeof fallback !== 'string') return fallback;
    return fallback.replace(/\{(\w+)\}/g, function (_, token) {
        return Object.prototype.hasOwnProperty.call(params, token) ? String(params[token]) : '';
    });
}

// Configuration des types de boites
const BOX_TYPES = {
    start: {
        name: 'Start',
        displayName: 'Start',
        description: 'Appeller le ',
        icon: 'fa-play',
        color: '#28a745',
        inputs: 0,
        outputs: 1,
        minOutputs: 1,
        maxOutputs: 5,
        unique: true,
        supportsTasks: true,
        tasks: [],
        xml: `<mxCell id="{id}" value="{label}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
                <mxGeometry x="{x}" y="{y}" width="120" height="80" as="geometry"/>
              </mxCell>`
    },
    route: {
        name: 'Route',
        displayName: 'Route',
        description: 'Envoi sur ',
        icon: 'fa-arrow-right',
        color: '#17a2b8',
        inputs: 1,
        outputs: 1,
        minOutputs: 1,
        maxOutputs: 5,
        supportsTasks: true,
        tasks: [],
        xml: `<mxCell id="{id}" value="{label}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
                <mxGeometry x="{x}" y="{y}" width="120" height="80" as="geometry"/>
              </mxCell>`
    },
    menu: {
        name: 'Menu',
        displayName: 'Menu',
        detail: 'Menu ',
        icon: 'fa-sitemap',
        color: '#ffc107',
        inputs: 1,
        outputs: 3,
        minOutputs: 1,
        maxOutputs: 12,
        supportsTasks: true,
        tasks: [],
        xml: `<mxCell id="{id}" value="{label}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
                <mxGeometry x="{x}" y="{y}" width="120" height="80" as="geometry"/>
              </mxCell>`
    },
    message: {
        name: 'Message',
        displayName: 'Message',
        description: 'Message ',
        icon: 'fa-comment',
        color: '#6f42c1',
        inputs: 1,
        outputs: 1,
        minOutputs: 1,
        maxOutputs: 1,
        supportsTasks: true,
        tasks: [],
        useDataTable: true,
        promptCheck: true,
        xml: `<mxCell id="{id}" value="{label}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
                <mxGeometry x="{x}" y="{y}" width="120" height="80" as="geometry"/>
              </mxCell>`
    },
    calendar: {
        name: 'Calendar',
        displayName: 'Calendar',
        description: 'Calendar ',
        icon: 'fa-calendar',
        color: '#fd7e14',
        inputs: 1,
        outputs: 3,
        minOutputs: 3,
        maxOutputs: 3,
        outputLabels: ['Open', 'Closed', 'Vacation'],
        useDataTable: true,
        supportsTasks: false,
        xml: `<mxCell id="{id}" value="{label}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;" vertex="1" parent="1">
                <mxGeometry x="{x}" y="{y}" width="120" height="80" as="geometry"/>
              </mxCell>`
    },
    end: {
        name: 'End',
        displayName: 'End',
        detail: 'Arrivée sur ',
        icon: 'fa-stop',
        color: '#dc3545',
        inputs: 1,
        outputs: 0,
        supportsTasks: true,
        tasks: [],
        xml: `<mxCell id="{id}" value="{label}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
                <mxGeometry x="{x}" y="{y}" width="120" height="80" as="geometry"/>
              </mxCell>`
    },
    error: {
        name: 'Erreur',
        displayName: 'Erreur',
        detail: 'Erreur ',
        icon: 'fa-exclamation-triangle',
        color: '#dc3545',
        inputs: 1,
        outputs: 0,
        minOutputs: 0,
        maxOutputs: 0,
        useDataTable: false,
        supportsTasks: false,
        xml: `<mxCell id="{id}" value="{label}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontColor=#000000;" vertex="1" parent="1">
                <mxGeometry x="{x}" y="{y}" width="120" height="80" as="geometry"/>
              </mxCell>`
    }
};

// Ajout des types d'actions pour les tâches
const TASK_ACTIONS = {
    play_message: {
        name: 'Jouer un message',
        icon: 'fa-play',
        color: '#28a745',
        requiresColumn: true,
        parameters: ['column']
    },
    identification: {
        name: 'Identification',
        icon: 'fa-user-circle',
        color: '#17a2b8',
        requiresText: true,
        parameters: ['text']
    },
    client_data: {
        name: 'Données Client',
        icon: 'fa-database',
        color: '#6f42c1',
        requiresKeyValue: true,
        parameters: ['keyValuePairs']
    },
    activation: {
        name: 'Activation',
        icon: 'fa-toggle-on',
        color: '#ffc107',
        requiresColumn: true,
        requiresLabel: true,
        parameters: ['column', 'label']
    }
};
/**
 * Vérification des dépendances Bootstrap
 */
function checkBootstrapDependencies() {
    if (typeof $ === 'undefined') {
        console.error('❌ jQuery non chargé - requis pour Bootstrap');
        return false;
    }
    
    if (typeof $.fn.modal === 'undefined') {
        console.error('❌ Bootstrap modal non disponible');
        return false;
    }
    
    console.log('✅ Dépendances Bootstrap OK');
    return true;
}

/**
 * Initialisation optimisée de l'interface
 */
function initializeFlowDesigner() {
    if (flowDesignerInitialized) {
        optimizeInitialLayout();
        return;
    }
    console.log('Initialisation du concepteur de flux optimisé');
    
    // Vérifier les dépendances
    if (!checkBootstrapDependencies()) {
        alert(i18nFlow('tab.flow.alert.bootstrap_missing', 'Erreur : Bootstrap ou jQuery non charge correctement'));
        return;
    }
    
    cleanupConnectionState();

    // Initialiser les composants
    setupFlowCanvas();
    setupDragAndDrop();
    setupConnectionEvents();
    optimizeInitialLayout();
    loadFlowFromCookie();
    loadGeneratedVisualsFromStorage();
    flowDesignerInitialized = true;

    console.log('✅ Concepteur de flux optimisé initialisé');
}

/**
 * Optimisation de la disposition initiale
 */
function optimizeInitialLayout() {
    // S'assurer que le panneau d'aide est visible au démarrage
    const helpPanel = document.getElementById('helpPanel');
    const configPanel = document.getElementById('boxConfigPanel');
    
    if (helpPanel) helpPanel.style.display = 'block';
    if (configPanel) configPanel.style.display = 'none';
    
    // Ajuster la hauteur du canvas selon la taille de l'écran
    const canvas = document.getElementById('flowCanvas');
    if (canvas) {
        const row = document.querySelector('.flow-designer-row');
        const rowHeight = row ? row.clientHeight : Math.max(420, Math.min(820, window.innerHeight - 220));
        const optimalHeight = Math.max(280, rowHeight - 80);
        canvas.style.height = optimalHeight + 'px';
        updateFlowCanvasSize();
    }
}

function getCanvasPointerPosition(event) {
    if (!flowCanvas) {
        return { x: 0, y: 0 };
    }
    const rect = flowCanvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left + flowCanvas.scrollLeft,
        y: event.clientY - rect.top + flowCanvas.scrollTop
    };
}

function updateFlowCanvasSize() {
    if (!flowCanvas) {
        return;
    }

    const svg = document.getElementById('flowSvg');
    if (!svg) {
        return;
    }

    const minWidth = Math.max(flowCanvas.clientWidth, FLOW_CANVAS_MIN_WIDTH);
    const minHeight = Math.max(flowCanvas.clientHeight, FLOW_CANVAS_MIN_HEIGHT);

    let maxRight = 0;
    let maxBottom = 0;
    flowBoxes.forEach(box => {
        maxRight = Math.max(maxRight, box.x + box.width);
        maxBottom = Math.max(maxBottom, box.y + box.height);
    });

    const targetWidth = Math.max(minWidth, maxRight + FLOW_CANVAS_PADDING);
    const targetHeight = Math.max(minHeight, maxBottom + FLOW_CANVAS_PADDING);

    svg.setAttribute('width', String(Math.ceil(targetWidth)));
    svg.setAttribute('height', String(Math.ceil(targetHeight)));
}


// Réajustement lors du redimensionnement de la fenêtre
window.addEventListener('resize', function() {
    setTimeout(optimizeInitialLayout, 100);
});

/**
 * Gestionnaire d'erreurs global pour le flow designer
 */
window.addEventListener('error', function(e) {
    if (e.filename && e.filename.includes('datatables-flow.js')) {
        console.error('❌ Erreur dans datatables-flow.js:', e.message, 'Ligne:', e.lineno);
        
        // Nettoyer les états en cas d'erreur
        try {
            cleanupConnectionState();
        } catch (cleanupError) {
            console.error('Erreur lors du nettoyage:', cleanupError);
        }
    }
});

/**
 * Configuration du canvas de flux
 */
function setupFlowCanvas() {
    flowCanvas = document.getElementById('flowCanvas');
    const svg = document.getElementById('flowSvg');
    updateFlowCanvasSize();
    
    // Événement de drop sur le canvas
    flowCanvas.addEventListener('drop', handleCanvasDrop);
    flowCanvas.addEventListener('dragover', handleCanvasDragOver);
    
    // Événement de clic pour désélectionner
    svg.addEventListener('click', function(e) {
        if (e.target === svg) {
            deselectBox();
        }
    });
}

/**
 * Configuration des événements de drag & drop
 */
function setupDragAndDrop() {
    const paletteItems = document.querySelectorAll('.palette-item');
    
    paletteItems.forEach(item => {
        item.addEventListener('dragstart', function(e) {
            draggedBoxType = this.getAttribute('data-type');
            e.dataTransfer.effectAllowed = 'copy';
        });
    });
}

/**
 * Gestion du drop sur le canvas
 */
function handleCanvasDrop(e) {
    
    console.log(`Drop`)
    e.preventDefault();
    
    if (!draggedBoxType) return;
    
    const pointer = getCanvasPointerPosition(e);
    const x = pointer.x;
    const y = pointer.y;
    
    // Vérifier si c'est une boîte unique (Start)
    if (BOX_TYPES[draggedBoxType].unique && hasBoxOfType(draggedBoxType)) {
        alert(i18nFlow('tab.flow.alert.single_start', 'Une seule boite Start est autorisee dans le flux'));
        return;
    }
    
    createFlowBox(draggedBoxType, x, y);
    draggedBoxType = null;
}

/**
 * Gestion du dragover sur le canvas
 */
function handleCanvasDragOver(e) {
    console.log(`DragOver`)
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
}

/**
 * Création d'une boîte de flux
 */
function createFlowBox(type, x, y) {
    const boxConfig = BOX_TYPES[type];
    const boxId = `box_${nextBoxId++}`;
    
    const box = {
        id: boxId,
        type: type,
        x: Math.max(0, x - 60), // Centrer la boîte
        y: Math.max(0, y - 40),
        width: 120,
        height: 80,
        displayName: boxConfig.displayName,
        dataTable: null,
        displayColumn: null,
        outputColumns: {},
        outputConditions: {}, 
        currentOutputs: boxConfig.outputs, 
        freeText: boxConfig.useDataTable ? null : '',
        description: boxConfig.description,
        data: {},
        testConfig: {
            description: "Étape de connexion au service client", // Message descriptif
            status: "untested", // untested | ok | ko
            validationSteps: [] // Pour les boîtes complexes
        }
    };
    
    // Initialiser les conditions de sortie
    for (let i = 0; i < box.currentOutputs; i++) {
        box.outputConditions[i] = {
            column: null,
            value: null,
            isDefault: false,
            targetKeyColumn:null
        };
    }

    // Créer l'élément SVG de la boîte
    const boxElement = createBoxSVG(box, boxConfig);
    
    // Ajouter au groupe des boîtes
    const boxesGroup = document.getElementById('boxesGroup');
    boxesGroup.appendChild(boxElement);
    
    // Sauvegarder dans la map
    flowBoxes.set(boxId, box);
    updateFlowCanvasSize();
    
    // Sélectionner la nouvelle boîte
    selectBox(boxId);
    onFlowChanged();

    console.log(`📦 Boîte ${type} créée:`, boxId);
}

// À la fin de chaque modification du flux :
function onFlowChanged() {
    saveCurrentFlowToCookie();
}

/**
 * Création de l'élément SVG d'une boîte
 */
function createBoxSVG(box, config) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('id', box.id);
    group.setAttribute('class', 'flow-box');
    group.setAttribute('transform', `translate(${box.x}, ${box.y})`);
    
    // Rectangle principal
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', box.width);
    rect.setAttribute('height', box.height);
    rect.setAttribute('fill', config.color);
    rect.setAttribute('stroke', '#333');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('rx', '5');
    rect.setAttribute('class', 'box-rect');
    
    // Texte du type
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', box.width / 2);
    text.setAttribute('y', 25);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'white');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('font-size', '14');
    text.textContent = box.displayName;

    // Points de connexion
    createConnectionPoints(group, box, config);
    
    // Événements
    group.addEventListener('click', () => selectBox(box.id));
    group.addEventListener('mousedown', (e) => startDragBox(e, box.id));
    
    // Assembler la boîte
    group.appendChild(rect);
    group.appendChild(text);
    
    if (config.useDataTable) {
        // Texte de la DataTable (si configurée)
        const dataTableText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        dataTableText.setAttribute('x', box.width / 2);
        dataTableText.setAttribute('y', 45);
        dataTableText.setAttribute('text-anchor', 'middle');
        dataTableText.setAttribute('fill', 'white');
        dataTableText.setAttribute('font-size', '10');
        dataTableText.setAttribute('class', 'datatable-text');
        dataTableText.textContent = box.dataTable ? getDataTableNameById(box.dataTable) : i18nFlow('tab.flow.config.not_configured', 'Non configure');
        
        // Texte de la colonne d'affichage
        const columnText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        columnText.setAttribute('x', box.width / 2);
        columnText.setAttribute('y', 60);
        columnText.setAttribute('text-anchor', 'middle');
        columnText.setAttribute('fill', 'white');
        columnText.setAttribute('font-size', '9');
        columnText.setAttribute('class', 'column-text');
        columnText.textContent = box.displayColumn || '';
        
        group.appendChild(dataTableText);
        group.appendChild(columnText);
    }

    return group;
}
/**
 * Création des points de connexion - Version avec sorties dynamiques
 */
function createConnectionPoints(group, box, config) {
    // Points d'entrée (inchangé)
    for (let i = 0; i < config.inputs; i++) {
        const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        //point.setAttribute('cx', 0);
        //point.setAttribute('cy', box.height / 2);
        point.setAttribute('cx', box.width / 2);
        point.setAttribute('cy', 0);
        point.setAttribute('r', '6');
        point.setAttribute('fill', '#fff');
        point.setAttribute('stroke', '#333');
        point.setAttribute('stroke-width', '2');
        point.setAttribute('class', 'connection-point input-point');
        point.setAttribute('data-type', 'input');
        point.setAttribute('data-index', i);
        point.setAttribute('data-box-id', box.id);
        
        point.addEventListener('click', (e) => {
            e.stopPropagation();
            handleConnectionPoint(box.id, 'input', i);
        });
        
        group.appendChild(point);
    }
    
    // Points de sortie utilisant currentOutputs au lieu de config.outputs
    for (let i = 0; i < box.currentOutputs; i++) {
        const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const spacing = box.width / (box.currentOutputs + 1);
        //point.setAttribute('cx', box.width);
        //point.setAttribute('cy', spacing * (i + 1));
        point.setAttribute('cx', spacing * (i + 1));
        point.setAttribute('cy', box.height);
        point.setAttribute('r', '6');
        point.setAttribute('fill', '#fff');
        point.setAttribute('stroke', '#333');
        point.setAttribute('stroke-width', '2');
        point.setAttribute('class', 'connection-point output-point');
        point.setAttribute('data-type', 'output');
        point.setAttribute('data-index', i);
        point.setAttribute('data-box-id', box.id);
        
        point.addEventListener('click', (e) => {
            e.stopPropagation();
            handleConnectionPoint(box.id, 'output', i);
        });
        
        group.appendChild(point);
    }
}


/**
 * Gestion des clics sur les points de connexion
 */
function handleConnectionPoint(boxId, type, index) {
    if (!isConnecting) {
        // Démarrer une connexion
        if (type === 'output') {
            isConnecting = true;
            connectionStart = { boxId, type, index };
            const outputPoint = document.querySelector(
                `.connection-point[data-box-id="${boxId}"][data-type="output"][data-index="${index}"]`
            );
            if (outputPoint) {
                outputPoint.style.fill = '#ff6b6b';
            }
            console.log('🔗 Début de connexion depuis:', connectionStart);
        }
    } else {
        // Terminer la connexion
        if (type === 'input' && connectionStart.type === 'output') {
            createConnection(connectionStart, { boxId, type, index });
        }
        cancelConnection();
    }
}

/**
 * Nettoyage complet des états de connexion
 */
function cleanupConnectionState() {
    isConnecting = false;
    connectionStart = null;
    
    if (tempLine) {
        tempLine.remove();
        tempLine = null;
    }
    
    // Réinitialiser tous les points de connexion
    document.querySelectorAll('.connection-point').forEach(point => {
        point.style.fill = '#fff';
        point.style.strokeWidth = '2';
    });
    
    console.log('🧹 État de connexion nettoyé');
}

/**
 * Création d'une connexion entre deux boîtes
 */
function createConnection(from, to) {
     // Vérifier si la connexion existe déjà
    const existingConnection = flowConnections.find(conn => 
        conn.from.boxId === from.boxId && conn.from.index === from.index
    );
    
    if (existingConnection) {
        alert(i18nFlow('tab.flow.alert.output_already_connected', 'Cette sortie est deja connectee'));
        redrawConnection(existingConnection.id)
        return;
    }

    const connection = {
        id: `conn_${flowConnections.length + 1}`,
        from: from,
        to: to
    };
    
    flowConnections.push(connection);
    drawConnection(connection);
    onFlowChanged();
    console.log('🔗 Connexion créée (multiple autorisée):', connection);
}

/**
 * Dessin d'une connexion - Version avec sorties dynamiques
 */
function drawConnection(connection) {
    const fromBox = flowBoxes.get(connection.from.boxId);
    const toBox = flowBoxes.get(connection.to.boxId);
    
    if (!fromBox || !toBox) return;
    
    // ✅ Utiliser currentOutputs pour le calcul de position
    const fromSpacing = fromBox.width / (fromBox.currentOutputs + 1);
    const fromX = fromBox.x + fromSpacing * (connection.from.index + 1);
    const fromY = fromBox.y + fromBox.height;
    
    const toX = toBox.x + toBox.width / 2;
    const toY = toBox.y ;
    const useDefaultStyle = isDefaultOutput(fromBox, connection.from.index);
    const lineColor = useDefaultStyle ? '#1f3f8a' : '#666';
    const markerId = useDefaultStyle ? 'arrowhead-default' : 'arrowhead';
      // Créer un groupe pour la connexion (ligne + texte)
    const connectionGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    connectionGroup.setAttribute('class', 'connection-group');
    connectionGroup.setAttribute('data-connection-id', connection.id);

    // Créer la ligne SVG
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', fromX);
    line.setAttribute('y1', fromY);
    line.setAttribute('x2', toX);
    line.setAttribute('y2', toY);
    line.setAttribute('stroke', lineColor);
    line.setAttribute('stroke-width', '2');
    line.setAttribute('marker-end', `url(#${markerId})`);
    line.setAttribute('class', 'connection-line');
    line.setAttribute('data-connection-id', connection.id);
    
    const conditionText = getConditionText(fromBox, connection.from.index);
    if (conditionText) {
        // Calculer le point médian de la ligne avec décallage si plusieurs connexions
        const textSpacing = (toY - fromY) / (fromBox.currentOutputs + 1);
        const midX = (fromX + toX) / 2;
        const midY = fromY  + textSpacing * (connection.from.index + 1);

        // Créer un rectangle de fond pour le texte
        const textBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        textBg.setAttribute('class', 'connection-text-bg');
        textBg.setAttribute('fill', 'white');
        textBg.setAttribute('rx', '3');
        textBg.setAttribute('ry', '3');

        // Créer le texte
        const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textElement.setAttribute('class', 'connection-text');
        textElement.setAttribute('x', midX);
        textElement.setAttribute('y', midY);
        textElement.setAttribute('font-size', '11');
        textElement.setAttribute('font-family', 'Arial, sans-serif');
        textElement.setAttribute('fill', '#333');
        textElement.setAttribute('text-anchor', 'middle');
        textElement.setAttribute('dominant-baseline', 'middle');
        textElement.textContent = conditionText;

        // Calculer la taille du texte et ajuster le rectangle de fond
        const textBBox = textElement.getBBox();
        const padding = 4;
        textBg.setAttribute('x', midX - textBBox.width/2 - padding);
        textBg.setAttribute('y', midY - textBBox.height/2 - padding);
        textBg.setAttribute('width', textBBox.width + 2*padding);
        textBg.setAttribute('height', textBBox.height + 2*padding);
        
        // Assembler les éléments
        connectionGroup.appendChild(line);
        connectionGroup.appendChild(textBg);
        connectionGroup.appendChild(textElement);
    } else {
        // Pas de texte, juste la ligne
        connectionGroup.appendChild(line);
    }

    // Événement pour supprimer la connexion
    connectionGroup.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (confirm(i18nFlow('tab.flow.confirm.delete_connection', 'Supprimer cette connexion ?'))) {
            deleteConnection(connection.id);
        }
    });

    // Ajouter au groupe des connexions
    const connectionsGroup = document.getElementById('connectionsGroup');
    connectionsGroup.appendChild(connectionGroup);
}


/**
 * Raccourcissement du texte de condition si trop long
 */
function isDefaultOutput(box, outputIndex) {
    const condition = box?.outputConditions?.[outputIndex];
    return Boolean(condition && condition.isDefault);
}

function getConditionText(box, outputIndex) {
    const condition = box.outputConditions[outputIndex];
    if (!condition) return null;
    
    if (condition.column && condition.value) {
        const fullText = `${condition.column} = "${condition.value}"`;
        
        // Raccourcir si trop long (plus de 20 caracteres)
        if (fullText.length > 20) {
            const shortValue = condition.value.length > 8 ? 
                condition.value.substring(0, 8) + '...' : 
                condition.value;
            return `${condition.column} = "${shortValue}"`;
        }
        
        return fullText;
    }

    if (condition.isDefault) {
        return `Sortie ${outputIndex + 1}`;
    }
    
    return null;
}

function getFlowStepIconClass(type) {
    return (BOX_TYPES[type] && BOX_TYPES[type].icon) ? BOX_TYPES[type].icon : 'fa-circle';
}

function hasFlowBranchContext(branchIndex) {
    return branchIndex !== undefined && branchIndex !== null && branchIndex !== '';
}

function buildFlowBranchContext(branchIndex) {
    return hasFlowBranchContext(branchIndex) ? `branch_${branchIndex}` : '';
}

function buildFlowInstanceId(baseId, branchIndex) {
    const context = buildFlowBranchContext(branchIndex);
    return context ? `${baseId}_${context}` : baseId;
}

function extractBoxIdsFromBoxXmlList(boxesXML, includeNormalizedAliases = false) {
    if (!boxesXML || !boxesXML.length) return [];
    const ids = [];
    boxesXML.forEach(boxXml => {
        const idMatch = boxXml.match(/id=\"([^\"]+)\"/);
        if (idMatch && idMatch[1]) {
            const rawId = idMatch[1];
            ids.push(rawId);
            if (includeNormalizedAliases) {
                let candidate = rawId;
                while (candidate.includes('_')) {
                    candidate = candidate.substring(0, candidate.lastIndexOf('_'));
                    ids.push(candidate);
                }
            }
        }
    });
    return Array.from(new Set(ids));
}

/**
 * Sélection d'une boîte
 */
function selectBox(boxId) {
    // Désélectionner la boîte précédente
    deselectBox();
    
    selectedBox = boxId;
    
    // Mettre en surbrillance la boîte sélectionnée
    const boxElement = document.getElementById(boxId);
    if (boxElement) {
        const rect = boxElement.querySelector('.box-rect');
        rect.setAttribute('stroke', '#ff6b6b');
        rect.setAttribute('stroke-width', '3');
    }
    
    // Afficher le panneau de configuration
    showBoxConfigPanel(boxId);

    const box = flowBoxes.get(boxId);
    if (box && box.type === 'start' && box.dataTable) {
        updateVisualsCountSelector();
    }
}

/**
 * Affichage du panneau de configuration - Version avec gestion du panneau d'aide
 */
function showBoxConfigPanel(boxId) {
    const box = flowBoxes.get(boxId);
    if (!box) return;
    
    const configPanel = document.getElementById('boxConfigPanel');
    const helpPanel = document.getElementById('helpPanel');
    const content = document.getElementById('boxConfigContent');
    
    // Masquer le panneau d'aide
    if (helpPanel) {
        helpPanel.style.display = 'none';
    }
    
    // Afficher un loading pendant la génération
    content.innerHTML = `<div class="text-center"><i class="fa fa-spinner fa-spin"></i> ${i18nFlow('tab.flow.loading.config', 'Chargement...')}</div>`;
    configPanel.style.display = 'block';
    
    try {
        const configHTML = generateBoxConfigHTML(box);
        content.innerHTML = configHTML;
    } catch (error) {
        console.error('Erreur lors de la génération de la configuration:', error);
        content.innerHTML = `<div class="alert alert-danger">${i18nFlow('tab.flow.error.config_load', 'Erreur lors du chargement')}</div>`;
    }
}

/**
 * Désélection de boîte - Version avec gestion du panneau d'aide
 */
function deselectBox() {
    if (selectedBox) {
        const boxElement = document.getElementById(selectedBox);
        if (boxElement) {
            const rect = boxElement.querySelector('.box-rect');
            rect.setAttribute('stroke', '#333');
            rect.setAttribute('stroke-width', '2');
        }
        selectedBox = null;
    }
    
    // Masquer le panneau de configuration
    const configPanel = document.getElementById('boxConfigPanel');
    const helpPanel = document.getElementById('helpPanel');
    
    if (configPanel) {
        configPanel.style.display = 'none';
    }
    
    // Afficher le panneau d'aide
    if (helpPanel) {
        helpPanel.style.display = 'block';
    }
}

/**
 * Génération du HTML de configuration - Version avec sorties dynamiques
 */
function generateBoxConfigHTML(box) {
    const config = BOX_TYPES[box.type];
    
    let html = `<h5 class="box-config-title"><i class="fa ${config.icon}"></i><input type="text" class="form-control box-title-input"
                         id="boxDisplayName" 
                         onchange="updateBoxDisplayName('${box.id}', this.value)"
                         value="${box.displayName}"></h5>`;
    //Ajout d'un champ description
    html += `
        <div class="form-group">
            <label>${i18nFlow('tab.flow.config.step_description_label', "Description de l'etape (pour les tests) :")}</label>
            <textarea class="form-control" id="boxDescription" rows="3" 
                      placeholder="${box.description}"
                      onchange="updateBoxDescription('${box.id}', this.value)">${box.description || ''}</textarea>
            <small class="text-muted">${i18nFlow('tab.flow.config.step_description_help', 'Cette description apparaitra dans les rapports de validation')}</small>
        </div>
        <hr>
    `;
    if (box.type === 'error') {
        html += `
            <div class="form-group">
                <label>${i18nFlow('tab.flow.config.error_text_label', "Texte d'erreur :")}</label>
                <textarea class="form-control" id="boxErrorText" rows="4" 
                          placeholder="${i18nFlow('tab.flow.config.error_text_placeholder', "Saisissez le message d'erreur a afficher...")}"
                          onchange="updateBoxErrorText('${box.id}', this.value)">${box.errorText || ''}</textarea>
                <small class="text-muted">${i18nFlow('tab.flow.config.error_text_help', "Ce texte sera affiche dans les parcours qui aboutissent a cette boite d'erreur")}</small>
            </div>
            
            <div class="form-group">
                <label>${i18nFlow('tab.flow.config.preview', 'Apercu :')}</label>
                <div class="well well-sm">
                    <strong>${i18nFlow('tab.flow.config.error_message_label', "Message d'erreur :")}</strong>
                    <div id="errorTextPreview" class="text-danger">
                        ${box.errorText || i18nFlow('tab.flow.config.no_text_defined', 'Aucun texte defini')}
                    </div>
                </div>
            </div>
        `;
    } else {        
        html += `
            <div class="form-group">
                <label>${i18nFlow('tab.flow.config.datatable', 'DataTable :')}</label>
                <select class="form-control" id="boxDataTable" onchange="updateBoxDataTable('${box.id}', this.value)">
                    <option value="">${i18nFlow('tab.flow.config.select_datatable', 'Selectionner une DataTable...')}</option>
                    ${dataTablesCache.map(dt => 
                        `<option value="${dt.id}" ${dt.id === box.dataTable ? 'selected' : ''}>${dt.name}</option>`
                    ).join('')}
                </select>
            </div>
        `;
        
        if (box.dataTable) {
            const columns = getDataTableColumns(box.dataTable);
            
            html += `
                <div class="form-group">
                    <label>${i18nFlow('tab.flow.config.display_column', "Colonne d'affichage :")}</label>
                    <select class="form-control" id="boxDisplayColumn" onchange="updateBoxDisplayColumn('${box.id}', this.value)">
                        <option value="">${i18nFlow('tab.flow.config.select_column', 'Selectionner une colonne...')}</option>
                        ${columns.map(col => 
                            `<option value="${col}" ${col === box.displayColumn ? 'selected' : ''}>${getColumnTitle(box.dataTable,col)}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
            
            if (config.maxOutputs > 0) {
                html += `
                    <div class="outputs-management">
                        <div class="row">
                            <div class="col-md-8">
                                <h5><i class="fa fa-right-from-bracket"></i> ${i18nFlow('tab.flow.config.outputs', 'Sorties')} (${box.currentOutputs}/${config.maxOutputs})</h5>
                                <!--<small class="text-muted">Min:${config.minOutputs},Max:${config.maxOutputs}</small>-->
                            </div>
                            <div class="col-md-4 text-right">
                                <button type="button" class="btn btn-xs btn-success" 
                                        onclick="addOutput('${box.id}')"
                                        ${box.currentOutputs >= config.maxOutputs ? 'disabled' : ''}>
                                    <i class="fa fa-plus"></i>
                                </button>
                            </div>
                        </div>
                `;
                
                for (let i = 0; i < box.currentOutputs; i++) {
                    html += generateOutputConfigHTML(box, i, columns);
                }
                html += `</div>
                    </div>
                    <hr>`;
            }
        }
        // Section de gestion des tâches
        if (config.supportsTasks !== false) {
            html += generateTasksConfigSection(box);
        }
    }
    html += `
        <hr>
        <button class="btn btn-danger btn-sm" onclick="deleteBox('${box.id}')">
            <i class="fa fa-trash"></i> ${i18nFlow('tab.flow.config.delete_box', 'Supprimer')}
        </button>
    `;
    
    return html;
}

/**
 * Génération des options DataTable
 */
// function generateDataTableOptions(selectedId) {
//     let options = '';
//     dataTablesCache.forEach(dataTable => {
//         const selected = dataTable.id === selectedId ? 'selected' : '';
//         options += `<option value="${dataTable.id}" ${selected}>${dataTable.name}</option>`;
//     });
//     return options;
// }

/**
 * Génération du HTML pour une sortie spécifique
 */
function generateOutputConfigHTML(box, outputIndex, columns) {
    const condition = box.outputConditions[outputIndex] || { column: null, value: null, isDefault: false, targetKeyColumn : null };
    const minOutputs = BOX_TYPES[box.type]?.minOutputs ?? 0;
    const removeDisabled = box.currentOutputs <= minOutputs;
    
    const defaultLabel = condition.isDefault ? `<span class="label label-info">${i18nFlow('tab.flow.output.default', 'Par defaut')}</span>` : '';
    return `
        <div class="output-config" id="output-config-${outputIndex}" style="border: 1px solid #ddd; padding: 10px; margin: 10px 0; border-radius: 5px;">
            <div class="row">
                <div class="col-md-10">
                    <h6>${i18nFlow('tab.flow.output.output', 'Sortie')} ${outputIndex + 1} ${defaultLabel}</h6>
                </div>
                <div class="col-md-2 text-right">
                    <button type="button" class="btn btn-xs btn-danger output-remove-btn"
                            onclick="removeOutputAt('${box.id}', ${outputIndex})"
                            ${removeDisabled ? 'disabled' : ''}
                            title="${i18nFlow('tab.flow.output.delete_this_output', 'Supprimer cette sortie')}">
                        <i class="fa fa-trash"></i>
                    </button>
                </div>
            </div>
            
            <div class="row">
                <div class="col-md-6">
                    <label>${i18nFlow('tab.flow.output.condition_column', 'Colonne de condition :')}</label>
                    <select class="form-control output-condition-column" 
                            data-output="${outputIndex}" data-box="${box.id}"
                            onchange="updateOutputCondition('${box.id}', ${outputIndex}, 'column', this.value)">
                        <option value="">${i18nFlow('tab.flow.output.no_condition_default', 'Aucune condition (defaut)')}</option>
                        ${columns.map(col => 
                            `<option value="${col}" ${condition.column === col ? 'selected' : ''}>${getColumnTitle(box.dataTable, col)}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="col-md-6">
                    <label>${i18nFlow('tab.flow.output.target_key', 'Cle cible :')}</label>
                    <select class="form-control output-condition-keyValue"
                            data-output="${outputIndex}" data-box="${box.id}"
                            onchange="updateOutputCondition('${box.id}', ${outputIndex}, 'targetKeyColumn', this.value)">
                        <option value="">${i18nFlow('tab.flow.output.select_key_column', 'Selectionner une colonne cle...')}</option>
                        ${columns.map(col => 
                            `<option value="${col}" ${condition.targetKeyColumn === col ? 'selected' : ''}>${getColumnTitle(box.dataTable, col)}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="col-md-6">
                    <label>${i18nFlow('tab.flow.output.expected_value', 'Valeur attendue :')}</label>
                    <input type="text" class="form-control output-condition-value" 
                           data-output="${outputIndex}" data-box="${box.id}"
                           value="${condition.value || ''}" 
                           placeholder="${i18nFlow('tab.flow.output.value_to_test', 'Valeur a tester')}"
                           onchange="updateOutputCondition('${box.id}', ${outputIndex}, 'value', this.value)"
                           ${!condition.column ? 'disabled' : ''}>
                </div>
            </div>
            
            <div class="row" style="margin-top: 10px;">
                <div class="col-md-12">
                    <label>
                        <input type="checkbox" 
                               onchange="updateOutputCondition('${box.id}', ${outputIndex}, 'isDefault', this.checked)"
                               ${condition.isDefault ? 'checked' : ''}>
                        ${i18nFlow('tab.flow.output.use_default_output', 'Utiliser comme sortie par defaut')}
                    </label>
                    <small class="text-muted block">${i18nFlow('tab.flow.output.default_help', "Si aucune autre condition n'est remplie, utiliser cette sortie")}</small>
                </div>
            </div>
        </div>
    `;
}

/**
 * Ajout d'une sortie à une boîte
 */
function addOutput(boxId) {
    const box = flowBoxes.get(boxId);
    const config = BOX_TYPES[box.type];
    
    if (!box || box.currentOutputs >= config.maxOutputs) {
        console.warn('Impossible d\'ajouter une sortie:', box ? 'Maximum atteint' : 'Boîte introuvable');
        return;
    }
    
    // Ajouter une nouvelle sortie
    const newOutputIndex = box.currentOutputs;
    box.currentOutputs++;
    
    // Initialiser la condition pour la nouvelle sortie
    box.outputConditions[newOutputIndex] = {
        column: null,
        value: null,
        isDefault: false,
        targetKeyColumn: null
    };
    
    // Recréer l'élément SVG
    recreateBoxSVG(boxId);
    
    // Rafraîchir le panneau de configuration
    showBoxConfigPanel(boxId);
    
    console.log(`➕ Sortie ajoutée à la boîte ${boxId}. Total: ${box.currentOutputs}`);
}

/**
 * Suppression d'une sortie d'une boîte
 */
function removeOutput(boxId) {
    const box = flowBoxes.get(boxId);
    if (!box) return;
    removeOutputAt(boxId, box.currentOutputs - 1);
}

/**
 * Suppression d'une sortie spécifique d'une boîte
 */
function removeOutputAt(boxId, outputIndex) {
    const box = flowBoxes.get(boxId);
    const config = BOX_TYPES[box.type];
    
    if (!box || box.currentOutputs <= config.minOutputs) {
        console.warn('Impossible de supprimer une sortie:', box ? 'Minimum atteint' : 'Boîte introuvable');
        return;
    }

    if (outputIndex < 0 || outputIndex >= box.currentOutputs) {
        console.warn('Index de sortie invalide:', outputIndex);
        return;
    }

    // Supprimer les connexions de la sortie supprimée
    const connectionsToRemove = flowConnections.filter(conn => 
        conn.from.boxId === boxId && conn.from.index === outputIndex
    );
    
    connectionsToRemove.forEach(conn => {
        deleteConnection(conn.id);
    });

    // Décaler les index de connexions des sorties restantes
    flowConnections.forEach(conn => {
        if (conn.from.boxId === boxId && conn.from.index > outputIndex) {
            conn.from.index -= 1;
        }
    });

    // Recréer la map des conditions en décalant les index
    const rebuiltConditions = {};
    for (let i = 0; i < box.currentOutputs; i++) {
        if (i === outputIndex) continue;
        const nextIndex = i > outputIndex ? i - 1 : i;
        rebuiltConditions[nextIndex] = box.outputConditions[i] || {
            column: null,
            value: null,
            isDefault: false,
            targetKeyColumn: null
        };
    }

    // Supprimer la sortie sélectionnée
    box.currentOutputs--;
    box.outputConditions = rebuiltConditions;
    
    // Recréer l'élément SVG
    recreateBoxSVG(boxId);
    onFlowChanged();
    // Rafraîchir le panneau de configuration
    showBoxConfigPanel(boxId);
    
    console.log(`Sortie ${outputIndex + 1} supprimée de la boîte ${boxId}. Total: ${box.currentOutputs}`);
}

/**
 * Recréation de l'élément SVG d'une boîte
 */
function recreateBoxSVG(boxId) {
    const box = flowBoxes.get(boxId);
    if (!box) return;
    
    // Supprimer l'ancien élément
    const oldElement = document.getElementById(boxId);
    if (oldElement) {
        oldElement.remove();
    }
    
    // Recréer l'élément SVG
    const config = BOX_TYPES[box.type];
    const boxElement = createBoxSVG(box, config);
    
    // Ajouter au groupe des boîtes
    const boxesGroup = document.getElementById('boxesGroup');
    boxesGroup.appendChild(boxElement);
    
    // Mettre à jour toutes les connexions liées à cette boîte
    updateAllConnectionsForBox(boxId);
    
    // Remettre en surbrillance si c'était la boîte sélectionnée
    if (selectedBox === boxId) {
        const rect = boxElement.querySelector('.box-rect');
        rect.setAttribute('stroke', '#ff6b6b');
        rect.setAttribute('stroke-width', '3');
    }
    saveCurrentFlowToCookie();
}

/**
 * Mise à jour de toutes les connexions pour une boîte - Version avec texte
 */
function updateAllConnectionsForBox(boxId) {
    const relatedConnections = flowConnections.filter(conn => 
        conn.from.boxId === boxId || conn.to.boxId === boxId
    );
    
    relatedConnections.forEach(connection => {
        const connectionElement = document.querySelector(`[data-connection-id="${connection.id}"]`);
        if (connectionElement) {
            updateConnectionLine(connection, connectionElement);
        } else {
            // Si l'élément n'existe pas, le redessiner
            drawConnection(connection);
        }
    });
}

/**
 * Fonctions de mise à jour de configuration
 */
function updateBoxDataTable(boxId, dataTableId) {
    const box = flowBoxes.get(boxId);
    if (!box) return;
    
    box.dataTable = dataTableId;
    box.displayColumn = null;
    box.outputColumns = {};
    
    updateBoxVisual(boxId);
    showBoxConfigPanel(boxId); // Rafraîchir le panneau
}

/**
 * Mise à jour du texte d'erreur
 */
function updateBoxErrorText(boxId, text) {
    const box = flowBoxes.get(boxId);
    if (!box || box.type !== 'error') return;
    
    box.errorText = text;
    
    // Mettre à jour l'aperçu en temps réel
    const preview = document.getElementById('errorTextPreview');
    if (preview) {
        preview.textContent = text || i18nFlow('tab.flow.config.no_text_defined', 'Aucun texte defini');
    }
    
    // Mettre à jour la visualisation de la boîte
    updateBoxVisual(boxId);
    
    console.log(`Texte d'erreur mis à jour pour ${boxId}:`, text);
}

function updateBoxDisplayColumn(boxId, column) {
    const box = flowBoxes.get(boxId);
    if (!box) return;
    
    box.displayColumn = column;
    updateBoxVisual(boxId);
}

// function updateBoxOutputColumn(boxId, outputIndex, column) {
//     const box = flowBoxes.get(boxId);
//     if (!box) return;
    
//     box.outputColumns[outputIndex] = column;
// }

/**
 * Mise à jour de la description d'une boîte
 */
function updateBoxDescription(boxId, description) {
    const box = flowBoxes.get(boxId);
    if (!box) return;
    
    box.description = description;
    
    // Mettre à jour la visualisation de la boîte si nécessaire
    updateBoxVisual(boxId);
    
    console.log(`Description mise à jour pour ${boxId}:`, description);
}

/**
 * Mise à jour de la description d'une boîte
 */
function updateBoxDisplayName(boxId, displayName) {
    const box = flowBoxes.get(boxId);
    if (!box) return;
    
    box.displayName = displayName;
    
    // Mettre à jour la visualisation de la boîte si nécessaire
    recreateBoxSVG(boxId);
    
    console.log(`displayName mise à jour pour ${boxId}:`, displayName);
}

/**
 * Mise à jour visuelle d'une boîte - Version avec support Erreur
 */
function updateBoxVisual(boxId) {
    const box = flowBoxes.get(boxId);
    const boxElement = document.getElementById(boxId);
    
    if (!box || !boxElement) return;
    
    // Mettre à jour le texte de la DataTable
    const dataTableText = boxElement.querySelector('.datatable-text');
    if (dataTableText) {
        if (box.type === 'error') {
            dataTableText.textContent = 'Message d\'erreur';
        } else {
            dataTableText.textContent = box.dataTable ? getDataTableNameById(box.dataTable) : 'Non configuré';
        }
    }
    
    // Mettre à jour le texte de la colonne/erreur
    const columnText = boxElement.querySelector('.column-text');
    if (columnText) {
        if (box.type === 'error') {
            // Afficher le texte d'erreur (tronqué si trop long)
            const errorText = box.errorText || 'Non défini';
            columnText.textContent = errorText.length > 15 ? errorText.substring(0, 15) + '...' : errorText;
        } else {
            columnText.textContent = box.displayColumn || '';
        }
    }
}


/**
 * Configuration des événements de connexion
 */
function setupConnectionEvents() {
    const svg = document.getElementById('flowSvg');
    
    // Événements pour le dessin de connexions temporaires
    svg.addEventListener('mousemove', handleConnectionMouseMove);
    svg.addEventListener('mouseup', handleConnectionMouseUp);
    
    // Événement pour annuler les connexions avec Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && isConnecting) {
            cancelConnection();
        }
    });
}

/**
 * Gestion du mouvement de souris pour les connexions temporaires
 */
function handleConnectionMouseMove(e) {
    if (!isConnecting || !connectionStart) return;
    
    const pointer = getCanvasPointerPosition(e);
    const mouseX = pointer.x;
    const mouseY = pointer.y;
    
    // Supprimer la ligne temporaire précédente
    if (tempLine) {
        tempLine.remove();
        tempLine = null;
    }
    
    // Calculer la position de départ
    const fromBox = flowBoxes.get(connectionStart.boxId);
    if (!fromBox) return;
    
    const fromSpacing = fromBox.width / (fromBox.currentOutputs + 1);
    const fromX = fromBox.x + fromSpacing * (connectionStart.index + 1);
    const fromY = fromBox.y + fromBox.height;
    
    tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tempLine.setAttribute('x1', fromX);
    tempLine.setAttribute('y1', fromY);
    tempLine.setAttribute('x2', mouseX);
    tempLine.setAttribute('y2', mouseY);
    tempLine.setAttribute('stroke', '#ff6b6b');
    tempLine.setAttribute('stroke-width', '2');
    tempLine.setAttribute('stroke-dasharray', '5,5');
    tempLine.setAttribute('class', 'temp-connection-line');
    
    const connectionsGroup = document.getElementById('connectionsGroup');
    connectionsGroup.appendChild(tempLine);
}

/**
 * Gestion du relâchement de souris pour les connexions
 */
function handleConnectionMouseUp(e) {
    if (!isConnecting) return;
    
    // Nettoyer la ligne temporaire
    if (tempLine) {
        tempLine.remove();
        tempLine = null;
    }
    
    // Si on n'a pas cliqué sur un point d'entrée, annuler la connexion
    if (!e.target.classList.contains('connection-point')) {
        cancelConnection();
    }
}

/**
 * Annulation d'une connexion en cours
 */
function cancelConnection() {
    isConnecting = false;
    connectionStart = null;
    
    if (tempLine) {
        tempLine.remove();
        tempLine = null;
    }
    
    // Réinitialiser les styles des points de connexion
    document.querySelectorAll('.connection-point').forEach(point => {
        point.style.fill = '#fff';
    });
    
    console.log('Connexion annulée');
}

/**
 * Suppression d'une connexion - Version mise à jour
 */
function deleteConnection(connectionId) {
    // Supprimer de la liste des connexions
    const connectionIndex = flowConnections.findIndex(conn => conn.id === connectionId);
    if (connectionIndex !== -1) {
        flowConnections.splice(connectionIndex, 1);
    }
    
    // Supprimer le groupe complet (ligne + texte)
    const connectionElement = document.querySelector(`[data-connection-id="${connectionId}"]`);
    if (connectionElement) {
        connectionElement.remove();
    }
    
    console.log('Connexion supprimée:', connectionId);
}

/**
 * Mise à jour des connexions lors du déplacement des boîtes
 */
function updateConnectionsForBox(boxId) {
    // Trouver toutes les connexions liées à cette boîte
    const relatedConnections = flowConnections.filter(conn => 
        conn.from.boxId === boxId || conn.to.boxId === boxId
    );
    
    // Redessiner ces connexions
    relatedConnections.forEach(connection => {
        const lineElement = document.querySelector(`[data-connection-id="${connection.id}"]`);
        if (lineElement) {
            updateConnectionLine(connection, lineElement);
        }
    });
}

/**
 * Mise à jour d'une ligne de connexion - Version avec texte
 */
function updateConnectionLine(connection, connectionElement) {
    const fromBox = flowBoxes.get(connection.from.boxId);
    const toBox = flowBoxes.get(connection.to.boxId);

    if (!fromBox || !toBox) return;
    
    // Calculer les nouvelles positions
    const fromSpacing = fromBox.width / (fromBox.currentOutputs + 1);
    const fromX = fromBox.x + fromSpacing * (connection.from.index + 1);
    const fromY = fromBox.y + fromBox.height ;
    
    const toX = toBox.x + toBox.width / 2;
    const toY = toBox.y ;
    
    // Mettre à jour le path (pour le textPath)
    const path = connectionElement.querySelector('path');
    if (path) {
        path.setAttribute('d', `M${fromX},${fromY} L${toX},${toY}`);
    }
    
    // Mettre à jour la ligne visible
    const line = connectionElement.querySelector('.connection-line');
    if (line) {
        const useDefaultStyle = isDefaultOutput(fromBox, connection.from.index);
        line.setAttribute('x1', fromX);
        line.setAttribute('y1', fromY);
        line.setAttribute('x2', toX);
        line.setAttribute('y2', toY);
        line.setAttribute('stroke', useDefaultStyle ? '#1f3f8a' : '#666');
        line.setAttribute('marker-end', useDefaultStyle ? 'url(#arrowhead-default)' : 'url(#arrowhead)');
    }
    
    updateConnectionText(connection, connectionElement);
}

/**
 * Mise à jour du texte de connexion
 */
function updateConnectionText(connection, connectionElement) {
    const fromBox = flowBoxes.get(connection.from.boxId);
    if (!fromBox) return;
    
    const newConditionText = getConditionText(fromBox, connection.from.index);
    const textElements = connectionElement.querySelectorAll('.connection-text textPath, .connection-text-bg textPath');
    
    if (newConditionText) {
        textElements.forEach(textPath => {
            textPath.textContent = newConditionText;
        });
        
        // Si le texte n'existait pas avant, redessiner la connexion
        if (textElements.length === 0) {
            redrawConnection(connection.id);
        }
    } else {
        // Supprimer le texte s'il n'y a plus de condition
        const textElementsToRemove = connectionElement.querySelectorAll('.connection-text, .connection-text-bg');
        textElementsToRemove.forEach(el => el.remove());
    }
}

/**
 * Redessin complet d'une connexion
 */
function redrawConnection(connectionId) {
    
    const connection = flowConnections.find(conn => conn.id === connectionId);
    if (!connection) return;
    
    // Supprimer l'ancienne connexion
    const oldElement = document.querySelector(`[data-connection-id="${connectionId}"]`);
    if (oldElement) {
        oldElement.remove();
    }
    
    // Redessiner
    drawConnection(connection);
}


/**
 * Mise à jour des conditions de sortie
 */
function updateOutputCondition(boxId, outputIndex, property, value) {
    const box = flowBoxes.get(boxId);
    if (!box) return;
    
    // Initialiser la condition si elle n'existe pas
    if (!box.outputConditions[outputIndex]) {
        box.outputConditions[outputIndex] = { column: null, value: null, isDefault: false };
    }
    
    const condition = box.outputConditions[outputIndex];
    
    // Mettre à jour la propriété
    if (property === 'column') {
        condition.column = value || null;
        // Si on vide la colonne, vider aussi la valeur
        if (!value) {
            condition.value = null;
        }
    } else if (property === 'value') {
        condition.value = value || null;
    } else if (property === 'targetKeyColumn') {
        condition.targetKeyColumn = value || null;
    } else if (property === 'isDefault') {
        // Si on marque comme défaut, démarquer les autres
        if (value) {
            Object.keys(box.outputConditions).forEach(key => {
                if (parseInt(key) !== outputIndex) {
                    box.outputConditions[key].isDefault = false;
                }
            });
        }
        condition.isDefault = value;
    }
    
    const affectedConnections = flowConnections.filter(conn => 
        conn.from.boxId === boxId && conn.from.index === outputIndex
    );
    
    affectedConnections.forEach(connection => {
        redrawConnection(connection.id);
    });

    onFlowChanged();
    console.log(`Condition mise à jour pour ${boxId} sortie ${outputIndex}:`, condition);
    
    // Rafraîchir l'affichage
    showBoxConfigPanel(boxId);
}

/**
 * Comptage des connexions pour une sortie spécifique
 */
function getConnectionsCountForOutput(boxId, outputIndex) {
    return flowConnections.filter(conn => 
        conn.from.boxId === boxId && conn.from.index === outputIndex
    ).length;
}

/**
 * Validation des connexions
 */
// function validateConnections() {
//     const errors = [];
    
//     // Vérifier que chaque boîte (sauf End) a au moins une sortie connectée
//     for (let box of flowBoxes.values()) {
//         if (box.type !== 'end') {
//             const config = BOX_TYPES[box.type];
//             const connectedOutputs = flowConnections.filter(conn => conn.from.boxId === box.id);
            
//             if (connectedOutputs.length === 0) {
//                 errors.push(`La boîte ${box.type} (${box.id}) n'a aucune sortie connectée`);
//             }
//         }
//     }
    
//     // Vérifier que chaque boîte (sauf Start) a une entrée connectée
//     for (let box of flowBoxes.values()) {
//         if (box.type !== 'start') {
//             const connectedInputs = flowConnections.filter(conn => conn.to.boxId === box.id);
            
//             if (connectedInputs.length === 0) {
//                 errors.push(`La boîte ${box.type} (${box.id}) n'a aucune entrée connectée`);
//             }
//         }
//     }
    
//     // Vérifier qu'il n'y a pas de cycles
//     if (hasCircularDependency()) {
//         errors.push('Le flux contient des références circulaires');
//     }
    
//     return errors;
// }

/**
 * Détection de dépendances circulaires
 */
function hasCircularDependency() {
    const visited = new Set();
    const recursionStack = new Set();
    
    function dfs(boxId) {
        if (recursionStack.has(boxId)) {
            return true; // Cycle détecté
        }
        
        if (visited.has(boxId)) {
            return false;
        }
        
        visited.add(boxId);
        recursionStack.add(boxId);
        
        // Visiter tous les successeurs
        const outgoingConnections = flowConnections.filter(conn => conn.from.boxId === boxId);
        for (let connection of outgoingConnections) {
            if (dfs(connection.to.boxId)) {
                return true;
            }
        }
        
        recursionStack.delete(boxId);
        return false;
    }
    
    // Tester à partir de chaque boîte non visitée
    for (let boxId of flowBoxes.keys()) {
        if (!visited.has(boxId)) {
            if (dfs(boxId)) {
                return true;
            }
        }
    }
    
    return false;
}

/**
 * Fonction pour démarrer le drag d'une boîte
 */
function startDragBox(e, boxId) {
    e.preventDefault();
    
    const box = flowBoxes.get(boxId);
    if (!box) return;
    
    const startPointer = getCanvasPointerPosition(e);
    const startX = startPointer.x - box.x;
    const startY = startPointer.y - box.y;
    
    let isDragging = false;
    
    function handleMouseMove(e) {
        if (!isDragging) {
            isDragging = true;
        }
        
        const pointer = getCanvasPointerPosition(e);
        const newX = pointer.x - startX;
        const newY = pointer.y - startY;
        
        // Contraindre dans les limites du canvas
        box.x = Math.max(0, newX);
        box.y = Math.max(0, newY);
        
        // Mettre à jour la position visuelle
        const boxElement = document.getElementById(boxId);
        if (boxElement) {
            boxElement.setAttribute('transform', `translate(${box.x}, ${box.y})`);
        }
        
        // Mettre à jour les connexions
        updateConnectionsForBox(boxId);
        updateFlowCanvasSize();
    }
    
    function handleMouseUp() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        
        if (isDragging) {
            console.log(`Boîte ${boxId} déplacée à (${box.x}, ${box.y})`);
            onFlowChanged();
        }
    }
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

/**
 * Suppression d'une boîte et de ses connexions
 */
function deleteBox(boxId) {
    if (!confirm(i18nFlow('tab.flow.confirm.delete_box', 'Etes-vous sur de vouloir supprimer cette boite ?'))) {
        return;
    }
    
    // Supprimer toutes les connexions liées à cette boîte
    const connectionsToDelete = flowConnections.filter(conn => 
        conn.from.boxId === boxId || conn.to.boxId === boxId
    );
    
    connectionsToDelete.forEach(conn => {
        deleteConnection(conn.id);
    });
    
    // Supprimer la boîte de la map
    flowBoxes.delete(boxId);
    
    // Supprimer l'élément SVG
    const boxElement = document.getElementById(boxId);
    if (boxElement) {
        boxElement.remove();
    }
    
    // Fermer le panneau de configuration si cette boîte était sélectionnée
    if (selectedBox === boxId) {
        deselectBox();
    }

    updateFlowCanvasSize();
    onFlowChanged();
    console.log('Boîte supprimée:', boxId);
}

/**
 * Nettoyage du canvas
 */
function clearCanvas(show) {
    if(show){
        if (!confirm(i18nFlow('tab.flow.confirm.clear_canvas', 'Etes-vous sur de vouloir vider completement le canvas ?'))) {
            return;
        }
    }
    
    // Supprimer toutes les boîtes
    flowBoxes.clear();
    
    // Supprimer toutes les connexions
    flowConnections.length = 0;
    
    // Vider les groupes SVG
    document.getElementById('boxesGroup').innerHTML = '';
    document.getElementById('connectionsGroup').innerHTML = '';
    
    // Fermer le panneau de configuration
    //deselectBox();
    
    // Réinitialiser les variables
    selectedBox = null;
    isConnecting = false;
    connectionStart = null;
    nextBoxId = 1;
    updateFlowCanvasSize();
    
    console.log('Canvas vidé');
}

/**
 * Vérification de l'existence d'un type de boîte
 */
function hasBoxOfType(type) {
    for (let box of flowBoxes.values()) {
        if (box.type === type) {
            return true;
        }
    }
    return false;
}

/**
 * Validation du flux - Version étendue pour les conditions
 */
function validateFlow(show) {
    const errors = [];
    
    // Validations existantes...
    if (!hasBoxOfType('start')) {
        errors.push(i18nFlow('tab.flow.validation.error_missing_start', 'Le flux doit contenir au moins une boite Start'));
    }
    
    if (!hasBoxOfType('end')) {
        errors.push(i18nFlow('tab.flow.validation.error_missing_end', 'Le flux doit contenir au moins une boite End'));
    }
    
    // Validation des boîtes
    for (let box of flowBoxes.values()) {
        const config = BOX_TYPES[box.type];
        
        if (box.type === 'error') {
            continue;
        }

        // Validation commune pour toutes les boîtes (sauf error)
        if (!box.dataTable) {
            errors.push(i18nFlow('tab.flow.validation.error_no_datatable', "La boite {type} ({id}) n'a pas de DataTable assignee", { type: box.type, id: box.id }));
            continue;
        }
        
        if (!box.displayColumn && box.dataTable) {
            errors.push(i18nFlow('tab.flow.validation.error_no_display_column', "La boite {type} ({id}) n'a pas de colonne d'affichage", { type: box.type, id: box.id }));
        }

        // Validation spécifique pour le composant Message
        if (box.type === 'message') {
            const connectedOutputs = flowConnections.filter(conn => conn.from.boxId === box.id);
            if (connectedOutputs.length === 0) {
                errors.push(i18nFlow('tab.flow.validation.error_message_no_output', 'Le composant Message ({id}) doit avoir une sortie connectee', { id: box.id }));
            }
            if (connectedOutputs.length > 1) {
                errors.push(i18nFlow('tab.flow.validation.error_message_too_many_outputs', "Le composant Message ({id}) ne peut avoir qu'une seule sortie", { id: box.id }));
            }
        }
        
        // Validation spécifique pour le composant Calendar
        if (box.type === 'calendar') {
            const connectedOutputs = flowConnections.filter(conn => conn.from.boxId === box.id);
            if (connectedOutputs.length !== 3) {
                errors.push(i18nFlow('tab.flow.validation.error_calendar_output_count', 'Le composant Calendar ({id}) doit avoir exactement 3 sorties connectees (Open, Closed, Vacation)', { id: box.id }));
            }
            // Vérifier que les sorties sont dans le bon ordre
            const outputIndices = connectedOutputs.map(conn => conn.from.index);
            if (!outputIndices.includes(0) || !outputIndices.includes(1) || !outputIndices.includes(2)) {
                errors.push(i18nFlow('tab.flow.validation.error_calendar_missing_states', 'Le composant Calendar ({id}) doit avoir des connexions pour chaque etat (Open, Closed, Vacation)', { id: box.id }));
            }
        }
        
        // Valider les conditions de sortie pour les autres types
        if (config.outputs > 0 && box.type !== 'calendar') {
            let hasDefault = false;
            let hasConditions = false;
            
            for (let i = 0; i < box.currentOutputs; i++) {
                const condition = box.outputConditions[i];
                const connectionsForOutput = flowConnections.filter(conn => 
                    conn.from.boxId === box.id && conn.from.index === i
                );
                
                if (connectionsForOutput.length > 0) {
                    if (condition.isDefault) {
                        hasDefault = true;
                    }
                    if (condition.column && condition.value) {
                        hasConditions = true;
                    }
                    if (condition.column && !condition.value && !condition.isDefault) {
                        errors.push(i18nFlow('tab.flow.validation.error_output_missing_value', 'La sortie {output} de la boite {type} ({id}) a une colonne mais pas de valeur definie', {
                            output: i + 1, type: box.type, id: box.id
                        }));
                    }
                }
            }
            
            // Vérifier qu'il y a au moins une condition ou une sortie par défaut
            if (!hasDefault && !hasConditions && box.type !== 'end') {
                errors.push(i18nFlow('tab.flow.validation.error_missing_condition_or_default', 'La boite {type} ({id}) doit avoir au moins une condition ou une sortie par defaut', {
                    type: box.type, id: box.id
                }));
            }
        }
    }
    
    if (errors.length > 0) {
        alert(i18nFlow('tab.flow.validation.errors_prefix', 'Erreurs de validation :\n') + errors.join('\n'));
        return false;
    }
    
    if(show) {
        alert(i18nFlow('tab.flow.validation.flow_valid', 'Flux valide !'));
    }
    return true;
}

/**
 * Génération des visuels - Version asynchrone pour gérer les menus
 */
function escapeXmlAttributeValue(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function setFlowXmlDiagramName(flowXml, diagramName, index) {
    if (!flowXml) return flowXml;

    const fallbackName = 'Flow Path';
    const rawName = String(diagramName || '').trim();
    const safeName = escapeXmlAttributeValue(rawName || fallbackName);

    if (/<diagram\b[^>]*\bname\s*=/i.test(flowXml)) {
        flowXml = flowXml.replace(
            /(<diagram\b[^>]*\bname\s*=\s*")[^"]*(")/i,
            `$1${safeName}$2`
        );
    }else if (/<diagram\b/i.test(flowXml)) {
        flowXml = flowXml.replace(
            /<diagram\b([^>]*)>/i,
            `<diagram name="${safeName}"$1>`
        );
    }

    if (/<diagram\b[^>]*\bname\s*=/i.test(flowXml)) {
        flowXml = flowXml.replace(
            /(<diagram\b[^>]*\bid\s*=\s*")[^"]*(")/i,
            `$1flow-${index}$2`
        );
    }

    return flowXml;
}

function generateFlowVisuals() {
    if (!validateFlow(false)) {
        return;
    }
    clearGeneratedVisuals();
    console.log('Génération des visuels avec limitation...');
    
    // Trouver la boîte Start
    const startBox = Array.from(flowBoxes.values()).find(box => box.type === 'start');
    if (!startBox) {
        alert(i18nFlow('tab.flow.validation.no_start', 'Aucune boite Start trouvee'));
        return;
    }
    
    toggleVisualsSection(true);
    toggleGeneratingVisuals();
    const visualsContainer = document.getElementById('generatedVisualsSection')
    visualsContainer.style.display = 'block';
    
    // Récupérer le nombre de visuels à générer
    const visualsCountSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('visualsCount'));
    const selectedCount = visualsCountSelect ? visualsCountSelect.value : '1';

    // Récupérer les données de la DataTable Start
    getDataTableRowsWithCache(startBox.dataTable)
        .then(rows => {
            console.log(`📊 ${rows.length} lignes disponibles dans la DataTable Start`);
            const limitedRows = getLimitedRows(rows, selectedCount);
            console.log(`🎯 Génération de ${limitedRows.length} visuel(s) sur ${rows.length} disponible(s)`);

            generateVisualsHeader(selectedCount, rows.length, new Date().toLocaleString());

            // Générer tous les visuels de façon asynchrone
            const visualPromises = limitedRows.map((row, index) => 
                generateConditionalFlowPath(row, startBox)
                    .then(flowPath => {
                        const flowPathWithNamedDiagram = {
                            ...flowPath,
                            xml: setFlowXmlDiagramName(flowPath?.xml, row?.key, index)
                        };
                        return ({
                        key: row.key,
                        index,
                        flowPath: flowPathWithNamedDiagram,
                        row
                    });
                    })
            );
            
            return Promise.all(visualPromises);
        })
        .then(visualData => {
            // Sauvegarder les données brutes
            saveGeneratedVisualsToStorage(visualData);

            // Générer le HTML pour chaque visuel
            const visualElements = visualData.map(data => 
                generateVisualElement(data.flowPath, data.row, data.index, data)
            );

            //Ajouter les visuels au conteneur
            const container = document.getElementById('generatedVisualsContent');
            visualElements.forEach(element => {
                container.appendChild(element);
            });

            // Mettre à jour les statistiques de validation dans l'en-tÃªte
            updateVisualsHeaderStats(visualData);
            
            toggleGeneratingVisuals(false);
            toggleVisualsSection(true);
            console.log(`✅ ${visualElements.length} visuels générés avec gestion des menus`);
        })
        .catch(error => {
            console.error('❌ Erreur lors de la génération:', error);
            visualsContainer.innerHTML = `
                <div class="alert alert-danger">
                    <h4>${i18nFlow('tab.flow.error.generating_visuals', 'Erreur lors de la generation des visuels')}</h4>
                    <p>${error.message}</p>
                </div>
            `;
        });
}

/**
 * Génération du parcours conditionnel - Version avec gestion complète des boîtes Menu
 */
function generateConditionalFlowPath(row, currentBox, keyValue, visitedBoxes = new Set(), depth = 0, branchIndex = 0, validator = new FlowPathValidator(), layoutCalculatorInstance = new DrawioLayoutCalculator()) {
    // Prévenir les boucles infinies
    if (depth > 10 || visitedBoxes.has(currentBox.id)) {
        return Promise.resolve({
            html: `<span class="flow-step error">${i18nFlow('tab.flow.path.loop_detected_html', '⚠️ Boucle detectee')}</span>`,
            details: [i18nFlow('tab.flow.path.loop_detected_detail', 'Boucle detectee dans le parcours')],
            xml: generateMxGraphModelWrapper([], []),
            validator: validator,
            validationGroups: []
        });
    }

    visitedBoxes.add(currentBox.id);
    const branchContext = buildFlowBranchContext(branchIndex);
    const currentBoxInstanceId = buildFlowInstanceId(currentBox.id, branchIndex);
    const position = layoutCalculatorInstance.calculatePosition(currentBoxInstanceId, depth, branchIndex);
    //console.log(`DEBUG generateConditionalFlowPath currentBox = `, currentBox);
    //console.log(`DEBUG currentBox KeyValue = `, keyValue);
    //console.log(`DEBUG currentRow = `, row);
    

    // Gestion spéciale pour les boîtes d'erreur
    if (currentBox.type === 'error') {
        const errorText = currentBox.errorText || i18nFlow('tab.flow.path.undefined_error', 'Erreur non definie');
        const boxXML = generateBoxXML(currentBox, position, i18nFlow('tab.flow.path.error_label', 'Erreur'), branchContext);
        return Promise.resolve({
            html: `<div class="flow-step error">
                ${i18nFlow('tab.flow.path.error_prefix', '❌ ERREUR:')} ${errorText}
            </div>`,
            details: [`${i18nFlow('tab.flow.path.error_detail_prefix', 'Erreur:')} ${errorText}`],
            xml: generateMxGraphModelWrapper([boxXML], []),
            validator: validator,
            validationGroups: []
            });
    }

    if (keyValue === null) {
        keyValue = row.key;
    }

    // Pour les autres types, récupérer les données de la DataTable
    return getDataTableRowsWithCache(currentBox.dataTable)
        .then(dataTableRows => {
            const currentRowData = dataTableRows.find(r => r.key === keyValue) || row;
            //console.log(`DEBUG currentRowData = `, currentRowData);	
            
            currentBox.data = currentRowData;

            const stepDisplayText = currentBox.displayColumn
                ? `${getColumnTitle(currentBox.dataTable,currentBox.displayColumn)}: ${currentRowData[currentBox.displayColumn] || 'N/A'}`
                : currentBox.type;
            let html = `<div class="flow-step ${currentBox.type}">
                <i class="fa ${getFlowStepIconClass(currentBox.type)} flow-step-icon"></i>
                <span class="flow-step-text">${stepDisplayText}</span>
            `;

            let details = [`${currentBox.type}: ${currentRowData[currentBox.displayColumn] || currentBox.displayName}`];
            const label = getColumnTitle(currentBox.dataTable,currentBox.displayColumn) + '/' + currentRowData[currentBox.displayColumn] 
            const currentBoxXML = generateBoxXML(currentBox, position, label, branchContext);
            const currentBoxXmlId = extractFirstBoxId(currentBoxXML) || currentBoxInstanceId;
            validator.addBox(currentBox, {
                instanceId: currentBoxXmlId,
                xmlId: currentBoxXmlId,
                xmlIds: [currentBoxXmlId],
                logicalId: currentBox.id,
                branchIndex: branchIndex,
                branchContext: branchContext
            });
            let allXMLBoxes = [currentBoxXML];
            let allConnections = [];
            
            let task = generateStepTasks(currentBox, currentRowData);
            if (task) {
                task.id = currentBoxXmlId;
                task.logicalId = currentBox.id;
                task.instanceId = currentBoxXmlId;
                task.xmlId = currentBoxXmlId;
                task.xmlIds = [currentBoxXmlId, currentBox.id];
            }
            validator.addTask(task);

            // Si c'est une boîte End, arrêter ici
            if (currentBox.type === 'end') {
                html += `</div>`
                return { html, details, xml: generateMxGraphModelWrapper(allXMLBoxes, allConnections), validator: validator, validationGroups: [] };
            }

            // Gestion spéciale pour le composant Message
            if (currentBox.type === 'message') {
                html +=`${BOX_TYPES[currentBox.type].promptCheck ? 
                        `<br><small class="prompt-status">${checkPromptExistence(currentRowData[currentBox.displayColumn]) ? '✅ Prompt trouvé' : '❌ Prompt manquant'}</small>` 
                        : ''}
                </div>`;
                details = [`Message: ${currentRowData[currentBox.displayColumn] || 'Non configuré'}`];
            }
            // Gestion spéciale pour le composant Calendar
            else if (currentBox.type === 'calendar') {
                const calendarStatus = checkCalendarStatus(currentRowData[currentBox.displayColumn]);
                html += `<br><small class="calendar-status">${calendarStatus}</small>
                </div>`;
                details = [`Calendrier: ${currentRowData[currentBox.displayColumn] || 'Non configuré'} (${calendarStatus})`];
            }
            else {
                html += `</div>`;
            }
            
            // Gestion spéciale pour les boîtes Menu
            if (currentBox.type === 'menu') {
                return generateMenuFlowPaths(row, currentBox, currentRowData, visitedBoxes, depth, branchIndex, validator, layoutCalculatorInstance)
                    .then(menuResult => {
                        html += menuResult.html;
                        details = details.concat(menuResult.details);
                        allXMLBoxes = allXMLBoxes.concat(menuResult.boxes);
                        allConnections = allConnections.concat(menuResult.connections);
                        
                        return {
                            html,
                            details,
                            xml: generateMxGraphModelWrapper(allXMLBoxes, allConnections),
                            validator: validator,
                            validationGroups: menuResult.validationGroups || []
                        };
                    });
            }
            // Gestion spéciale pour Calendar avec ses 3 sorties fixes
            else if (currentBox.type === 'calendar') {
                const outgoingConnections = flowConnections.filter(conn => conn.from.boxId === currentBox.id);
                const outputPromises = outgoingConnections.map((conn, idx) => {
                    const targetBox = flowBoxes.get(conn.to.boxId);
                    if (!targetBox) return null;
                    
                    return generateConditionalFlowPath(
                        row, 
                        targetBox, 
                        keyValue,
                        new Set(visitedBoxes), 
                        depth + 1, 
                        idx,
                        validator,
                        layoutCalculatorInstance
                    ).then(result => {
                        const currentXmlId = currentBoxXmlId;
                        const targetXmlId = buildFlowInstanceId(targetBox.id, idx);
                        const connXML = generateConnectionXML(currentXmlId, targetXmlId, `conn_${currentXmlId}_to_${targetXmlId}`, BOX_TYPES[currentBox.type].outputLabels[idx]);
                        return {
                            output: BOX_TYPES[currentBox.type].outputLabels[idx],
                            result: result,
                            connection: connXML
                        };
                    });
                });

                return Promise.all(outputPromises.filter(p => p !== null))
                    .then(results => {
                        results.forEach(r => {
                            html += `<div class="calendar-branch">${r.output}: ${r.result.html}</div>`;
                            details = details.concat(r.result.details);
                            allXMLBoxes = allXMLBoxes.concat(r.result.xml.boxes || []);
                            allConnections.push(r.connection);
                        });

                        return {
                            html,
                            details,
                            xml: generateMxGraphModelWrapper(allXMLBoxes, allConnections),
                            validator: validator,
                            validationGroups: results.flatMap(r => r.result.validationGroups || [])
                        };
                    });
            }
            else {
                // Gestion normale pour les autres types
                const nextBox = findNextBoxWithConditions(currentBox, currentRowData);
                //console.log('DEBUG NEXT BOX INFO : ',nextBox);
                
                if (nextBox.box) {
                    html += ' <i class="fa fa-arrow-right"></i> ';
                    details.push(`Condition: ${nextBox.condition} sur la clé : ${nextBox.keyValue}`);
                    
                    return generateConditionalFlowPath(row, nextBox.box,nextBox.keyValue, new Set(visitedBoxes), depth + 1, branchIndex, validator, layoutCalculatorInstance)
                        .then(nextPath => {
                            html += nextPath.html;
                            details = details.concat(nextPath.details);
                            const nextData = extractBoxesAndConnectionsFromXML(nextPath.xml);
                            allXMLBoxes = allXMLBoxes.concat(nextData.boxes);
                            allConnections = allConnections.concat(nextData.connections);
                            const nextBoxXmlId = buildFlowInstanceId(nextBox.box.id, branchIndex);
                            const connectionXML = generateConnectionXML(
                                currentBoxXmlId, 
                                nextBoxXmlId, 
                                `conn_${currentBoxXmlId}_to_${nextBoxXmlId}`
                            );
                            //    const uniqueId = context ? `${box.id}_${context}` : box.id;
                            allConnections.push(connectionXML);
                            return {
                                html,
                                details,
                                xml: generateMxGraphModelWrapper(allXMLBoxes,allConnections),
                                validator: validator,
                                validationGroups: nextPath.validationGroups || []
                            };

                        });
                } else {
                    html += ` <span class="flow-step error">${i18nFlow('tab.flow.path.no_output_found_html', '❌ Aucune sortie trouvee')}</span>`;
                    details.push(`${i18nFlow('tab.flow.path.error_detail_prefix', 'Erreur:')} ${nextBox.reason}`);
                    return {
                        html,
                        details,
                        xml: generateMxGraphModelWrapper(allXMLBoxes,allConnections),
                        validator: validator,
                        validationGroups: []
                    };
                }
            }
        })
        .catch(error => {
            console.error('Erreur lors de la génération du parcours:', error);
            return {
                html: `<span class="flow-step error">${i18nFlow('tab.flow.path.data_error_html', '❌ Erreur de donnees')}</span>`,
                details: [i18nFlow('tab.flow.path.data_fetch_error', 'Erreur lors de la recuperation des donnees')],
                xml: generateMxGraphModelWrapper([],[]),
                validator: validator,
                validationGroups: []
            };
        });
}

/**
 * Génération de tous les parcours possibles pour une boîte Menu
 */
function generateMenuFlowPaths(row, menuBox, currentRowData, visitedBoxes, depth, menuBranchIndex, validator, layoutCalculatorInstance) {
    const outgoingConnections = flowConnections.filter(conn => conn.from.boxId === menuBox.id);
    
    if (outgoingConnections.length === 0) {
        return Promise.resolve({
            html: ` <span class="flow-step error">${i18nFlow('tab.flow.path.no_outgoing_connection_html', '❌ Aucune connexion sortante')}</span>`,
            details: [i18nFlow('tab.flow.path.no_outgoing_connection_detail', 'Erreur: Aucune connexion sortante du menu')],
            boxes: [],
            connections: [],
            validationGroups: []
        });
    }
    
    // Grouper les connexions par index de sortie
    const connectionsByOutput = {};
    outgoingConnections.forEach(conn => {
        if (!connectionsByOutput[conn.from.index]) {
            connectionsByOutput[conn.from.index] = [];
        }
        connectionsByOutput[conn.from.index].push(conn);
    });
    
    // Traiter chaque sortie
    const outputPromises = [];
    
    Object.keys(connectionsByOutput).forEach((outputIndex, branchIdx) => {
        const connections = connectionsByOutput[outputIndex];
        const condition = menuBox.outputConditions[outputIndex];
        
        const columnValue = currentRowData[condition.column];
        if ((columnValue && columnValue.toString() === condition.value && currentRowData[condition.targetKeyColumn]) || condition.isDefault) {
                outputPromises.push(
                    generateMenuOutputPath(row, menuBox, currentRowData, connections, condition,currentRowData[condition.targetKeyColumn], outputIndex, visitedBoxes, depth, branchIdx,validator, layoutCalculatorInstance)
                );
            }
    });
    
    return Promise.all(outputPromises)
        .then(outputResults => {
            // Déterminer quelle sortie sera effectivement prise
            //const takenOutputIndex = determineTakenOutput(menuBox, currentRowData);
            
            let html = '<div class="menu-branches">';
            let details = [];
            let allBoxes = [];
            let allConnections = [];
            let validationGroups = [];
            
            outputResults.forEach((outputResult, index) => {
                //console.log(`DEBUG generateMenuFlowPaths currentMenuBranche = `, outputResult.label);
    
                const outputIndex = outputResult.outputIndex;
                //const isTaken = (parseInt(outputIndex) === takenOutputIndex);
                //<div class="menu-branch ${isTaken ? 'taken' : 'not-taken'}">
                //${isTaken ? '<span class="branch-status taken">✓ PRIS</span>' : '<span class="branch-status not-taken">○ Non pris</span>'}
                html += `
                    <div class="menu-branch taken">
                        <div class="branch-header">
                            <span class="branch-label">${outputResult.label}</span>
                        </div>
                        <div class="branch-content">
                            ${outputResult.html}
                        </div>
                    </div>
                `;
                
                details.push(`Sortie ${parseInt(outputIndex) + 1}: ${outputResult.label} `);
                details = details.concat(outputResult.details.map(d => `  └─ ${d}`));
                validationGroups = validationGroups.concat(outputResult.validationGroups || []);

                allBoxes = allBoxes.concat(outputResult.boxes);
                allConnections = allConnections.concat(outputResult.connections);

                const branchBoxIds = outputResult.branchBoxIds || [];
                if (branchBoxIds.length > 0) {
                    validationGroups.push({
                        menuBoxId: menuBox.id,
                        menuLabel: menuBox.displayName || BOX_TYPES[menuBox.type].name,
                        branchLabel: outputResult.label,
                        boxIds: branchBoxIds
                    });
                }

                if (outputResult.boxes.length > 0) {
                    const firstBoxId = extractFirstBoxId(outputResult.boxes[0]);
                    if (firstBoxId) {
                        const menuXmlId = buildFlowInstanceId(menuBox.id, menuBranchIndex);
                        const menuConnectionXML = generateConnectionXML(
                            menuXmlId,
                            firstBoxId,
                            `conn_${menuXmlId}_${outputIndex}_${firstBoxId}`
                        );
                        allConnections.push(menuConnectionXML);
                    }
                }
            });
            
            html += '</div>';
            
            return {
                html,
                details,
                boxes: allBoxes,
                connections: allConnections,
                validationGroups: validationGroups
            };
        });
}


/**
 * Génération du parcours pour une sortie spécifique d'une boîte Menu - Version avec XML
 */
function generateMenuOutputPath(row, menuBox, currentRowData, connections, condition,targetKeyColumn, outputIndex, visitedBoxes, depth, branchIndex,validator, layoutCalculatorInstance) {
    const connection = connections[0];
    const targetBox = flowBoxes.get(connection.to.boxId);
    //console.log(`DEBUG generateMenuOutputPath Menu =: `, outputIndex);
    
    if (!targetBox) {
        return Promise.resolve({
            label: `${i18nFlow('tab.flow.output.output', 'Sortie')} ${parseInt(outputIndex) + 1}`,
            html: `<span class="flow-step error">${i18nFlow('tab.flow.path.target_box_not_found_html', '❌ Boite cible introuvable')}</span>`,
            details: [i18nFlow('tab.flow.path.target_box_not_found_detail', 'Erreur: Boite cible introuvable')],
            boxes: [],
            connections: [],
            branchBoxIds: [],
            validationGroups: [],
            outputIndex: parseInt(outputIndex)
        });
    }
    
    // Déterminer le label de la sortie
    let label = `Sortie ${parseInt(outputIndex) + 1}`;
    if (condition) {
        if (condition.isDefault) {
            label += ' (Par défaut)';
        } else if (condition.column && condition.value) {
            label += ` (${condition.column} = "${condition.value}")`;
        }
    }
    
    // Générer le parcours pour cette branche
    return generateConditionalFlowPath(row, targetBox,targetKeyColumn, new Set(visitedBoxes), depth + 1, branchIndex, validator, layoutCalculatorInstance)
        .then(branchPath => {
            const branchData = extractBoxesAndConnectionsFromXML(branchPath.xml);
            return {
                label: label,
                html: ' <i class="fa fa-arrow-right"></i> ' + branchPath.html,
                details: branchPath.details,
                boxes: branchData.boxes,
                connections: branchData.connections,
                branchBoxIds: extractBoxIdsFromBoxXmlList(branchData.boxes),
                validator: validator,
                validationGroups: branchPath.validationGroups || [],
                outputIndex: parseInt(outputIndex)
            };
        });
}

/**
 * Vérifie le statut d'un calendrier
 */
function checkCalendarStatus(calendarId) {
    if (!calendarId) return 'Non configuré';
    
    // On pourrait ajouter ici une logique plus complexe pour vérifier
    // l'état actuel du calendrier (ouvert/fermé/vacances)
    // Pour l'instant on retourne un statut par défaut
    return 'Ouvert';
}

/**
 * Génération du XML pour une connexion
 */
// function generateConnectionXML(fromBox, toBox, position, label) {
//     return `<mxCell id="edge_${fromBox.id}_${toBox.id}" value="${label || ''}" 
//             style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=1;exitY=0.5;entryX=0;entryY=0.5;jettySize=auto;orthogonalLoop=1;" 
//             edge="1" parent="1" source="${fromBox.id}" target="${toBox.id}">
//         <mxGeometry relative="1" as="geometry"/>
//     </mxCell>`;
// }

function checkPromptExistence(promptId) {
    // Vérifie si le promptId existe dans le cache des prompts
    return promptsCache.some(prompt => prompt.name === promptId || prompt.id === promptId);
}

/**
 * Détermination de quelle sortie sera effectivement prise
 */
function determineTakenOutput(menuBox, currentRowData) {
    const boxConfig = BOX_TYPES[menuBox.type];
    
    // Tester chaque sortie avec ses conditions
    for (let outputIndex = 0; outputIndex < menuBox.currentOutputs; outputIndex++) {
        const condition = menuBox.outputConditions[outputIndex];
        
        if (!condition) continue;
        
        // Si pas de condition mais marquée comme défaut
        if (!condition.column && condition.isDefault) {
            continue; // On garde cette sortie pour la fin
        }
        
        // Tester la condition
        if (condition.column && condition.value) {
            const columnValue = currentRowData[condition.column];
            if (columnValue && columnValue.toString() === condition.value) {
                return outputIndex;
            }
        }
    }
    
    // Si aucune condition n'est remplie, chercher la sortie par défaut
    for (let outputIndex = 0; outputIndex < menuBox.currentOutputs; outputIndex++) {
        const condition = menuBox.outputConditions[outputIndex];
        if (condition && condition.isDefault) {
            return outputIndex;
        }
    }
    
    return -1; // Aucune sortie trouvée
}


/**
 * Recherche de la prochaine boîte selon les conditions
 */
function findNextBoxWithConditions(currentBox, rowData) {
    const boxConfig = BOX_TYPES[currentBox.type];
    
    // Récupérer toutes les connexions sortantes de cette boîte
    const outgoingConnections = flowConnections.filter(conn => conn.from.boxId === currentBox.id);
    
    if (outgoingConnections.length === 0) {
        return { box: null, reason: 'Aucune connexion sortante', condition: null };
    }
    
    // Tester chaque sortie avec ses conditions
    for (let outputIndex = 0; outputIndex < currentBox.currentOutputs; outputIndex++) {
        const condition = currentBox.outputConditions[outputIndex];
        const connectionsForOutput = outgoingConnections.filter(conn => conn.from.index === outputIndex);
        
        if (connectionsForOutput.length === 0) continue;
        
        // Si pas de condition ou condition par défaut, on utilisera cette sortie en dernier recours
        if (!condition.column) {
            if (condition.isDefault) {
                const targetBox = flowBoxes.get(connectionsForOutput[0].to.boxId);
                return { 
                    box: targetBox, 
                    condition: 'Sortie par défaut',
                    keyValue: rowData[condition.targetKeyColumn],
                    reason: null 
                };
            }
            continue;
        }
        
        // Tester la condition
        const columnValue = rowData[condition.column];
        if (columnValue && columnValue.toString() === condition.value) {
            const targetBox = flowBoxes.get(connectionsForOutput[0].to.boxId);
            return { 
                box: targetBox, 
                condition: `${condition.column} = "${condition.value}"`,
                keyValue: rowData[condition.targetKeyColumn],
                reason: null 
            };
        }
    }
    
    // Si aucune condition n'est remplie, chercher la sortie par défaut
    for (let outputIndex = 0; outputIndex < boxConfig.outputs; outputIndex++) {
        const condition = currentBox.outputConditions[outputIndex];
        const connectionsForOutput = outgoingConnections.filter(conn => conn.from.index === outputIndex);
        
        if (connectionsForOutput.length > 0 && condition.isDefault) {
            const targetBox = flowBoxes.get(connectionsForOutput[0].to.boxId);
            return { 
                box: targetBox, 
                condition: 'Sortie par défaut (aucune condition remplie)',
                reason: null 
            };
        }
    }
    
    return { 
        box: null, 
        reason: 'Aucune condition remplie et aucune sortie par défaut définie',
        condition: null 
    };
}

// Fonction utilitaire pour mettre à jour les compteurs
function updateValidatorCounters(validator, oldStatus, newStatus) {
    if (oldStatus === 'ok') validator.okCount--;
    else if (oldStatus === 'ko') validator.koCount--;
    else if (oldStatus === 'untested') validator.untestedCount--;

    if (newStatus === 'ok') validator.okCount++;
    else if (newStatus === 'ko') validator.koCount++;
    else if (newStatus === 'untested') validator.untestedCount++;
}

// Fonction pour mettre à jour l'UI du rapport de validation
function updateValidationReportUI(testCase, validator) {
    const validationReport = testCase.closest('.validation-report');
    if (validationReport) {
        const progressBar = validationReport.querySelector('.progress');
        const summary = validationReport.querySelector('.status-summary');
        
        if (progressBar && summary) {
            // Mettre à jour les barres de progression
            const total = validator.total;
            progressBar.querySelector('.progress-bar-success').style.width = `${(validator.okCount/total)*100}%`;
            progressBar.querySelector('.progress-bar-danger').style.width = `${(validator.koCount/total)*100}%`;
            progressBar.querySelector('.progress-bar-warning').style.width = `${(validator.untestedCount/total)*100}%`;

            // Mettre à jour les badges
            summary.querySelector('.badge-success').textContent = `${validator.okCount} ${i18nFlow('tab.flow.validation.ok', 'Reussis')}`;
            summary.querySelector('.badge-danger').textContent = `${validator.koCount} ${i18nFlow('tab.flow.validation.ko', 'Echoues')}`;
            summary.querySelector('.badge-warning').textContent = `${validator.untestedCount} ${i18nFlow('tab.flow.validation.untested', 'Non testes')}`;
            summary.querySelector('.badge-info').textContent = `${validator.progress}% ${i18nFlow('tab.flow.validation.completed', 'Complete')}`;
        }
    }
}
/**
 * Mise à jour des données de validation dans le storage
 */
function updateStoredValidation(boxId, updates,visualIndex) {
    try {
        const storedData = JSON.parse(localStorage.getItem('generatedVisuals'));
        if (!storedData) return;

        if (storedData && storedData.visuals[visualIndex]) {
        const visual = storedData.visuals[visualIndex];

            const boxInPath = visual.flowPath.validator.boxes.find(b =>
                b.id === boxId ||
                b.instanceId === boxId ||
                b.xmlId === boxId ||
                b.logicalId === boxId
            );
            if (boxInPath) {
                // Mettre à jour les données de test
                if (!boxInPath.testConfig) {
                    boxInPath.testConfig = {};
                }
                Object.assign(boxInPath.testConfig, updates);

                // Recalculer les compteurs
                visual.flowPath.validator.okCount = visual.flowPath.validator.boxes.filter(b => b.testConfig?.status === 'ok').length;
                visual.flowPath.validator.koCount = visual.flowPath.validator.boxes.filter(b => b.testConfig?.status === 'ko').length;
                visual.flowPath.validator.untestedCount = visual.flowPath.validator.boxes.filter(b => !b.testConfig?.status || b.testConfig.status === 'untested').length;
            }
        }

        // Sauvegarder les modifications
        localStorage.setItem('generatedVisuals', JSON.stringify(storedData));
        console.log('Données de validation mises à jour pour la box:', boxId);
    } catch (error) {
        console.error('Erreur lors de la mise à jour de la validation:', error);
    }
}


/**
 * Obtenir le label du statut
 */
function getStatusLabel(status) {
    const labels = {
        'untested': i18nFlow('tab.flow.validation.untested', 'Non teste'),
        'ok': i18nFlow('tab.flow.validation.ok', 'Reussi'),
        'ko': i18nFlow('tab.flow.validation.ko', 'Echec')
    };
    return labels[status] || status;
}

/**
 * Calcul des statistiques globales de validation
 */
function calculateGlobalValidationStats(visualData) {
    const stats = {
        total: 0,
        ok: 0,
        ko: 0,
        untested: 0,
        progress: 0,
        flows: visualData.length
    };

    visualData.forEach(data => {
        const validator = data.flowPath.validator;
        stats.total += validator.total;
        stats.ok += validator.okCount;
        stats.ko += validator.koCount;
        stats.untested += validator.untestedCount;
    });
    stats.progress = stats.total > 0 ? Math.round(((stats.ok + stats.ko) / stats.total) * 100) : 0;
    return stats;
}

/**
 * Mise à jour de l'en-tête avec les statistiques globales
 */
function updateVisualsHeaderStats(visualData) {
    const stats = calculateGlobalValidationStats(visualData);
    const validationSummary = document.querySelector('.validation-summary');
    if (validationSummary) {
        validationSummary.innerHTML = generateValidationSummaryHTML(stats);
    }
}


function saveCurrentFlowToCookie() {
    const flowData = {
        boxes: Array.from(flowBoxes.values()),
        connections: flowConnections
    };
    const flowDataJson = encodeURIComponent(JSON.stringify(flowData));
    const expirationDate = new Date();
    expirationDate.setTime(expirationDate.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 an
    
    //document.cookie = `flowData=${flowDataJson}; expires=${expirationDate.toUTCString()}; path=/`;
    localStorage.setItem('flowData', JSON.stringify(flowData));

    console.log('📥 Flow Sauvegardé dans les cookies :', flowData);
}


function loadFlowFromCookie() {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.split('=').map(c => c.trim());
        if (name === 'flowData') {
            try {
                //const flowData = JSON.parse(decodeURIComponent(value));
                const flowData = JSON.parse(localStorage.getItem('flowData'));
                processFlowDataImport(flowData);
                console.log('📥 Flow importé depuis les cookies :', flowData);
            } catch (e) {
                console.warn("Erreur lors du chargement du flux depuis le cookie :", e);
            }
        }
    }
}

/**
 * Export du flux
 */
function exportFlow() {
    const flowData = {
        timestamp: new Date().toISOString(),
        boxes: Array.from(flowBoxes.values()),
        connections: flowConnections
    };
    
    const dataStr = JSON.stringify(flowData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `datatables-flow-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    console.log('📤 Flux exporté');
}

/**
 * Import de flux
 */
function importFlow() {
    console.log('Import du flux');
    $('#importFlowModal').modal('show');
}

/**
 * Traitement de l'import de flow
 */
function processFlowImport() {
    const fileInput = document.getElementById('flowImportFile');
    const file = fileInput.files[0];
    
    if (!file) {
        alert(i18nFlow('tab.flow.import.select_file', 'Veuillez selectionner un fichier'));
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const flowData = JSON.parse(e.target.result);
            
            if (!flowData.boxes || !flowData.connections) {
                throw new Error(i18nFlow('tab.flow.import.invalid_file_format', 'Format de fichier invalide'));
            }
            // Vider le canvas actuel
            clearCanvas(true);
            processFlowDataImport(flowData);
            onFlowChanged();
        } catch (error) {
            console.error('❌ Erreur lors de l\'import:', error);
            alert(i18nFlow('tab.flow.import.error_prefix', "Erreur lors de l'import : ") + error.message);
        }
    };
    
    reader.readAsText(file);
}

function processFlowDataImport(flowData){
    // Importer les boîtes
    flowData.boxes.forEach(boxData => {
        // Recréer chaque boîte
        const box = {
            ...boxData,
            id: `box_${nextBoxId++}` // Nouveau ID pour éviter les conflits
        };
        
        flowBoxes.set(box.id, box);
        
        const boxConfig = BOX_TYPES[box.type];
        const boxElement = createBoxSVG(box, boxConfig);
        
        const boxesGroup = document.getElementById('boxesGroup');
        boxesGroup.appendChild(boxElement);
    });
    
    // Importer les connexions
    flowData.connections.forEach(connData => {
        // Adapter les IDs des connexions
        const connection = {
            ...connData,
            id: `conn_${flowConnections.length + 1}`
        };
        
        flowConnections.push(connection);
        drawConnection(connection);
    });
    updateFlowCanvasSize();
    
    // ✅ Fermer la modal avec Bootstrap
    $('#importFlowModal').modal('hide');
    
    //alert('✅ Flow importé avec succès !');
    console.log('📥 Flow importé:', flowData);
}

/**
 * Sauvegarde des visuels générés dans le localStorage
 */
function normalizeDrawioXmlCaseForStorage(xmlContent) {
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

function normalizeVisualsXmlForStorage(visualsData) {
    if (!Array.isArray(visualsData)) return [];
    return visualsData.map(item => {
        if (!item || !item.flowPath) return item;
        return {
            ...item,
            flowPath: {
                ...item.flowPath,
                xml: normalizeDrawioXmlCaseForStorage(item.flowPath.xml || '')
            }
        };
    });
}

function saveGeneratedVisualsToStorage(visualsData) {
    try {
        const normalizedVisuals = normalizeVisualsXmlForStorage(visualsData);
        localStorage.setItem('generatedVisuals', JSON.stringify({
            timestamp: new Date().toISOString(),
            visuals: normalizedVisuals
        }));
        console.log('📥 Visuels sauvegardés dans le localStorage');
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des visuels:', error);
    }
}

function clearGeneratedVisualsFromStorage() {
    try {
        localStorage.removeItem('generatedVisuals');
        console.log('📥 Visuels supprimés du localStorage');
    } catch (error) {
        console.error('Erreur lors de la suppression des visuels:', error);
    }
}
/**
 * Restauration des visuels depuis le localStorage
 */
function loadGeneratedVisualsFromStorage() {
    try {
        const savedData = localStorage.getItem('generatedVisuals');
        if (!savedData) return false;
        toggleVisualsSection(true);
            
        const visualsData = JSON.parse(savedData);
        const normalizedVisuals = normalizeVisualsXmlForStorage(visualsData.visuals);
        visualsData.visuals = normalizedVisuals;
        localStorage.setItem('generatedVisuals', JSON.stringify({
            timestamp: visualsData.timestamp || new Date().toISOString(),
            visuals: normalizedVisuals
        }));
        const container = document.getElementById('generatedVisualsContent');
        
        if (container) {
            generateVisualsHeader(visualsData.visuals.length,'',visualsData.timestamp);

            visualsContainer = document.getElementById('generatedVisualsSection')
            visualsContainer.style.display = 'block';
            
            const visualElements = visualsData.visuals.map(data => 
                generateVisualElement(data.flowPath, data.row, data.index)
            );
            
            visualElements.forEach(element => {
                container.appendChild(element);
            });
            
            toggleGeneratingVisuals();
            // Mettre à jour les statistiques de validation dans l'en-tête
            updateVisualsHeaderStats(visualsData.visuals);
            
            console.log('📤 Visuels restaurés depuis le localStorage');
            return true;
        }
    } catch (error) {
        console.error('Erreur lors de la restauration des visuels:', error);
        return false;
    }
}

/**
 * Nettoyage lors du changement d'onglet
 */
// function cleanupOnTabChange() {
//     cleanupConnectionState();
    
//     // Nettoyer les event listeners si nécessaire
//     const svg = document.getElementById('flowSvg');
//     if (svg) {
//         // Cloner et remplacer pour supprimer tous les event listeners
//         const newSvg = svg.cloneNode(true);
//         svg.parentNode.replaceChild(newSvg, svg);
        
//         // Réinitialiser les événements
//         setupConnectionEvents();
//     }
// }

/**
 * Calculateur de positions pour l'export draw.io
 */
class DrawioLayoutCalculator {
    constructor() {
        this.boxWidth = 120;
        this.boxHeight = 80;
        this.horizontalSpacing = 200;
        this.verticalSpacing = 150;
        this.startX = 50;
        this.startY = 50;
        this.usedPositions = new Set();
        this.boxPositions = new Map();
    }
    
    /**
     * Calcul de position pour une boîte dans le parcours
     */
    calculatePosition(boxId, level = 0, branchIndex = 0) {
        const x = this.startX + (level * this.horizontalSpacing);
        const y = this.startY + (branchIndex * this.verticalSpacing);
        
        // Éviter les collisions
        let finalY = y;
        while (this.usedPositions.has(`${x},${finalY}`)) {
            finalY += this.verticalSpacing;
        }
        
        this.usedPositions.add(`${x},${finalY}`);
        this.boxPositions.set(boxId, { x, y: finalY });
        
        return { x, y: finalY };
    }
    
    /**
     * Réinitialiser le calculateur
     */
    reset() {
        this.usedPositions.clear();
        this.boxPositions.clear();
    }
    
    /**
     * Obtenir la position d'une boîte
     */
    getPosition(boxId) {
        return this.boxPositions.get(boxId) || { x: 0, y: 0 };
    }
}


class FlowPathValidator {
    constructor() {
        this.boxes = [];
        this.okCount = 0;
        this.koCount = 0;
        this.untestedCount = 0;
        this.progress = 0;
        this.total = 0;
        this.tasks = [];
    }

    addBox(box, metadata = {}) {
        const snapshot = {
            ...box,
            testConfig: box && box.testConfig ? { ...box.testConfig } : box?.testConfig,
            data: box && box.data && typeof box.data === 'object' ? { ...box.data } : box?.data,
            logicalId: metadata.logicalId || box?.logicalId || box?.id,
            branchIndex: metadata.branchIndex !== undefined ? metadata.branchIndex : (box?.branchIndex ?? null),
            branchContext: metadata.branchContext || box?.branchContext || null
        };

        const resolvedInstanceId = metadata.instanceId || metadata.xmlId || box?.instanceId || box?.xmlId || box?.id;
        snapshot.id = resolvedInstanceId;
        snapshot.instanceId = resolvedInstanceId;
        snapshot.xmlId = metadata.xmlId || resolvedInstanceId;
        const explicitXmlIds = Array.isArray(metadata.xmlIds) ? metadata.xmlIds : [];
        snapshot.xmlIds = Array.from(new Set([
            ...explicitXmlIds,
            snapshot.xmlId,
            snapshot.instanceId,
            snapshot.logicalId
        ].filter(Boolean)));

        this.boxes.push(snapshot);
        this.total++;
        const status = snapshot.testConfig?.status || 'untested';
        switch(status) {
            case 'ok': this.okCount++; break;
            case 'ko': this.koCount++; break;
            default: this.untestedCount++; break;
        }
        this.progress = this.total > 0 ? Math.round(((this.okCount + this.koCount)/this.total)*100) : 0;
    }

    addTask(task) {
        this.tasks.push(task);
    }

    /*get progress() {
        const tested = this.okCount + this.koCount;
        return this.total > 0 ? Math.round((tested / this.total) * 100) : 0;
    }*/
    
}

