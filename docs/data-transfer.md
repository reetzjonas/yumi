# Household transfer

Open **More > Household data** to download an export or select a JSON file.
The import screen validates the file locally and shows its record counts before
an explicit confirmation. It names the active household and explains that import
adds copies rather than replacing existing data. After import it shows the actual
inserted counts. Export responses are excluded from the service worker cache.

The authenticated API exports the session's active household with
`GET /api/household-transfer/export`. The response is a JSON attachment named
`yumi-household-v1.json` with `Cache-Control: no-store`. Import the JSON object
directly with `POST /api/household-transfer/import` and
`Content-Type: application/json`. Every household member can export and import.
Both endpoints verify active household membership.

## Format and coverage

`packages/shared/src/household-transfer.ts` defines the runtime schema and types.
The root has `format: "yumi-household"`, `version: 1`, `exportedAt`, and arrays for:

- `ingredients`: every custom household ingredient, including nutrition and pack
  sizes, plus referenced global ingredients represented by their stable `key`.
- `recipes`, `recipeIngredients`, `steps`, `images`: recipe content, tags, timer
  definitions, manual ingredient references, and both WebP image variants as
  base64. Image keys are regenerated during import.
- `stores`, `lists`, `items`: store category ordering, list default stores,
  checked state, quantities, categories, and live recipe/queue/recurring sources.
- `queue`, `pantry`, `recurring`, `leftovers`, `cookLogs`: planning state,
  recurring due dates, leftover quantities and live queue sources, and
  anonymized cooking history.

Dates and timestamps use ISO strings. Categories use stable catalog keys.
All record IDs are archive-local handles. An import remaps every handle;
an ID cannot address an existing record in any household. The schema rejects
unknown fields, duplicate IDs, duplicate global keys, dangling references, and
step ingredient references to another recipe. Recipe source URLs must be valid
HTTP or HTTPS URLs, matching the regular recipe input contract.

The export uses a read-only PostgreSQL repeatable-read transaction, so all
records and image bytes come from one consistent snapshot. References left
behind by deleted recipe ingredients, queue entries, recipes, or recurring
items are omitted from the corresponding reference arrays.

Authentication, users, household identity, memberships, invitations, share
capabilities, personal ratings, and attribution are not transferred. Shopping
event history and its arbitrary event payloads are excluded; current list state
is transferred. Store learning state is excluded with that history. No secret
or access token is part of the format.

## Additive import

Import runs in one database transaction, using the existing household queue
lock. Existing records stay in place. Custom ingredients, recipes, stores,
lists, list items, recurring items, leftovers, and cooking history receive new
IDs. Imported queue entries follow the current queue in their exported order.
Repeated imports create another copy. Pantry membership for a global
ingredient already present in the target household is retained once; the
reported pantry count reflects newly inserted memberships.

Global ingredients are resolved only against global entries by stable key.
Categories are resolved by stable key. Missing keys return HTTP 422 with
`unavailable_global_ingredients:<keys>` or `unavailable_category:<key>`.
The importer does not guess replacements or silently erase ingredient links.
Any failure rolls back all imported rows, including failures after earlier
inserts. Images are checked before opening the transaction.

A successful import returns HTTP 201:

```json
{
  "imported": {
    "recipes": 2,
    "ingredients": 1,
    "lists": 1,
    "items": 3,
    "queue": 1,
    "stores": 1,
    "pantry": 0,
    "recurring": 1,
    "leftovers": 1,
    "cookLogs": 1
  }
}
```

`ingredients` counts new custom ingredients, not resolved global entries.

## Bounds and errors

The JSON request and serialized export are limited to 32 MiB. Every array has
at most 10,000 records and the archive has at most 50,000 records in total.
An encoded thumbnail can contain at most 1 MiB of decoded bytes; a full image
at most 4 MiB. All image variants together are limited to 20 MiB of decoded
bytes. Images must decode as WebP and have at most 4096 pixels on either axis.
Text, reference arrays, tags, synonyms, timers, pack sizes, and numbers
also have explicit bounds in the shared schema.

- HTTP 400: malformed JSON, unsupported version, invalid shape, invalid image,
  duplicate IDs, or invalid references.
- HTTP 413: request/export exceeds its size limits.
- HTTP 415: the import is not sent as JSON.
- HTTP 422: required catalog keys are unavailable, or existing household data
  cannot be represented safely within the transfer schema.

This is an interchange format for household data. It is not a database backup
and does not restore access to the source household.
