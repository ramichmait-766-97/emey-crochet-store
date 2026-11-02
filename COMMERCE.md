# Database-led checkout and store operations

## Business requirements implemented in this change

This release implements the owner's immediate next steps: editable delivery and
payment configuration, a server-reviewed checkout total, and transactional stock
reservation. It also provides the order ledger's minimum operational UI: admin
queue, separate payment/fulfillment, private guest status, and member history.

The example zones ($3 local / $7 nationwide), 24-hour hold and manual payment
choices in the owner's message were bracketed examples, not verified operational
facts. `Create disabled draft configuration` seeds those examples **disabled**, with
free shipping disabled and pickup disabled. An admin must confirm names, fees,
instructions, duration and currency, enable the intended options, then explicitly
open checkout. No live seed or deployment has been run by this implementation.

The recorded total is merchandise minus verified-member discount plus selected
delivery. Free delivery applies to merchandise **after** discount; pickup is free.
All stored money is integer cents. This release supports two-decimal currencies;
do not configure currencies with other minor-unit scales. Taxes/duties are not
calculated; the owner must settle applicable pricing/policy requirements before
launch. Never publish example banking or wallet details as real instructions.

## Customer UX and edge cases

1. Guest enters name, phone, optional email, delivery zone or pickup, street and
   building/apartment for delivery, optional notes and payment method. Member
   profile values are reused automatically without forcing guest registration.
2. Review final total makes a read-only server quote. A verified Firebase email is
   required for the member discount; guest-supplied `member`/prices are ignored.
3. A Turnstile challenge precedes reservation. The server rereads configuration,
   active products, selected variants and stock **inside** the reservation
   transaction; the accepted quote must still match. Price/config changes ask for
   another review without taking stock.
4. Transaction writes the immutable order snapshot and decrements available
   quantities together. A repeated submission with the same secret key returns the
   same order; a changed request with that key conflicts. Duplicate selections are
   aggregated before stock validation. At most 15 selections / 20 units each.
5. Success shows the order reference, true recorded total, deadline, private status
   link and optional WhatsApp link containing only the reference. WhatsApp has no
   authority to change products, amounts or payment state. Bag clears on success.
6. A timeout preserves the exact pending request and private key in sessionStorage.
   Customer can check status or retry the same reservation with a new challenge.
   Starting over requires an explicit warning; clearing recovery never cancels an
   existing order. Session-only recovery is not a cross-device notification system.
7. Guest access uses `/order/<reference>#access=<256-bit random secret>`. Fragments
   are not sent in the hosting request. API POST hashes the secret and returns only
   that order's summary, not contact data. Link lifetime is 90 days; signed-in owner
   access remains available separately. No email-based claiming of guest orders.

Unverified members can order at guest pricing. The server identifies membership
from a verified Firebase ID token, never form fields. Existing orders keep the
original item, delivery and payment-instruction snapshots after catalog/settings
edits. Product inactivity or insufficient stock prevents a new reservation.

## State and inventory rules

Fulfillment: requested → awaiting confirmation → confirmed → in production →
dispatched → delivered. Confirmation may skip awaiting confirmation; ready-made
orders may skip production. Cancellation is permitted before dispatch. Expired and
cancelled orders cannot be reopened; place a new request against current stock.

Payment is derived from cumulative `paidCents` and `refundedCents`: unpaid, deposit
paid, fully paid, partially refunded or refunded. Amounts cannot decrease; refunds
cannot exceed recorded payments. An evidence note is required for every update.
No payment gateway, refund execution or payment-proof verification is automated.
Full net payment is required before Delivered (including COD reconciled on receipt).

Stock reservation states:

- held: available stock already decreased; unpaid and unconfirmed.
- committed: confirmed or any payment recorded; no automatic timeout release.
- released: cancelled/expired; stock returned once, guarded transactionally.

An overdue held order expires before an admin can confirm or record payment from
a stale screen. An expired request cannot consume another customer's stock.
Committed orders need an explicit admin cancellation. Cancellation of a paid order
does not imply a money refund; separately record the refund after actual payment.
This release has no dispatched returns/restocking workflow; handle that manually
until a dedicated return ledger is implemented.

