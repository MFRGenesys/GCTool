
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
