/* logs-flow.js
 * Onglet "Flux Logs" : construit un petit designer (boîtes + liens) et
 * calcule les compteurs à partir d'un CSV (colonne LOG_INTERACTION).
 * Sauvegarde continue dans localStorage: key = 'flux_log'.
 *
 * Conception inspirée de l'existant (drag & drop, points d'entrée/sortie, dessin SVG)
 * du designer de flux DataTables, mais isolée dans un namespace pour éviter les collisions. 
 */

(function(logFlow){
  'use strict';

  // ====== ÉTAT ======
  let canvasEl, svgEl, boxesGroup, connsGroup;
  let isConnecting = false, connectionStart = null, tempLine = null;
  let nextId = 1;
  const boxes = new Map();            // id -> { id, x,y,w,h, label, waypoint, count }
  const connections = [];             // { id, from:{boxId}, to:{boxId} }
  let csvStats = null;                // { totalRows, totalInteractions, countsByWaypoint:{} }
  const MAX_OUTGOING = 10;
  let isLeftCollapsed = false;

  // RegExp de validation stricte (ex: MEN[101])
  const WAYPOINT_VALIDATE_RE = /^[A-Za-z]{3,4}\[\d{3,4}\]$/;

  // RegExp d'extraction dans des textes (globale + captures)
  const WAYPOINT_EXTRACT_RE = /([A-Za-z]{3,4})\[(\d{3,4})\]/g;
  const STORAGE_KEY = 'flux_log';

  // ====== INIT (charge HTML à l'ouverture de l'onglet) ======
  logFlow.initializeLogsFlowTab = function initializeLogsFlowTab() {
    // Charger le HTML quand l’onglet est affiché pour la 1ère fois
    $('a[href="#logs-flow"]').one('shown.bs.tab', function() {
      $('#logsFlowContent').load('./Scripts/tabs/logs-flow.html', function(){
        setupDomRefs();
        bindUi();
        restoreLeftPanelCollapseState();
        loadFromStorage();
      });
    });
  };

  function setupDomRefs(){
    canvasEl = document.getElementById('logFlowCanvas');
    svgEl = document.getElementById('logFlowSvg');
    boxesGroup = document.getElementById('logBoxesGroup');
    connsGroup = document.getElementById('logConnectionsGroup');
  }

  function bindUi(){
    // Canvas : double‑clic = créer une boîte
    canvasEl.addEventListener('dblclick', (e) => {
      const {x,y} = getMouseSvgCoords(e);
      openCreateBoxModal(x-60, y-40);
    });

    $(document).on('click', '#toggleLeftColBtn', toggleLeftColumn);
    $(document).on('click', '#loadDataBtn, #ldOpenBtn, #ldShowBtn', ensureLeftPanelVisible);
    document.addEventListener('logFlow:openLoadData', ensureLeftPanelVisible);

    // Connexion temporaire (suivi souris)
    svgEl.addEventListener('mousemove', onMouseMoveWhileConnecting);
    svgEl.addEventListener('mouseup', (e)=>{
      if (isConnecting && !e.target.classList.contains('log-conn-point')) cancelConnection();
    });

    // Boutons
    document.getElementById('logsCsvInput').addEventListener('change', onCsvSelected);
    document.getElementById('clearCountersBtn').addEventListener('click', resetCounters);
    document.getElementById('clearDiagramBtn').addEventListener('click', () => clearDiagram(true));

    // Boutons Load Date et IndexedDB
    setDefaultPeriod();
    document.getElementById('loadDataBtn').addEventListener('click', ()=> $('#loadDataModal').modal('show'));
    document.getElementById('ldStart').addEventListener('change', validateDatetimeRange);
    document.getElementById('ldEnd').addEventListener('change', validateDatetimeRange);
    document.getElementById('loadDataValidateBtn').addEventListener('click', (e)=>{
      if (!validateDatetimeRange()){
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onValidateLoadData()
    },true);
    // [IDB] boutons de service
    $('#ldBuildFromLocalBtn').on('click', ()=> openJobsPickerModal());
    // Moteur de recherche + refresh
    $(document).on('input', '#ldJobsSearch', async function(){
      const jobs = await fetchAllJobs();
      renderJobsTable(jobs, this.value);
    });
    $(document).on('click', '#ldJobsRefresh', async ()=>{
      const jobs = await fetchAllJobs();
      const ft = $('#ldJobsSearch').val()||'';
      renderJobsTable(jobs, ft);
    });
    // Utiliser la sélection
    $(document).on('click', '#ldJobsUseBtn', async ()=>{
      const jobId = getSelectedJobIdFromModal();
      if (!jobId) return;
      $('#ldJobsModal').modal('hide');
      const statusEl = document.getElementById('ldStatus');
      if (statusEl) statusEl.textContent = `Chargement du job local ${jobId}…`;
      await buildGraphFromStored(jobId);
    });

    // (Optionnel) Supprimer un job
    $(document).on('click', '#ldJobsDeleteBtn', async ()=>{
      const jobId = getSelectedJobIdFromModal();
      if (!jobId) return;
      if (!confirm(`Supprimer le job ${jobId} et ses interactions ?`)) return;
      // supprimer interactions + job
      const db = await idbOpen();
      await new Promise((res,rej)=>{
        const tx = db.transaction([IDB_STORE_INTERACTIONS, IDB_STORE_JOBS], 'readwrite');
        const stI = tx.objectStore(IDB_STORE_INTERACTIONS).index('byJob');
        const req = stI.openCursor(IDB_STORE_JOBS? IDBKeyRange.only(jobId): jobId);
        req.onsuccess = (e)=>{
          const c = e.target.result;
          if (c){ c.delete(); c.continue(); }
          else res();
        };
        req.onerror = ()=> rej(req.error);
        tx.oncomplete = ()=> {
          const tx2 = db.transaction(IDB_STORE_JOBS, 'readwrite');
          tx2.objectStore(IDB_STORE_JOBS).delete(jobId);
          tx2.oncomplete = res; tx2.onerror = ()=> rej(tx2.error);
        };
      });
      // refresh table
      const jobs = await fetchAllJobs();
      const ft = $('#ldJobsSearch').val()||'';
      renderJobsTable(jobs, ft);
    });

    $('#ldPurgeLocalBtn').on('click', async ()=>{
      await idbClear(IDB_STORE_INTERACTIONS);
      await idbClear(IDB_STORE_JOBS);
      alert('Stockage local purgé.');
    });
    $('#ldExportLocalBtn').on('click', async ()=>{
      try{
        await exportIndexedDbToJson();
      }catch(e){
        alert('Export échoué: ' + e.message);
      }
    });
    $('#ldImportLocalBtn').on('click', ()=> $('#idbImportFile').click());
    $(document).on('change', '#idbImportFile', async function(){
      const file = this.files && this.files[0];
      if (!file) return;
      try{
        if (typeof ensureLeftPanelVisible === 'function') ensureLeftPanelVisible();
        const r = await importDataAuto(file);
        // petit toast/alert selon le type
        if (r.type === 'idb'){
          alert(`Import IDB OK : ${r.jobs} jobs, ${r.interactions} interactions.`);
        } else {
          alert(`Import Genesys OK : jobId=${r.jobId}, ${r.saved} conversations.`);
        }
        // const { jobs, interactions } = await importIndexedDbFromJson(file, { merge:false });
        // alert(`Import terminé : ${jobs} jobs, ${interactions} interactions.`);
        // // reconstruire le graphe depuis le stockage local :
        // buildGraphFromStored(); // (rejoue sur tout le stock)
      }catch(e){
        alert('Import échoué: ' + e.message);
      }finally{
        this.value = '';
      }
    });

    // Import Excel
    $(document).on('click', '#excelImportBtn', ()=> $('#excelImportFile').click());

    $(document).on('change', '#excelImportFile', async function(){
      const f = this.files && this.files[0];
      if (!f) return;
      try{
        await importExcelWaypoints(f);
      }catch(e){
        alert('Import Excel échoué : ' + (e.message||e));
      }finally{
        this.value = '';
      }
    });


    // Modal
    $('#logBoxSaveBtn').on('click', saveBoxFromModal);
    // [NEW] handler bouton supprimer (dans bindUi() ou équivalent)
    $('#logBoxDeleteBtn').on('click', function(){
      const editingId = ($('#logBoxEditingId').val() || '').trim();
      if (!editingId) return;
      if (!confirm('Supprimer cette boîte et ses connexions ?')) return;
      $('#logBoxModal').modal('hide');
      deleteBoxAndConnections(editingId);
    });
  }


  // ==============     INTERFACE DE LOG FLOW  ==============
  function setLeftColumnCollapsed(collapsed) {
    isLeftCollapsed = !!collapsed;

    const $left  = $('#logsLeftCol');
    const $right = $('#logsRightCol');
    const $btn   = $('#toggleLeftColBtn');

    if (isLeftCollapsed) {
      $left.hide();
      $right.removeClass('col-md-9').addClass('col-md-12');
      $btn.attr('title', 'Afficher le panneau')
          .find('i').removeClass('fa-chevron-left').addClass('fa-chevron-right');
    } else {
      $left.show();
      $right.removeClass('col-md-12').addClass('col-md-9');
      $btn.attr('title', 'Masquer le panneau')
          .find('i').removeClass('fa-chevron-right').addClass('fa-chevron-left');
    }

    try { localStorage.setItem('logsLeftCollapsed', String(isLeftCollapsed)); } catch(e){}
    // force un resize pour recalculer les dimensions éventuelles
    window.dispatchEvent(new Event('resize'));
  }

  // toggle simple
  function toggleLeftColumn() {
    setLeftColumnCollapsed(!isLeftCollapsed);
  }

  // garantit que le panneau est visible (utilisé par "Load Data")
  function ensureLeftPanelVisible() {
    if (isLeftCollapsed) setLeftColumnCollapsed(false);
  }

  // restaure l’état au chargement de l’onglet
  function restoreLeftPanelCollapseState() {
    const v = (localStorage.getItem('logsLeftCollapsed') || 'false') === 'true';
    setLeftColumnCollapsed(v);
  }





  // ====== [IDB] IndexedDB minimal pour interactions Analytics ======
  const IDB_DB_NAME = 'gctool_logflow';
  const IDB_DB_VER  = 2;
  const IDB_STORE_INTERACTIONS = 'interactions'; // clé = conversationId
  const IDB_STORE_JOBS         = 'jobs';         // clé = jobId

  function idbOpen(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(IDB_DB_NAME, IDB_DB_VER);
    req.onupgradeneeded = (ev)=>{
      const db = ev.target.result;

      // store interactions
      if (!db.objectStoreNames.contains(IDB_STORE_INTERACTIONS)){
        const s = db.createObjectStore(IDB_STORE_INTERACTIONS, { keyPath: 'conversationId' });
        s.createIndex('byJob', 'jobId', { unique: false });
      }

      // store jobs
      let jobs;
      if (!db.objectStoreNames.contains(IDB_STORE_JOBS)){
        jobs = db.createObjectStore(IDB_STORE_JOBS, { keyPath: 'jobId' });
      } else {
        jobs = req.transaction.objectStore(IDB_STORE_JOBS);
      }
      // [CACHE] index par signature (si absent)
      if (!jobs.indexNames.contains('bySig')){
        jobs.createIndex('bySig', 'signature', { unique: false });
      }
      if (!jobs.indexNames.contains('bySavedAt')){
        jobs.createIndex('bySavedAt', 'savedAt', { unique: false });
      }
    };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror  = ()=> reject(req.error);
    });
  }
  function idbPut(store, value){
    return idbOpen().then(db => new Promise((res, rej)=>{
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = ()=> res();
      tx.onerror    = ()=> rej(tx.error);
    }));
  }
  function idbPutMany(store, values){
    return idbOpen().then(db => new Promise((res, rej)=>{
      const tx = db.transaction(store, 'readwrite');
      const st = tx.objectStore(store);
      values.forEach(v => st.put(v));
      tx.oncomplete = ()=> res();
      tx.onerror    = ()=> rej(tx.error);
    }));
  }
  function idbGetAllByIndex(store, index, query){
    return idbOpen().then(db => new Promise((res, rej)=>{
      const tx = db.transaction(store, 'readonly');
      const idx = tx.objectStore(store).index(index);
      const rq = idx.getAll(query);
      rq.onsuccess = ()=> res(rq.result || []);
      rq.onerror   = ()=> rej(rq.error);
    }));
  }
  function idbGetAll(store){
    return idbOpen().then(db => new Promise((res, rej)=>{
      const tx = db.transaction(store, 'readonly');
      const st = tx.objectStore(store);
      const rq = st.getAll();
      rq.onsuccess = ()=> res(rq.result || []);
      rq.onerror   = ()=> rej(rq.error);
    }));
  }
  function idbClear(store){
    return idbOpen().then(db => new Promise((res, rej)=>{
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = ()=> res();
      tx.onerror    = ()=> rej(tx.error);
    }));
  }

  // ===== [CACHE] helpers signature & lookup =====
  function makeJobSignature({ interval, media, dnis }){
    const m = String(media||'all').toLowerCase();
    const d = String(dnis||'').replace(/\s+/g,''); // sans espaces
    return `${interval}|${m}|${d||'-'}`;
  }
  async function getJobsBySignature(sig){
    return idbGetAllByIndex(IDB_STORE_JOBS, 'bySig', sig);
  }
  function pickMostRecentJob(jobs){
    return (jobs||[]).slice().sort((a,b)=> (b.savedAt||'').localeCompare(a.savedAt||''))[0];
  }

  // ===== [JOBS-UI] Listing/choix de job =====
  async function fetchAllJobs(){
    return idbGetAll(IDB_STORE_JOBS).then(arr => arr.sort((a,b)=> (b.savedAt||'').localeCompare(a.savedAt||'')));
  }
  function renderJobsTable(jobs, filterText=''){
    const tb = document.getElementById('ldJobsTbody');
    if (!tb) return;
    const ft = filterText.trim().toLowerCase();
    const rows = (jobs||[]).filter(j=>{
      if (!ft) return true;
      const p = j.params || {};
      const hay = [
        j.jobId, j.savedAt, j.count,
        p.interval || '',
        (p.media || ''),
        (p.dnis || '')
      ].join(' ').toLowerCase();
      return hay.includes(ft);
    }).map(j=>{
      const p = j.params || {};
      return `<tr>
        <td><input type="radio" name="ldJobPick" value="${j.jobId}"></td>
        <td><code>${j.jobId}</code></td>
        <td><small>${p.interval||''}</small></td>
        <td>${(p.media||'all').toUpperCase()}</td>
        <td>${p.dnis||'∅'}</td>
        <td>${j.count||0}</td>
        <td><small>${j.savedAt||''}</small></td>
      </tr>`;
    }).join('');
    tb.innerHTML = rows || `<tr><td colspan="7" class="text-muted">Aucun jeu local</td></tr>`;
    // pré-sélectionner la première
    const first = tb.querySelector('input[type=radio]');
    if (first) first.checked = true;
  }
  async function openJobsPickerModal({ signature=null } = {}){
    console.log(`DEBUG - openJobsPickerModal`);
    let jobs = await fetchAllJobs();
    if (signature){
      jobs = jobs.filter(j => j.signature === signature);
    }
    renderJobsTable(jobs);
    $('#ldJobsModal').modal('show');
  }
  function getSelectedJobIdFromModal(){
    const r = document.querySelector('#ldJobsTbody input[type=radio]:checked');
    return r ? r.value : null;
  }


  // Tente d'extraire la liste de conversations depuis différents emballages
  function pickConversationsFromPayload(payload){
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;                         // cas: tableau direct
    if (Array.isArray(payload.conversations)) return payload.conversations; // cas "officiel"
    if (payload.data && Array.isArray(payload.data.conversations)) return payload.data.conversations;
    if (payload.results && Array.isArray(payload.results)) {
      // certains exports historisés
      const flat = payload.results.flatMap(x => Array.isArray(x.conversations) ? x.conversations : []);
      if (flat.length) return flat;
    }
    // fallback : cherche une grosse propriété tableau avec des objets qui ont "conversationId"
    for (const k of Object.keys(payload)){
      const v = payload[k];
      if (Array.isArray(v) && v.length && typeof v[0] === 'object' && ('conversationId' in v[0] || 'participants' in v[0])) {
        return v;
      }
    }
    return [];
  }

  // Déduit un interval ISO à partir des horodatages des conversations (si non fourni)
  function computeIntervalFromConversations(convs){
    if (!convs || !convs.length) return null;
    let minT = +Infinity, maxT = -Infinity;

    const pickTime = (c)=> {
      // champs possibles : conversationStart, startTime, start, etc.
      const t = c.conversationStart || c.startTime || c.start || null;
      return t ? Date.parse(t) : NaN;
    };

    for (const c of convs){
      const t = pickTime(c);
      if (!isNaN(t)){
        if (t < minT) minT = t;
        if (t > maxT) maxT = t;
      }
    }
    if (!isFinite(minT) || !isFinite(maxT)) return null;

    const startIso = new Date(minT).toISOString();
    // borne supérieure : on prend maxT + 1 minute par sécurité
    const endIso   = new Date(maxT + 60*1000).toISOString();
    return `${startIso}/${endIso}`;
  }

  /**
   * Importe un export JSON "brut" de Genesys Cloud (Conversation Details) comme un job local.
   * @param {File|Blob|String|Object} fileOrTextOrObj - fichier JSON, string JSON, ou objet déjà parsé
   * @param {Object} options
   *   - interval  {String}  interval ISO "startZ/endZ" (sinon déduit des données)
   *   - media     {String}  'all' | 'voice' | 'email' | 'campaign' (facultatif)
   *   - dnis      {String}  DNIS libre (facultatif)
   *   - jobId     {String}  jobId imposé (sinon auto)
   *   - buildGraph {Boolean} construire le graphe directement (défaut true)
   */
  async function importGenesysDetailsJson(fileOrTextOrObj, { interval=null, media=null, dnis=null, jobId=null, buildGraph=true } = {}){
    let payload;
    if (typeof fileOrTextOrObj === 'string'){
      try { payload = JSON.parse(fileOrTextOrObj); } catch(e){ throw new Error('JSON invalide.'); }
    } else if (fileOrTextOrObj && typeof fileOrTextOrObj.text === 'function'){
      const text = await fileOrTextOrObj.text();
      try { payload = JSON.parse(text); } catch(e){ throw new Error('JSON invalide.'); }
    } else if (typeof fileOrTextOrObj === 'object'){
      payload = fileOrTextOrObj;
    } else {
      throw new Error('Paramètre import invalide (fichier ou texte JSON attendu).');
    }

    const conversations = pickConversationsFromPayload(payload);
    if (!conversations.length) throw new Error('Aucune conversation trouvée dans ce fichier.');

    // paramètres par défaut : on reprend ceux de l’UI si dispo
    const uiMedia = (typeof getSelectedMedia === 'function') ? getSelectedMedia() : 'all';
    const uiDnis  = (typeof $ === 'function' && $('#ldDnis').length) ? ($('#ldDnis').val()||'').trim() : '';

    const params = {
      interval: interval || computeIntervalFromConversations(conversations) || '',
      media:    (media || uiMedia || 'all'),
      dnis:     (typeof dnis === 'string' ? dnis : uiDnis),
      source:   'import-json'
    };

    const localJobId = jobId || `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;

    // Sauvegarde en IndexedDB comme un résultat API
    const { saved } = await saveAnalyticsResultsToDb(localJobId, params, { conversations });

    // Feedback UI si tu as #ldStatus / #ldResults
    const statusEl = document.getElementById('ldStatus');
    if (statusEl) statusEl.textContent = `Import JSON : ${saved} conversations sauvegardées (jobId=${localJobId}).`;

    // Construit le graphe comme d’habitude
    if (buildGraph) await buildGraphFromStored(localJobId);

    return { jobId: localJobId, saved, params };
  }



// Heuristique: export GCTool IDB si "meta.dbName" et "data.{jobs,interactions}"
function isGctoolIdbExportPayload(obj){
  if (!obj || typeof obj !== 'object') return false;
  const meta = obj.meta || {};
  const data = obj.data || {};
  const hasDbName = typeof meta.dbName === 'string';
  const hasStores = data && Array.isArray(data.jobs) && Array.isArray(data.interactions);
  return !!(hasDbName && hasStores);
}

// Heuristique: export Genesys si on détecte des conversations
function isGenesysDetailsExportPayload(obj){
  try {
    const convs = pickConversationsFromPayload(obj); // déjà fournie plus haut
    return Array.isArray(convs) && convs.length > 0;
  } catch { return false; }
}

// Lecture fichier/texte → objet
async function parseJsonInput(fileOrText){
  if (typeof fileOrText === 'string') return JSON.parse(fileOrText);
  if (fileOrText && typeof fileOrText.text === 'function'){
    const text = await fileOrText.text();
    return JSON.parse(text);
  }
  if (typeof fileOrText === 'object') return fileOrText;
  throw new Error('Entrée import invalide (JSON attendu).');
}

/**
 * Import automatique:
 *  - si export GCTool (IDB): importIndexedDbFromJson(merge:false) puis buildGraphFromStored()
 *  - sinon si export Genesys: importGenesysDetailsJson(buildGraph:true)
 *  - sinon erreur
 */
async function importDataAuto(fileOrText){
  const payload = await parseJsonInput(fileOrText);

  // Cas 1: export IDB GCTool
  if (isGctoolIdbExportPayload(payload)){
    const text = typeof fileOrText === 'string' ? fileOrText : JSON.stringify(payload);
    const { jobs, interactions } = await importIndexedDbFromJson(text, { merge:false });
    // Feedback + rebuild
    const statusEl = document.getElementById('ldStatus');
    if (statusEl) statusEl.textContent = `Import IDB: ${jobs} jobs, ${interactions} interactions. Reconstruction du graphe…`;
    await buildGraphFromStored(); // sur l’ensemble
    return { type:'idb', jobs, interactions };
  }

  // Cas 2: export brut Genesys
  if (isGenesysDetailsExportPayload(payload)){
    // On laisse interval/media/DNIS déduits/issus de l’UI dans importGenesysDetailsJson
    const { jobId, saved, params } = await importGenesysDetailsJson(payload, { buildGraph:true });
    const statusEl = document.getElementById('ldStatus');
    if (statusEl) statusEl.textContent = `Import Genesys: ${saved} conversations (jobId=${jobId}). Graphe construit.`;
    return { type:'genesys', jobId, saved, params };
  }

  throw new Error('Format JSON non reconnu : ni export GCTool, ni export Genesys.');
}















  // ====== MODAL CRÉATION ======
  let pendingBoxPos = {x:0,y:0};
  // [NEW] Ouvre la modale en mode création
  function openCreateBoxModal(x,y,preset = {}){
    pendingBoxPos = {x,y};
    $('#logBoxEditingId').val('');
    $('#logBoxModalTitle').text('Nouvelle boîte');
    $('#logBoxLabel').val(preset.label || '');
    $('#logBoxWaypoint').val(preset.waypoint || '').prop('disabled', false);
    $('#logBoxWpHint').hide();
    $('#logBoxDeleteBtn').hide();
    $('#logBoxModal').modal('show');
  }

  // [NEW] Ouvre la modale en mode édition (waypoint verrouillé)
  function openEditBoxModal(boxId){
    const box = boxes.get(boxId);
    if (!box) return;
    $('#logBoxEditingId').val(boxId);
    $('#logBoxModalTitle').text('Éditer la boîte');
    $('#logBoxLabel').val(box.label || '');
    $('#logBoxWaypoint').val(box.waypoint || '').prop('disabled', true);
    $('#logBoxWpHint').show();
    $('#logBoxDeleteBtn').show();
    $('#logBoxModal').modal('show');
  }

  // [MOD] saveBoxFromModal — gère création ET édition
  function saveBoxFromModal(){
    const editingId = ($('#logBoxEditingId').val() || '').trim();
    const label = ($('#logBoxLabel').val()||'').trim();
    let waypoint = ($('#logBoxWaypoint').val()||'').trim().toUpperCase();

    if (!label){
      alert('Veuillez saisir un label');
      return;
    }

    if (editingId){ 
      // === ÉDITION ===
      const box = boxes.get(editingId);
      if (!box) return;
      // waypoint ne doit PAS changer : on ignore l’input (désactivé de toute façon)
      // Mise à jour du label
      box.label = label;
      box.userCreated = true;
      box.locked = true;
      const g = document.getElementById(box.id);
      if (g){
        const title = g.querySelector('.log-title');
        if (title) title.textContent = box.label;

        console.log(`DEBUG Modification Box. userCreated : ${box.userCreated}`)
        // badge userCreated si pas présent
        if (!g.querySelector('.log-user-badge-wrap')){
          const badge = createSvg('g', { class: 'log-user-badge-wrap' });
          const badgeRect = createSvg('rect', { x: 4, y: 4, width: 18, height: 18, rx: 3, class: 'log-user-badge' });
          const badgeTxt  = createSvg('text', { x: 13, y: 18, 'text-anchor':'middle', class: 'log-user-badge-text' });
          badgeTxt.textContent = '★';
          const tip = createSvg('title', {}); tip.textContent = 'Créé manuellement';
          badge.appendChild(badgeRect); badge.appendChild(badgeTxt); badge.appendChild(tip);
          g.insertAfter(badge, g.firstChild);
        }
      }

      $('#logBoxModal').modal('hide');
      saveToStorage(true);

      // ne pas relancer un layout auto (car locked), mais on peut redessiner les liens si besoin
      if (typeof redrawAllConnections === 'function') redrawAllConnections();
      return;
    }

    // === CRÉATION ===
    if (!WAYPOINT_VALIDATE_RE.test(waypoint)){
      alert('Point de passage invalide. Format attendu: 3-4 lettres + [3-4 chiffres] ex: BACC[0123]');
      return;
    }
    waypoint = normWp(waypoint);

    const id = `lbox_${nextId++}`;
    const box = {
      id, x: pendingBoxPos?.x || 40, y: pendingBoxPos?.y || 40, w: 120, h: 80,
      label, waypoint, count: 0,
      userCreated: true,  // création manuelle
      locked: true        // ne bouge pas en layout auto
    };
    boxes.set(id, box);
    drawBox(box);
    updateBoxCountVisual(id);
    $('#logBoxModal').modal('hide');
    saveToStorage(true);
    // recalcul counters si CSV déjà chargé
    if (csvStats) applyCountsToBoxes();
  }

  // [NEW] suppression d'une boîte et de ses connexions
  function deleteBoxAndConnections(boxId){
    // supprimer connexions liées
    const toDelete = connections.filter(c => c.from.boxId === boxId || c.to.boxId === boxId)
                                .map(c => c.id);
    toDelete.forEach(id => deleteConnection(id)); // suppose que tu as déjà deleteConnection()

    // supprimer la box
    const g = document.getElementById(boxId);
    if (g && g.parentNode) g.parentNode.removeChild(g);
    boxes.delete(boxId);

    saveToStorage(true);
    if (typeof redrawAllConnections === 'function') redrawAllConnections();
    if (typeof updateSvgViewportSize === 'function') updateSvgViewportSize();
  }

  // ====== DESSIN DES BOÎTES ======
  function drawBox(box){
    // groupe
    const g = createSvg('g', { id: box.id, class: 'log-box', transform:`translate(${box.x},${box.y})` });
    g.style.cursor = 'pointer';
    // rect
    const rect = createSvg('rect', { width: box.w, height: box.h, rx:5, class:'log-rect' });
    console.log(`DEBUG création Box. userCreated : ${box.userCreated}`)
    // Badge créé par le user
    if (box.userCreated) {
      const badge = createSvg('g', { class: 'log-user-badge-wrap' });
      const badgeRect = createSvg('rect', { x: 4, y: 4, width: 18, height: 18, rx: 3, class: 'log-user-badge' });
      const badgeTxt  = createSvg('text', { x: 13, y: 18, 'text-anchor':'middle', class: 'log-user-badge-text' });
      badgeTxt.textContent = '★';
      const tip = createSvg('title', {}); tip.textContent = 'Créé manuellement';
      badge.appendChild(badgeRect); badge.appendChild(badgeTxt); badge.appendChild(tip);
      g.appendChild(badge);
    }
    // titre
    const title = createSvg('text', { x: box.w/2, y: 22, 'text-anchor':'middle', class:'log-title' });
    title.textContent = box.label;
    // waypoint
    const wp = createSvg('text', { x: box.w/2, y: 40, 'text-anchor':'middle', class:'log-waypoint' });
    wp.textContent = box.waypoint;
    // compteur
    const counter = createSvg('text', { x: box.w/2, y: 60, 'text-anchor':'middle', class:'log-counter', id:`cnt_${box.id}` });
    counter.textContent = '(0)';
    // points connexion (entrée haut, sortie bas)
    const inPt = createSvg('circle', { cx: box.w/2, cy: 0, r:6, class:'log-conn-point in', 'data-type':'in', 'data-id':box.id });
    const outPt= createSvg('circle', { cx: box.w/2, cy: box.h, r:6, class:'log-conn-point out', 'data-type':'out', 'data-id':box.id });

    // events
    g.addEventListener('dblclick', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      openEditBoxModal(box.id);
      });
    g.addEventListener('mousedown', (e)=>startDragBox(e, box.id));
    inPt.addEventListener('click', (e)=>onConnPointClicked(e, 'in', box.id));
    outPt.addEventListener('click', (e)=>onConnPointClicked(e, 'out', box.id));

    g.appendChild(rect);
    g.appendChild(title);
    g.appendChild(wp);
    g.appendChild(counter);
    g.appendChild(inPt);
    g.appendChild(outPt);
    boxesGroup.appendChild(g);
  }

  function recreateBox(id){
    const box = boxes.get(id);
    if (!box) return;
    const old = document.getElementById(id);
    if (old) old.remove();
    drawBox(box);
    updateConnectionsForBox(id);
    // surbrillance si en connexion
  }

  
  // ====== DRAG ======
  function startDragBox(e, id){
    e.preventDefault();

    const box = boxes.get(id);
    if (!box) return;

    const rectCanvas = canvasEl.getBoundingClientRect();

    // Offsets de scroll au moment du clic (peuvent évoluer pendant le drag)
    let sx = canvasEl.scrollLeft;
    let sy = canvasEl.scrollTop;

    // Décalage initial curseur→coin de la box en coordonnées "surface scrollee"
    const startOffset = {
      x: e.clientX - rectCanvas.left + sx - box.x,
      y: e.clientY - rectCanvas.top  + sy - box.y
    };

    let dragging = true;

    function onMove(ev){
      if (!dragging) return;

      // Si l'utilisateur scrolle pendant le drag, on recalcule
      sx = canvasEl.scrollLeft;
      sy = canvasEl.scrollTop;

      // Dimensions de l'aire de travail : privilégier le width/height du <svg>
      const maxW = (svgEl && (svgEl.width?.baseVal?.value || svgEl.clientWidth || canvasEl.clientWidth)) || canvasEl.clientWidth;
      const maxH = (svgEl && (svgEl.height?.baseVal?.value || svgEl.clientHeight || canvasEl.clientHeight)) || canvasEl.clientHeight;

      // Nouvelle position bornée à l'aire de travail complète (et non la fenêtre visible)
      const nx = Math.max(0, Math.min(
        ev.clientX - rectCanvas.left - startOffset.x + sx,
        maxW - box.w
      ));
      const ny = Math.max(0, Math.min(
        ev.clientY - rectCanvas.top  - startOffset.y + sy,
        maxH - box.h
      ));

      placeBox(box, nx, ny, true);

      // Redessiner les connexions liées
      updateConnectionsForBox(id);
    }

    function onUp(){
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveToStorage();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

// ===== [SIZE] Ajuster la surface SVG à ce qui est affiché =====
const CANVAS_PADDING = 120;         // marge autour du contenu
const MIN_SVG_W = 900;              // largeur mini (s'adapte au viewport plus bas)
const MIN_SVG_H = 600;              // hauteur mini

function computeContentExtents(){
  // bornes via les boîtes
  let maxRight = 0, maxBottom = 0;
  boxes.forEach(b => {
    if (!b) return;
    maxRight  = Math.max(maxRight,  b.x + b.w);
    maxBottom = Math.max(maxBottom, b.y + b.h);
  });

  // tenir compte des sections (bandes) si utilisées
  let sectionsBottom = 0;
  if (typeof computeSectionOrder === 'function' && typeof SECTION_HEIGHT !== 'undefined'){
    const groups = computeSectionOrder();
    sectionsBottom = groups.length * SECTION_HEIGHT;
  }

  return {
    w: Math.max(maxRight,  0),
    h: Math.max(maxBottom, sectionsBottom)
  };
}

function updateSvgViewportSize(){
  const canvas = document.getElementById('logFlowCanvas');
  if (!svgEl || !canvas) return;

  const ext = computeContentExtents();
  // bornes + padding + minima (et au moins la taille visible du canvas)
  const targetW = Math.max(ext.w + CANVAS_PADDING, MIN_SVG_W, canvas.clientWidth);
  const targetH = Math.max(ext.h + CANVAS_PADDING, MIN_SVG_H, canvas.clientHeight);

  // appliquer sur l'élément <svg>
  svgEl.setAttribute('width',  Math.ceil(targetW));
  svgEl.setAttribute('height', Math.ceil(targetH));

  // si des sections existent déjà, recaler leur largeur
  const sects = svgEl.querySelectorAll('#logSectionsGroup .log-section');
  sects.forEach(r => r.setAttribute('width', Math.ceil(targetW)));
}







  // ====== BOX CONNEXIONS ======
  function onConnPointClicked(e, type, boxId){
    e.stopPropagation();
    if (!isConnecting && type === 'out'){
      // démarrer
      isConnecting = true;
      connectionStart = { boxId };
      // feedback visuel
      e.target.classList.add('connecting');
    } else if (isConnecting && type === 'in'){
      // terminer
      createConnection(connectionStart.boxId, boxId);
      cancelConnection();
    }
  }

  function cancelConnection(){
    isConnecting = false;
    connectionStart = null;
    if (tempLine){ tempLine.remove(); tempLine = null; }
    document.querySelectorAll('.log-conn-point.connecting').forEach(n=>n.classList.remove('connecting'));
  }

  function onMouseMoveWhileConnecting(e){
    if (!isConnecting || !connectionStart) return;
    const from = boxes.get(connectionStart.boxId);
    if (!from) return;
    const fromX = from.x + from.w/2;
    const fromY = from.y + from.h;
    const m = getMouseSvgCoords(e);
    if (tempLine) tempLine.remove();
    tempLine = createSvg('line', { x1:fromX, y1:fromY, x2:m.x, y2:m.y, class:'log-line temp' });
    connsGroup.appendChild(tempLine);
  }

  function createConnection(fromId, toId) {
    // Interdits simples
    if (fromId === toId) {
      alert("Impossible de connecter une boîte à elle-même.");
      return;
    }

    // 1) Bloquer les doublons from->to
    if (
      connections.some((c) => c.from.boxId === fromId && c.to.boxId === toId)
    ) {
      alert("Cette connexion existe déjà.");
      return;
    }

    // 2) Appliquer une limite max (configurable)
    const outgoing = connections.filter((c) => c.from.boxId === fromId);
    if (MAX_OUTGOING && outgoing.length >= MAX_OUTGOING) {
      alert(
        `Cette sortie a déjà ${outgoing.length} connexion(s) (max ${MAX_OUTGOING}).`
      );
      return;
    }

    // Id plus robuste (évite collisions quand on supprime/recrée)
    const conn = {
      id: `lc_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      from: { boxId: fromId },
      to: { boxId: toId },
    };
    connections.push(conn);
    drawConnection(conn);
    saveToStorage();
  }

    // [MOD] Connexions : latérales si horizontales, verticales sinon
  function drawConnection(conn) {
    const from = boxes.get(conn.from.boxId);
    const to   = boxes.get(conn.to.boxId);
    if (!from || !to) return;

    // centres
    const fc = { x: from.x + from.w/2, y: from.y + from.h/2 };
    const tc = { x: to.x   + to.w/2,   y: to.y   + to.h/2 };
    const dx = tc.x - fc.x, dy = tc.y - fc.y;

    // heuristique d'horizontalité (favorise les accroches latérales)
    const isHorizontal = Math.abs(dx) >= Math.abs(dy) * 1.2 || Math.abs(dy) < 20;

    let fromPt, toPt;

    if (isHorizontal){
      // côté droit si la cible est à droite, sinon côté gauche
      fromPt = (dx >= 0)
        ? { x: from.x + from.w, y: fc.y }
        : { x: from.x,          y: fc.y };

      // côté gauche si la source est à gauche, sinon côté droit
      toPt = (dx >= 0)
        ? { x: to.x,            y: tc.y }
        : { x: to.x + to.w,     y: tc.y };
    } else {
      // vertical : bas de la source → haut de la cible (comportement actuel)
      fromPt = { x: fc.x, y: from.y + from.h };
      toPt   = { x: tc.x, y: to.y };
    }

    // éventail léger uniquement pour sorties verticales (pour éviter le fouillis)
    let x1 = fromPt.x, y1 = fromPt.y;
    if (!isHorizontal){
      const outgoing = connections.filter(c => c.from.boxId === conn.from.boxId);
      const idx = outgoing.findIndex(c => c.id === conn.id);
      const n = Math.max(outgoing.length, 1);
      const spread = 16;
      x1 = x1 + (idx - (n - 1) / 2) * spread;
    }

    const line = createSvg('line', {
      x1, y1, x2: toPt.x, y2: toPt.y,
      class: 'log-line',
      'marker-end': 'url(#logArrow)',
      'data-id': conn.id
    });

    line.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (confirm('Supprimer cette connexion ?')) deleteConnection(conn.id);
    });

    connsGroup.appendChild(line);
  }

  function updateConnectionsForBox(boxId){
    // Re-dessiner toutes les connexions liées
    const related = connections.filter(c => c.from.boxId===boxId || c.to.boxId===boxId);
    related.forEach(c => {
      const el = connsGroup.querySelector(`line[data-id="${c.id}"]`);
      if (el) el.remove();
      drawConnection(c);
    });
  }

  function deleteConnection(connId){
    const i = connections.findIndex(c => c.id === connId);
    if (i>=0){
      connections.splice(i,1);
      const el = connsGroup.querySelector(`line[data-id="${connId}"]`);
      if (el) el.remove();
      saveToStorage();
    }
  }


















  // ====== API ======
  function onValidateLoadData(){
    const start = parseDatetimeLocalInput('ldStart');
    const end   = parseDatetimeLocalInput('ldEnd');
    if (!start || !end) throw new Error('Veuillez renseigner les dates de début et de fin.');
    if (end <= start)   throw new Error('La date/heure de fin doit être postérieure au début.');
    const interval = `${start.toISOString()}/${end.toISOString()}`;
    console.log(`DEBUG - onValidateLoadData`,interval);
    
    // Local → ISO Z (UTC)
    const startIso = start.toISOString();
    const endIso   = end.toISOString();

    const media = $('#ldMedia .btn.active').data('value') || 'all';
    const dnis  = ($('#ldDnis').val()||'').trim();

    const payload = { media, dnis, startIso, endIso };
    localStorage.setItem('flux_log_load_params', JSON.stringify(payload));
    $('#loadDataModal').modal('hide');
    document.dispatchEvent(new CustomEvent('logFlow:openLoadData'));

    const req = buildDetailsJobRequest(payload);
    //renderApiPreview(req);      // << afficher seulement
    runAnalyticsJobAndPoll(req,payload)
    console.log('🔌 Load Data params:', payload);
  }

  // remplit les selects d'heures (00..23) et minutes (00,10,..50)
  function initLoadDataControls(){
    const hours = Array.from({length:24}, (_,h)=> (h<10?'0':'')+h);
    const minutes = ['00','10','20','30','40','50'];

    function fillSelect(id, arr){
      const el = document.getElementById(id);
      if (!el || el.options.length) return; // idempotent
      arr.forEach(v=>{
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v;
        el.appendChild(opt);
      });
    }

    fillSelect('ldStartHour', hours);
    fillSelect('ldEndHour', hours);
    fillSelect('ldStartMinute', minutes);
    fillSelect('ldEndMinute', minutes);

    // revalidation sur changement
    ['ldStartDate','ldStartHour','ldStartMinute','ldEndDate','ldEndHour','ldEndMinute']
      .forEach(id => document.getElementById(id).addEventListener('change', validatePeriodAndToggle));
  }

  //arrondi un Date au pas de 10 minutes (inférieur ou supérieur)
  function roundTo10(date, mode='floor'){
    const d = new Date(date.getTime());
    const ms = d.getMinutes();
    const r = Math[mode](ms/10)*10;
    d.setMinutes(r, 0, 0);
    return d;
  }

  function setDefaultPeriod(){
    const now = new Date();
    // Aujourd’hui 00:00 (locale)
    const today00 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    // Hier 00:00 (locale)
    const yest00 = new Date(today00.getTime() - 24*60*60*1000);

    const startEl = document.getElementById('ldStart');
    const endEl   = document.getElementById('ldEnd');
    if (startEl) startEl.value = toDatetimeLocalValue(yest00);
    if (endEl)   endEl.value   = toDatetimeLocalValue(today00);

    validateDatetimeRange(); // applique l’état initial (bouton activé/désactivé)
  }

  // lit les 3 contrôles → Date locale
  function getDateFromControls(prefix){
    const d = document.getElementById(prefix+'Date').value;
    const h = document.getElementById(prefix+'Hour').value;
    const m = document.getElementById(prefix+'Minute').value;
    if (!d || h==='' || m==='') return null;
    const [Y, M, D] = d.split('-').map(Number);
    return new Date(Y, M-1, D, Number(h), Number(m), 0, 0); // locale
  }

  function pad2(n){ return (n<10?'0':'')+n; }
  function toDatetimeLocalValue(d){
    // "YYYY-MM-DDTHH:MM" (heure locale, sans secondes)
    return [
      d.getFullYear(), '-', pad2(d.getMonth()+1), '-', pad2(d.getDate()),
      'T', pad2(d.getHours()), ':', pad2(d.getMinutes())
    ].join('');
  }
  function parseDatetimeLocalInput(id){
    const v = document.getElementById(id)?.value;
    return v ? new Date(v) : null; // interprété en locale par le navigateur
  }

  function validateDatetimeRange(){
    const errEl = document.getElementById('ldDateErr');
    const runBtn = document.getElementById('ldRunBtn') || document.getElementById('loadDataValidateBtn');

    const s = parseDatetimeLocalInput('ldStart');
    const e = parseDatetimeLocalInput('ldEnd');

    console.log(`DEBUG - validateDatetimeRange`,s,e);

    if (!s || !e){
      if (errEl) errEl.style.display = 'none';
      if (runBtn) runBtn.disabled = true;
      return false;
    }
    if (e <= s){
      if (errEl){
        errEl.textContent = 'La date/heure de fin doit être après la date/heure de début.';
        errEl.style.display = 'block';
      }
      if (runBtn) runBtn.disabled = true;
      return false;
    }
    if (errEl) errEl.style.display = 'none';
    if (runBtn) runBtn.disabled = false;
    return true;
  }

  // Affichage d’un rappel (sous les stats CSV existantes)
  function showLoadDataBadge(p){
    const el = $('#logsStats');
    if (!el.length) return;
    const m = (p.media || 'all').toUpperCase();
    el.append(`<div class="small text-muted" style="margin-top:6px">
      <i class="fa fa-filter"></i> Filtre actif — ${m}, ${p.start||'?'} → ${p.end||'?'}, DNIS: ${p.dnis||'∅'}
    </div>`);
  }

  // Construit la requête POST "jobs" (sans l'exécuter)
  function buildDetailsJobRequest(p){
    const interval = (p.startIso && p.endIso) ? `${p.startIso}/${p.endIso}` : null;
    const segmentFilters = [];

    // Média
    // - voice/email => filtre mediaType
    // - campaign => approximation utile: voice + direction outbound (campagnes sortantes)
    if (p.media && p.media !== 'all'){
      if (p.media === 'campaign'){
        segmentFilters.push({
          type: 'and',
          predicates: [
            { type: 'dimension', dimension: 'mediaType', operator: 'matches', value: 'voice' },
            { type: 'dimension', dimension: 'direction', operator: 'matches', value: 'outbound' }
          ]
        });
      } else {
        segmentFilters.push({
          type: 'or',
          predicates: [{ type: 'dimension', dimension: 'mediaType', operator: 'matches', value: p.media }]
        });
      }
    }

    // DNIS (doit être en segmentFilters)
    if (p.dnis){
      segmentFilters.push({
        type: 'or',
        predicates: [{ type: 'dimension', dimension: 'dnis', operator: 'matches', value: p.dnis }]
      });
    }

    const body = {
      interval,                         // "YYYY-MM-DDTHH:mm:ss.SSSZ/YYYY-...Z"
      order: 'asc',
      orderBy: 'conversationStart',
      startOfDayIntervalMatching: false,
      paging: { pageSize: 100, pageNumber: 1 },
      segmentFilters
      // conversationFilters / evaluationFilters / surveyFilters : non requis ici
    };
    return body;
    // return {
    //   method: 'POST',
    //   url: '/api/v2/analytics/conversations/details/jobs',
    //   headers: {
    //     'Authorization': 'Bearer <ACCESS_TOKEN>',
    //     'Content-Type': 'application/json'
    //   },
    //   body
    // };
  }

  let ldPollTimer = null;
  async function runAnalyticsJobAndPoll(req,payload){
    const preview = document.getElementById('ldRequestPreview');
    const statusEl = document.getElementById('ldStatus');
    const resultsEl = document.getElementById('ldResults');

    resultsEl.innerHTML = '';
    statusEl.textContent = '';

    let body;
    try{
      body = req;
    }catch(err){
      preview.textContent = '';
      alert(err.message);
      return;
    }

     // récupère media & dnis depuis l’UI (ou ce que tu stockes déjà)
    const media = (typeof getSelectedMedia === 'function' ? getSelectedMedia() : 'all');
    const dnis  = ($('#ldDnis').val()||'').trim();
    const signature = makeJobSignature({ interval: body.interval, media, dnis });

    // Afficher la requête (POST + body)
    preview.textContent = JSON.stringify({
      method: 'POST',
      path: '/api/v2/analytics/conversations/details/jobs',
      body
    }, null, 2);

    // [CACHE] vérifier s'il existe déjà un job pour cette signature
    const existing = await getJobsBySignature(signature);
    if (existing && existing.length){
      // Option A: auto-utiliser le plus récent
      const latest = pickMostRecentJob(existing);
      statusEl.textContent = `Résultats en cache détectés (jobId=${latest.jobId}, ${latest.count} convos, ${latest.savedAt}). Utilisation du cache.`;
      // Afficher la requête (informative)
      preview.textContent = JSON.stringify({ method:'POST', path:'/api/v2/analytics/conversations/details/jobs', body }, null, 2);
      // Construire le graphe depuis ce job
      await buildGraphFromStored(latest.jobId);
      return;
      // Option B (si tu préfères demander) : ouvre la modale de choix (voir §5) au lieu du return.
    }

    try{
      const analyticsApi = new platformClient.AnalyticsApi();
      statusEl.textContent = 'Création du job...';

      analyticsApi.postAnalyticsConversationsDetailsJobs(body)
        .then(resp => {
          const jobId = resp.jobId || resp.id;
          if (!jobId) throw new Error('jobId introuvable dans la réponse de création.');
          statusEl.textContent = `Job créé: ${jobId} • polling...`;

          // Poll toutes les 500ms
          ldPollTimer && clearInterval(ldPollTimer);
          ldPollTimer = setInterval(() => {
            analyticsApi.getAnalyticsConversationsDetailsJob(jobId)
              .then(j => {
                statusEl.textContent = `Statut: ${j.state}`;
                if (j.state === 'FULFILLED'){
                  clearInterval(ldPollTimer);
                  statusEl.textContent = `Statut: FULFILLED • récupération des résultats...`;
                  // Récup 1ère page (pageSize défini dans body/paging pour cohérence)
                  analyticsApi.getAnalyticsConversationsDetailsJobResults(jobId)
                    .then(async (r) => {
                      const meta = document.createElement('div');
                      const total = (r.conversations && r.conversations.length) || 0;
                      const hasCursor = !!r.cursor;
                      meta.innerHTML = `<div class="alert alert-success" style="margin-bottom:6px;">
                        <strong>Résultats reçus.</strong> Conversations: <code>${total}</code>${hasCursor?' • (cursor présent)':''}
                      </div>`;
                      const pre = document.createElement('pre');
                      pre.textContent = JSON.stringify(r, null, 2);
                      resultsEl.innerHTML = '';
                      resultsEl.appendChild(meta);
                      resultsEl.appendChild(pre);

                      const params = {
                            // garde ce que tu as envoyé au POST: startIso/endIso ou interval, media, dnis...
                            interval: body.interval,
                            media: (payload && payload.media),
                            dnis: (payload && payload.dnis)
                          };

                      // [IDB] sauvegarde locale
                      try{
                        const { saved } = await saveAnalyticsResultsToDb(jobId, params, r);
                        // petit feedback dans le panneau statut
                        const statusEl = document.getElementById('ldStatus');
                        if (statusEl) statusEl.textContent = `Statut: FULFILLED • ${saved} interactions sauvegardées localement. Construction du graphe…`;
                      }catch(e){
                        console.warn('Sauvegarde IDB impossible:', e);
                      }

                      // [ANALYTICS→GRAPH] construit le graphe à partir du job courant
                      buildGraphFromStored(jobId);
                    })
                    .catch(e => {
                      resultsEl.innerHTML = `<div class="alert alert-danger">Erreur lors de la récupération des résultats: ${e.message}</div>`;
                    });
                }
                if (j.state === 'FAILED' || j.state === 'CANCELLED'){
                  clearInterval(ldPollTimer);
                  statusEl.textContent = `Statut: ${j.state}`;
                }
              })
              .catch(e => {
                clearInterval(ldPollTimer);
                statusEl.textContent = `Erreur polling: ${e.message}`;
              });
          }, 500);
        })
        .catch(e => {
          statusEl.textContent = `Erreur création job: ${e.message}`;
        });

    }catch(e){
      statusEl.textContent = `Erreur: ${e.message}`;
    }
  }

  // Affiche joliment la requête (sans l’appeler)
  function renderApiPreview(req){
    const el = document.getElementById('apiPreview');
    if (!el) return;
    const curl =
  `curl -X ${req.method} \\
    '${req.url}' \\
    -H 'Authorization: Bearer <ACCESS_TOKEN>' \\
    -H 'Content-Type: application/json' \\
    -d '${JSON.stringify(req.body).replace(/'/g,"'\\''")}'`;

    el.style.display = 'block';
    el.innerHTML = `
      <div><strong>Requête prête (non exécutée)</strong></div>
      <div style="margin-top:6px"><code>${req.method} ${req.url}</code></div>
      <pre style="margin-top:6px">${JSON.stringify(req.body, null, 2)}</pre>
      <details style="margin-top:6px"><summary>Voir exemple cURL</summary><pre>${curl}</pre></details>
    `;
  }

















  // ====== [ANALYTICS→GRAPH] Extraction & Sauvegarde ======

  // Cherche l'attribut LOG_INTERACTION (insensible à la casse) dans divers niveaux:
  function extractLogInteractionFromConversation(conv){
    const keyMatch = (k)=> String(k).toUpperCase() === 'LOG_INTERACTION';
    const pickFrom = (obj)=>{
      if (!obj) return null;
      const atts = obj.attributes || obj.conversationAttributes || null;
      if (!atts) return null;
      for (const k in atts){ if (keyMatch(k)) return atts[k]; }
      return null;
    };

    // 1) conversation
    let val = pickFrom(conv);
    if (val) return val;

    // 2) participants
    const parts = conv.participants || [];
    for (const p of parts){
      val = pickFrom(p);
      if (val) return val;

      // 3) sessions/segments
      const sessions = p.sessions || [];
      for (const s of sessions){
        val = pickFrom(s);
        if (val) return val;

        const segs = s.segments || [];
        for (const seg of segs){
          val = pickFrom(seg);
          if (val) return val;
        }
      }
    }
    return null;
  }

  // Sauvegarde un job + toutes ses conversations dans IndexedDB
  async function saveAnalyticsResultsToDb(jobId, params, result){
    const nowIso = new Date().toISOString();
    const convs = (result && result.conversations) || [];
    const signature = makeJobSignature({
      interval: params.interval,
      media: params.media,
      dnis: params.dnis
    });

    await idbPut(IDB_STORE_JOBS, {
      jobId,
      savedAt: nowIso,
      params: params || {},
      signature, 
      source: params && params.source ? params.source : 'api',
      count: convs.length
    });

    // Préparer les enregistrements d'interactions
    const records = convs.map(c=>{
      const cid = c.conversationId || c.id || `${jobId}-${Math.random().toString(36).slice(2)}`;
      return {
        conversationId: cid,
        jobId,
        fetchedAt: nowIso,
        logInteraction: extractLogInteractionFromConversation(c),
        conversation: c // garde brut (peut être retiré si souci de volume)
      };
    });

    if (typeof idbBulkPutChunked === 'function') {
      await idbBulkPutChunked(IDB_STORE_INTERACTIONS, records, 500);
    } else {
      await idbPutMany(IDB_STORE_INTERACTIONS, records);
    }
    return { saved: records.length };
  }













  // ====== CSV ======
  function onCsvSelected(evt) {
    const file = evt.target.files && evt.target.files[0];
    evt.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result || "";
      processCsvTextWithProgress(text);
    };
    reader.readAsText(file);
  }

  // Traitement progressif du CSV (avec barre d’avancement)
  function processCsvTextWithProgress(csvText) {
    const { rows, headerMap } = parseCsvText(csvText); // <-- réutilisable partout
    const formattedCol = findFormattedColKey(headerMap);
    if (!formattedCol) {
      alert('Colonne "Attributs participant formatés" introuvable.');
      return;
    }

    const total = rows.length;
    showCsvProgress(total);

    // compte par waypoint (forme canonique "LLLL[DDD]")
    const counts = new Map();

    let i = 0;
    const CHUNK = 250; // traite par paquets pour fluidifier l’UI

    function step() {
      const end = Math.min(i + CHUNK, total);
      for (; i < end; i++) {
        const row = rows[i];
        const rawKV = row[formattedCol];
        if (!rawKV) continue;

        const kv = parseFormattedKV(rawKV);
        const logKey = Object.keys(kv).find(
          (k) => k.toLowerCase() === "log_interaction"
        );
        const logVal = logKey ? kv[logKey] : null;
        if (!logVal) continue;

        // Extrait une séquence canonique "LLLL[DDD]"
        const seq = Array.from(
          (logVal || "").matchAll(WAYPOINT_EXTRACT_RE),
          (m) => `${m[1].toUpperCase()}[${m[2]}]`
        );
        if (seq.length === 0) continue;

        // 1) auto-création des boîtes et comptage global des occurrences
        for (const wp of seq) {
          ensureBoxForWaypoint(wp); // crée si absente
          counts.set(wp, (counts.get(wp) || 0) + 1);
        }

        // 2) connexions séquentielles (A->B, B->C, …)
        for (let k = 0; k < seq.length - 1; k++) {
          ensureConnectionByWaypoints(seq[k], seq[k + 1]);
        }
      }

      updateCsvProgress(i, total);

      if (i < total) {
        setTimeout(step, 0); // laisse respirer l’UI
      } else {
        // FIN : construire csvStats et mettre à jour l’UI
        const countsObj = Object.fromEntries(counts);
        csvStats = {
          totalRows: total,
          totalInteractions: total,
          countsByWaypoint: countsObj,
        };
        showStats(csvStats);
        applyCountsToBoxes();
        refreshSectionsAndLayout();
        saveToStorage(true);
        hideCsvProgress();
      }
    }
    step();
  }


  // Parser CSV réutilisable (PapaParse si dispo, sinon fallback robuste)
  function parseCsvText(csvText) {
    if (typeof csvText !== "string") return { rows: [], headerMap: {} };

    // PapaParse si présent (gère les quotes/multi-lignes)
    try {
      if (window.Papa && typeof window.Papa.parse === "function") {
        const res = window.Papa.parse(csvText, {
          header: true,
          skipEmptyLines: false,
          dynamicTyping: false,
        });
        const rows = Array.isArray(res?.data) ? res.data : [];
        const headerMap = {};
        if (rows[0])
          Object.keys(rows[0]).forEach((k, idx) => (headerMap[k] = idx));
        return { rows, headerMap };
      }
    } catch (e) {
      console.warn("Papa.parse a échoué, fallback utilisé:", e);
    }

    // Fallback: parsing manuel CSV (supporte quotes, virgule, CRLF)
    const records = [];
    let i = 0,
      cur = "",
      inQ = false,
      row = [],
      headers = null;
    function pushCell() {
      row.push(cur);
      cur = "";
    }
    function pushRow() {
      if (!headers) {
        headers = row.map((h) => h.trim());
      } else {
        const obj = {};
        headers.forEach((h, idx) => (obj[h] = row[idx] ?? ""));
        records.push(obj);
      }
      row = [];
    }
    while (i < csvText.length) {
      const ch = csvText[i],
        nx = csvText[i + 1];
      if (ch === '"') {
        if (inQ && nx === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQ = !inQ;
        i++;
        continue;
      }
      if (!inQ && ch === ",") {
        pushCell();
        i++;
        continue;
      }
      if (!inQ && (ch === "\n" || ch === "\r")) {
        if (ch === "\r" && nx === "\n") i++;
        pushCell();
        pushRow();
        i++;
        continue;
      }
      cur += ch;
      i++;
    }
    pushCell();
    if (row.length) pushRow();

    const headerMap = {};
    if (records[0])
      Object.keys(records[0]).forEach((k, idx) => (headerMap[k] = idx));
    return { rows: records, headerMap };
  }


 function computeCsvStats(data, options = {}) {
    const countUniquePerRow = options.countUniquePerRow !== false; // défaut: true
    const rows = Array.isArray(data) ? data : parseCsvText(data).rows;
    const byCode = Object.create(null);
    const totalInteractions = rows?.length || 0;

    if (!rows || rows.length === 0) {
      return { byCode, byBoxId: {}, totalInteractions: 0 };
    }

    // 1) On localise la colonne "Attributs participant formatés" (tolérance accents/casse)
    const formattedCol = findFormattedColKey(rows[0]);
    console.log(`DEBUG colonne trouvée : `, formattedCol);
    if (!formattedCol) {
      console.warn('Colonne "Attributs participant formatés" introuvable.');
      return { byCode, byBoxId: {}, totalInteractions };
    }

    // 2) On parcourt chaque interaction (ligne)
    for (const row of rows) {
      const formatted = row?.[formattedCol];
      if (typeof formatted !== "string" || formatted.trim() === "") continue;

      // 2.a) On isole la paire LOG_INTERACTION:<valeur ...> dans la liste "clé:valeur"
      const attrsMap = parseFormattedKV(formatted);
      const logInteraction = pickCaseInsensitive(attrsMap, "LOG_INTERACTION");

      if (!logInteraction) continue;
      //console.log(`DEBUG log interaction : `,logInteraction);

      // 2.b) Extraction de TOUS les points de passage ABCD[1234] dans la valeur
      const found = [];
      let m;
      while ((m = WAYPOINT_EXTRACT_RE.exec(logInteraction)) !== null) {
        found.push(`${m[1].toUpperCase()}[${m[2]}]`);
      }

      //    console.log(`DEBUG comptage : `,found.length);
      if (found.length === 0) continue;

      // 2.c) Comptage — par défaut : 1 interaction par boîte si le point apparaît au moins une fois
      const codesToCount = countUniquePerRow
        ? Array.from(new Set(found))
        : found;
      for (const code of codesToCount) {
        console.log(`DEBUG code + 1`, code);
        byCode[code] = (byCode[code] || 0) + 1;
      }
    }

    // 3) Mapping des codes -> boîtes du schéma depuis localStorage('flux_log')
    const byBoxId = mapCountsToBoxes(byCode);
    console.log(`DEBUG mapCountsToBoxes`, byBoxId);

    return { byCode, byBoxId, totalInteractions };

    // Récupère une clé "case‑insensitive"
    function pickCaseInsensitive(obj, key) {
      if (!obj) return undefined;
      const wanted = key.toLowerCase();
      for (const k of Object.keys(obj)) {
        if (k.toLowerCase() === wanted) return obj[k];
      }
      return undefined;
    }
  }


  function normalizeNoDiacritics(str) {
    return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // Essaie de projeter les compteurs par code sur les boîtes du schéma (localStorage 'flux_log')
  function mapCountsToBoxes(codeCounts) {
    const result = {};
    try {
      const raw = localStorage.getItem("flux_log");
      if (!raw) return result;
      const flux = JSON.parse(raw);
      const boxes = Array.isArray(flux?.boxes) ? flux.boxes : [];
      for (const b of boxes) {
        const boxId = b.id || b._id || b.uid || b.label || "";
        const code = (inferBoxPassageCode(b) || "").toUpperCase();
        if (!code) {
          result[boxId || "(sans-code)"] = 0;
          continue;
        }
        result[boxId || code] = codeCounts[code] || 0;
      }
    } catch (e) {
      console.warn("Lecture flux_log impossible:", e);
    }
    return result;
  }

  // Déduit la propriété “point de passage” d’une box (libellé, champ dédié, etc.)
  function inferBoxPassageCode(box) {
    if (!box || typeof box !== "object") return null;
    // champs courants possibles — on teste sans casse ni accents
    const candidates = [
      "pointDePassage",
      "pointdepasse",
      "passage",
      "pdp",
      "checkpoint",
      "passageCode",
      "code",
      "key",
      "tag",
    ];
    const entries = Object.entries(box);
    // 1) champ dédié si présent
    for (const [k, v] of entries) {
      const nk = normalizeNoDiacritics(k).toLowerCase();
      if (candidates.includes(nk) && typeof v === "string" && v.trim())
        return v.trim();
    }
    // 2) embedded dans le label ? ex: "Accueil [IVR123]"
    if (typeof box.label === "string") {
      const m = box.label.match(WAYPOINT_EXTRACT_RE);
      if (m && m.length) return m[0].replace(/[\[\]]/g, "");
    }
    return null;
  }

  // parse "clé:valeur; ..." en gérant les valeurs multi-lignes
  function parseFormattedKV(s) {
    const map = {};
    if (!s || typeof s !== "string") return map;
    const re =
      /(?:^|;)\s*([^:;]+?)\s*:\s*([\s\S]*?)(?=(?:\s*;[^:;]+?\s*:)|$)/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      map[m[1].trim()] = (m[2] || "").trim();
    }
    return map;
  }
  // trouve la colonne "Attributs participant formatés" (tolère la casse/accents)
  function findFormattedColKey(headerMap) {
    const keys = Object.keys(headerMap || {});
    const want = "attributs participant formates";
    for (const k of keys) {
      const norm = (k || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
      if (norm === want) return k;
      if (
        norm.includes("attribut") &&
        norm.includes("participant") &&
        norm.includes("format")
      )
        return k;
    }
    return null;
  }

  // normalise un code en version avec crochets, ex "IVR123" -> "IVR[123]"
  function normWp(code){
    if (!code) return null;
    const s = String(code).trim().toUpperCase();
    // 3-4 lettres + 3-4 chiffres (avec ou sans crochets)
    const m = s.match(/^([A-Z]{3,4})\s*\[?(\d{3,4})\]?$/);
    return m ? `${m[1]}[${m[2]}]` : s;
  }

  // retrouve une box par point de passage
  function getBoxIdByWaypoint(wp) {
    const N = normWp(wp);
    for (const [id, b] of boxes.entries()) {
      if ((b.waypoint || "").toUpperCase() === N) return id;
    }
    return null;
  }
  // crée une box si absente (label = waypoint)
  function ensureBoxForWaypoint(wp) {
    const waypoint = normWp(wp);
    let id = getBoxIdByWaypoint(waypoint);
    if (id) return id;

    // placement simple en grille
    const count = boxes.size;
    const col = count % 4;
    const row = Math.floor(count / 4);
    const x = 40 + col * 160;
    const y = 40 + row * 120;

    const newId = `lbox_${nextId++}`;
    const box = {
      id: newId, x, y, w: 120, h: 80,
      label: waypoint,
      waypoint,
      count: 0,
      userCreated: false,
      locked: false
    };
    boxes.set(newId, box);
    drawBox(box);
    updateBoxCountVisual(newId);
    return newId;
  }


  // crée une connexion entre deux waypoints (s’ils sont valides et non dupliqués)
  function ensureConnectionByWaypoints(fromWp, toWp) {
    const fromId = ensureBoxForWaypoint(fromWp);
    const toId = ensureBoxForWaypoint(toWp);
    // évite doublons exacts
    if (
      connections.some((c) => c.from.boxId === fromId && c.to.boxId === toId)
    )
      return;
    createConnection(fromId, toId);
  }

  // constants pour les sections
  const SECTION_HEIGHT = 220;
  const SECTION_COLORS = ['#fef6e4','#e3f2fd','#f3e5f5','#e8f5e9','#fff3e0','#e0f2f1'];

// récupère le quadrigramme "BACC" depuis "BACC[0123]"
function getQuadriFromWaypoint(wp){
  const m = String(wp||'').toUpperCase().match(/^([A-Z]{3,4})\[\d{3,4}\]$/);
  return m ? m[1] : 'AUTRE';
}

// calcule l'ordre des sections en minimisant les retours vers le haut
function computeSectionOrder(){
  // 1) collecter les groupes
  const groupsSet = new Set();
  boxes.forEach(b => groupsSet.add(getQuadriFromWaypoint(b.waypoint)));
  const groups = Array.from(groupsSet);

  // 2) index
  const idx = Object.fromEntries(groups.map((g,i)=>[g,i]));

  // 3) arêtes pondérées
  const out = new Map(groups.map(g=>[g,new Map()])); // g -> (h -> weight)
  const indeg = new Map(groups.map(g=>[g,0]));
  const outdeg = new Map(groups.map(g=>[g,0]));

  connections.forEach(c=>{
    const fb = boxes.get(c.from.boxId);
    const tb = boxes.get(c.to.boxId);
    if (!fb || !tb) return;
    const gFrom = getQuadriFromWaypoint(fb.waypoint);
    const gTo   = getQuadriFromWaypoint(tb.waypoint);
    if (gFrom === gTo) return;
    const m = out.get(gFrom);
    m.set(gTo, (m.get(gTo)||0)+1);
  });

  // calcul degrés
  groups.forEach(g=>{
    let o=0,i=0;
    out.get(g).forEach(w=>o+=w);
    out.forEach((mp,from)=>{
      if (mp.has(g)) i+= mp.get(g);
    });
    outdeg.set(g,o); indeg.set(g,i);
  });

  // 4) tri topo + heuristique (Kahn + cassure par out-in)
  const order = [];
  const S = groups.filter(g=>indeg.get(g)===0);
  const remaining = new Set(groups);

  const removeNode = (g)=>{
    remaining.delete(g);
    order.push(g);
    out.get(g).forEach((w, h)=>{
      indeg.set(h, indeg.get(h)-w);
    });
    // nettoyer pour éviter les valeurs négatives
    out.get(g).clear();
  };

  while (S.length){ removeNode(S.shift()); }

  // si cyclique, on ajoute par heuristique (plus gros out-in d'abord)
  while (remaining.size){
    const pick = Array.from(remaining).sort((a,b)=> (outdeg.get(b)-indeg.get(b)) - (outdeg.get(a)-indeg.get(a)) )[0];
    removeNode(pick);
    // réévaluer sources restantes
    Array.from(remaining).forEach(g=>{
      if (indeg.get(g)<=0 && !S.includes(g)) S.push(g);
    });
    while (S.length){ removeNode(S.shift()); }
  }

  return order;
}

  // liste triée des quadrigrammes présents
  function getOrderedQuadriList(){
    const set = new Set();
    boxes.forEach(b => set.add(getQuadriFromWaypoint(b.waypoint)));
    return Array.from(set).sort();
  }

  // dessiner les bandes colorées
  function drawSections(){
    const g = document.getElementById('logSectionsGroup');
    if (!g) return;
    g.innerHTML = '';
    const width = svgEl.width.baseVal.value || 2400;
    //const groups = getOrderedQuadriList();
    const groups = computeSectionOrder();
    groups.forEach((code, i)=>{
      const y = i*SECTION_HEIGHT;
      const rect = createSvg('rect', { x:0, y, width, height: SECTION_HEIGHT, class:'log-section', fill: SECTION_COLORS[i % SECTION_COLORS.length] });
      const title = createSvg('text', { x:12, y: y + 20, class:'log-section-title' });
      title.textContent = code;
      g.appendChild(rect);
      g.appendChild(title);
    });
  }

  // repositionner les boîtes dans leur section (grille)
  function layoutBoxesBySections(){
    const cols = 10, cellW = 160, cellH = 120, padX = 20, padY = 40;
    //const groups = getOrderedQuadriList();
    const groups = computeSectionOrder();
    const buckets = new Map(groups.map(g => [g, []]));
    boxes.forEach(b => {
      const g = getQuadriFromWaypoint(b.waypoint);
      if (!buckets.has(g)) buckets.set(g, []);
      buckets.get(g).push(b);
    });
    bucket.sort((a,b)=>a.waypoint.localeCompare(b.waypoint))
    groups.forEach((code, gi)=>{
      const y0 = gi*SECTION_HEIGHT + padY;
      (buckets.get(code)||[]).forEach((b, idx)=>{
        const col = idx % cols;
        const row = Math.floor(idx/cols);
        placeBox(b,padX + col*cellW,y0 + row*cellH, false);
      });
    });
    updateSvgViewportSize();
  }

  function layoutBoxesByWaypointName(){
    const gridCol = 10, cellW = 160, cellH = 120, padX = 20, padY = 20;
    const sorted = Array.from(boxes.values()).slice()
      .sort((a,b)=> (a.waypoint||'').localeCompare(b.waypoint||''));
    sorted.forEach((b, idx)=>{
      const col = idx % gridCol;
      const row = Math.floor(idx / gridCol);
      const nx = padX + col * cellW;
      const ny = padY + row * cellH;
      placeAuto(b, nx, ny);
    });
    if (typeof updateSvgViewportSize === 'function') updateSvgViewportSize();
    if (typeof redrawAllConnections === 'function') redrawAllConnections();
  }

  // redraw complet des connexions après layout
  function redrawAllConnections(){
    connsGroup.innerHTML = '';
    connections.forEach(drawConnection);
    updateSvgViewportSize();
  }

  // orchestrateur
  function refreshSectionsAndLayout(){
    drawSections();
    layoutBoxesBySections();
    redrawAllConnections();
  }

  function placeBox(box, nx, ny, manualMove = false){
    if (box.locked && !manualMove) return;                 // ← ne rien faire si boîte manuelle
    box.x = nx; box.y = ny;
    const g = document.getElementById(box.id);
    if (g) g.setAttribute('transform', `translate(${nx},${ny})`);
  }

  // [NEW] récupère une propriété sans tenir compte de la casse
  function getFieldCaseInsensitive(obj, ...names){
    if (!obj) return undefined;
    const keys = Object.keys(obj);
    for (const n of names){
      const k = keys.find(kk => kk.toLowerCase() === String(n).toLowerCase());
      if (k) return obj[k];
    }
    return undefined;
  }

  // [NEW] retrouve l'id d'une box par waypoint exact (si ta base ne l'a pas)
  function getBoxIdByWaypointExact(wp){
    // si tu as déjà getBoxIdByWaypoint(wp), utilise-la
    if (typeof getBoxIdByWaypoint === 'function') return getBoxIdByWaypoint(wp);
    let found = null;
    boxes.forEach(b => { if (b.waypoint === wp) found = b.id; });
    return found;
  }















  // [NEW] import Excel waypoints
  async function importExcelWaypoints(file){
    if (!window.XLSX){ alert('Librairie XLSX non chargée.'); return; }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type:'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    let created = 0, updated = 0, skipped = 0;

    for (const r of rows){
      let wpRaw = getFieldCaseInsensitive(r, 'Number');        // waypoint
      const desc = String(getFieldCaseInsensitive(r, 'LOG_CALL_X') || '').trim(); // label

      if (!wpRaw){ skipped++; continue; }

      // normaliser waypoint -> "LLLL[DDDD]"
      wpRaw = String(wpRaw).trim().toUpperCase();
      // Si le fichier contient "BACC0123", normWp va matcher et produire "BACC[0123]"
      const wp = normWp(wpRaw);
      if (!wp || !/^[A-Z]{3,4}\[\d{3,4}\]$/.test(wp)){ skipped++; continue; }

      // existe déjà ?
      let boxId = getBoxIdByWaypointExact(wp);
      if (boxId){
        const b = boxes.get(boxId);
        if (desc && b && b.label !== desc){
          b.label = desc;
          // MAJ DOM
          const g = document.getElementById(b.id);
          const title = g && g.querySelector('.log-title');
          if (title) title.textContent = b.label;
          updated++;
        } else {
          // rien à changer
        }
      } else {
        // créer via ta fonction d'auto-création (position initiale quelconque)
        boxId = ensureBoxForWaypoint(wp);
        const b = boxes.get(boxId);
        if (b){
          b.label = desc || wp;
          b.userCreated = false;
          b.locked = false;
          // MAJ DOM
          const g = document.getElementById(b.id);
          const title = g && g.querySelector('.log-title');
          if (title) title.textContent = b.label;
          created++;
        }
      }
    }

    // ranger par nom
    layoutBoxesByWaypointName();

    // feedback + persistance
    saveToStorage(true);
    const msg = `Import Excel terminé — créées: ${created}, mises à jour: ${updated}, ignorées: ${skipped}.`;
    console.log(msg);
    const statusEl = document.getElementById('ldStatus');
    if (statusEl) statusEl.textContent = msg;
    alert(msg);
  }





















  // ====== [ANALYTICS→GRAPH] Construire le graphe depuis les enregistrements IDB ======
  async function buildGraphFromStored(jobId /* facultatif */){
    console.log(`DEBUG buildGraphFromStored : `,jobId)
    const records = jobId
      ? await idbGetAllByIndex(IDB_STORE_INTERACTIONS, 'byJob', jobId)
      : await idbGetAll(IDB_STORE_INTERACTIONS);

    // Progress UI (on réutilise celle du CSV pour uniformiser)
    const total = records.length;
    if (typeof showCsvProgress === 'function') showCsvProgress(total);

    const counts = new Map();
    let i = 0;
    const CHUNK = 250;

    function step(){
      const end = Math.min(i + CHUNK, total);
      for (; i < end; i++){
        const rec = records[i];
        const logVal = rec && rec.logInteraction;
        if (!logVal) continue;

        // Extrait séquence canonique "LLLL[DDDD]"
        const seq = Array.from((logVal || '').matchAll(WAYPOINT_EXTRACT_RE),
                              m => `${m[1].toUpperCase()}[${m[2]}]`);
        if (!seq.length) continue;

        // Compte unique par interaction pour chaque waypoint apparu
        const seen = new Set();
        for (const wp of seq){
          const key = normWp(wp);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          counts.set(key, (counts.get(key) || 0) + 1);
        }

        // Connexions séquentielles
        for (let k = 0; k < seq.length - 1; k++){
          ensureConnectionByWaypoints(seq[k], seq[k+1]);
        }
      }

      if (typeof updateCsvProgress === 'function') updateCsvProgress(i, total);

      if (i < total) {
        setTimeout(step, 0);
      } else {
        // produire des stats compatibles avec showStats()
        csvStats = {
          totalRows: total,
          totalInteractions: total,
          countsByWaypoint: Object.fromEntries(counts)
        };
        if (typeof showStats === 'function') showStats(csvStats);
        if (typeof applyCountsToBoxes === 'function') applyCountsToBoxes();
        saveToStorage(true);
        if (typeof hideCsvProgress === 'function') hideCsvProgress();
        // si tu as un layout par sections, on le relance proprement
        if (typeof refreshSectionsAndLayout === 'function') refreshSectionsAndLayout();
      }
    }
    step();
  }







  // ====== [IDB-EXPORT] Export complet IndexedDB → fichier JSON téléchargeable ======
  async function exportIndexedDbToJson(){
    const db = await idbOpen();
    const stores = [IDB_STORE_JOBS, IDB_STORE_INTERACTIONS];

    async function dumpStore(store){
      return new Promise((resolve, reject)=>{
        const tx = db.transaction(store, 'readonly');
        const st = tx.objectStore(store);
        const out = [];
        const req = st.openCursor();
        req.onsuccess = (e)=>{
          const cursor = e.target.result;
          if (cursor){ out.push(cursor.value); cursor.continue(); }
          else resolve(out);
        };
        req.onerror = ()=> reject(req.error);
      });
    }

    const data = {};
    for (const s of stores){
      data[s] = await dumpStore(s);
    }

    const payload = {
      meta: {
        dbName: IDB_DB_NAME,
        version: IDB_DB_VER,
        exportedAt: new Date().toISOString(),
        stores
      },
      data
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const fname = `${IDB_DB_NAME}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  // ====== [IDB-IMPORT] Import fichier JSON → IndexedDB (clear + insert) ======
  async function idbBulkPutChunked(store, items, chunkSize=500){
    if (!items || !items.length) return;
    const db = await idbOpen();
    for (let i=0; i<items.length; i+=chunkSize){
      const chunk = items.slice(i, i+chunkSize);
      await new Promise((res, rej)=>{
        const tx = db.transaction(store, 'readwrite');
        const st = tx.objectStore(store);
        for (const v of chunk) st.put(v);
        tx.oncomplete = ()=> res();
        tx.onerror    = ()=> rej(tx.error);
      });
    }
  }

  /**
   * Import JSON d’IndexedDB.
   * @param {File|Blob|String} fileOrText - Fichier JSON ou texte JSON
   * @param {Object} options
   * @param {boolean} options.merge - true = fusionner, false = purge puis import (défaut)
   * @returns {{jobs:number, interactions:number}}
   */
  async function importIndexedDbFromJson(fileOrText, { merge=false } = {}){
    let text;
    if (typeof fileOrText === 'string') text = fileOrText;
    else if (fileOrText && typeof fileOrText.text === 'function') text = await fileOrText.text();
    else throw new Error('Paramètre import invalide (attendu: fichier JSON ou string).');

    let parsed;
    try { parsed = JSON.parse(text); } catch(e){ throw new Error('Fichier JSON invalide.'); }
    if (!parsed || !parsed.data) throw new Error('Structure JSON invalide: champ "data" manquant.');

    const jobs = Array.isArray(parsed.data[IDB_STORE_JOBS]) ? parsed.data[IDB_STORE_JOBS] : [];
    const interactions = Array.isArray(parsed.data[IDB_STORE_INTERACTIONS]) ? parsed.data[IDB_STORE_INTERACTIONS] : [];

    // Vérifs rapides des clés (pour éviter les conflits de keyPath)
    const badJob = jobs.find(j => !j || !j.jobId);
    if (badJob) throw new Error('Entrée "jobs" sans jobId.');
    const badInt = interactions.find(r => !r || !r.conversationId);
    if (badInt) throw new Error('Entrée "interactions" sans conversationId.');

    if (!merge){
      await idbClear(IDB_STORE_INTERACTIONS);
      await idbClear(IDB_STORE_JOBS);
    }

    await idbBulkPutChunked(IDB_STORE_JOBS, jobs);
    await idbBulkPutChunked(IDB_STORE_INTERACTIONS, interactions);

    return { jobs: jobs.length, interactions: interactions.length };
  }









  // ---- Progress helpers ----
  function showCsvProgress(total) {
    $("#logsCsvProgress").show();
    const wrap = $("#logsCsvProgress");
    const bar = $("#logsCsvProgressBar");
    bar
      .attr("aria-valuemin", 0)
      .attr("aria-valuemax", total)
      .attr("aria-valuenow", 0);
    bar.css("width", "0%").text("0%");
    wrap.show();
  }
  function updateCsvProgress(done, total) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar = $("#logsCsvProgressBar");
    bar.attr("aria-valuenow", done);
    bar.css("width", pct + "%").text(pct + "%");
  }
  function hideCsvProgress() {
    $("#logsCsvProgress").hide();
  }





















  // ====== COMPTEURS ======
  function applyCountsToBoxes() {
    if (!csvStats) return;
    const counts = csvStats.countsByWaypoint || csvStats.byCode || {};
    boxes.forEach((box, id) => {
      const key = normWp(box.waypoint); // remet en forme canonique
      box.count = key ? counts[key] || 0 : 0;
      updateBoxCountVisual(id);
    });
    saveToStorage();
  }

  function resetCounters() {
    boxes.forEach((box, id) => {
      box.count = 0;
      updateBoxCountVisual(id);
    });
    $("#logsStats").hide().empty();
    saveToStorage();
  }
  function updateBoxCountVisual(id) {
    const box = boxes.get(id);
    const t = document.getElementById(`cnt_${id}`);
    if (t) t.textContent = `(${box.count})`;
  }

  function showStats(stats) {
    const el = $("#logsStats");
    if (!stats) {
      el.hide();
      return;
    }

    // tolérant: supporte l'ancien (countsByWaypoint) et le nouveau (byCode)
    const totalRows = stats.totalRows ?? stats.rowsCount ?? 0; // si tu n’as pas totalRows, mets 0 ou calcule ailleurs
    const totalInteractions =
      stats.totalInteractions ?? stats.interactions ?? 0;

    const codesObj = stats.countsByWaypoint
      ? stats.countsByWaypoint
      : stats.byCode
      ? stats.byCode
      : {}; // fallback

    const uniques = Object.keys(codesObj).length;

    el.html(
      `
  <strong>CSV chargé</strong><br>
  Lignes: <code>${totalRows}</code><br>
  Interactions: <code>${totalInteractions}</code><br>
  Points de passage uniques détectés: <code>${uniques}</code>
`
    ).show();
  }














  // ====== PERSISTENCE ======
  function saveToStorage(){
    const data = {
      boxes: Array.from(boxes.values()),
      connections: connections,
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch(e){
      console.warn('Impossible d\'écrire flux_log', e);
    }
  }
  function loadFromStorage(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      clearDiagram(false);
      (data.boxes||[]).forEach(b => {
        boxes.set(b.id, b);
        nextId = Math.max(nextId, Number((b.id||'').split('_')[1]||1)+1);
        drawBox(b);
      });
      (data.connections||[]).forEach(c => {
        connections.push(c);
        drawConnection(c);
      });
      refreshSectionsAndLayout();
    }catch(e){
      console.warn('Erreur lecture flux_log', e);
    }
  }
  function clearDiagram(confirmMsg){
    if (confirmMsg && !confirm('Vider complètement le diagramme ?')) return;
    boxes.clear();
    connections.splice(0, connections.length);
    boxesGroup.innerHTML = '';
    connsGroup.innerHTML = '';
    const sect = document.getElementById('logSectionsGroup');
    if (sect) sect.innerHTML = '';
    saveToStorage();
  }

  // ====== OUTILS ======
  function getMouseSvgCoords(evt){
    const pt = svgEl.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const m = svgEl.getScreenCTM().inverse();
    const loc = pt.matrixTransform(m);
    return { x: loc.x, y: loc.y };
  }
  function createSvg(tag, attrs){
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs||{}).forEach(k => {
      el.setAttribute(k, attrs[k]);
    });
    return el;
  }

  // ====== STYLES (injection minimale) ======
  const css = `
    #logFlowSvg marker polygon { fill:#666; }
    .log-box .log-rect{ fill:#dae8fc; stroke:#6c8ebf; stroke-width:2; }
    .log-title{ font-weight:bold; fill:#1a1a1a; font-size:13px; }
    .log-waypoint{ fill:#1a1a1a; font-size:11px; }
    .log-counter{ fill:#000; font-size:12px; }
    .log-conn-point{ fill:#fff; stroke:#333; stroke-width:2; cursor:pointer; }
    .log-conn-point.connecting{ fill:#ff6b6b; }
    .log-line{ stroke:#666; stroke-width:2; }
    .log-line.temp{ stroke-dasharray:4,4; }
    .log-section{ opacity:.45; }
    .log-section-title{ font-weight:bold; fill:#333; }
    .log-user-badge { fill:#fff3cd; stroke:#b8860b; stroke-width:1; }
    .log-user-badge-text { font-size:12px; font-weight:700; fill:#8a6d3b; }
    .code-pre{
      max-height: 260px;          /* limite la hauteur */
      overflow: auto;             /* scroll si ça déborde (x et y) */
      white-space: pre;           /* pas de wrap, scroll horizontal pour JSON */
      word-wrap: normal;
      font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.4;
      background: #f8f9fa;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 8px;
      margin-top: 6px;
    }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  
  // Exporter le schéma en JSON (fichier)
  function exportDiagramJson() {
    try {
      const payload = serializeDiagram();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `flux_log-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 0);
    } catch (e) {
      console.error("Export JSON échoué", e);
      alert("Erreur lors de l’export JSON");
    }
  }

  // Importer un JSON de schéma
  function importDiagramJson(evt) {
    const file = evt.target.files && evt.target.files[0];
    evt.target.value = ""; // reset pour ré-importer le même nom
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        deserializeDiagram(data);
        saveToStorage(true); // save immédiat
        alert("Schéma importé avec succès ✅");
      } catch (e) {
        console.error("Import JSON échoué", e);
        alert("Erreur lors de l’import du schéma (format invalide ?)");
      }
    };
    reader.readAsText(file);
  }

  // Snapshot du schéma courant (format stable)
  function serializeDiagram() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      boxes: Array.from(boxes.values()).map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        label: b.label,
        waypoint: b.waypoint,
        count: b.count || 0,
      })),
      connections: connections.map((c) => ({
        id: c.id,
        from: c.from,
        to: c.to,
      })),
    };
  }

  // Recharge un snapshot (avec nettoyage complet et redraw)
  function deserializeDiagram(data) {
    if (
      !data ||
      !Array.isArray(data.boxes) ||
      !Array.isArray(data.connections)
    ) {
      throw new Error("Format JSON invalide (boxes/connections manquants)");
    }
    // vider sans confirmation
    boxes.clear();
    connections.splice(0, connections.length);
    boxesGroup.innerHTML = "";
    connsGroup.innerHTML = "";
    // reconstruire
    data.boxes.forEach((b) => {
      boxes.set(b.id, { ...b, count: Number(b.count || 0) });
      nextId = Math.max(nextId, Number((b.id || "").split("_")[1] || 1) + 1);
      drawBox(b);
    });
    data.connections.forEach((c) => {
      connections.push(c);
      drawConnection(c);
    });
    // recalcul éventuel des compteurs si un CSV est chargé
    if (csvStats) applyCountsToBoxes();
  }

})(window.GCTOOL_LOGFLOW = window.GCTOOL_LOGFLOW || {});

// Auto‑binding au chargement de la page (si le DOM des onglets existe déjà)
$(function(){
  if ($('a[href="#logs-flow"]').length){
    window.GCTOOL_LOGFLOW.initializeLogsFlowTab();
  }
});






