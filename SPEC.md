# ARCHITECTURE & PROGRESS BLUEPRINT (`SPEC.md`)

Audit date: 2026-11-02 (Asia/Beirut). Scope: current checkout, including existing staged work, not just HEAD. Application inspection was read-only. This document specifies the target architecture and records observed implementation separately.

Implementation update, 2026-11-02: the subsequent authorized runtime-contract/cart
task changed application source. `src/app/types/commerce.contracts.ts` now provides
readonly domain contracts, full nested runtime guards and compatibility adapters
for the existing Firestore schema. Catalog/admin snapshot wrappers require
decoders; settings/profile/upload/commerce/recovery reads validate unknown data.
Commerce calls require a response decoder rather than a generic result cast.
Ledger status unions preserve existing server vocabulary, and public-order DTOs
no longer incorrectly require reservationMinutes. The original read-only audit
and historical verification below are a baseline; current changes supersede the
specific gaps described here and in the updated cart/quality sections.

Evidence: sibling `../emey-crochet-store-notes/PROJECT_MEMORY.md`, README.md, COMMERCE.md, DESIGN.md, UX-CONTRACT.md, application services/components/templates/styles, Firebase configuration/rules/indexes, Worker implementations/tests/configuration, legacy Functions and deployment workflows.

Status meanings:

- [✅ VERIFIED COMPLETED]: the narrowly named capability was inspected and, where stated, locally tested. This does not certify deployment or a whole pillar.
- [🟡 IN PROGRESS]: implementation exists but lacks requested finish, coverage, integration, or production evidence.
- [🔴 NOT STARTED]: no implementation of the named capability was found. Proposed architecture is not implemented functionality.

No complete pillar currently meets the requested enterprise baseline. Live provider settings, database contents/rules/index readiness, Cloudflare zone settings, ImageKit responses, and production performance were not independently queried.

## 1. Executive Summary & Quality Baseline

### Core target audience and premium experience

Emey serves buyers of small-batch handmade crochet apparel, bags/accessories, home decor and gifts, plus the store team managing limited stock and fulfillment, often on a phone. Preserve the existing boutique identity: cream surfaces, brown ink, tactile photography, DM Sans and Playfair Display. Delivery markets and operating policies require owner confirmation rather than inference from locale or telephone country code.

A premium experience means fast discovery, accurate variant availability, predictable totals, accessible controls, separate payment/fulfillment status and reliable interrupted-checkout recovery. A $30,000 comparison expresses ambition; it is not an acceptance test. Zero CLS, universal sub-second paint and absolute security cannot be certified by reading source.

### Architecture stack: actual versus target

- Angular manifests specify framework `^20.3.33`, CLI/build tooling `^20.3.39`, TypeScript `~5.9.3`, RxJS `^7.8.2` and Zone.js `^0.15.1`. Standalone components, OnPush, lazy `loadComponent` routes, signal inputs and Signals/computed state exist. Zone event coalescing is enabled. This is a browser-rendered SPA; no SSR/prerender/hydration configuration was found. Viewport-triggered `@defer` now wraps home categories, catalog cards and the detail gallery; cards/gallery have separate lazy chunks.
- Firebase SDK is pinned to `12.19.0`. One native `FirebaseService` owns app/Auth/Firestore database `maindb`. Retain that boundary; never reintroduce AngularFire. Auth and Firestore are integrated in source. Cloud Functions remain legacy code unused by the current storefront checkout.
- Firebase Hosting owns the configured SPA delivery. A Cloudflare upload Worker handles admin media. A separate commerce Worker implements reservations and an order ledger. Both have `workers.dev` configuration. This does not establish Cloudflare DNS/proxy/cache coverage in front of Firebase Hosting.
- ImageKit endpoint: `https://ik.imagekit.io/s5yr4ioi1`. Store hosted URLs/file metadata in Firestore, never new image bytes. Pure imagekit/imagekitSrcset pipes now build responsive, query-safe URLs for this account, plus small blurred backdrops and stable local error fallback. Local home WebPs remain explicit pass-through assets.
- Target Angular model: Signals for synchronous view/cart state; native SDK Observables for real-time streams; explicit lifecycle-managed interop; suitable below-fold components loaded through `@defer` with geometry-matched placeholder/loading/error states. Route laziness and template deferral address different boundaries.
- Keep Cloudflare, Firebase and ImageKit on free plans. No Blaze activation, paid Storage, plan upgrade or legacy Functions deployment is authorized. Future Functions/payment design must be reconciled with that constraint before implementation.

### Non-negotiable UX metrics

