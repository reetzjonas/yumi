# Recipe sharing

Household members can create public read-only links from a recipe's Share dialog.
Each link carries 256 random bits and optionally expires at a chosen time. Several
links can exist for one recipe and can be revoked independently. Links show the
current recipe, rather than a frozen snapshot. Deleting the recipe deletes its links.

`GET /api/recipe-shares/:token` returns only recipe content, ingredient display
names and cooking steps. It does not disclose household identifiers, users,
ratings, cooking history or catalog identifiers. Images use the same token at
`/api/recipe-shares/:token/image/:variant`. Every request checks that the link
exists and has not expired. Public responses use `Cache-Control: no-store`,
`Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow`.

Anyone holding a link can read it until it expires or is revoked. Revocation
prevents subsequent requests; it cannot erase content already read or copied.
Keep access logs private because request paths contain sharing tokens.

`POST /api/recipe-shares/:token/copy` requires an authenticated user with an active
household. It creates an independent recipe in that household, including images,
step references and linked custom ingredients. Global catalog entries remain
shared. Custom ingredients from a different household receive new identifiers
and belong to the destination household. Copies contain no ratings, cooking
history or sharing links. Later source edits, deletion or link revocation do not
change a copy.

Link management endpoints under `/api/recipes/:id/shares` require membership in
the recipe's household. Unknown, expired and revoked links return `404`.
