# Bounded catalog queries

Implemented locally on 2026-11-02. No Firestore product migration, seed, index
deployment, Hosting deployment or plan change was performed.

## Contract and stored-field mapping

`CatalogQueryFilters` and `PaginatedCatalogPage` live in
`src/app/types/commerce.contracts.ts`. Query input is decoded at runtime. Page size
must be an integer from 1 to 48; the server reads at most size + 1 documents.

Logical `basePriceInCents` orders the existing numeric `price` field. Conversion to
integer cents occurs at the validation boundary; ordering is equivalent for valid
two-decimal prices in the store's currency. Logical `title` orders stored `name`.
Logical `version` orders stored `inventoryVersion`; it is inventory revision, not
creation time or a new-arrival date. The database was not renamed to match domain
interfaces: ordering by nonexistent canonical fields would hide migrated products.

**Version prerequisite:** Firestore excludes documents without an ordered field.
Older records may omit inventoryVersion. Version sorting emits a notice and is not
exposed in the shop. Confirm/backfill that field through an independently reviewed
rollout before using version sorting as a complete public catalog. Do not run the
legacy seeds or reset live holds to accomplish this.

## Query matrix and indexes

Public queries always include `active == true`. Optional category uses equality.
Optional collection selects either `newArrival == true` or `bestSeller == true`;
there is no combined two-collection predicate. Every public page orders by:

1. Physical sort field (`price`, `name` or `inventoryVersion`), requested direction.
2. `documentId()` (`__name__`), the same direction.

The repository declares 36 public product composite indexes: category absent or
present × collection absent/new/bestsellers × three fields × two directions.
Equality fields are active, optional category, optional collection flag; the sort
field and explicit **name** follow. For example:

```json
{
  "collectionGroup": "products",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "active", "order": "ASCENDING" },
    { "fieldPath": "category", "order": "ASCENDING" },
    { "fieldPath": "price", "order": "ASCENDING" },
    { "fieldPath": "__name__", "order": "ASCENDING" }
  ]
}
```

An additional product index covers active + slug + **name** for detail lookup.
The three existing order composites and all six field exemptions are preserved.
Total: 37 product composites and three order composites. Single-field indexes on
active, name, price and inventoryVersion must remain enabled. The cart's active +
document-ID IN query uses the automatic active index. Admin uses unfiltered single
sort-field ordering plus document ID, so automatic indexes suffice; filtered admin
paging is deliberately rejected rather than issuing an undeclared combination.

## Search and visible sorting semantics

Search is **case-sensitive name prefix**, not substring, color, description,
multiword token-array or full-text search. It constrains the existing name field
between the entered prefix and prefix + U+F8FF. Prefix matching follows Firestore's
string ordering; it is not locale-aware collation or a Unicode search service.
This requires name-first ordering. The UI labels the behavior, debounces nonempty
search for 250 ms and disables price sorting during search. Programmatic price or
version plus search is rejected before issuing a query.

The existing `sort=featured` URL is retained as the default name-A-to-Z alias;
the visible label now states that order rather than implying global bestseller
ranking. `sort=new` selects the newArrival collection in name order unless an
explicit collection was requested. Category/collection/price predicates run on the
server, never just on already loaded rows. True normalized token/full-text search
requires a separate schema/index/provider decision and data rollout.

## Cursor, errors and mutation behavior

The pager holds the last consumed `QueryDocumentSnapshot` privately and passes it
to `startAfter`; it does not reread the ID to obtain possibly changed sort values.
One lookahead document determines hasMore and is read again as part of the next
page. Incoming rows go through decodeProduct/toProductDocument/assertValidProduct.
Malformed rows are omitted with a rejected-record notice; the cursor advances
across those rows, even if an entire page is rejected. Thus lastVisibleId identifies
the last _examined_ document and can refer to a rejected row. hasMore means more
server candidates, which may themselves be rejected. No automatic unbounded scan
tries to fill a page with valid data.

Reset or any changed filter/direction/limit/scope clears accumulated rows, cursor,
error and rejected count. A generation token suppresses responses from old requests
or destroyed views. Concurrent append clicks do not issue overlapping queries.
An append failure retains rows and the previous cursor; Retry loading more uses
that same cursor. Duplicate product IDs are merged rather than appended twice.
There is no count query; the UI reports **pieces loaded**, not an invented total.

Deterministic ordering prevents ties from losing records in a stable dataset. It
does not create a transactionally frozen catalog across page requests: edits to
sort values, activation or deletion between reads can move documents across an
earlier cursor. Refresh to rebuild the list; do not promise snapshot isolation or
continuous live updates for browse pages. Missing-index errors are caught and
displayed, not silently worked around with an all-collection fallback.

## Consumers and bounded live reads

- Shop owns a component-scoped pager: default 12 records, explicit Load more,
  initial versus append loading/error states, empty and rejected-record handling.
  URL changes immediately hide rows from mismatched queries while a request is
  scheduled. Product cards retain their existing ImageKit and viewport defer logic.
- Home owns an independent eight-record preview, plus one lookahead. Navigating
  between home and shop cannot mix their cursors or allow a late home response to
  replace the shop list.
- Admin reuses the root pager, 25 records plus one lookahead, including inactive
  records under existing server authorization. Saving a product refreshes its list
  from the beginning. The admin catalog no longer subscribes to the whole collection.
- Product detail listens to active + slug, limit two; a duplicate slug errors
  rather than choosing an arbitrary product. Route changes unsubscribe the previous
  listener. A missing first catalog page cannot turn a valid detail URL into 404.
- Cart listens only to its distinct IDs (maximum fifteen), active-only and bounded
  to that ID count. An empty bag creates no product query. Quantity changes do not
  reopen listeners when the ID set is unchanged. IDs are tracked with each response:
  absence from a browse page or an old ID response never means an item was deleted.
  Auth scoping, persistence limits and server-authoritative checkout remain intact.

## Deployment and verification

Deploy the new `firestore.indexes.json` to named database **maindb**, review any
delete-index prompt, and wait for every required index to reach enabled state
before deploying source that uses these queries. The standard VM runner deploys
Hosting/rules, **not indexes**. Use COMMERCE.md's VM-local Firebase CLI path and
source-checkout working directory; never use shared-folder dependency links or
copy credentials between machine profiles. No deployment was executed here.

Local tests exercise real ProductService code with a controllable Firestore query
adapter: duplicate sort values in both directions, bounded reads, filter resets,
stale responses/destruction, append retries, malformed data/cursor progress, deleted
cursor snapshots, cart/detail subscriptions and admin paging. A matrix test checks
every supported composite definition and preservation of order indexes/exemptions.
Browser fixtures exercise the actual shop controller/template with a simulated
paging provider, not live Firebase. They verify load-more progress, busy controls,
failure retention/retry, category reset, price order, prefix search and empty/clear
states at 390px and 1280px. These checks do not independently verify deployed
indexes, Firestore rules, IAM, or production catalog contents.