- Target zero unexpected CLS: require lab CLS = 0 on agreed scripted journeys and investigate every nonzero result. Reserve media, card, skeleton, font, security-challenge, error and async-content geometry. Collect field CLS at the 75th percentile when sufficient appropriate data exists. No field score is available here.
- Define sub-second paint as proposed FCP <= 1,000 ms on a documented reference device/network/cache profile. Report cold/warm runs separately; do not imply every device/network can meet it. Proposed additional release goals: LCP <= 2,500 ms and INP <= 200 ms. These are project targets, not measured achievements.
- Relevant product/marketing raster media must use approved ImageKit URLs, responsive width candidates and accurate `sizes`, format negotiation and low-resolution placeholders. Verify actual WebP/AVIF content types rather than assuming `f-auto` guarantees one format for every client.
- Local branding SVGs can be justified exceptions to an all-media ImageKit policy. Preserve existing local product assets even if runtime delivery later changes.
- Skeletons must match final layout at each breakpoint, expose accessible loading status and respect reduced motion. Preserve input values, focus, retry actions and usable control targets.
- Existing initial-bundle budgets warn at 5,750 kB and fail at 6 MB; they do not enforce sub-second paint. Measure a fresh bundle/network baseline before adopting tighter enforceable budgets. This audit did not generate a production build or performance trace.

## 2. Enterprise Angular Directory & Visual Tree

### Observed structure

```text
src/
├── main.ts, index.html, styles.scss
├── environments/environment.ts
├── types/temporal.d.ts                  # SDK bridge, not domain models
├── assets/{branding,products}/
└── app/
    ├── app.component.ts, app.config.ts, app.routes.ts
    ├── core/
    │   ├── constants/store.constants.ts
    │   ├── guards/{auth,admin,guest}.guard.ts
    │   ├── layout/{header,footer}/
    │   ├── models/
    │   │   └── product, user, profile, site-settings, order, commerce models
    │   ├── services/
    │   │   ├── firebase, auth, profile, product, cart services
    │   │   ├── commerce, admin-store, image-upload services
    │   │   └── site-settings, navigation, order services
    │   └── utils/
    │       └── firestore-streams, product-image, catalog,
    │           auth-navigation, order-request
    ├── shared/
    │   ├── components/product-card/
    │   ├── components/product-card-skeleton/
    │   ├── components/product-gallery/
    │   ├── components/checkout-challenge.component.ts
    │   ├── directives/image-fallback.directive.ts
    │   └── pipes/{product-image,imagekit}.pipe.ts
    └── features/
        ├── home/, shop/, product-detail/
        ├── login/, account/
        ├── cart/                       # currently includes checkout
        ├── orders/                     # guest/member/admin modes
        ├── checkout-settings/, admin/, not-found/
        └── commerce.scss
workers/image-upload/
├── worker.mjs                          # upload API
├── commerce.mjs, commerce-domain.mjs    # ledger/API/domain validation
├── firestore-rest.mjs                  # privileged transactions
├── worker.test.mjs, commerce.test.mjs
└── wrangler.jsonc, wrangler.commerce.jsonc
functions/src/index.ts                  # legacy callable createOrder
scripts/                               # regression/VM/recovery tooling
firebase.json, firestore.rules, firestore.indexes.json, storage.rules
```

### Target structure: proposed, not created

```text
src/app/
├── core/
│   ├── services/                       # singleton SDK/Auth/Firestore/API wrappers
│   ├── state/                          # cart/session Signals when separation helps
│   ├── guards/                         # functional route guards
│   ├── interceptors/                   # only for actual HttpClient traffic
│   ├── layout/                         # application shell
│   └── utils/                          # validators/converters/pure helpers
├── shared/
│   ├── components/                     # presentational buttons/cards/feedback
│   ├── pipes/                          # ImageKit transformer
│   └── directives/                     # reusable behavior when needed
├── features/
│   ├── discovery/                      # home/catalog/detail containers
│   ├── authentication/
│   ├── account/
│   ├── cart/
│   ├── checkout/                       # quote/review/reservation/recovery
│   ├── orders/
│   └── admin/                          # catalog/orders/settings containers
└── types/                              # strict domain/transport interfaces
    └── product, auth, profile, cart, checkout, order contracts
```

Dependency direction: feature containers → core services/shared UI/types. Presentational components accept data and emit intents; they do not own Auth, persistence, pricing or checkout policy. Types must not import feature components. Firebase initialization stays exclusively in `FirebaseService`. Standalone feature boundaries do not need NgModules.