`reservedUnits` protects option definitions while orders remain open. Delivering
an order removes that bookkeeping hold without returning the sold quantity.
Admin stock editor uses optimistic `inventoryVersion` inside a native SDK
transaction; concurrent checkout forces the editor to reopen current stock.
Do not rename/delete/restructure variants while reserved units exist. Gallery
uploads are bounded to eight additional images; variants to 25 per product.

## Firestore schema

- `store_settings/checkout`: enabled, currency, reservationMinutes,
  freeShippingThresholdCents|null, zones[{id,label,feeCents,estimate,enabled}],
  pickup{enabled,details}, paymentMethods[{id,label,instructions,enabled}], version,
  modifiedAt, modifiedBy. Public read, Worker-only write.
- `orders/{id}`: schemaVersion=2; opaque reference; userId|null; contact snapshot;
  lines[{productId,variantId,quantity,name,option,unitPriceCents,lineTotalCents}];
  subtotalCents, discountCents, deliveryCents, totalCents, currency;
  delivery/payment snapshots; accessHash, requestHash, accessExpiresAt;
  fulfillmentStatus, paymentStatus, paidCents, refundedCents;
  reservationState, reservationExpiresAt; createdAt, updatedAt, version, lastUpdate.
  Secret checkout key is never stored raw server-side. References use the first
  128 bits of its SHA-256 hash; the full hash is required for guest access.
- `orders/{id}/events/{version}`: timestamp, actor, action, note and cumulative
  payment amounts. Append-only through the Worker, admin-readable, no browser writes.
- `products/{id}`: existing fields plus variants[{id,color,size,price,quantity}],
  inventoryVersion and reservedUnits. Existing gallery URLs are retained; no image
  bytes added. Product and variant quantity always mean **available**, not physical
  stock including reserved pieces.

Legacy orders remain untouched. New order lists explicitly select schemaVersion=2
to avoid interpreting legacy decimal totals or timestamps as the new ledger.
Firestore indexes cover member history, admin paging and due-reservation sweep.
Disable indexing of contact, lines, hashes, galleries and variant arrays to reduce
index overhead. Lists return 25 rows; filters state when they apply to loaded rows.
There are no per-order live listeners or customer polling loops.

## Trusted backend and free plans

Firebase Cloud Functions requires Blaze. The separate `emey-commerce` Cloudflare
Worker uses Firestore's documented REST transaction API with a dedicated service
account. Frontend Firebase access continues through native `FirebaseService`.
Order writes remain denied by Firestore rules, including browser-admin writes.
Service-account IAM bypasses those rules, so API validation/authorization and a
least-privilege dedicated account are essential. Never put its key in Angular.
No AngularFire, paid Firebase Functions, Firestore TTL or Firebase Storage upload
is introduced. Storage rules deny all because media uses ImageKit's admin Worker.

Read/write envelope, before retries: quote = 2 settings documents plus N distinct
products read; reservation = order + 2 settings + N products read, N product writes,
1 order write and 1 event write; duplicate requests do not mutate inventory.
Status reads one order (plus release transaction if overdue). Scheduled sweep
queries at most three due holds every 10 minutes to leave Worker subrequest
headroom for retries. It is eventual cleanup, not an exact timer; customer/admin
status reads also expire overdue holds. Large expiry backlogs can delay release;
monitor cron failures and increase safe sweep capacity only after load testing.

IP rate limits apply before Firestore, Turnstile verifies host/action on checkout,
and body/line/quantity/transaction retries are bounded. Cloudflare rate limits are
approximate and region-local, not a global cost guarantee. Free services have hard
capacity ceilings: this is a small-store design, not unlimited-scale infrastructure.
Quota monitoring and abuse alerts remain launch responsibilities.

## Configuration and deployment runbook

1. Create a dedicated Google service account for this Worker, with Firestore data
   access (for example `roles/datastore.user`, not Owner/Editor). Restrict its use
   and rotation operationally. Do not export or paste credentials into this repo,
   chat, frontend environment, VM seed copies or logs.
