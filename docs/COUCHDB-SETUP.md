# CouchDB Sync Setup (IBM Cloudant)

This guide walks through setting up IBM Cloudant (free tier) as the CouchDB sync relay for Fortudo.

Cloudant is a managed CouchDB-compatible database from IBM. The Lite plan is permanently free (not a trial) with 1 GB storage, 20 reads/sec, and 10 writes/sec — more than enough for a personal to-do app.

## 1. Create a Cloudant instance

1. Sign up at [IBM Cloud](https://cloud.ibm.com/registration) (no credit card required for Lite plan).
2. Go to the [Cloudant catalog page](https://cloud.ibm.com/catalog/services/cloudant).
3. Select the **Lite** plan.
4. **Important:** Under authentication, choose **"Use both legacy credentials and IAM"**. PouchDB does not support IAM-only authentication.
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

> **Note:** Service credentials always have Manager-level access. For more restricted access, generate a Cloudant API key (see "Option B" below).

## 3. Enable CORS

The browser needs permission to make cross-origin requests to Cloudant.

1. From your Cloudant instance, click **Launch Dashboard**.
2. Go to **Account** > **CORS**.
3. Enable CORS and add your Firebase Hosting domain (e.g., `https://your-app.web.app`).

Do **not** use "All domains" in production — restrict to your exact origin.

## 4. Database creation

Fortudo creates a database per room code (e.g., `fortudo-fox-742`). Databases need to exist on Cloudant before PouchDB can replicate to them. Two approaches:

### Option A: Admin credentials in the URL (simplest)

Include your service credentials in `COUCHDB_URL`. When PouchDB connects as an admin, Cloudant auto-creates databases on first write.

In `public/js/config.js`:

```js
export const COUCHDB_URL = 'https://<username>:<password>@<host>.cloudantnosqldb.appdomain.cloud';
```

**Pros:** Zero setup per room. New room codes just work.
**Cons:** Credentials are visible in the browser (network tab, JS source). Acceptable for personal/household use; not suitable for a public-facing app.

### Option B: Pre-create databases with scoped API keys

Keep admin credentials out of the browser. Create each room's database ahead of time and grant access via a scoped API key.

```bash
HOST="https://<username>:<password>@<host>.cloudantnosqldb.appdomain.cloud"

# Create the database
curl -X PUT "$HOST/fortudo-fox-742"

# Generate a Cloudant API key
curl -X POST "$HOST/_api/v2/api_keys"
# Returns: {"key": "...", "password": "...", "ok": true}

# Grant the API key read/write/replicate access to the database
curl -X PUT "$HOST/fortudo-fox-742/_security" \
  -H "Content-Type: application/json" \
  -d '{
    "cloudant": {
      "YOUR_API_KEY": ["_reader", "_writer", "_replicator"]
    }
  }'
```

Then in `public/js/config.js`, use the API key credentials:

```js
export const COUCHDB_URL = 'https://<api_key>:<api_password>@<host>.cloudantnosqldb.appdomain.cloud';
```

You can reuse the same API key across multiple databases by adding it to each database's `_security` document.

**Pros:** Scoped access — the API key can only read/write databases you've explicitly granted.
**Cons:** Manual step to create each database and grant permissions.

### Recommendation

For personal/household use, **Option A** is the pragmatic choice. If you add more rooms rarely, **Option B** is worth the extra step for better security.

## 5. Connect Fortudo

Copy the config template and set your Cloudant URL:

```bash
cp public/js/config.example.js public/js/config.js
```

Edit `public/js/config.js`:

```js
export const COUCHDB_URL = 'https://<credentials>@<host>.cloudantnosqldb.appdomain.cloud';
```

The app constructs the full database URL automatically (e.g., appending `/fortudo-fox-742`).

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

Credentials (admin or API key) are embedded in `config.js`, which is served as a static file. Anyone who can load the site can view source and extract them. This means they could read, modify, or delete your Cloudant data, or consume your free-tier quota.

**Why this is acceptable for Fortudo:**
- The site URL is not publicly shared — only known to household members
- The data is non-sensitive (daily to-do items)
- Room codes add a layer of obscurity (someone would need to know or guess a code to find your data)
- The app works fully offline without sync, so a compromised Cloudant instance is an inconvenience, not a data loss event (your local PouchDB is the source of truth)

**If your threat model changes** (e.g., you share the URL more broadly), consider:
1. **Firebase Cloud Function as a proxy** — holds Cloudant credentials server-side, the browser never sees them. Firebase Functions has a free tier.
2. **Firebase Authentication** — gate the app behind Google sign-in. Only authenticated users get the sync URL (served dynamically, not as a static file).
3. **HTTP gateway** — put Cloudflare Access or similar in front of the site to require a password before the app loads at all.

## Gotchas

### Rate limiting looks like CORS errors

Cloudant's Lite plan enforces 20 reads/sec and 10 writes/sec. When you hit these limits, the 429 response is missing CORS headers, so the browser reports it as a CORS error — not a rate limit error.

If you see unexpected CORS errors during sync, this is likely the cause. The current sync implementation uses single-shot replication which should stay well within limits for a personal app, but if you hit issues, reduce PouchDB's batch size:

```js
db.replicate.to(remoteUrl, { batch_size: 5, batches_limit: 1 });
```

### Cloudant vs CouchDB differences

Cloudant is CouchDB-compatible but has some limits:
- Max request size: 11 MB (vs CouchDB's 4 GB default)
- Max attachment size: 10 MB
- No `_users` database (auth is via IAM or Cloudant API keys, not CouchDB users)
- No `couch_peruser` plugin

None of these affect Fortudo's use case (small JSON task documents, no attachments).

## Cost

**Free.** The Cloudant Lite plan is permanently free with no expiration. If you exceed 1 GB storage, writes are blocked until you delete data or upgrade.

## Migrating away

If you outgrow Cloudant or want to self-host, you can move to any CouchDB instance:

1. Set up CouchDB elsewhere (Docker, Fly.io, a home server, etc.)
2. Use Cloudant's built-in replication to copy your databases to the new CouchDB
3. Update `COUCHDB_URL` in `config.js` to point to the new host
4. Redeploy

The CouchDB replication protocol is an open standard — your data is never locked in.