Structural alignment is [🟡 IN PROGRESS]: readonly contracts and runtime decoders now live in `app/types/commerce.contracts.ts`, with compatibility view/edit models retained in `core/models`; ProductCard still injects CartService/SiteSettingsService and is not dumb; checkout lives in cart; buttons are native controls/global CSS rather than a shared component system. No shared directives or interceptors directory exists. Align incrementally while preserving routes/imports; avoid a wholesale rename solely for aesthetics.

No HttpClient provider/interceptor was found. Current APIs use `fetch`, and Firebase has its own SDK transport: Angular interceptors would not intercept either. Keep bearer tokens, timeout, no-store and error normalization in the real API boundary. Add a Cloudflare interceptor only if HttpClient traffic warrants it; do not proxy Firebase merely to fill a directory or expose service-account credentials to Angular.

## 3. End-to-End User Flows & Feature Matrix

### Authentication & Route Security — [🟡 IN PROGRESS]

**Flow:** protected route → Auth initialization → login/register/provider → safe return route → account/profile → verification/reset/logout. Admin routes additionally require the admin claim; server rules/API authorization remain authoritative.

**A) UI states:** loading/readiness exists; login/reset use mutable `busy` fields, account uses loading/saving/security Signals. Signed-out is an empty-session redirect; absent profile fields have defaults. Success notices and friendly errors/retry exist. State is not uniformly Signals-driven. Auth-stream errors can terminate shell/account/guard subscriptions without a recoverable view state; guards lack explicit error recovery or bounded initialization behavior.

**B) Data models/services:** `StoreUser`, `StoreRole`, `CustomerProfile`; FirebaseService, AuthService, ProfileService; auth/admin/guest functional guards and safe navigation utilities. Auth uses `onIdTokenChanged` and verified token claims, with lifecycle-managed currentUser() Signal interop for cart ownership. `ensureProfile` runs on registration and Google/Apple login, not email/password login. It uses read-then-set; no continuous Auth/profile reconciliation exists. ProfileService now validates one-shot reads and constructs profile fields explicitly; it is not a live profile stream.

**C) Capability matrix:**

- [✅ VERIFIED COMPLETED] Native SDK singleton and functional guard implementation inspected; local navigation tests pass for safe return URLs and role destinations.
- [🟡 IN PROGRESS] Email/password, Google/Apple, reset, verification and profile editing exist. Provider enablement/domains/mail delivery, failure after Auth creation, missing-profile repair and live claim behavior remain unverified.
- [🟡 IN PROGRESS] Profile ownership/field allowlists exist in rules; strengthen email/timestamp/nested-data validation and test malformed/cross-account writes in emulators.
- [🟡 IN PROGRESS] Route security needs auth-error UX, provider/expired-session tests and role-revocation checks. Browser redirects are not the security boundary.

**DoD:** guest/member/admin/provider-cancellation/expired-token coverage; profile-write failure after successful Auth creation; missing-profile repair; identity changes during pending profile loads; server denial of unauthorized reads/writes; typed loading/empty/success/error Signals at view boundaries with lifecycle-safe stream interop.

### Discovery & Performance Engine — [🟡 IN PROGRESS]

**Flow:** home collection → URL category/search/sort → product detail/gallery/variant → add to bag. Firestore updates availability.

**A) UI states:** shop/home now render ProductService's readonly Signals. Shop separates first-page and append loading, preserves rows on append failure, retries its cursor, reports pieces loaded and offers explicit Load more. URL changes hide mismatched old rows while requests are scheduled. Detail retains AsyncPipe over a bounded slug listener. Cards/skeletons and all ImageKit/defer bindings remain unchanged by pagination. Earlier controlled media/defer CLS 0 results are historical; arbitrary live data/font transitions remain unverified. Product-ID changes still reset selected media/options.

**B) Models/services:** ProductService now uses CatalogQueryFilters/PaginatedCatalogPage and getDocsFromServer with limit + 1, explicit physical-field order and document-ID tie-breaker, plus a retained snapshot cursor passed to startAfter. Logical price/title/version map to price/name/inventoryVersion, with no schema migration. Category/collection/prefix filters run on the server. decodeProduct/toProductDocument/assertValidProduct validate each consumed row; malformed records are skipped and cursor progress continues. Generation checks suppress superseded/destroyed requests and duplicate IDs are merged. Detail queries active + slug (limit 2); cart watches active IDs (max 15). Full behavior, version-field prerequisites, mutation limits and index matrix are in CATALOG.md.

