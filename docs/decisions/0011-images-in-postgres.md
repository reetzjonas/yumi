# 0011: Recipe images stored in PostgreSQL

- Status: Accepted (alpha)
- Date: 2026-11-03

## Context

Recipes get one photo. The app is self-hosted, usually for one household, with a single replica and
the bundled PostgreSQL. Options were PostgreSQL (`bytea`), a filesystem volume (PVC), or an
S3-compatible store.

## Decision

Uploads are resized on the server (Bun's built-in image API) to two WebP variants, `thumb` (400 px
wide) and `full` (1200 px wide), and stored in `recipe_image` as `bytea`. The original is discarded.
`recipe.image_key` holds the current image id and is part of the image URL, so responses are cached
as immutable and a new upload changes the URL.

## Consequences

No extra volume, service or credentials; database backups (#36) and exports (#35) include images.
A few hundred recipes cost roughly 100 MB of database size. Revisit (PVC or S3) if images become a
size or performance problem, e.g. many photos per recipe or step photos.
