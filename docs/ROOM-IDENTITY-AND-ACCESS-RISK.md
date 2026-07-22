# Room Identity and Access Risk

## Status

This document records an architectural and security diagnosis of Fortudo's room model as observed on 2026-07-21. It does not authorize a room migration, Cloudant permission change, credential rotation, or production write.

The repository already accepts browser-visible Cloudant administrator credentials for personal and household use. This diagnosis preserves that historical decision while separating it from additional room-identity risks that were not fully analyzed when the decision was recorded.

## Executive summary

Fortudo currently uses one user-entered room code as:

- the label displayed in the UI;
- the persistent local PouchDB database locator;
- the persistent remote Cloudant database locator;
- the value a user enters to select or share a room.

The room code is not a true authentication secret. The deployed static application contains one shared credentialed Cloudant URL. The currently deployed credential has administrative capability across the Cloudant account, so a technically capable holder can enumerate databases instead of guessing room codes.

This creates two related but distinct risks:

1. **Accepted credential exposure:** `docs/COUCHDB-SETUP.md` explicitly accepts administrator credentials in the browser for a personal or household threat model.
2. **Unresolved room coupling:** display name, immutable database identity, sharing, and access control are not separate concepts. This prevents safe renaming, collision avoidance, scoped authorization, invitation revocation, and independent credential rotation.

Increasing room-code entropy alone would address guessing and accidental collision, but it would not fix account-wide credential exposure or provide room-level authorization.

## Current model

| Concern              | Current implementation                                                |
| -------------------- | --------------------------------------------------------------------- |
| Displayed room name  | Raw room code                                                         |
| Saved room reference | Raw room code in browser `localStorage`                               |
| Local database       | `fortudo-<room-code>`                                                 |
| Remote database      | `fortudo-<room-code>`                                                 |
| Join mechanism       | Enter any nonempty room code                                          |
| Authentication       | Shared credentialed Cloudant URL in static `config.js`                |
| Authorization scope  | Account-wide administrative credential in the observed deployment     |
| Membership           | None                                                                  |
| Invitation           | Share the room code                                                   |
| Revocation           | None at the room or invitation level                                  |
| Rename               | No independent label; selecting another code selects another database |

Preview deployments insert a `preview-` database prefix, but otherwise use the same model.

## Repository evidence

### Room generation and entry

`public/js/room-manager.js` generates codes from 16 words and 900 three-digit numbers using `Math.random()`. This produces 14,400 generated values, or approximately 13.81 bits of namespace entropy.

The collision probability grows according to the birthday bound:

- 100 independently generated rooms have about a 29% probability of at least one collision.
- 142 independently generated rooms have about a 50% probability of at least one collision.

Generation does not reserve a code or check remote availability before showing it to the user.

`public/js/room-renderer.js` also accepts arbitrary nonempty input after trimming and lowercasing. Therefore, the 14,400-value calculation applies only to generated codes, not every code users may enter. Human-chosen codes must not be assumed to provide security-grade entropy.

### Database identity

`public/js/storage.js` uses the room code directly in the local PouchDB name. `public/js/app.js` appends the same derived name to the Cloudant account URL. There is no separate immutable room record that maps a high-entropy identity to an editable label.

Consequences include:

- Two independently generated or manually chosen identical codes select the same remote database.
- A friendly rename cannot be represented without changing the database locator or adding a new mapping layer.
- A disclosed code cannot be rotated independently from the database identity.
- Database migration and user-visible renaming are unnecessarily coupled.

### Deployed authorization

`.github/workflows/ci-cd.yml` writes the repository secret `COUCHDB_URL` into the deployed static `public/js/config.js`. The browser needs that URL to replicate directly to Cloudant.

A credential-safe, read-only production check confirmed:

- the deployed configuration contains a credentialed URL;
- unauthenticated database enumeration is rejected;
- the deployed credential can enumerate every database visible to the account;
- the authenticated session includes the `_admin` role;
- the credential can read database metadata and document indexes;
- the same deployment credential has created and deleted isolated preview databases during acceptance testing.

No credential value, private document content, description, or non-authorized database name was printed during this validation.

The practical security boundary is therefore the shared Cloudant credential, not knowledge of the room code. A browser-origin CORS allowlist reduces cross-origin browser access but does not hide a credential embedded in a static asset, constrain a user operating from the allowed application, or restrict non-browser HTTP clients.

## Existing accepted-risk decision

`docs/COUCHDB-SETUP.md` explicitly documents two deployment options:

- **Option A:** embed administrator service credentials for zero-setup room creation;
- **Option B:** pre-create databases and use database-scoped API keys.

The document recommends Option A as a pragmatic choice for personal or household use and acknowledges that anyone who loads the application can extract the credentials and potentially read, modify, or delete Cloudant data.

That is a real accepted-risk decision. The technical blast radius remains high, but it should not be described as a newly discovered or unaccepted production defect while the documented threat model still applies.

### Assumptions behind the acceptance

The recorded decision relies on these assumptions:

- the site URL is not broadly shared;
- only trusted household members load the application;
- task data is considered non-sensitive;
- compromise of remote sync is tolerable because local PouchDB copies exist;
- room-code obscurity adds a meaningful barrier.

### Limitations in the recorded rationale

Some of those assumptions need correction or explicit reaffirmation:

- A static site URL is not an authentication boundary.
- Database enumeration by the deployed credential defeats room-code obscurity for a technically capable user.
- Users may put private information in task or activity descriptions even if the product is intended for low-sensitivity data.
- Local PouchDB does not categorically prevent data loss. Remote deletion tombstones and malicious revisions can replicate into connected local databases.
- Offline clients that do not reconnect may retain recoverable copies, but that is not a backup guarantee.
- The decision did not explicitly evaluate generator collisions, room renaming, per-room blast radius, invitations, or revocation.

