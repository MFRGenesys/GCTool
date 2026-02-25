/**
 * Copiez ce fichier en `Scripts/org-configs.local.js`
 * puis adaptez les valeurs a votre organisation.
 *
 * Ce fichier example est versionne.
 * Le fichier `.local.js` est ignore par Git.
 */
window.ORG_CONFIGS = {
    org1: {
        name: 'Mon Org',
        clientId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        description: 'Organisation principale',
        authMode: 'implicit', // 'implicit' ou 'pkce'
        region: 'eu_west_1' // ex: 'eu_west_1', 'us_east_1', 'eu_central_1'
    }
};
