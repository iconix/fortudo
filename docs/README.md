# Documentation map

Fortudo documentation is organized by purpose rather than by whether the described work is current,
future, or complete. Status changes over time; the role of a document is the more stable boundary.

The `docs/` root contains this index only.

## Directory map

| Directory                                        | Purpose                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| [`reference/`](reference/)                       | Durable product conventions and setup references                       |
| [`architecture/`](architecture/)                 | Assessments, diagnoses, risks, and architectural case studies          |
| [`operations/`](operations/)                     | Reusable engineering procedures, invariants, and safety boundaries     |
| [`product/`](product/)                           | Product principles, UX explorations, and unresolved product questions  |
| [`migrations/`](migrations/)                     | Exact, versioned migration runbooks and completed operation records    |
| [`plans/design/`](plans/design/)                 | Scoped design decisions and specifications accepted for implementation |
| [`plans/implementation/`](plans/implementation/) | Executable task, migration, and verification plans                     |

## Current documents

### Reference

- [Fortudo brand reference](reference/BRAND.md)
- [CouchDB Sync Setup](reference/COUCHDB-SETUP.md)

### Architecture

- [Architecture Assessment](architecture/ARCHITECTURE-ASSESSMENT.md)
- [Offline Client Migration Safety](architecture/OFFLINE-CLIENT-MIGRATION-SAFETY.md)
- [Room Identity and Access Risk](architecture/ROOM-IDENTITY-AND-ACCESS-RISK.md)

### Operations

- [Cloudant migration toolkit boundaries](operations/CLOUDANT-MIGRATION-TOOLKIT.md)

### Product

- [Taxonomy Manager UX Point of View](product/TAXONOMY-MANAGER-UX-POV.md)

### Migrations

- [Taxonomy identity v1: dat-411 operation runbook](migrations/taxonomy_identity_v1/dat-411-operation-runbook.md)

The dated design and implementation plan catalogs are described in [Plans](plans/README.md).

## Document lifecycle

```text
product exploration or architectural diagnosis
    -> accepted design specification
    -> implementation plan
    -> current reference, operational guidance, or completed migration record
```

Do not rewrite an exploratory or diagnostic document into an implementation plan. Create a dated
plan that links back to the source reasoning so its evidence, open questions, and historical context
remain intact.

Future-facing content does not automatically belong under `plans/`:

- An unaccepted UX direction remains a product note.
- A risk analysis or target architecture remains an architectural diagnosis.
- A reusable safety contract remains operational guidance.
- Work moves into `plans/design/` when its scope and decisions are accepted for implementation.
- A concrete execution sequence belongs in `plans/implementation/`.

Each exploratory, diagnostic, or operational document should state its status and whether it grants
implementation or production authorization. A passing test, dry run, or historical operation
record is never authorization for a new production mutation.

## Adding documentation

Before adding a file, identify its intended reader and durable role:

- Place current setup facts and conventions in `reference/`.
- Place evidence-backed assessments and architectural reasoning in `architecture/`.
- Place reusable operator and engineering procedures in `operations/`.
- Place product principles and open UX questions in `product/`.
- Place exact migration-specific commands and closure records in a versioned `migrations/`
  subdirectory.
- Place accepted specifications and executable plans in their existing `plans/` subdirectories.

Update this index when adding or moving a durable document.
