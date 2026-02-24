/**
 * Export de tous les visuels en PDF (1 visuel par page)
 */
function i18nPdf(key, fallback, params) {
    if (window.GCToolI18n && typeof window.GCToolI18n.t === 'function') {
        return window.GCToolI18n.t(key, params, fallback);
    }
    return fallback;
}

async function exportAllVisualsAsPDF() {
    const visualsContainer = document.getElementById('generatedVisualsContent');
    const visualElements = visualsContainer.querySelectorAll('.generated-visual');
    
    if (visualElements.length === 0) {
        alert(i18nPdf('tab.flow.export_pdf.no_visual', 'No visual to export'));
        return;
    }
    
    // Afficher un indicateur de progression
    showExportProgress(0, visualElements.length);
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        
        // Configuration PDF
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 10;
        const contentWidth = pageWidth - (2 * margin);
        const contentHeight = pageHeight - (2 * margin);
        
        for (let i = 0; i < visualElements.length; i++) {
            const visualElement = visualElements[i];
            
            // Mettre à jour la progression
            showExportProgress(i + 1, visualElements.length);
            
            // Si ce n'est pas la première page, ajouter une nouvelle page
            if (i > 0) {
                doc.addPage();
            }
            
            // Ajouter un en-tête de page
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text(
                i18nPdf('tab.flow.export_pdf.visual_counter', 'Visual {current}/{total}', { current: i + 1, total: visualElements.length }),
                margin,
                margin + 10
            );
            
            // Ajouter la date de génération
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(i18nPdf('tab.flow.export_pdf.generated_on', 'Generated on {date}', { date: new Date().toLocaleString() }), margin, margin + 20);
            
            // Convertir l'élément en image
            const canvas = await html2canvas(visualElement, {
                scale: 2, // Haute résolution
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff'
            });
            
            const imgData = canvas.toDataURL('image/png');
            
            // Calculer les dimensions pour ajuster l'image à la page
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const ratio = Math.min(contentWidth / imgWidth, (contentHeight - 30) / imgHeight);
            
            const finalWidth = imgWidth * ratio;
            const finalHeight = imgHeight * ratio;
            
            // Centrer l'image
            const x = (pageWidth - finalWidth) / 2;
            const y = margin + 30;
            
            // Ajouter l'image au PDF
            doc.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
            
            // Ajouter un petit délai pour éviter de surcharger le navigateur
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Télécharger le PDF
        const filename = `visuels-flux-${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
        
        hideExportProgress();
        console.log(`📄 PDF généré avec ${visualElements.length} page(s)`);
        
    } catch (error) {
        console.error('❌ Erreur lors de la génération du PDF:', error);
        hideExportProgress();
        alert(i18nPdf('tab.flow.export_pdf.error_generation', 'Error while generating PDF'));
    }
}

/**
 * Affichage de la progression d'export
 */
function showExportProgress(current, total) {
    // Créer ou mettre à jour la modal de progression
    let progressModal = document.getElementById('exportProgressModal');
    
    if (!progressModal) {
        progressModal = document.createElement('div');
        progressModal.id = 'exportProgressModal';
        progressModal.className = 'modal fade';
        progressModal.innerHTML = `
            <div class="modal-dialog modal-sm">
                <div class="modal-content">
                    <div class="modal-header">
                        <h4 class="modal-title">
                            <i class="fa fa-file-pdf-o"></i> ${i18nPdf('tab.flow.export_pdf.progress_title', 'PDF export in progress...')}
                        </h4>
                    </div>
                    <div class="modal-body text-center">
                        <div class="progress">
                            <div class="progress-bar progress-bar-success" id="exportProgressBar" 
                                 style="width: 0%"></div>
                        </div>
                        <p id="exportProgressText">${i18nPdf('tab.flow.export_pdf.preparing', 'Preparing...')}</p>
                        <small class="text-muted">${i18nPdf('tab.flow.export_pdf.please_wait', 'Please wait while generating the PDF')}</small>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(progressModal);
    }
    
    // Mettre à jour la progression
    const progressBar = document.getElementById('exportProgressBar');
    const progressText = document.getElementById('exportProgressText');
    
    const percentage = Math.round((current / total) * 100);
    progressBar.style.width = percentage + '%';
    progressText.textContent = i18nPdf('tab.flow.export_pdf.progress', 'Processing visual {current}/{total}', { current, total });
    
    // Afficher la modal
    $(progressModal).modal({
        backdrop: 'static',
        keyboard: false
    });
}

/**
 * Masquer la progression d'export
 */
function hideExportProgress() {
    const progressModal = document.getElementById('exportProgressModal');
    if (progressModal) {
        $(progressModal).modal('hide');
        setTimeout(() => {
            progressModal.remove();
        }, 500);
    }
}

/**
 * Export PDF avec options avancées
 */
