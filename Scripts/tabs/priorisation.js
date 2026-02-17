let currentPage,maxPages,hasMoreInteractions,data,state,isUpdating;

  // ====== INIT (charge HTML à l'ouverture de l'onglet) ======
  function initializePriorisationTab(){
        currentPage = 1;
        maxPages = 10;
        hasMoreInteractions = true;
        data = [];

        // État local (réutilisable plus tard)
        state = {
            selectedConversationIds: new Set(),
            lastResults: [],
            currentQueueId : null
        };
        bindUi();
        populateQueuesSelect();
        setDefaultDate();
  };

  function bindUi(){
    // Select2 si dispo
    if (typeof $ !== 'undefined' && $.fn.select2) {
      $('#prioQueueSelect').select2({
        placeholder: 'Sélectionner une queue…',
        allowClear: true,
        width: '100%'
      });
    }

    $('#prioSearchBtn').on('click', onSearchClicked);
    $('#selectAllCheckbox').on('change', onSelectAllChanged);

    // checkbox ligne -> delegation (tbody recréé)
    $(document).on('change', '.prio-row-check', function(){
      const convId = $(this).attr('data-conversation-id');
      if (!convId) return;

      if (this.checked) state.selectedConversationIds.add(convId);
      else state.selectedConversationIds.delete(convId);
        updateSelectedCount();
    });
  }

  function populateQueuesSelect(){
    const $sel = $('#prioQueueSelect');
    if (!$sel.length) return;

    const queues = queuesCache;

    // rebuild options
    $sel.empty();
    $sel.append(`<option value=""></option>`); // pour allowClear/select2

    queues.forEach(q => {
        if (q.name.substring(0, 4) !== 'MEL_') return; // filtrage simple sur préfixe de nom (à adapter selon besoin)
      $sel.append(`<option value="${escapeHtml(q.id)}">${escapeHtml(q.name)}</option>`);
    });

    // refresh select2
    if ($sel.data('select2')) $sel.trigger('change.select2');

    console.log(`[Priorisation] Queues chargées dans la liste: ${queues.length}`);
  }

  function setDefaultDate(){
    const el = document.getElementById('prioDate');
    if (!el) return;
    const today = new Date("2026-02-01");
    el.value = today.toISOString().slice(0,10);
  }

  async function onSearchClicked(){
    const queueId = $('#prioQueueSelect').val();
    const dateVal = $('#prioDate').val();

    if (!queueId) {
      showStatus('Veuillez sélectionner une queue.', 'warning');
      return;
    }
    state.currentQueueId = queueId;

    try{
      data = await GetQueueInteractions(queueId, dateVal);

      state.lastResults = data;
      state.selectedConversationIds.clear();
      $('#selectAllCheckbox').prop('checked', false);

      renderResults(data);

      showStatus(`Résultats : ${data.length} ligne(s).`, data.length ? 'success' : 'warning');
    } catch (e) {
      console.error('[Priorisation] Erreur API', e);
      showStatus(`Erreur : ${e.message}`, 'danger');
      renderResults([]); // reset table
    }
  }