ProductImagePipe remains a compatibility source resolver. ImageKitPipe and ImageKitSrcsetPipe replace fixed requests in rendered product media: cards use 200/400/600/800 candidates, detail uses 320/640/960/1280/1600, and gallery/bag/admin have thumbnail candidates. Sizes match actual grid breakpoints. Existing transformations are replaced without losing other query parameters; commas are URL-escaped for valid native srcset parsing. Optional blur uses documented bl-30, with 32px/q20 LQIP backdrops cleared on load. Only the configured ImageKit account is transformed; local/data images and external URLs receive no fictitious responsive variants. Legacy bytes remain compatibility-only and are never newly persisted.

**C) Capability matrix:**

- [✅ VERIFIED COMPLETED] Local deterministic cursor engine, Signals, malformed-row/cursor behavior, retries, reset/race handling and index matrix pass regressions. Shop uses 12-row Load more; home previews 8; admin pages 25, each with one lookahead.
- [🟡 IN PROGRESS] Product queries are now bounded, but the new 37 product composites must be deployed/enabled in maindb and tested against actual catalog/rules before rollout. Existing order indexes and six exemptions are preserved.
- [✅ VERIFIED COMPLETED] Local category/collection filters and price/name ordering use server predicates. Search explicitly means case-sensitive name prefix, forcing name order. Full-text/normalized tokens are not implemented; default featured URL now means Name: A to Z, and new-arrival choices filter the flag. Version sorting is not exposed until legacy inventoryVersion coverage is confirmed.
- [✅ VERIFIED COMPLETED] Responsive ImageKit/srcset/LQIP/fallback source implementation and unit tests; gallery/variant/admin/bag image bindings now use the shared pipeline. Five local home raster sources remain unchanged by design.
- [✅ VERIFIED COMPLETED] Viewport @defer for discovery cards, home categories and gallery, matching skeleton/loading/error geometry, separate card/gallery code chunks and working reload recovery. Browser fixtures verified off-screen content/chunks remain deferred until visibility.
- [🟡 IN PROGRESS] All raster image tags now have dimensions and/or explicit aspect boxes, with responsive photo heights. Main detail/hero are prioritized and visible first shop cards load eagerly once instantiated. Fonts still use Google `display=swap`, without live fallback-metric testing. Full production CLS is not certified.
- [🟡 IN PROGRESS] Local browser fixture traces now check media/defer CLS at 320/390/768/1280px and DPR 1/2. Field metrics, real CDN bytes/content types, cold-region paint and enforceable CI performance budgets remain outstanding.

**Target path:** deterministic bounded Firestore query with document-ID tie-breaker → validated page/cursor → feature Signals → presentational cards → approved responsive ImageKit URLs. Reset cursor on filter changes, discard stale responses, deduplicate IDs and preserve Back/scroll restoration. Separate first-page and load-more errors/loading. Define server filters/indexes explicitly: arbitrary substring search cannot simply become the existing Firestore query; bounded client search must disclose its coverage.

**DoD:** deterministic page traversal with duplicate sort values/catalog changes; direct product lookup without full-catalog fetch; approved transformed responsive media and broken-image fallback; below-fold deferral; keyboard/mobile QA; measured zero CLS across loading/success/empty/error transitions.

### Local Reactive Cart State — [🟡 IN PROGRESS]

**Flow:** select variant → add/update/remove → reload → live price/stock reconciliation → checkout. Target member flow adds private remote hydration/merge and account isolation.

**A) UI states:** private `#lineItems` Signals own slim cart state; readonly `items()`, `totalItemsCount()` and `estimatedSubtotalCents()` plus a computed legacy display projection are synchronous. Empty/populated/unavailable/quantity-limit states exist. Storage failures preserve the in-memory bag and expose inline status. Auth initialization is distinct from confirmed guest. Member remote-sync/loading/conflict UI remains absent.

**B) Models/services:** CartLineItem persists only productId, variantId/null, bounded quantity and snapshotPriceInCents. `emey-cart-v3:guest` and UID-scoped member keys isolate device-local bags; validated v2 migration extracts only permitted fields. AuthService.currentUser() drives scope changes with cross-scope guards. No auto-merge occurs. Cart now uses lifecycle-managed toObservable/toSignal + switchMap to watch only its distinct product IDs; quantity-only changes do not reopen the query. Responses carry their ID set, so off-page or outdated browse results never imply deletion. Computed display lines still reflect live prices/stock with effect-based reconciliation/persistence. Ten units per selection and fifteen selections remain enforced. Quotes remain authoritative; no storage-event/multi-tab synchronization exists.

Target remote cart: schema version, owner UID, product/variant IDs, bounded integer quantities, revision/updatedAt; no client-authoritative prices or byte payloads. Define guest-to-member merge/capping, logout/account switching, offline retry and concurrency policy before adding writes. Add owner-only rules for the chosen path; current default-deny rules do not authorize remote carts.

**C) Capability matrix:**