2. In Cloudflare configure Worker secrets `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
   `GOOGLE_PRIVATE_KEY` (PKCS8 PEM), and `TURNSTILE_SECRET` using the dashboard or
   `wrangler secret put <NAME> --config wrangler.commerce.jsonc`. Configure Turnstile
   for the actual hosting domains and action `checkout`. Verify native limiter
   namespace `2047` is unique for this account. Only explicitly allow test origins
   during intentional local integration testing.
3. Deploy the separate Worker with `npm run commerce:deploy` inside
   `workers/image-upload`. This is separate from the existing image uploader.
   Test token validation, IAM transactions, challenges and cron using a test
   project/catalog before allowing live customer reservations.
4. Deploy `firestore:rules,firestore:indexes` against `maindb`, wait for indexes to
   finish building. The normal VM runner historically deploys rules and Hosting
   only: deploy indexes explicitly; do not run legacy all-services deployment.
   `storage.rules` is a deny-all declaration, not a request to activate Storage or
   upgrade Firebase. Do not deploy Functions or change plans.
5. Set `environment.commerce.apiUrl` to the verified Worker URL and
   `turnstileSiteKey` to its public key; build and deploy Hosting through the normal
   source-checkout workflow. Both default to empty, so checkout fails closed until
   real backend configuration is ready. Existing hosted store remains unchanged
   until you deploy this source.
6. Sign in as admin → `/admin/settings` → Create disabled draft configuration →
   replace example labels/fees/payment instructions with verified operating facts →
   enable desired options → save/open checkout. Match the existing store currency.
7. Run two-customer last-unit test, guest private-link isolation test, member price
   test, timeout retry, deposit/confirmation/expiry race and cancellation/refund
   reconciliation against test data. Verify narrow-screen checkout and actual
   mobile WhatsApp handoff without sending a fake customer message.
8. Check cron execution and quota dashboards. Closing checkout blocks new orders
   while keeping order history/status and admin updates available.

## Production integration detail: indexes and environment layout

Reviewed against the current source on 2026-10-28. This section is a guide; none of
these production commands has been executed by the agent.

### 1. Index deployment

The exact source is `firestore.indexes.json`. Its three **order** composite indexes serve:
admin pages (`schemaVersion`, `createdAt`); member pages (`schemaVersion`, `userId`,
`createdAt`); due holds (`reservationState`, `reservationExpiresAt`). Their collection
scope is deliberate. The default descending document-name tie breaker matches the
Worker's explicit `__name__ DESCENDING`. The current status selector filters loaded
rows; no server payment/status filter or analytics query is implemented yet.

In PowerShell, from the source checkout on the machine/profile with Firebase login,
use Node 22.12+ or 24. Use the CLI installed in the VM-local deployment copy. Direct Node invocation against shared-folder node_modules can still fail with EISDIR:

```powershell
node --version
$firebaseCli = Join-Path $env:LOCALAPPDATA 'EmeyCrochet\deploy\project\node_modules\firebase-tools\lib\bin\firebase.js'
# If Test-Path $firebaseCli is false, prepare local dependencies without deploying:
# powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\firebase.ps1 -BuildOnly
node $firebaseCli login
node $firebaseCli firestore:indexes --project emey-crochet-store --database maindb
```

Save the listing outside the repository as a before-change record. Compare any
existing indexes/exemptions with the local file and retain unrelated deployed
definitions before deploying. Do not accept unexpected index-deletion prompts.

```powershell
node $firebaseCli deploy --project emey-crochet-store --only firestore:indexes
```

`firebase.json` selects `maindb`; the deploy command does not need a separate
`--database` option. In Firebase Console select Firestore database `maindb`, then
Indexes; wait for all required definitions to finish building and be enabled. The
bounded catalog also adds 37 product composites; see CATALOG.md for their complete
query matrix and deployment prerequisites. Index
deployment does not rewrite product/order data. Field exemptions remove indexes,
not contact/gallery/variant document fields. Deploy new Firestore rules separately
before using the new client/configuration paths:

```powershell
node $firebaseCli deploy --project emey-crochet-store --only firestore:rules
```

### 2. Public Worker bindings

`workers/image-upload/wrangler.commerce.jsonc` owns these non-secret values:

```json
{
  "FIREBASE_PROJECT_ID": "emey-crochet-store",
  "FIRESTORE_DATABASE": "maindb",
  "ALLOWED_ORIGINS": "https://emey-crochet-store.web.app,https://emey-crochet-store.firebaseapp.com"
}
```

The same config defines `API_LIMITER` (namespace 2047, 30 requests/minute per key)
and the 10-minute cron. Keep the namespace unique within your Cloudflare account.
Only add custom HTTPS origins when those are actual production storefront origins.

### 3. Turnstile and private bindings

Cloudflare dashboard → Turnstile → Add widget. Name it Emey Checkout Production,
choose Managed, add hostnames `emey-crochet-store.web.app` and
`emey-crochet-store.firebaseapp.com` (no scheme/path), and leave pre-clearance off.
The component already sends action `checkout`; that is not a dashboard secret.
Use separate widgets/configuration for development and production.

- Sitekey is public; it belongs in Angular's `commerce.turnstileSiteKey`.
- Secret key is private; it becomes the Worker's `TURNSTILE_SECRET`.

Google Cloud Console → select project `emey-crochet-store` → IAM & Admin → Service
Accounts → create a dedicated commerce account. Grant Cloud Datastore User
(`roles/datastore.user`), not Owner/Editor. This grants data access beyond a single
collection; the Worker must keep validating every request. On that account's Keys
tab, create a JSON key and keep the downloaded file outside source/shared folders.
Map its `client_email` to `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and its `private_key`
value to `GOOGLE_PRIVATE_KEY`. The latter is PKCS8 PEM including BEGIN/END lines;
the adapter accepts actual line breaks or literal `\n` escapes. Do not paste the
whole JSON file into the PEM binding, browser configuration, chat or Git.