async function fetchQueueInteractions(queueId, pageNumber = 1) {
    const body = {
        order: 'asc',
        filter: {
            type: 'or',
            predicates: [
                {
                    type: 'dimension',
                    dimension: 'queueId',
                    value: queueId
                }
            ]
        },
        groupBy: [
            'queueId'
        ],
        metrics: [
            {
                metric: 'oWaiting',
                details: true
            }
        ],
        subscribe: true,
        pageNumber: pageNumber,
        pageSize: 50
    };

    try {
        const response = await analyticsApi.postAnalyticsConversationsActivityQuery(body);
        console.log(`[Priorisation] API Response (page ${pageNumber})`, response);
        return response.results[0].entities || [];
    } catch (error) {
        console.error('Erreur lors de la récupération des interactions:', error);
        return [];
    }
}

  async function GetQueueInteractions(queueId, prioDate,startPage = 1, maxPagesToFetch = 10, allInteractions = []){
    let pageNumber = startPage;
    let pagesFetched = 0;
    hasMoreInteractions = true;

    showStatus('Recherche en cours…', 'info');
    while (pagesFetched < maxPagesToFetch && hasMoreInteractions) {
        const interactions = await fetchQueueInteractions(queueId, pageNumber);
        console.log(`[Priorisation] Interactions récupérées (page ${pageNumber}):`, interactions);
        if (interactions.length === 0) {
            hasMoreInteractions = false;
            break;
        }

        allInteractions = allInteractions.concat(interactions);
        
        // Vérifier si la date de la dernière interaction est antérieure à la date sélectionnée
        const lastInteractionDate = new Date(interactions[interactions.length - 1].activityDate);
        const limitDate = new Date(prioDate);
        
        if (lastInteractionDate > limitDate) {
            hasMoreInteractions = false;
        } else {
            pageNumber++;
            pagesFetched++;
        }
    }

    // Afficher ou masquer le bouton pour récupérer plus d'interactions
    const loadMoreButton = document.getElementById('loadMoreButton');
    if (hasMoreInteractions && pagesFetched === maxPagesToFetch) {
        loadMoreButton.style.display = 'block';
    } else {
        loadMoreButton.style.display = 'none';
    }

    return allInteractions;
  }

// Fonction pour charger plus d'interactions
async function loadMoreInteractions() {
    currentPage += maxPages;
    const dateVal = $('#prioDate').val();
    const queueId = state.currentQueueId;
    
    try{
      data = await GetQueueInteractions(queueId,dateVal, currentPage, maxPages,data);

      state.lastResults = data;
      state.selectedConversationIds.clear();
      $('#selectAllCheckbox').prop('checked', false);
      updateSelectedCount()

      renderResults(data);

      showStatus(`Résultats : ${data.length} ligne(s).`, data.length ? 'success' : 'warning');
    } catch (e) {
      console.error('[Priorisation] Erreur API', e);
      showStatus(`Erreur : ${e.message}`, 'danger');
      renderResults([]); // reset table
    }
}

  function renderResults(items){
    const $tb = $('#prioResultsTbody');
    if (!$tb.length) return;
    
    if (!items || !items.length) {
      $tb.html(`
        <tr>
          <td colspan="4" class="text-muted" style="text-align:center;">
            Aucun résultat.
          </td>
        </tr>
      `);
      return;
    }

    const rowsHtml = items.map((it, idx) => {
      const convId = escapeHtml(String(it.conversationId || ''));
      const actDt  = escapeHtml(String(it.activityDate || ''));
      const prioV  = escapeHtml(String(it.routingPriority ?? ''));
      const row =  `
        <tr class="prio-result-row" data-conversation-id="${convId}" data-interaction-date="${it.activityDate}">
          <td style="text-align:center;">
            <input type="checkbox"
                   class="prio-row-check"
                   data-conversation-id="${convId}">
          </td>
          <td><code>${convId}</code></td>
          <td>${actDt}</td>
          <td>${prioV}</td>
        </tr>
      `;

      console.log(`[Priorisation] conversation ${convId} avec date ${it.activityDate} (${new Date(it.activityDate)}) (date selectionnée: ${$('#prioDate').val()})`);
      if (new Date(it.activityDate) > new Date($('#prioDate').val())) {
        return row.replace('prio-result-row', 'prio-result-row posterior'); 
      }
        return row;
    }).join('');

    $tb.html(rowsHtml);
    updateSelectedCount(); // Mettre à jour le nombre de cases cochées après le rendu
  }

  function onSelectAllChanged(event, uncheckAll = false){
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const checked = !!this.checked;
    const prioDate = new Date($('#prioDate').val());

    if (selectAllCheckbox.indeterminate) {
        // Cocher uniquement les lignes non grisées
        $('.prio-row-check').each(function() {
            const row = $(this).closest('tr');
            const interactionDate = new Date(row.data('interaction-date'));
            this.checked = interactionDate <= prioDate;
            const convId = $(this).attr('data-conversation-id');
            if (!convId) return;
            if (this.checked) {
                state.selectedConversationIds.add(convId);
            } else {
                state.selectedConversationIds.delete(convId);
            }
        });
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = true;
    } else if (selectAllCheckbox.checked || uncheckAll) {
        // Décocher toutes les cases
        $('.prio-row-check').each(function() {
            this.checked = false;
            const convId = $(this).attr('data-conversation-id');
            if (!convId) return;
            state.selectedConversationIds.delete(convId);
        });
        selectAllCheckbox.indeterminate = false;
    } else {
        // Cocher toutes les cases
        $('.prio-row-check').each(function() {
            this.checked = true;
            const convId = $(this).attr('data-conversation-id');
            if (!convId) return;
            state.selectedConversationIds.add(convId);
        });
        selectAllCheckbox.indeterminate = true;
    }
    
    showStatus(`Résultats : ${state.selectedConversationIds.size} / ${data.length} ligne(s) sélectionnée(s).`, data.length ? 'success' : 'warning');
    updateSelectedCount();
  }


  // Fonction pour mettre à jour le nombre de cases cochées