- [✅ VERIFIED COMPLETED] Local Signals operations, caps, price/stock reconciliation, slim migration, owner isolation, persistence errors and lifecycle cleanup pass real Angular scheduler regressions. Checkout completion/recovery cannot clear another account's cart.
- [🟡 IN PROGRESS] Guest/device-member durability now has decoding and feedback; multi-tab/device synchronization remains outstanding.
- [🔴 NOT STARTED] Firebase member-cart persistence, hydration/merge/logout policy and cart rules.
- [✅ VERIFIED COMPLETED] Cart owns bounded active-ID listeners with lifecycle cleanup; an empty bag makes no product query. Neither browse nor admin subscribes to an unbounded product collection.

**DoD:** corrupt/blocked/quota storage; deleted/deactivated product or variant; live price/stock changes; multiple tabs/devices; merge conflicts; sign-in/out/account changes without exposing previous-account state. Revalidate every purchase server-side.

### Scalable Checkout & Webhook Pipeline — [🟡 IN PROGRESS]

**Current flow:** contact/delivery/payment → `/quote` → reviewed fingerprint → Turnstile → `/checkout` → atomic reservation/reference/private status → optional WhatsApp → admin payment/fulfillment ledger. Source already exceeds dummy checkout: it reserves real inventory. It does not process online payments.

**A) UI states:** cart uses configLoading/busy/pending/error/quote/result fields and manual change detection, not a uniform Signals state engine. Empty cart and closed/unconfigured checkout are distinct. Edits invalidate quotes; sessionStorage preserves the exact pending request/random key for uncertain-response recovery. Success clears the bag except returned expired/cancelled orders. Recovery checks status or retries the same request. Orders use Signals for loading/error/notice/selection and empty states; settings expose draft/version/conflict behavior.

**B) Models/services:** CheckoutSettings, DeliveryZone, PaymentMethod, LedgerLine, OrderQuote, LedgerOrder, OrderPage, CheckoutContact and component-local CheckoutRequest. CommerceService validates settings read through FirebaseService and POSTs to the Worker with optional token, timeout, omitted credentials, no-store and no-referrer. Every call now requires an explicit unknown-payload decoder. Nested amounts/totals/IDs/status unions are validated, public-order DTOs no longer incorrectly require reservationMinutes, and local recovery validates its request/owner. Ledger states retain existing server vocabulary; future uppercase provider-facing types are separate. Runtime validation does not replace server authorization.

Worker validates JWT signature/project/expiry, server-derived verified-email discounts, Origin, rate limits, body bounds and Turnstile hostname/action. It rereads catalog/settings, prices in cents and commits inventory/order/events through Firestore REST transactions with dedicated IAM secrets. Privileged IAM bypasses browser rules: Worker validation and credential scope are independent security boundaries. Origin is not authentication.

Schema-v2 orders hold immutable price/contact/delivery/payment snapshots, hashed access/request identities, deterministic order ID/idempotency, held/committed/released stock, independent payment/fulfillment and versioned audit events. Guest fragment tokens return a PII-stripped summary and expire after 90 days. Order history has 25-row cursor pages; admin status filtering is loaded-row-only. Cron runs every ten minutes, expires up to three due holds, with status/admin access also expiring overdue holds. Backlogs can accumulate; this is not an enterprise throughput guarantee.

**C) Capability matrix:**

- [✅ VERIFIED COMPLETED] Local Worker tests pass for authoritative cents/variants, idempotency, simulated stock races, expiry/release once, transition/version constraints, guest/member isolation, signed tokens, challenge checks, body/rate limits, settings and REST retry/write mapping. These use controlled dependencies, not deployed IAM or real contention.
- [🟡 IN PROGRESS] Commerce Worker deployment and secret uploads are supported by user terminal evidence; live CORS/missing-token checks passed independently. User confirms maindb indexes enabled and rules published. Source browser commerce URL and public Turnstile sitekey are now configured; Hosting deployment is pending. Real IAM transactions, challenges, cron execution and recovery still require integration QA.
- [🟡 IN PROGRESS] Validate free-plan transaction/subrequest/latency/backlog operating limits, especially large carts and retries. Commerce observability is disabled in Wrangler configuration; no verified alert/reconciliation process exists.
- [🔴 NOT STARTED] Stripe/PayPal payment creation/UI, signed webhook endpoints, event deduplication, automated refunds and provider reconciliation.
- [🟡 IN PROGRESS] Legacy Functions `createOrder` exists but is not wired into current checkout. It lacks v2 idempotency/reservation/variant/payment contracts and interleaves reads/writes across cart items. Do not activate it as the modern backend.

