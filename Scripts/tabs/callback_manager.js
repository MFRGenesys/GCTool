// Remplir la liste déroulante avec les queues
const queueSelect = document.getElementById('queueSelect');
for (const [key, value] of Object.entries(queuesCache)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = key;
    queueSelect.appendChild(option);
}

// Gestion du clic sur le bouton pour voir les callbacks
document.getElementById('viewCallbacksBtn').addEventListener('click', function() {
    const queueId = queueSelect.value;
    if (!queueId) return; // Aucune sélection

    fetchCallbacks(queueId);
});

// Fonction pour récupérer et afficher les callbacks
function fetchCallbacks(queueId) {
    const requestBody = {
        order: "desc",
        orderBy: "conversationStart",
        paging: {
            pageNumber: 1,
            pageSize: 50
        },
        interval: "2022-02-09T07:00:00.000Z/2022-02-10T07:00:00.000Z",
        segmentFilters: [{
            type: "and",
            predicates: [
                { dimension: "segmentEnd", operator: "notExists" },
                { dimension: "mediaType", value: "callback" },
                { dimension: "queueId", value: queueId }
            ]
        }],
        conversationFilters: []
    };

    // Envoi de la requête POST
    fetch('https://your-api-endpoint.com/callbacks', { // Remplacez par l'URL de votre API
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
    })
    .then(response => response.json())
    .then(data => {
        displayCallbacks(data); // Suppose que la réponse contient la liste des callbacks
    })
    .catch(error => {
        console.error('Erreur:', error);
    });
}

function displayCallbacks(callbacks) {
    const callbacksList = document.getElementById('callbacksList');
    callbacksList.innerHTML = '<h4>Callbacks en attente :</h4>';

    if (callbacks.length === 0) {
        callbacksList.innerHTML += '<p>Aucun callback en attente.</p>';
        return;
    }

    const list = document.createElement('ul');
    callbacks.forEach(callback => {
        const item = document.createElement('li');
        item.textContent = `Callback ID: ${callback.id} - Heure de début: ${callback.conversationStart}`;
        list.appendChild(item);
    });
    callbacksList.appendChild(list);
}