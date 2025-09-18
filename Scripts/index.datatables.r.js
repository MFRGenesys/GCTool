/* eslint-disable indent */
//////////////////////////////////////////////////////////
// Genesys EMEA France - PS - Matthieu FRYS
// Description: Affichage des DataTables
// Date: 05/2025
//////////////////////////////////////////////////////////

const platformClient = require(`platformClient`);

// Get client credentials from environment variables
const CLIENT_ID = '55595517-5140-4da9-bd6f-c358b545ae98';
const ORG_REGION = "eu_west_1"; //platformClient.PureCloudRegionHosts.eu_west_1; // eg. us_east_1

let redirectURL = window.location.origin + window.location.pathname;
let usersApi = new platformClient.UsersApi();
let architectApi = new platformClient.ArchitectApi();
let currentUserId;

// Set Genesys Cloud objects
const client = platformClient.ApiClient.instance;

// Set environment
const environment = platformClient.PureCloudRegionHosts[ORG_REGION];
if(environment) client.setEnvironment(environment);

//////////////////////////////////////////////////////////
//get All Datatables
//////////////////////////////////////////////////////////
function GetAllDatatables() {
	
	console.log ("récupération des Datatables");
	let opts = { 
	  "pageSize": 100, // Number | Page size
	  "pageNumber": 1
	};

	// Get datatables
	architectApi.getFlowsDatatables()
		.then((data) => {
			console.log(`getFlowsDatatables success! data: ${JSON.stringify(data,null,2)}`);
			const dataTablesList = document.getElementById('dataTablesList');
        	data.entities.forEach(dataTable => {
				const div = document.createElement('div');
				div.textContent = dataTable.name;
				dataTablesList.appendChild(div);
        	});
		})
	  .catch((err) => {
		console.log("There was a failure calling getFlowsDatatables");
		console.error(err);
	  });
}


//////////////////////////////////////////////////////////
// Authenticate with Genesys Cloud
//////////////////////////////////////////////////////////
client.loginImplicitGrant(CLIENT_ID, redirectURL)
	.then(() => {
		console.log('Authenticated with Genesys Cloud');
		console.log ("redirectURL: " + redirectURL);
		// Make request to GET /api/v2/users/me?expand=presence
			return usersApi.getUsersMe().then(function(userObject) {
				currentUserId = userObject.id;
				console.log("currentUserId " + currentUserId);
				GetAllDatatables();
				return;
			});
	})
	.catch(e => console.error(e));

