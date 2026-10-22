# Emey Crochet Store

Premium handmade boutique storefront built with Angular and Firebase.

## Stable stack

This revision deliberately uses the supported Angular 20 LTS / AngularFire 20 line instead of mixing Angular 21 with a non-existent stable AngularFire 21 package.

- Angular framework: `20.3.x`
- Angular CLI / build tooling: `20.3.x`
- AngularFire: `20.1.1`
- Firebase Web SDK: `12.18.x`
- Firebase CLI: `15.30.x`
- Cloud Functions: `7.4.x`
- Firebase Admin: `14.5.x`
- Node.js: 22 recommended
- TypeScript: 5.9.x

## First run

```powershell
node --version
npm --version

npm install
npm start
```

Open `http://localhost:4200`.

The app starts in `demoMode: true`, so the public catalog works before a Firebase project exists. Authentication and persistent admin writes require Firebase configuration.

## Firebase setup

1. Create a new Firebase project.
2. Add a Web App in Firebase Console.
3. Enable Firestore Database.
4. Enable Storage.
5. Enable Authentication providers:
   - Email/password
   - Google
   - Apple when your Apple Developer configuration is ready
6. Copy only the public Firebase web configuration into `src/environments/environment.ts`.
7. Change `demoMode` to `false`.
8. Login with the Firebase CLI:

```powershell
npx firebase login
npx firebase use --add
```

9. Install function dependencies:

```powershell
npm run functions:install
```

10. Deploy:

```powershell
npm run firebase:deploy
```

## Admin account

Admin authorization uses a Firebase custom claim. It is not trusted from local storage or a writable Firestore field.

After creating the admin user in Firebase Authentication and configuring Application Default Credentials for the Admin SDK, run:

```powershell
npm run functions:install
npm run admin:set -- admin@example.com
```

Then sign out and sign in again so Firebase refreshes the ID token.

## Architecture

```text
src/app
├── core
│   ├── constants
│   ├── guards
│   ├── layout
│   ├── models
│   └── services
├── features
│   ├── account
│   ├── admin
│   ├── cart
│   ├── home
│   ├── login
│   ├── product-detail
│   └── shop
└── shared
    └── components
```

Important responsibilities are separated:

- `ProductService` — public catalog reads.
- `AdminStoreService` — admin-only product/settings writes and image uploads.
- `AuthService` — Firebase authentication and user profile creation.
- `CartService` — reactive local cart state.
- `OrderService` — checkout call boundary.
- `SiteSettingsService` — dynamic currency, member discount and contact channels.
- `functions/src/index.ts` — trusted server-side stock, price and discount calculation.

## Security model

The browser never decides the final order price.

The `createOrder` Cloud Function:

- reloads each product from Firestore;
- verifies that the product is active;
- verifies stock;
- uses the server-side product price;
- loads currency and member discount from `siteSettings/public`;
- applies the member discount only when Firebase Auth verifies a user;
- decrements stock and creates the order in one Firestore transaction.

Firestore rules prevent clients from creating or editing orders directly. Admin writes require the `admin: true` custom claim.

## Dynamic contacts

WhatsApp is only the initial contact method. Admin store settings support multiple configurable contact methods. Each entry contains:

```ts
{
  id: string;
  type: 'whatsapp' | 'phone' | 'instagram' | 'email' | 'custom';
  label: string;
  value: string;
  url?: string;
  enabled: boolean;
}
```

This means the storefront does not need to be redesigned when Instagram, phone, email or another channel is added later.

## Product data

The project contains the 14 products extracted from the supplied Emey Crochet images under `src/assets/products`.

The seed prices and quantities are demo values only. Replace them through the admin area after Firebase is connected.

## Code quality commands

```powershell
npm run typecheck
npm run format:check
npm run build:prod
npm run functions:build
```

To apply formatting:

```powershell
npm run format
```

## Apple sign-in

The Angular code is ready for Apple authentication, but Firebase cannot complete Apple sign-in until the Apple Developer side is configured with the required Service ID, key and redirect configuration.

## Node 24 and Firebase 12.19 note

Angular 20.2/20.3 supports Node 20.19+, Node 22.12+, and Node 24.x. The root package therefore accepts all three supported Node lines. Cloud Functions remain configured for the Node 22 runtime in `functions/package.json`, which is independent from the Node version used to run the Angular development server locally.

Firebase 12.19 adds `Temporal.Instant` methods to Firestore `Timestamp`. TypeScript's ES2022 DOM libraries do not yet provide a global `Temporal` namespace in every toolchain, so the project includes `src/types/temporal.d.ts` as a narrow compile-time bridge. Strict checking remains enabled; `skipLibCheck` is intentionally not used.

If you upgraded from an earlier project archive, remove the old install before reinstalling:

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -Force -ErrorAction SilentlyContinue
npm cache verify
npm install
npm run typecheck
npm run build
npm start
```

Do not run `npm audit fix --force` blindly. First inspect production exposure with:

```powershell
npm audit --omit=dev
npm audit
```

Most Firebase CLI/build-tool advisories are development-only transitive packages; force-upgrading can replace Angular/Firebase packages across major versions and break the supported dependency set.
