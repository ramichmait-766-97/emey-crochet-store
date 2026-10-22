# Project context

Updated 2026-10-22. Start here before editing the application. No secrets belong here.

## Architecture

Angular 20 standalone, OnPush pages, SCSS, RxJS/signals; Firebase SDK 12.19.
`package.json` and `package-lock.json` are authoritative for dependency versions.
AngularFire was removed after reproducing a live mixed-SDK Firestore error.

- `src/main.ts`, `src/app/app.config.ts`: Angular bootstrap/router.
- `core/services/firebase.service.ts`: single Firebase app/Auth/maindb instance.
  All app SDK operations import only `firebase/*`; do not reintroduce AngularFire.
- `core/utils/firestore-streams.ts`: typed RxJS native onSnapshot adapters; teardown
  unsubscribes listeners, errors propagate to page load states.
- `core/services/product.service.ts`: shared catalog state (loading/data/error/retry).
- `core/utils/catalog.ts`: pure URL filter parsing, searching and sorting.
- `features/home/`: hero/product links, four collections, live product grid.
- `features/shop/`: URL drives collections/search/sorting. Special collection=new
  or collection=bestsellers filters the corresponding flags; q searches text/colors.
- `features/product-detail/`: live product, breadcrumbs, availability and bag action.
- `core/services/cart.service.ts`: slim persistence, live stock/price reconciliation,
  quantity limits and transient accessible announcements. Never persist base64 bytes.
- `core/services/order.service.ts`: rereads prices/stock from server, then prepares
  an estimate and encoded WhatsApp link through `core/utils/order-request.ts`.
- `features/cart/`: contact form, saved profile fill, validation and explicit link.
  Changes to bag/contact invalidate prepared link. No automatic sending.
- `core/services/auth.service.ts`: native token-change stream, role claims, auth,
  password reset/email verification. `auth-navigation.ts` validates return URLs.
- `core/guards/`: auth, admin and guest route guards.
- `features/account/`, `core/services/profile.service.ts`: editable profile,
  billing, notification preferences and account security. /profile aliases /account.
- `features/admin/`, `admin-store.service.ts`: catalog and settings management,
  numeric/category validation, image preview and up-to-700-KiB Firestore uploads.
- `core/services/navigation.service.ts`: preserves scroll during filters, restores
  history scroll, scrolls to anchors; page changes go to top.
- `core/layout/`: responsive header/nav, admin/account actions and configurable footer.
- `shared/components/product-card/`: product detail links and add action.
- `styles.scss`: shared page states, loading skeletons, breadcrumbs, feedback/accessibility.
- `features/not-found/`: real 404 view rather than silent home redirect.
- `scripts/firebase.ps1`: Windows shared-folder-to-local-copy build/deploy workflow.
- `.github/workflows/`: PR preview installs Node/dependencies, tests, builds, deploys.

## Firebase/data

Project emey-crochet-store; named database maindb. Catalogs use Firestore only;
no demo mode or static catalog exists in application source. Test fixtures live
under scripts/fixtures and are excluded from the app compilation.
Authentication is project-wide, not scoped to a named database. Native API/realtime
listeners are required. No billing-plan changes were made or authorized.

- products/P001..P019: id, slug, name, category, description, price, quantity,
  colors[], gallery[], bestSeller, newArrival, active, timestamps, imageData bytes,
  imageContentType. The 19-entry seed has Apparel (10), Bags & Accessories (5),
  Home Decor (3), Keychains (1). All images have enhanced boutique backgrounds
  and are WebP files under 700 KiB. Existing database prices, stock and active
  status are preserved on reseed. New P015-P019 start as inactive drafts; the
  owner supplies prices and quantities and enables active when ready. P016 is
  a nine-design tops collection preview. Public pages query active == true;
  admin reads hidden products too. Product changes appear through onSnapshot.
- siteSettings/public: storeName, currency, memberDiscountPercent, contacts[].
  Current WhatsApp is +96176080766 / https://wa.me/96176080766, explicitly supplied
  by user and saved via admin during this refactor. Currency USD, member discount 10%.