Use the Cloudflare commerce Worker's Variables and Secrets screen with secret
type for the three bindings, or run these from `workers/image-upload`:

```powershell
npx wrangler@4.152.0 login
npx wrangler@4.152.0 secret put GOOGLE_SERVICE_ACCOUNT_EMAIL --config wrangler.commerce.jsonc
npx wrangler@4.152.0 secret put GOOGLE_PRIVATE_KEY --config wrangler.commerce.jsonc
npx wrangler@4.152.0 secret put TURNSTILE_SECRET --config wrangler.commerce.jsonc
```

Enter values at the prompts; use the dashboard's multiline secret editor for the
PEM if terminal pasting is awkward. `secret put` updates/deploys a Worker version;
it is not a read-only check. The `--config` argument targets `emey-commerce`, not
the existing image uploader. Keep checkout disabled during setup. For this
implementation, `GOOGLE_APPLICATION_CREDENTIALS` and a Firebase web API key do not
replace the two Google secret bindings. `IMAGEKIT_PRIVATE_KEY` stays only on the
image-upload Worker. Wrangler login credentials belong to the CLI, not the app.

After Worker setup/verification, Angular needs only these public values:

```typescript
commerce: {
  apiUrl: 'https://<verified-commerce-worker-host>',
  turnstileSiteKey: '<production-public-sitekey>',
}
```

Use the actual deployed URL without a trailing slash. Do not change the existing
image-upload URL. No Google private key, Turnstile secret or Cloudflare management
token belongs in Angular. Before opening checkout verify successful server-side
challenge validation, rejection of reused/expired tokens, exact hostname/action
matching, and creation of one ledger record for repeated submission of one key.

### 4. Safe variant rollout: manual allocation, no destructive reseed

There is no bulk variant-migration script or command in this repository. No bulk
backfill is needed to keep existing non-variant products working: missing variant
arrays behave as no options, and missing inventory counters default to zero.
Do not run productseed, products:seed, user seed or image migration for this change.

1. Keep `store_settings/checkout.enabled=false` and pause catalog edits. Inspect all
   products including inactive drafts using an authorized admin session. Preserve a
   verified restorable, type-preserving snapshot of the database before any product
   conversion; an index listing is not a product backup. No backup/migration tool
   was generated by this release, and managed Firestore export must not be assumed
   available under the free-plan restriction.
2. Record product document IDs, slugs, active flags, price, current quantity, photos,
   gallery, descriptive colors and timestamps. Preserve inactive/zero-price drafts
   unchanged until real sellable options and prices are confirmed. Inspect any
   existing old orders/holds before deciding that inventory is unreserved.
3. For one verified product with no open reservations, use the new admin editor to
   add only real color/size combinations with stable option IDs, actual prices and
   counted available stock. Reconcile the sum with the old available quantity;
   document any deliberate correction. Never copy total stock into each option or
   infer a color/size cross-product from descriptive colors alone.
4. Save through AdminStoreService: it merges fields, retains document identity and
   media, calculates product quantity as the sum of variant quantities, increments
   inventoryVersion, and rejects a stale inventory version. Verify Firestore
   read-back, inactive/draft visibility, gallery and all option quantities/prices.
   Do not manually reset reservedUnits or inventoryVersion after reservations exist.
