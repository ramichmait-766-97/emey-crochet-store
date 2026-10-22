# Engineering review notes

## Dependency alignment

The previous project mixed Angular 21 packages with `@angular/fire@^21.0.0`, but no stable AngularFire 21 package exists. The project is now aligned on the stable Angular 20 LTS ecosystem:

- Angular framework `20.3.x`
- Angular CLI / `@angular/build` `20.3.39`
- AngularFire `20.1.1`
- Firebase JS `12.18.x`
- Firebase Tools `15.30.x`
- Firebase Functions `7.4.x`
- Firebase Admin `14.5.x`

`@angular/build` is used instead of the deprecated webpack-oriented build facade.

## Codebase changes

- Split large inline components into TypeScript / HTML / SCSS files.
- Added `OnPush` change detection to UI components.
- Replaced loose `any` typing with explicit domain interfaces.
- Added typed product categories and store roles.
- Added centralized default store settings.
- Made member discount, currency and contacts dynamic.
- Added a dedicated admin data service for privileged writes.
- Made cart storage defensive and quantity-aware.
- Added safe authentication return URLs and friendlier auth errors.
- Added accessibility labels, focus styles and reduced-motion handling.
- Added consistent responsive behavior and loading-friendly product images.

## Security changes

- Admin access is based on Firebase custom claims.
- Firestore user documents cannot self-assign admin/role fields.
- Orders cannot be created or modified directly by browser clients.
- Cloud Functions re-read prices and stock from Firestore.
- Discount percentage and currency are read server-side from store settings.
- Order creation and stock decrement happen in a single transaction.
- Product uploads are restricted to admins, image MIME types and 8 MB.
- Firebase Hosting includes baseline security headers.

## Validation status

- Package versions were checked against current published releases.
- TypeScript source was syntax-parsed locally.
- Static scans found no remaining `any` types or stale AngularFire 21 references.
- A full `npm install` could not finish inside the execution environment because registry access timed out. Run the commands in `README.md` locally; the dependency set itself has been aligned to published versions.

## 1.1.1 compiler compatibility patch

- Corrected the root Node engine declaration to match Angular 20.2/20.3 support, including Node 24.x.
- Pinned Firebase Web SDK to `12.19.0` for deterministic installs.
- Added `src/types/temporal.d.ts` to bridge Firestore 12.19's `Temporal.Instant` declarations without disabling library type checking.
- Made the authentication role mapping explicitly return `StoreUser` and narrowed the role to `StoreRole`, resolving strict observable variance errors.
- Kept Cloud Functions on Node 22, independent from the local Angular development runtime.