- users/{authUid}: uid,email,displayName,phone,billing {fullName,company,taxId,
  addressLine1,addressLine2,city,region,postalCode,country}, notifications
  {orderUpdates,emailOffers}, timestamps. Firestore rules restrict fields/types/
  lengths and ownership. Admin custom claim is the only source of privileges.
- orders/{id}: legacy Functions-created orders only. Browser writes remain denied.
  Current WhatsApp request flow intentionally does not create confirmed orders.

## Commands and deployment

Use supported Node 22.12+ or 24; host default Node 14 is too old. VM has Node 24.
`npm ci`, `npm start`, `npm test`, `npm run typecheck`, `npm run build:prod`.
VM shared folders cannot resolve host pnpm links reliably. `npm run firebase`
resolves source through npm_package_json, mirrors into local
LOCALAPPDATA/EmeyCrochet/deploy/project, installs when manifest/lock/Node-major
change, builds and deploys only Hosting/Firestore rules. -BuildOnly skips deploy.
Dedicated local target is managed; edit shared source, never the deployment copy.
Firebase credentials are per Windows machine/profile; VM login is not host login.

Trusted seeds under functions/scripts use service account, ADC or CLI login. CLI
credentials are supplied via temporary authorized-user ADC, cleaned on normal exit.
OAuth client values match Firebase CLI. No passwords or tokens are committed.
Run npm run productseed from the project to copy scripts, manifests and WebP
assets into C:\firebase-seed, install local dependencies when needed and seed.
Use -- --dry-run for offline validation. Matching by ID/slug/normalized name
prevents repeat inserts and rejects ambiguous matches. The seed refreshes only
changed image fields on existing products. No automatic activation or deletion.
Firebase credentials are required for real writes. The owner runs seeding and
deployment after reviewing the prepared source; do not claim a dry run seeded data.

## Boundaries and verification

Live audit reproduced blank catalog/admin lists with: Type does not match expected
instance / different Firestore SDK. Refactor uses native Firebase only and removes
AngularFire dependency. Native app browser tests showed 3 bags in the correct
collection, product detail, add-to-bag and all 14 admin rows/editor. Admin's current
password supplied in latest user message works; both admin and client role paths
are verified. No account passwords changed. Store contact was explicitly updated.

Tests cover all collection counts, combined filters/sorts, invalid URL filters,
new/bestseller filtering, safe role routing, rounded estimates and invalid contacts.
Build/TypeScript checks pass. Refactored frontend still requires deployment from
VM; do not imply localhost changes are already live. Database settings saves are
live immediately. Original production URL: https://emey-crochet-store.web.app.

No payment processor or automated notification delivery is configured. Request
estimates are manually confirmed by store; no stock reservation or fake order IDs.
Legacy functions/src/index.ts still exists, but is not used by the storefront.
Its multi-item transaction interleaves reads/writes and lacks duplicate-ID
aggregation; repair/test before any future backend checkout deployment. Do not
weaken order security rules to work around that. Full Functions deploy needs Blaze.

Regression suite now includes 16 checks for auth routing, catalog filters,
request estimates, duplicate seed matching, live activation and hidden admin rows.
Browser QA additionally confirmed client /admin denial, profile load, admin logout,
collection switching and browser Back restoring category and product count. An
unsent request for P004 at44 USD yielded39.60 USD member estimate; changing the
contact invalidated its link. No message was sent and no stock/order was mutated.
The configured WhatsApp number was verified in the generated link and live footer.

Final build after request-estimate model cleanup and three-column category layout passed. Host dependency lock was regenerated with npm11; package/lock roots match and AngularFire is absent from app source and lock. Shared-folder deployment now runs regression tests before production build.


## Asset and repository cleanup

The optimized seed images remain in src/assets/products; five are also used as
homepage category artwork. Keep these assets. Full-size generations, originals
and prompts stay in ignored output/product-photos; they are not needed by the app
or seed runner. Removed the unused public/index.html, duplicate Firebase config,
unreferenced Storage rules, outdated engineering notes and dead demo styles.
Angular caches and output archives are ignored; deployment excludes them.
Images use revalidation caching because their filenames are stable; hashed JS/CSS
and fonts retain immutable caching. The deployment copy includes functions/scripts
so duplicate-matching regression tests can import their helper. Legacy Functions
source remains available but is not part of the normal Hosting/rules deployment.
