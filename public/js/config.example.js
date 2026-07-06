/**
 * App configuration.
 *
 * COUCHDB_URL: Set to your CouchDB server URL to enable cross-device sync.
 * Leave as null to run in local-only mode (no sync).
 *
 * Example: 'https://your-couchdb-host.example.com'
 *
 * The app will append the database name automatically (e.g., /fortudo-fox-742).
 */
export const COUCHDB_URL = null;

/**
 * Feature flag for the browser-scoped Activities availability announcement.
 * Keep false until Activities are ready to announce broadly.
 */
export const ACTIVITIES_ANNOUNCEMENT_ENABLED = false;