function showPDFExportOptions() {
    const optionsModal = `
        <div class="modal fade" id="pdfExportOptionsModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <button type="button" class="close" data-dismiss="modal">&times;</button>
                        <h4 class="modal-title">
                            <i class="fa fa-file-pdf-o"></i> ${i18nPdf('tab.flow.export_pdf.options_title', 'PDF export options')}
                        </h4>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>${i18nPdf('tab.flow.export_pdf.page_format', 'Page format:')}</label>
                            <select class="form-control" id="pdfPageFormat">
                                <option value="a4">A4 (210 x 297 mm)</option>
                                <option value="a3">A3 (297 x 420 mm)</option>
                                <option value="letter">Letter (216 x 279 mm)</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>${i18nPdf('tab.flow.export_pdf.orientation', 'Orientation:')}</label>
                            <select class="form-control" id="pdfOrientation">
                                <option value="portrait">${i18nPdf('tab.flow.export_pdf.orientation_portrait', 'Portrait')}</option>
                                <option value="landscape">${i18nPdf('tab.flow.export_pdf.orientation_landscape', 'Landscape')}</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>${i18nPdf('tab.flow.export_pdf.image_quality', 'Image quality:')}</label>
                            <select class="form-control" id="pdfQuality">
                                <option value="1">${i18nPdf('tab.flow.export_pdf.quality_standard', 'Standard (x1)')}</option>
                                <option value="2" selected>${i18nPdf('tab.flow.export_pdf.quality_high', 'High (x2)')}</option>
                                <option value="3">${i18nPdf('tab.flow.export_pdf.quality_very_high', 'Very high (x3)')}</option>
                            </select>
                        </div>
                        
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" id="pdfIncludeHeader" checked>
                                ${i18nPdf('tab.flow.export_pdf.include_header', 'Include page headers')}
                            </label>
                        </div>
                        
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" id="pdfIncludeFooter">
                                ${i18nPdf('tab.flow.export_pdf.include_footer', 'Include page footers')}
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-default" data-dismiss="modal">${i18nPdf('common.cancel', 'Cancel')}</button>
                        <button type="button" class="btn btn-primary" onclick="exportPDFWithOptions()">
                            <i class="fa fa-download"></i> ${i18nPdf('tab.flow.export_pdf.generate', 'Generate PDF')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Supprimer la modal existante si elle existe
    $('#pdfExportOptionsModal').remove();
    
    // Ajouter et afficher la nouvelle modal
    document.body.insertAdjacentHTML('beforeend', optionsModal);
    $('#pdfExportOptionsModal').modal('show');
}

/**
 * Export PDF avec les options sélectionnées
 */
async function exportPDFWithOptions() {
    const options = {
        format: document.getElementById('pdfPageFormat').value,
        orientation: document.getElementById('pdfOrientation').value,
        quality: parseInt(document.getElementById('pdfQuality').value),
        includeHeader: document.getElementById('pdfIncludeHeader').checked,
        includeFooter: document.getElementById('pdfIncludeFooter').checked
    };
    
    $('#pdfExportOptionsModal').modal('hide');
    
    await exportAllVisualsAsPDFWithOptions(options);
}

/**
 * Export PDF avec options personnalisées
 */
async function exportAllVisualsAsPDFWithOptions(options) {
    const visualsContainer = document.getElementById('generatedVisualsContent');
    const visualElements = visualsContainer.querySelectorAll('.generated-visual');
    
    if (visualElements.length === 0) {
        alert(i18nPdf('tab.flow.export_pdf.no_visual', 'No visual to export'));
        return;
    }
    
    showExportProgress(0, visualElements.length);
    
    try {
        const { jsPDF } = window.jspdf;
        const orientation = options.orientation === 'landscape' ? 'l' : 'p';
        const doc = new jsPDF(orientation, 'mm', options.format);
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        const headerHeight = options.includeHeader ? 25 : 0;
        const footerHeight = options.includeFooter ? 15 : 0;
        const contentHeight = pageHeight - (2 * margin) - headerHeight - footerHeight;
        const contentWidth = pageWidth - (2 * margin);
        
        for (let i = 0; i < visualElements.length; i++) {
            const visualElement = visualElements[i];
            
            showExportProgress(i + 1, visualElements.length);
            
            if (i > 0) {
                doc.addPage();
            }
            
            // En-tête
            if (options.includeHeader) {
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(
                    i18nPdf('tab.flow.export_pdf.report_visual_counter', 'Flow Report - Visual {current}/{total}', { current: i + 1, total: visualElements.length }),
                    margin,
                    margin + 10
                );
                
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.text(i18nPdf('tab.flow.export_pdf.generated_on', 'Generated on {date}', { date: new Date().toLocaleString() }), margin, margin + 18);
                
                // Ligne de séparation
                doc.setDrawColor(200, 200, 200);
                doc.line(margin, margin + 22, pageWidth - margin, margin + 22);
            }
            
            // Contenu
            const canvas = await html2canvas(visualElement, {
                scale: options.quality,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff'
            });
            
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const ratio = Math.min(contentWidth / imgWidth, contentHeight / imgHeight);
            
            const finalWidth = imgWidth * ratio;
            const finalHeight = imgHeight * ratio;
            
            const x = (pageWidth - finalWidth) / 2;
            const y = margin + headerHeight + ((contentHeight - finalHeight) / 2);
            
            doc.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
            
            // Pied de page
            if (options.includeFooter) {
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.text(
                    i18nPdf('tab.flow.export_pdf.page_counter', 'Page {current}/{total}', { current: i + 1, total: visualElements.length }),
                    pageWidth - margin - 20, 
                    pageHeight - margin
                );
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const filename = `rapport-flux-${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
        
        hideExportProgress();
        console.log(`📄 PDF généré avec options personnalisées: ${visualElements.length} page(s)`);
        
    } catch (error) {
        console.error('❌ Erreur lors de la génération du PDF:', error);
        hideExportProgress();
        alert(i18nPdf('tab.flow.export_pdf.error_generation', 'Error while generating PDF'));
    }
}