The accepted risk should therefore be treated as conditional and periodically reviewed, not as evidence that the architecture has no security debt.

## Threat and failure scenarios

This section describes capability, not evidence that any event occurred.

### Accidental collision

Two households generate or choose the same room code. Both clients address the same Cloudant database and may replicate documents into one revision namespace. Data can become visible across households or conflict during synchronization.

### Room-code disclosure

A room code appears in a screenshot or message. Through the normal application, another user can enter the code without a separate authentication or invitation check.

### Credential extraction

A user reads the deployed `config.js` or browser network configuration. Because the observed credential is account-wide and administrative, the user does not need to guess a room code and can operate outside the Fortudo UI.

### Remote destructive write

An authorized or unauthorized credential holder deletes or changes documents. Connected clients may pull deletion tombstones or modified revisions, so local-first storage does not guarantee isolation from remote damage.

### Credential rotation

Rotating the shared credential invalidates synchronization for every room and client simultaneously. Embedding a replacement account-wide credential restores functionality but recreates the same exposure.

### Room rename

Because the displayed value is also the database locator, there is no safe metadata-only rename. Selecting a different code points at a different local and remote database unless data is explicitly migrated.

### Invitation revocation

There is no invitation object or member-specific credential to revoke. Changing the room code requires changing identity and moving data, while rotating the account credential affects every room.

## Security characterization

Risk severity and risk disposition are different:

- **Inherent blast radius:** high to critical because the deployed credential can affect confidentiality, integrity, and availability across the account.
- **Current disposition:** accepted for the personal or household threat model documented in `COUCHDB-SETUP.md`.
- **Residual uncertainty:** the repository does not prove that the threat-model assumptions remain true or that every non-preview database belongs to one trusted household.
- **Incident status:** no evidence of unauthorized access was established by this diagnosis. Confirming or excluding past access would require a separate audit-log investigation.

This accepted risk does not automatically block unrelated work. It should become a release blocker if the application is offered to untrusted users, stores data outside the accepted sensitivity, or expands beyond the household deployment model without a new authorization design.

## Target architecture

The future room model should separate identity, presentation, and authorization.

### Immutable room identity

`roomId` should be opaque, immutable, and generated with cryptographically secure high entropy. It may participate in a database locator, but it must not be the friendly label or the authorization secret.

### Editable label

`label` should be presentation-only, such as `Personal`, `Family`, or `Planning`. Renaming it must not move data, change database identity, or invalidate client references.

### Scoped authorization

Each client should receive only the capabilities needed for rooms it may access. No account-wide administrative credential should be shipped in a public static asset.

Possible stages include:

1. Pre-created databases with Cloudant API keys restricted to the relevant database and only required reader/writer roles.
2. Separate credentials per invitation, member, or device to allow bounded revocation.
3. A server-side authorization broker that holds administrative credentials and issues short-lived room-scoped capabilities.

Database-scoped static credentials reduce blast radius but remain extractable by authorized room members. A broker with authenticated users and expiring capabilities provides stronger attribution and revocation.

### Invitations and membership

An invitation should be distinct from `roomId` and `label`. It should be high entropy, scoped, expirable where practical, and revocable without moving the database. Redeeming an invitation should grant a member or device capability rather than reveal an account administrator credential.

### Server-side control plane

Database creation, security configuration, credential issuance, and destructive room administration require a trusted component. A purely static client cannot safely hold the account-level authority needed to perform those operations.

### Offline-client behavior

Room redesign must account for clients that retain old local database names and credentials. Migration needs:

- an explicit mapping from legacy room code to immutable `roomId`;
- controlled local PouchDB migration or replication;
- minimum client/write-version enforcement;
- a recovery path for unsynchronized offline edits;
- credential revocation only after compatible clients have transferred safely;
- per-room backups and revision gates.

This work should coordinate with, but remain separate from, taxonomy identity hardening.

## What does not fix the problem

The following changes are insufficient on their own:

- Expanding the word list while retaining a shared administrative credential.
- Replacing the room code with a UUID but allowing the credential to enumerate databases.
- Rotating the administrator credential and embedding its replacement in the same static file.
- Treating CORS as authentication.
- Adding a friendly label without separating database identity and access.
- Recording device telemetry without enforcing authorization.

## Recommended follow-up

1. Reaffirm or revise the accepted personal/household threat model and assign an owner and review trigger to the decision.
2. Correct `COUCHDB-SETUP.md` so room-code obscurity and local-copy recovery are not described as stronger guarantees than they provide.
3. Classify the non-preview Cloudant databases before designing a room migration scope.
4. Write a dedicated room identity and authorization design covering backend trust, database ACLs, invitations, revocation, and offline migration.
5. Prefer an incremental transition from account-wide credentials to room-scoped capabilities before changing database identities.
6. Retain independent backups during any credential or room migration.
7. Keep production writes blocked unless the applicable migration's backup, client, revision, database-name, and verification gates pass.

## Evidence map

- `docs/COUCHDB-SETUP.md`: accepted credential-exposure decision and security assumptions.
- `public/js/room-manager.js`: generated namespace and local saved-room state.
- `public/js/room-renderer.js`: unrestricted room-code entry flow.
- `public/js/storage.js`: local database naming.
- `public/js/app.js`: remote database URL construction.
- `public/js/sync-manager.js`: bidirectional replication behavior.
- `.github/workflows/ci-cd.yml`: deployment-time Cloudant URL injection.
- IBM Cloudant documentation, “How Cross-origin resource sharing (CORS) works.”
- IBM Cloudant documentation, “Working with your IBM Cloudant account.”
- IBM Cloudant documentation, “Managing access for IBM Cloudant.”