function updateSelectedCount() {
    const selectedCount = state.selectedConversationIds.size;
    $('#selectedCount').text(selectedCount);

    const updatePriorityButton = document.getElementById('updatePriorityButton');
    updatePriorityButton.disabled = state.selectedConversationIds.size === 0;
}



  function showStatus(msg, level){
    const el = document.getElementById('prioStatus');
    if (!el) return;
    el.style.display = 'block';
    el.className = `alert alert-${level || 'info'}`;
    el.textContent = msg;
  }

  function escapeHtml(str){
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }




  // Fonction pour mettre à jour la priorité des conversations sélectionnées
async function updatePriority() {
    if (isUpdating) return;
    isUpdating = true;

    const button = document.getElementById('updatePriorityButton');
    button.disabled = true;
    button.textContent = 'Mise à jour en cours...';

    const conversationIds = Array.from(state.selectedConversationIds)
    console.log('[Priorisation] Conversations à mettre à jour', conversationIds, conversationIds.length );
    const batchSize = 200;
    for (let i = 0; i < conversationIds.length; i += batchSize) {
        console.log(`Traitement du batch ${i/batchSize + 1}`); // Log pour vérifier l'entrée dans la boucle
        const batch = conversationIds.slice(i, i + batchSize);
        console.log(`[Priorisation] Mise à jour des conversations ${i + 1} à ${i + batch.length} / ${conversationIds.length}`);
        await Promise.all(batch.map(conversationId => {
            return updateConversationPriority(conversationId);
        }));
        if (i + batchSize < conversationIds.length) {
            await new Promise(resolve => setTimeout(resolve, 60000)); // Temporisation de 1 minute
        }
    }
    
    $('#selectAllCheckbox').prop('checked', false);
    button.textContent = 'Mettre à jour la priorité';
    isUpdating = false;
}

// Fonction pour mettre à jour la priorité d'une conversation
async function updateConversationPriority(conversationId) {
    console.log(`[Priorisation] Mise à jour de la priorité pour la conversation ${conversationId}...`);
    const body = {
        priority: 1000100
    };

    try {
        const response = await routingApi.patchRoutingConversation(conversationId, body);
        console.log(`Priorité mise à jour pour la conversation ${conversationId}`, response);

        // Mettre à jour l'interface utilisateur pour montrer que la mise à jour est faite
        const row = document.querySelector(`tr[data-conversation-id="${conversationId}"]`);
        if (row) {
            row.classList.add('updated');
        }
    } catch (error) {
        console.error(`Erreur lors de la mise à jour de la priorité pour la conversation ${conversationId}:`, error);
    }
}
