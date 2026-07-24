# CouchDB Sync Setup (IBM Cloudant)

**Document type:** Operational setup reference

This guide walks through setting up IBM Cloudant as the CouchDB sync relay for Fortudo.

Service facts and links in this guide were last checked on **2026-07-23**. Recheck IBM's
current documentation before provisioning an instance or changing production access.

Cloudant is a managed CouchDB-compatible database from IBM. IBM currently describes the
[Lite plan](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-ibm-cloud-public) as a free
evaluation and testing tier with 1 GB of storage, 20 reads/sec, 10 writes/sec, and 5 global
queries/sec. Those limits are sufficient for Fortudo's observed personal use, but Lite is not
IBM's recommended production tier. Lite instances created on or after 2025-03-03 are also
limited to 20 databases; older instances are currently exempt from that database-count limit.
Because Fortudo uses one database per room, verify the instance's current database capacity
before adding rooms. See IBM's
[database-limit notice](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-deprecations-for-ibm-cloudant).

## 1. Create a Cloudant instance

1. Sign up at [IBM Cloud](https://cloud.ibm.com/registration).
2. Go to the [Cloudant catalog page](https://cloud.ibm.com/catalog/services/cloudant).
3. Select the **Lite** plan.
4. **Important for the current Fortudo client:** Under authentication, choose
   **"Use both legacy credentials and IAM"**. Fortudo's direct browser sync currently uses
   legacy HTTP Basic credentials and does not implement IBM IAM token exchange or refresh.
   PouchDB's [remote database options](https://pouchdb.com/api.html) can inject other authorization
   headers through a custom `fetch`, so IAM-only support is possible with application changes; it
   is not supported by Fortudo today. IBM recommends IAM-only access where possible, so treat
   combined mode as an explicit compatibility tradeoff.
5. Click **Create**.

## 2. Get your credentials

1. Go to your [IBM Cloud Resource List](https://cloud.ibm.com/resources).
2. Find your Cloudant instance under **Databases** and click it.
3. Go to **Service credentials** > **New credential** > **Add**.
4. Expand the new credential. You need:
   - `url` — your Cloudant instance URL (e.g., `https://abc123-bluemix.cloudantnosqldb.appdomain.cloud`)
   - `username` and `password` — legacy credentials for PouchDB

The URL with embedded credentials looks like:

```
https://<username>:<password>@<host>.cloudantnosqldb.appdomain.cloud
```

> **Note:** In combined legacy-and-IAM mode, the generated legacy username and password are
> equivalent to Manager access. IBM documents this in
> [Managing access for IBM Cloudant](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-managing-access-for-cloudant).
> For database-scoped legacy access, see "Option B" below.

## 3. Enable CORS

The browser needs permission to make cross-origin requests to Cloudant.

1. From your Cloudant instance, click **Launch Dashboard**.
2. Go to **Account** > **CORS**.
3. Enable CORS and add your Firebase Hosting domains.

For this repo (`fortudo`), allowlist exact origins:

- Production: `https://fortudo.web.app` and `https://fortudo.firebaseapp.com`
- Preview channels: each exact active preview URL that needs browser-based Cloudant access

Cloudant's restricted-origin mode documents exact origins, not glob patterns such as
`https://fortudo--*.web.app`. Copy the exact preview URL from the GitHub Actions deploy step or
Firebase Console > Hosting > Channels, add it only while needed, and remove it when the preview
channel is deleted.

Do **not** use "All domains" in production. CORS controls which browser origins may issue
requests; it does not authenticate users, hide a credential shipped to the browser, or restrict
non-browser clients. See IBM's
[CORS security guidance](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-cross-origin-resource-sharing).

## 4. Manual database provisioning

Fortudo uses one database per room code (for example, `fortudo-fox-742`), but the browser does not
create Cloudant databases. Replication uses PouchDB's `skip_setup: true`; entering a room whose remote
database does not exist leaves that room local-only and reports that sync is not provisioned.

The database must be created by an operator before the room can sync. At present this repository
intentionally provides no supported production provisioning command. Do not infer that entering a
room code, possessing the shared credential, or creating local data has provisioned its remote.

The current compatibility release deliberately allows an existing database with no Fortudo
document-contract validator to sync while reporting `missing-validator`. A missing database,
partitioned database, corrupt or mismatched validator, or validator newer than the client blocks
sync. See [sync-contract.js](../../public/js/sync-contract.js).

That tolerance is a rollout state, not the target provisioning design. A future production room is
intended to be provisioned fence-first:

1. Create the exact empty, nonpartitioned database.
2. Install and verify the exact current Fortudo validator.
3. Only then enable client replication.

Until a general fence-first production operation is reviewed, creating a new unfenced remote is an
explicit compatibility exception rather than routine room setup. An existing nonempty database
needs its own inventory, state binding, recovery decision, approval, and verified validator
installation; do not copy the completed `dat-411` write command to another room.

Two credential arrangements remain possible after manual provisioning:

### Option A: Shared service credentials in the URL (simplest)

Create the database through the Cloudant Dashboard or an explicitly approved administrative
request, then include the existing service credentials in `COUCHDB_URL`.

In `public/js/config.js`:

```js
export const COUCHDB_URL =
  'https://<username>:<password>@<host>.cloudantnosqldb.appdomain.cloud';
```

**Pros:** No separate API-key grant step.

**Cons:** Every room still needs manual provisioning. The Manager-equivalent credential is visible
in the browser and can operate across the Cloudant account rather than only the active room. This
is an accepted risk for the current personal/household deployment, not a suitable public-facing
design.

### Option B: Manually provision with scoped API keys

Keep the account-wide credential out of the browser. Create the database ahead of time and grant a
legacy Cloudant API key access only to the database or fixed set of databases the deployment needs.

```bash
HOST="https://<username>:<password>@<host>.cloudantnosqldb.appdomain.cloud"

# For an already approved database, generate a Cloudant API key
curl -X POST "$HOST/_api/v2/api_keys"
# Returns: {"key": "...", "password": "...", "ok": true}
```

Treat both the response and the current database `_security` document as private. Read the current
`_security` value, add this entry to its existing `cloudant` mapping, then `PUT` the complete merged
document and reread it:

```json
"YOUR_API_KEY": ["_reader", "_writer", "_replicator"]
```

Do not submit a replacement object containing only that entry: doing so can remove existing
principals or roles. Verify that the intended entry was added and every pre-existing entry is
unchanged. The three roles are the union needed when the same database participates in both
directions of PouchDB synchronization: document reads, document writes, and replication
checkpoints. See IBM's
[replication permissions](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-replication-guide#permissions).

Then in `public/js/config.js`, use the scoped API-key credentials:

```js
export const COUCHDB_URL =
  'https://<api_key>:<api_password>@<host>.cloudantnosqldb.appdomain.cloud';
```

Fortudo currently has one global `COUCHDB_URL`. It can therefore use one scoped API key granted to
one database or a fixed set of databases, but it cannot select a different credential for each room.
Granting the same key to more databases broadens that key's blast radius. Distinct room credentials,
invitations, and revocation require the separate room identity and access redesign.

**Pros:** The browser credential is limited to the databases explicitly granted.

**Cons:** Manual database creation and permission grants are required; the present client still
shares one credential across every room it can sync.

### Recommendation

The current personal deployment accepts Option A's account-wide shared-credential risk. Option B can
reduce that blast radius for a fixed deployment, but it is not a per-room invitation system. In
either case, database creation is an operator action, not browser behavior, and fence-first
provisioning is the intended production posture.

For an existing nonempty room or a migration, start with
[Cloudant migration toolkit boundaries](../operations/CLOUDANT-MIGRATION-TOOLKIT.md). Its reusable
read-only components are not blanket authorization to provision, fence, or migrate a database.

## 5. Connect Fortudo

The repo tracks `public/js/config.js` with `COUCHDB_URL = null`, which means local-only mode is explicit by default.

To enable sync locally, edit `public/js/config.js`:

```js
export const COUCHDB_URL =
  'https://<credentials>@<host>.cloudantnosqldb.appdomain.cloud';
```

The app constructs the full database URL automatically (e.g., appending `/fortudo-fox-742`).

### Preview deployments isolate data

Preview channels use a separate database prefix to avoid touching production data.

- Production: `fortudo-<room>`
- Preview: `fortudo-preview-<room>`

The UI still shows the original room code; only the underlying database name changes.

### GitHub Actions CI/CD deployment (tracked default config + secret override)

If you use the GitHub Actions workflow in this repo, the tracked `public/js/config.js` stays at `COUCHDB_URL = null` unless CI overrides it from a repository secret.

1. In GitHub, add a repository secret named `COUCHDB_URL`.
2. Set it to your full Cloudant URL (with credentials).

During the build job, the workflow overwrites `public/js/config.js` only when the secret is present. If the secret is missing (for example on PRs from forks), the tracked local-only default remains in place.

The GitHub repository secret protects the value during CI configuration, but it does **not** remain
a secret at runtime. The deployed browser must receive `config.js`, so any user who can load the
application can recover the Cloudant credential.

## 6. Update Firebase Hosting headers

Add the Cloudant domain to `Content-Security-Policy` in `firebase.json` so the browser allows connections:

```json
{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "headers": [
      {
        "source": "**",
        "headers": [
          {
            "key": "Content-Security-Policy",
            "value": "default-src 'self'; connect-src 'self' https://*.cloudantnosqldb.appdomain.cloud; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; font-src 'self' https://cdnjs.cloudflare.com"
          }
        ]
      }
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

Then deploy:

```bash
firebase deploy
```

## Security considerations

The browser credential is embedded in deployed `config.js`. Anyone who can load the application can
extract it from the source or network configuration and operate outside the Fortudo UI.

With Option A, that credential is Manager-equivalent and the potential impact spans the Cloudant
account: database enumeration, reads, writes, deletion, provisioning, and quota consumption. With
Option B, impact is limited to the databases and roles granted to that API key.

The current personal/household deployment explicitly accepts Option A under this threat model:

- Only trusted household members are expected to load the application.
- The application URL is not intentionally advertised, while recognizing that URL secrecy is not
  authentication.
- The operator accepts the account-wide blast radius of exposing the shared credential.
- Task and activity data may contain private descriptions even though the deployment is intended for
  personal use.
- A room code is a database selector and friendly label, not an access-control boundary.
- Local PouchDB replicas support offline use but are not backups. Remote deletion tombstones or bad
  revisions can replicate into connected clients; an offline copy may help manual recovery but
  provides no guarantee.

Reassess this decision if the audience broadens, rooms cross trust boundaries, the data becomes more
sensitive, the database count grows, or remote loss is no longer tolerable. The architectural debt
and future direction are documented in
[Room identity and access risk](../architecture/ROOM-IDENTITY-AND-ACCESS-RISK.md).

Possible mitigations have different strengths:

1. **Authenticated server-side proxy or control plane:** Keep Cloudant credentials on the server and
   authorize each user and room operation there. Firebase Authentication can establish identity, but
   authentication alone is not sufficient if the backend then hands the raw Cloudant credential to
   the browser.
2. **Scoped legacy API key:** Limit the current deployment credential to a fixed set of databases.
   This reduces account-wide blast radius but does not add distinct per-room invitations or
   revocation to the current client.
3. **HTTP access gateway:** Reduce who can load the site. This is useful defense in depth but does
   not constrain a Cloudant credential after an authorized browser receives it.
4. **Independent recovery copy:** Use a reviewed replication or export process and test recovery.
   Cloudant's intra-service redundancy provides availability, while IBM recommends
   [replication or export](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-security#protection-against-data-loss-or-corruption)
   for additional data redundancy.

## Gotchas

### Distinguish rate limiting from CORS

Cloudant returns HTTP `429 Too Many Requests` when an instance exceeds a request-class capacity
limit. Fortudo can surface transport failures as a generic sync error, so do not diagnose every
browser-reported network or CORS failure as either CORS or rate limiting without evidence.

Check the browser network response when it is available and inspect the instance's Cloudant
Monitoring metrics for 429s. Ordinary application changes remain in local PouchDB and can sync after
capacity is available. Operator tooling must use bounded batching and retry with backoff; Fortudo's
reusable Cloudant client does so. Do not change PouchDB batch settings ad hoc without exercising the
sync and recovery tests. See IBM's
[429 guidance](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-usage-and-charges#provisioned-throughput-capacity-and-429-http-responses).

### Cloudant vs CouchDB differences

Cloudant is CouchDB-compatible but has some limits:

- Max JSON document size: 1 MB
- Max request size: 11 MB (vs CouchDB's 4 GB default)
- Max attachment size: 10 MB
- Provisioned throughput limits can return HTTP 429
- Authentication and authorization include IBM IAM and Cloudant legacy controls; do not assume a
  self-hosted CouchDB access configuration transfers unchanged
- No `couch_peruser` plugin

The size limits do not affect Fortudo's current small JSON documents, but access configuration,
throughput, database count, and the current nonpartitioned-database requirement all matter
operationally. See IBM's
[Cloudant and CouchDB comparison](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-couchdb-and-cloudant).

## Cost

As of the verification date at the top of this guide, IBM lists Lite as free. This is a current
service-plan fact, not a promise that pricing or terms can never change.

At more than 1 GB of measured storage, Lite blocks document creates and updates while reads and
deletes remain available. After data is deleted below the limit, IBM says write access can take up
to 24 hours to return. Recheck
[plans and provisioning](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-ibm-cloud-public) and
[usage and charges](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-usage-and-charges) before
depending on current limits.

## Migrating away

Cloudant provides replication and JSON export paths for data portability. Moving to a compatible
CouchDB is practical, but it is an operation to verify rather than a URL-only switch:

1. Set up CouchDB elsewhere (Docker, Fly.io, a home server, etc.)
2. Use a reviewed replication or export process with a narrow, rotatable credential.
3. Verify the expected live, deleted, and conflicting revisions and design documents at the target.
4. Recreate and verify authorization, `_security`, CORS, validator, provisioning, and hosting
   configuration; those operational controls do not transfer merely by copying documents.
5. Update `COUCHDB_URL`, deploy, and exercise synchronization before retiring the source.

Do not put Fortudo's long-lived shared Manager credential into a durable `_replicator` document. A
deleted replication document can retain credential material in revision history. The completed
taxonomy migration instead used a bounded transient replication request and verified target state;
future operator work should choose and review its credential lifecycle explicitly. See
[Cloudant migration toolkit boundaries](../operations/CLOUDANT-MIGRATION-TOOLKIT.md) and IBM's
[replication security guidance](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-replication-guide).

The CouchDB replication model gives Fortudo strong data portability, but Cloudant-specific access,
limits, and operational configuration still require migration work. See IBM's
[data-portability guidance](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-data-portability).