5. In a test environment, reserve the last unit from two sessions, confirm only one
   succeeds, retry the successful key, cancel/expire once, and verify the exact
   stock restoration. Check guest-link isolation and member price/history too.
6. Roll out the remaining products individually after the first read-back/test.
   Products without meaningful variants may stay unchanged. Only open checkout
   after indexes, rules, secrets, operating configuration and physical stock agree.
   After any real reservations start, do not blindly restore an older product
   snapshot; reconcile the ledger first to avoid making reserved/sold stock available.

## Explicit next work beyond this immediate checkout release

Saved multi-address books (current single profile address is reused), custom
commission intake/quotes/deposits, private COGS/material/labor records and profit
reporting, consent-based funnel telemetry and retention cohorts are not implemented
by these checkout changes. Neither are automated notifications, carrier booking,
returns, token revocation/reissue UI, or full legal/store policy content. Do not show
invented metrics or claim the platform is completely launch-ready without these
operational decisions and independent integration verification.

## Local verification record — 2026-10-28

- 19 root regression tests and 24 Worker tests passed (43 total).
- TypeScript no-emit and Angular production build passed.
- Formatting passed for every changed/new supported source and document file.
  The repository-wide formatter still reports pre-existing legacy files.
- Headless Edge smoke checks: 390px cart and guest-status failure state, 1280px
  cart/shop, admin-settings guest redirect. No horizontal overflow or page runtime
  exceptions. Read public catalog only; no live database writes or messages.
- Generic premium UI static audit has zero unresolved ownership findings but
  reports 47 actionless buttons: its HTML scanner recognizes onclick/@click,
  not Angular `(click)`. Manual Angular-aware inspection found zero buttons without
  an action or explicit submit. Raw audit JSON and a mobile screenshot are in
  ignored `.artifacts/`; the generic audit is **not** reported as passing.
- No designmd executable is installed for the external DESIGN linter.
  Document token mapping was checked against the existing stylesheet.
- Worker REST/IAM, Turnstile, cron and deployed security rules still need live/test
  project integration validation. No production deployment or seed was performed.

## Vendor references checked 2026-10-28

- Firebase Spark/Blaze boundaries: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Firestore REST/IAM behavior: https://firebase.google.com/docs/firestore/use-rest-api
- REST transactions: https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Rate-limit accuracy: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

## Edge transaction security contract — local implementation

The commerce entrypoint remains `commerce.mjs` with `wrangler.commerce.jsonc`;
`wrangler.jsonc` continues to deploy the separate authenticated image uploader.
Do not replace it with the example commerce configuration or use `https://web.app`.
The two explicit storefront origins are enforced in every environment, including
preflight; Origin is a browser boundary, not authentication.

Checkout alone requires `X-Turnstile-Token` (401 missing, 403 invalid). Quotes,
private status, authenticated history and administrator routes retain their own
existing authorization contracts. CommerceService sends the ephemeral widget token
only in this header; it is excluded from checkout JSON and persisted recovery.
CORS permits the header. The existing `TURNSTILE_SECRET` handle remains a Wrangler
secret; no secret rename or plaintext variable is required. Siteverify uses the
canonical challenges.cloudflare.com endpoint, 10-second timeout, HTTP success,
strict boolean success and exact storefront hostname / checkout action checks.
Provider errors fail closed with redacted 503 responses. The widget is destroyed
while submitting and recreated afterward, requiring a fresh single-use challenge.

Before constructing the database adapter, the Worker rejects non-object payloads,
validates checkout lines/contact/key and the reviewed fingerprint, and completes
Turnstile verification. Normalized domain projections discard injected pricing,
identity and payment-state fields; server pricing/atomic reservation remains intact.
The request stream is still capped at 24 KiB. All API replies carry no-store,
nosniff, no-referrer and a restrictive JSON-response CSP. This CSP does not replace
a separately tested Hosting document CSP (still pending).

The existing 30-per-60-second IP limiter remains mandatory and fails closed.
Cloudflare's binding is approximate and per-location, not a globally exact quota:
https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
Compatibility date is 2026-11-02 and NODE_ENV is production. Observability remains
disabled to avoid introducing transaction request logs; no body/token logging is
added. Live secrets, widget/sitekey, API URL, IAM and deployment QA remain pending.