**Future payment blueprint, design only:** create provider payment attempts server-side against canonical order IDs/version/amount/currency. Keep secrets server-side. Use a separate webhook boundary verifying raw-body signatures/provider identity rather than browser Origin/Turnstile. Atomically deduplicate provider event IDs, validate order/amount/currency, handle retries/out-of-order events and audit every transition. Browser success redirects never mark paid. Keep payment attempts distinct from fulfillment; handle hold expiry/late settlement, cancellation/refunds and reconciliation. If Workers and Functions coexist, choose one canonical event writer and authenticate their handoff. Resolve free-plan feasibility and owner authorization before activating Functions or providers.

**DoD:** real final-stock concurrency, lost-response retries, stale quotes, membership changes, unauthorized access, expired/replayed capabilities, admin conflicts, stock release, cron backlog, redacted diagnostics and confirmed business fees/policies. Provider phase additionally requires sandbox signed-webhook replay/out-of-order/refund/reconciliation coverage and named operational ownership.

## 4. Verification Checkpoints & Definition of Done (DoD)

### Code quality — [🟡 IN PROGRESS]

- [✅ VERIFIED COMPLETED] Current frontend no-emit typecheck passed. tsconfig enables strict TypeScript/templates/injection/input access plus return/override/index-signature checks.
- [✅ VERIFIED COMPLETED] Frontend catalog/admin snapshots, settings, profile fields, uploads, commerce responses and local recovery/cart payloads now decode unknown data. Generic Firestore/API result assertions were removed; nested primitives/arrays/IDs/hosts/cents/totals/statuses are checked, and data is explicitly constructed. Opaque legacy image bytes/SDK timestamps remain compatibility unknown fields; no new cart persistence includes them. Worker `.mjs` remains outside frontend strict coverage, and live integration evidence remains outstanding.
- [🟡 IN PROGRESS] Feature/Worker errors are handled in many paths, but no custom application ErrorHandler/recoverable shell boundary exists. Add route-load/Auth-stream/unexpected-error recovery and redacted diagnostics; global capture cannot resume failed business transactions.
- [🟡 IN PROGRESS] Snapshot teardown, AsyncPipe, guard take(1), refCount sharing and takeUntilDestroyed remain. Cart now uses lifecycle-managed toSignal/effects and guarded identity scopes; checkout recovery records owner identity. Broader Auth/profile stream-error and Promise cancellation/recovery gaps remain.
- [🟡 IN PROGRESS] Rules deny browser order writes, constrain profile ownership/fields and require admin claims for product writes. Admin product/settings validation remains largely client-side; product rules allow unrestricted admin payloads. Require emulator adversarial tests and an explicit trusted-admin model. Storage rules deny all; do not activate paid media storage.
- [🟡 IN PROGRESS] Hosting has nosniff/referrer/frame/permissions headers and private-status no-store. No CSP configured. Assess/test a Firebase/Auth/ImageKit/fonts/Turnstile-compatible policy and actual deployed headers. Never cache tokens/personalized responses.

### Cloudflare/ImageKit audit — [🟡 IN PROGRESS]

- [✅ VERIFIED COMPLETED] Upload Worker tests cover signed admin access, Origin/preflight, magic/size validation, no-store, hosted URL checks and redacted upstream errors.
- [🟡 IN PROGRESS] Hosted gallery/variant/admin/bag/card requests now use the configured-account responsive transformer. Local home rasters are deliberate pass-throughs. Controlled network fixtures prove URL selection/geometry, not actual ImageKit/CDN responses; live formats/cache/bytes still need inspection. Preserve local assets and never rerun legacy seeds against migrated catalog.
- [🔴 NOT STARTED] Repository-managed storefront Cloudflare DNS/proxy/CDN cache-rule configuration not found. Account-side state is unknown, not proven absent. Worker deployment does not prove Hosting traffic traverses Cloudflare.
- [🟡 IN PROGRESS] Hosting gives JS/CSS/woff2 one-year immutable caching and rasters/SVG revalidation; verify unhashed assets cannot become stale. Worker source returns no-store/Vary: Origin; no Cache API implementation found. No verified cache-hit claims can be made.
- DoD: capture actual HTML/hashed asset/ImageKit headers, cache status, width/format/content types and cold/warm regional latency. Verify transformations/format variants remain distinct in cache keys and private POST/order/Auth responses never enter shared cache. Confirm current account usage/limits without plan changes. Redact credentials/access capabilities from evidence.

### Read-only baseline verification on 2026-11-02

