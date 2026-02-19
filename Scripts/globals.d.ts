/**
 * Externally provided globals used by browser scripts.
 * Keep this file minimal to avoid duplicate identifier diagnostics.
 */

declare function require(moduleName: string): any;
declare var $: any;

let usersApi, architectApi, routingApi, analyticsApi;
// Cache global pour les donnÃ©es Genesys
let dataTablesCache = [];
let queuesCache = [];
let skillsCache = [];
let promptsCache = [];
let scheduleGroupsCache = [];
