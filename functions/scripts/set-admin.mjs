import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

initializeApp({ credential: applicationDefault() });

const email = process.argv[2];
if (!email) {
  console.error('Usage: node functions/scripts/set-admin.mjs admin@example.com');
  process.exit(1);
}

const auth = getAuth();
const user = await auth.getUserByEmail(email);
const currentClaims = user.customClaims ?? {};

await auth.setCustomUserClaims(user.uid, { ...currentClaims, admin: true });
console.log(`Admin claim set for ${email}. Sign out and back in to refresh the token.`);
