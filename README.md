# Emey Crochet Store

Angular 20 storefront with Firebase Authentication, Firestore realtime catalogs,
ImageKit product photos, and a Cloudflare Worker for secure admin uploads.

## Development and checks

Use Node 22.12+ or Node 24. Install dependencies on a local disk, not a VMware
shared folder with host-linked node_modules.

```powershell
npm ci
npm start
npm test
npm run typecheck
npm run build:prod
```

Worker checks:

```powershell
cd workers/image-upload
npm ci
npm test
```

## Deploy from the VMware shared folder

```powershell
npm run firebase:login
npm run firebase
```

The launcher handles UNC paths, mirrors source to
`%LOCALAPPDATA%\EmeyCrochet\deploy\project`, reuses local dependencies, runs tests,
builds, and deploys only Hosting and Firestore rules. Hosting uploads default to
two concurrent files; `FIREBASE_HOSTING_UPLOAD_CONCURRENCY` overrides that value.
Credentials are specific to the Windows user and machine. Edit the shared source,
not the generated deployment copy. `npm run firebase -- -BuildOnly` skips deployment.
Avoid the legacy `firebase:deploy` command: it also deploys Functions and requires Blaze.

## Store behavior

- Firebase project: `emey-crochet-store`; Firestore database: `maindb`.
- Catalogs come from Firestore realtime listeners. Public pages show active
  products; admin sees hidden products as well. There is no demo catalog fallback.
- Admin access requires the Firebase Auth custom claim `admin: true`.
- Product photos are hosted on ImageKit. Admin accepts WebP/JPEG/PNG up to 5 MiB;
  the Worker verifies the Firebase admin token and uploads using its secret key.
  Firestore stores `imageUrl`, `imageFileId`, and `imageContentType`.
- Existing photo migration was reported complete by the owner on 2026-10-26.
  Legacy byte rendering remains for recovery. Do not run the old product seed
  against the migrated catalog; it refuses writes once hosted images are present.
- Local product WebP files remain necessary for homepage artwork and recovery.
- The cart keeps slim local data and reconciles current prices/stock. Checkout
  prepares a WhatsApp request; the customer sends it and the store manually confirms
  availability, delivery, and payment. No payment collection, stock reservation,
  automated notification delivery, or confirmed order is created by this flow.
- Profiles and notification preferences are stored in `users/{uid}`. Role claims,
  profile ownership, and customer write restrictions are enforced by Firestore rules.

## Image hosting and recovery

- ImageKit endpoint: `https://ik.imagekit.io/s5yr4ioi1`
- Upload Worker: `https://emey-image-upload.rami-chmait97.workers.dev`
- Worker source/configuration: `workers/image-upload/`.
- Worker text variables: `FIREBASE_PROJECT_ID`, `IMAGEKIT_URL_ENDPOINT`,
  `ALLOWED_ORIGINS`; secret: `IMAGEKIT_PRIVATE_KEY`. Never commit private keys.
- Keep all services on their free plans. Usage allowances still apply.

Migration tooling is retained for recovery and skips products without image bytes:

```powershell
# Preview only; requires authorized Firebase CLI login on the VM.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\migrate-images.ps1
# Apply only when intentionally migrating remaining byte images; prompts for key.
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\migrate-images.ps1 -Apply
```

The runner uses `C:\firebase-seed` for local script dependencies. Migration verifies
the publicly served original with SHA-256 before replacing bytes and uses an update
precondition to avoid overwriting concurrent edits. Private keys stay out of chat,
source, and shell command history. Admin/user seed scripts and legacy checkout
Functions are recovery tools, not part of normal deployment; user seeding resets
passwords and must only be run deliberately.

## Project guide

The maintained code map, history, verification record, and next steps live outside
the repository at `../emey-crochet-store-notes/PROJECT_MEMORY.md`. AGENTS.md instructs
future tasks to read and update it. That sibling folder is not included in a Git
push; copy it separately when moving to a different computer.