- Frontend `tsc -p tsconfig.app.json --noEmit`: PASS, exit 0.
- Root regression tests: PASS, 19/19.
- Worker tests: PASS, 24/24 (18 commerce + 6 upload).
- Supported bundled Node used per project guide. Local tests exercise source/fakes; no seed/migration script executed.
- No fresh production build, browser visual review, emulator rules test, performance trace, external query, credential inspection, live mutation, deployment, commit or push. Historical guide build/browser results remain historical.
- Existing staged application work preserved. Only SPEC.md and the required external memory entry were authored for this task.

### Runtime-contract/cart implementation verification on 2026-11-02

- Frontend strict no-emit typecheck and production Angular build: PASS. Current
  build reports 900.76 kB initial raw / 241.78 kB estimated transfer; these are
  bundle estimates, not paint/interaction measurements.
- Root regressions: PASS, 31/31. Worker regressions: PASS, 24/24. Cart tests use
  real Angular TestBed Signals/effects and check teardown, limits, migration,
  scoped ownership, stock/price reconciliation and blocked storage. Contract tests
  reject malformed nested payloads and exercise real API/snapshot decode boundaries
  plus checkout account-switch protection.
- Changed-file Prettier check and Git whitespace check: PASS. Repository-wide
  formatting was not claimed; the guide records pre-existing unrelated failures.
- Headless Edge, 390px: empty/saved/corrupt/blocked-storage cart, removal/reload
  passed with zero page exceptions or horizontal overflow. External requests were
  blocked; no live catalog/Auth/checkout integration was exercised.
- Routing paths, layout/styles, server reservation code and Firestore schema were
  preserved. No deployment, seed/migration against Firebase, credential access,
  commit or push occurred. Local v2-to-v3 browser-cart migration is separate from
  product database migration. Remote member-cart sync, pagination and live commerce
  readiness remain outstanding; the full phases are not marked complete.

### Responsive media/view implementation verification on 2026-11-02

- Strict frontend no-emit and production Angular build passed; 35 root + 24 Worker
  tests passed (59 total). Image pipeline tests cover query/transform replacement,
  approved endpoint, local/data/external pass-through, parameter limits, srcset
  parsing, LQIP and bounded fallback. No new package dependency was added.
- Production build reports 911.83 kB raw / 247.18 kB estimated initial transfer.
  This is larger than the previous runtime-contract build; do not claim an initial
  JavaScript reduction. Cards and gallery are separately emitted lazy chunks.
- An ignored local fixture app uses the real components/router and fake catalog/
  Auth/settings providers. Headless Edge measured CLS 0 for tested image/defer
  journeys at 320/390/768/1280px, DPR 1/2, plus home/detail/fallback cases. Off-screen
  placeholders retain exact card geometry and instantiate only when visible.
  The 390px/DPR2 card chose w-400; the 768px/DPR2 card chose w-600. Gallery and card
  chunks were absent before their viewport triggers. Forced chunk failure recovered
  through Reload catalog; forced image failure removed srcset and preserved shape.
- External requests were blocked/fulfilled with local image fixtures, and fonts
  used fallbacks: these are controlled browser results, not real CDN byte/format,
  live catalog/cardinality, font-swap, field CLS or global latency certification.
  Artifacts/results are under ignored `.artifacts/media-*`.
- DESIGN.md lint: zero errors, four existing orphan-token warnings. Strict generic
  UI audit reports 50 actionless-button findings; Angular-aware inspection found a
  `(click)`/form handler for each. Raw audit was not called a clean pass. Repo-wide
  formatting still reports 14 pre-existing unrelated files; touched media files
  are formatted. Cart state/payment logic, route paths and Workers are unchanged.
- No credentials, production writes, plan changes, media uploads, deployment,
  product migration/seed, commit or push. Five local home WebPs remain unchanged.

### Bounded catalog implementation verification on 2026-11-02

- Strict no-emit and warning-free production Angular build: PASS. Root regressions
  43/43 and Worker regressions 24/24 passed (67 total). Initial build is 920.33 kB
  raw / 248.95 kB estimated transfer; no new package dependency or performance claim.
- Real ProductService code with a controlled Firestore adapter verifies tied
  names/prices/revisions in both directions, reset and stale-response suppression,
  bounded reads, rejected-row cursor progress, deleted cursor snapshots, duplicate
  merge, append failure/retry, version-field prerequisites and listener teardown.
  Every public index combination is checked against the JSON configuration.
- Actual shop controller/template with a fixture paging provider passed headless
  Edge at 390px and 1280px: 12/24/36/38 loaded rows, disabled busy button, failure
  retention/retry, category reset, price sort, prefix search, no results/clear,
  zero page exceptions or horizontal overflow. External requests were blocked or
  fulfilled locally. Evidence is ignored under `.artifacts/catalog-*`; this is not
  a live Firebase/emulator or production-index verification.
