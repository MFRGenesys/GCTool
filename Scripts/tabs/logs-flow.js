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
  const MAX_OUTGOING = 3;

  // [NOUVEAU] RegExp de validation stricte (ex: MEN[101])
  const WAYPOINT_VALIDATE_RE = /^[A-Za-z]{3,4}\[\d{3,4}\]$/;

  // [NOUVEAU] RegExp d'extraction dans des textes (globale + captures)
  const WAYPOINT_EXTRACT_RE = /([A-Za-z]{3,4})\[(\d{3,4})\]/g;
  const STORAGE_KEY = 'flux_log';

  // ====== INIT (charge HTML à l'ouverture de l'onglet) ======
  logFlow.initializeLogsFlowTab = function initializeLogsFlowTab() {
    // Charger le HTML quand l’onglet est affiché pour la 1ère fois
    $('a[href="#logs-flow"]').one('shown.bs.tab', function() {
      $('#logsFlowContent').load('./Scripts/tabs/logs-flow.html', function(){
        setupDomRefs();
        bindUi();
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

    // Connexion temporaire (suivi souris)
    svgEl.addEventListener('mousemove', onMouseMoveWhileConnecting);
    svgEl.addEventListener('mouseup', (e)=>{
      if (isConnecting && !e.target.classList.contains('log-conn-point')) cancelConnection();
    });

    // Boutons
    document.getElementById('logsCsvInput').addEventListener('change', onCsvSelected);
    document.getElementById('clearCountersBtn').addEventListener('click', resetCounters);
    document.getElementById('clearDiagramBtn').addEventListener('click', () => clearDiagram(true));

    // Modal
    $('#logBoxSaveBtn').on('click', saveBoxFromModal);
  }

  // ====== MODAL CRÉATION ======
  let pendingBoxPos = {x:0,y:0};
  function openCreateBoxModal(x,y){
    pendingBoxPos = {x,y};
    $('#logBoxLabel').val('');
    $('#logBoxWaypoint').val('');
    $('#logBoxModal').modal('show');
  }

  function saveBoxFromModal(){
    const label = ($('#logBoxLabel').val()||'').trim();
    let waypoint = ($('#logBoxWaypoint').val()||'').trim();
    waypoint = waypoint.toUpperCase();
    if (!label){
      alert('Veuillez saisir un label');
      return;
    }
    if (!WAYPOINT_VALIDATE_RE.test(waypoint)){
      alert('Point de passage invalide. Format attendu: 3-4 lettres + [3-4 chiffres] ex: MEN[101]');
      return;
    }
    const id = `lbox_${nextId++}`;
    const box = {
      id, x: pendingBoxPos.x, y: pendingBoxPos.y, w: 120, h: 80, 
      label, waypoint, count: 0
    };
    boxes.set(id, box);
    drawBox(box);
    updateBoxCountVisual(id);
    $('#logBoxModal').modal('hide');
    saveToStorage();
    // recalcul counters si CSV déjà chargé
    if (csvStats) applyCountsToBoxes();
  }

  // ====== DESSIN DES BOÎTES ======
  function drawBox(box){
    // groupe
    const g = createSvg('g', { id: box.id, class: 'log-box', transform:`translate(${box.x},${box.y})` });
    // rect
    const rect = createSvg('rect', { width: box.w, height: box.h, rx:5, class:'log-rect' });
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
    const box = boxes.get(id);
    const rectCanvas = canvasEl.getBoundingClientRect();
    const startOffset = {
      x: e.clientX - rectCanvas.left - box.x,
      y: e.clientY - rectCanvas.top - box.y
    };
    let dragging = true;

    function onMove(ev){
      if (!dragging) return;
      const nx = Math.max(0, Math.min(ev.clientX - rectCanvas.left - startOffset.x, canvasEl.clientWidth - box.w));
      const ny = Math.max(0, Math.min(ev.clientY - rectCanvas.top - startOffset.y,  canvasEl.clientHeight - box.h));
      box.x = nx; box.y = ny;
      const g = document.getElementById(id);
      if (g) g.setAttribute('transform', `translate(${nx},${ny})`);
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

  // ====== CONNEXIONS ======
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

  function drawConnection(conn) {
    const from = boxes.get(conn.from.boxId);
    const to = boxes.get(conn.to.boxId);
    if (!from || !to) return;

    const baseFromX = from.x + from.w / 2;
    const fromY = from.y + from.h;
    const toX = to.x + to.w / 2;
    const toY = to.y;

    // [NEW] Disposer légèrement les connexions sortantes en éventail
    const outgoing = connections.filter(
      (c) => c.from.boxId === conn.from.boxId
    );
    const idx = outgoing.findIndex((c) => c.id === conn.id);
    const n = Math.max(outgoing.length, 1);
    const spread = 16; // écart horizontal entre traits (px)
    const fromX = baseFromX + (idx - (n - 1) / 2) * spread;

    const line = createSvg("line", {
      x1: fromX,
      y1: fromY,
      x2: toX,
      y2: toY,
      class: "log-line",
      "marker-end": "url(#logArrow)",
      "data-id": conn.id,
    });

    line.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (confirm("Supprimer cette connexion ?")) {
        deleteConnection(conn.id);
      }
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
        // Normalise le code en MAJ pour la clé d’agrégation
        //console.log(`DEBUG exec log : `,m);
        found.push(m[1].toUpperCase());
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
    function normWp(code) {
      if (!code) return null;
      const core = code
        .toUpperCase()
        .replace(/^([A-Za-z]{3,4}\[\d{3,4})\]?$/, "$1");
      return `[${core}]`;
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
        id: newId,
        x,
        y,
        w: 120,
        h: 80,
        label: waypoint,
        waypoint,
        count: 0,
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

    // ---- Progress helpers ----
    function showCsvProgress(total) {
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
