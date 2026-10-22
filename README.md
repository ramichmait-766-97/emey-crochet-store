# Emey Crochet Store

An Angular 20 storefront for handmade crochet, using Firebase Authentication and
Firestore database `maindb` in project `emey-crochet-store`.

## Development

Use Node 22.12+ or Node 24 and a local disk for dependencies:

```powershell
npm ci
npm start
```

The application uses the modular Firebase SDK (`firebase@12.19.0`) through one
`FirebaseService`. AngularFire is intentionally removed: mixing its Firebase 11
references with Firebase 12 caused empty public and admin catalogs.
Public project configuration lives in `src/environments/environment.ts`.
Never put private credentials or passwords in application source.

## Deploy from the VMware shared folder

```powershell
npm run firebase
```

The Windows script resolves its source even when npm's CMD process falls back from
a UNC path. It mirrors source into `%LOCALAPPDATA%\EmeyCrochet\deploy\project`,
installs dependencies when package files or Node major change, builds production,
and deploys Hosting and Firestore rules. The current VM user's Firebase CLI login
is used. Do not edit the managed local copy; edit the shared source instead.

```powershell
npm run firebase -- -BuildOnly
```

The normal command excludes Functions and does not change your billing plan.
`npm run firebase:deploy` is the legacy full deployment command; it includes
Functions and requires Blaze. Prefer `npm run firebase` for this store.

## Shopping and ordering

- Storefront and admin catalogs use Firestore realtime listeners only. There is
  no bundled demo catalog or static product fallback. Public pages query
  `products` with `active == true` in `emey-crochet-store / maindb`; admin sees
  hidden products too. Seeding does not require redeploying the storefront.
- Newly seeded P015-P019 start hidden. In `/admin`, enter their actual prices
  and stock, enable Active, and save to make them appear publicly.
- Home collection links open URL-driven shop filters; category, search and sorting
  survive refresh and browser history. New arrivals and bestseller shortcuts filter
  the matching products.
- Products use image bytes stored in Firestore. Admin uploads accept images up to
  700 KiB; the browser generates display data URLs. Storage is not needed.
- The bag persists slim product data without binary/base64 images. Prices and stock
  refresh from the catalog. Added items have accessible confirmation feedback.
- Checkout prepares a WhatsApp request after checking current Firestore prices and
  stock. Member discount is shown as an estimate. Customers explicitly send the
  message; the store confirms availability, delivery and payment manually.
- Preparing a request does not create a confirmed order, collect payment, decrement
  stock, or clear the bag. Editing request details invalidates the prepared link.
- WhatsApp contact: `+96176080766`, configured in Store settings. Invalid/missing
  contacts block request preparation with a useful message.

## Accounts and admin

Admins are authorized by Firebase Auth custom claim `admin: true` and go to
`/admin`. Clients go to `/account`. Header navigation exposes the correct actions,
including mobile navigation and sign out. Safe shopping return URLs are preserved.

Account profiles save name, phone, billing address/company/tax details and
notification preferences in `users/{uid}`. Password reset and email verification
use Firebase Auth. No card details are stored. Notification preferences are saved;
automated notification delivery is not connected.

Admin manages products, stock, prices, image bytes and store/contact settings.
Firestore rules protect profile ownership and prevent customer role escalation.
The database must support the Firestore Native API and realtime listeners.

## Seeds

Install trusted script dependencies with `npm --prefix functions ci`. Use local
VM copies when the shared folder cannot resolve node_modules links. Scripts accept
a service account via GOOGLE_APPLICATION_CREDENTIALS, ADC, or the existing Firebase
CLI login. Do not commit credential files.

```powershell
npm run products:seed
npm run users:seed
```

For a local-disk seed run from the shared project folder, use `npm run productseed`.
It copies the seed scripts into `C:\firebase-seed\functions\scripts`, the Functions
dependency manifests into `C:\firebase-seed\functions`, and product WebP images into
`C:\firebase-seed\src\assets\products`, installs local dependencies when needed,
then seeds from that copy. It leaves unrelated destination files and credentials
in place. Repeated runs refresh the copied source files and reuse installed dependencies.
Use `npm run productseed -- --dry-run` to validate the local copy without database writes.

If Firebase credentials are missing, run `npm run firebase:login` once, complete
the browser sign-in with an account authorized for this project, then retry.

Product seed includes 19 entries and verifies every image by read-back, preserving
existing prices, stock, publication status and settings. It matches by fixed ID,
normalized slug or name; ambiguous matches or conflicting IDs abort before writes.
Repeated runs refresh changed images without creating additional products. Existing
duplicates must be resolved manually; the script does not delete products.
All 19 product images use the enhanced boutique backgrounds. P015–P019 are created as inactive drafts
with zero price and stock; set actual prices/stock in `/admin` before activation.
P016 is a nine-design tops collection preview, not nine separately purchasable items.
Images are committed as WebP assets under 700 KiB; the original PNG outputs are
not needed to run the seed. The launcher uses supported Node on PATH, or the
installed Codex Node runtime when the system Node is too old.
Use `npm run products:seed -- --dry-run` for local image/manifest validation without
connecting to Firestore. User seed targets the configured admin/client emails;
set SEED_ADMIN_PASSWORD and SEED_CLIENT_PASSWORD in the process environment first.
It creates or updates accounts, resets their passwords to the supplied values,
and verifies role claims. Passwords are never written to Firestore or source.

## Validation

```powershell
npm test
npm run typecheck
npm run build:prod
```

See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the code map, schema, verification
status and remaining boundaries. Local original photos, full-size generated PNGs
and image-generation prompts are retained under `output/product-photos/`, which
is ignored by Git and excluded from the deployment copy. Commit the optimized
`src/assets/products/*.webp` files to share or deploy the enhanced images.
