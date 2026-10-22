import { getAuth } from 'firebase-admin/auth';
import { initAdminApp } from './init-admin-app.mjs';

initAdminApp();

const email = process.argv[2];
if (!email) {
  console.error('Usage: npm run admin:set -- admin@example.com');
  process.exit(1);
}

try {
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  const currentClaims = user.customClaims ?? {};

  await auth.setCustomUserClaims(user.uid, { ...currentClaims, admin: true });
  console.log(`Admin claim set for ${email}. Sign out and back in to refresh the token.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('There is no user record')) {
    console.error(
      `No Auth user exists for ${email}. Create the account in the app (register/login) first, then re-run this command.`,
    );
    process.exit(1);
  }

  console.error(message);
  process.exit(1);
}