- Index configuration now contains 37 product and three preserved order composites,
  with six preserved field exemptions. None were deployed. Missing-index errors
  are handled without unbounded fallbacks. CATALOG.md documents exact physical
  fields, supported predicates, freshness/mutation/search limits and rollout steps.
- Touched files and whitespace checks pass. COMMERCE.md was formatted while its
  index instructions were updated; other historical repository formatter failures
  remain. Generic UI audit reports 52 actionless-button flags, all with Angular
  click/form actions on inspection; no clean generic-audit pass is claimed.
- No application-state seed, product migration, credential access, database write,
  plan change, Hosting/Worker/index deployment, commit or push. ImageKit source,
  payment mechanics and router paths were not changed. Cart's necessary read
  integration now watches its IDs rather than treating a browse page as complete.

### Production evidence and rollout prerequisites

User terminal evidence confirms commerce Worker deployment, three secret uploads and maindb index/rule deployment; user confirms index readiness and service-account/widget creation. Live CORS and missing-token rejection independently passed. Public browser configuration is now present in source; updated Hosting deployment and real transaction/challenge/cron verification remain pending.

Before opening checkout: deploy updated Hosting; verify actual IAM/secret functionality; test actual Auth/atomicity/challenge/expiry/recovery; confirm delivery/payment operating terms in disabled drafts; explicitly open checkout. Normal VM runner deploys Hosting/rules, not indexes or Workers. Follow COMMERCE.md with VM-local dependencies/profile credentials while editing this checkout. Avoid legacy Functions-inclusive deployment/paid activation. This documentation task authorizes no rollout.

### Ordered completion plan

1. Finish runtime contracts, Auth/profile recovery, security/integration evidence, IAM/configuration, business policies and expiry operating limits for existing commerce.
2. Bounded catalog/admin paging and direct detail/cart reads are implemented locally; deploy/verify their maindb indexes and catalog coverage. Member remote cart sync/merge/owner rules remain outstanding.
3. Responsive ImageKit/LQIP, media geometry and viewport @defer are implemented locally. Finish live CDN/field verification, font stability, measured budgets and CI performance gates.
4. Incrementally align directory/presentational boundaries while preserving identity/routes; avoid speculative layers or wholesale rewrites.
5. Add payment/webhook providers only in a separately authorized phase after resolving free-plan feasibility.

A whole flow earns [✅ VERIFIED COMPLETED] at the premium baseline only after implemented state/model/security contracts, relevant automated checks, responsive accessible UI review, measured performance and required live integration evidence all pass. Local regressions alone cannot promote a complete pillar.

### Edge security hooks — 2026-11-02 local verification

Checkout now uses an ephemeral X-Turnstile-Token header and advertised CORS header;
missing token returns401, invalid challenge403. Canonical Siteverify validates
HTTP status, strict success boolean, hostname and checkout action with a timeout.
Malformed JSON roots/checkout selections/contact/key/fingerprint fail before the
Firestore factory; failed verification cannot dispatch database requests. Existing
IP limiter, JWT authorization, atomic stock/idempotency/expiry logic preserved.
All API replies include restrictive JSON CSP and no-store; Hosting CSP is still
pending. Separate upload/commerce configs and existing TURNSTILE_SECRET secret
handle preserved; real hosting origins used, no placeholder fallback or dev bypass.
See COMMERCE.md for scope and approximate per-location limiter limits. Full checkout
pillar remains IN PROGRESS until live configuration and integration QA pass.

### Admin dashboard and responsive editor — local implementation, 2026-11-02

New guarded /admin/dashboard summarizes existing authenticated order pages with
currency/date-filtered order value, net recorded payments, pending confirmation,
outstanding balances, daily chart/table, fulfillment distribution and recent orders.
Scope is explicit: loaded recent pages25, capped250; no store-wide/visitor revenue
claims or new Firestore scans. Admin Home/logo/default sign-in target dashboard;
clients retain storefront Home. Existing /admin and transaction paths preserved.
Shared admin navigation spans management screens. Native modal product add/edit
uses viewport scrolling, focus trapping/restoration, dirty-route/close confirmation,
busy protection and inline failure recovery. Mobile product rows retain status;
loaded-product search/filter/clear and refresh added. Checkout settings reuse the
shared modal for their existing unsaved-navigation confirmation. Cash on delivery
unchanged; Stripe/PayPal and webhook integration remain future work.
These UI changes are local until the next Hosting rollout, independent of the
previously deployed commerce Worker and owner-reported successful settings creation.
