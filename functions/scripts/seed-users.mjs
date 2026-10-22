import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { DATABASE_ID, initAdminApp } from './init-admin-app.mjs';

// Passwords are supplied through the environment, never committed or logged.
const accounts = [
  { email: 'rami.chmait97@gmail.com', password: process.env.SEED_ADMIN_PASSWORD, admin: true },
  { email: 'ramosh2014@gmail.com', password: process.env.SEED_CLIENT_PASSWORD, admin: false },
];

try {
  for (const account of accounts) {
    if (!account.password || account.password.length < 6) {
      throw new Error('Set SEED_ADMIN_PASSWORD and SEED_CLIENT_PASSWORD (at least 6 characters).');
    }
  }
  initAdminApp();
  const auth = getAuth();
  const db = getFirestore(DATABASE_ID);
  // Check database access before changing any Auth users.
  await db.doc('siteSettings/public').get();
  for (const account of accounts) {
    let user;
    try {
      user = await auth.getUserByEmail(account.email);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
    if (user) {
      user = await auth.updateUser(user.uid, { password: account.password });
    } else {
      user = await auth.createUser({ email: account.email, password: account.password });
    }
    const claims = { ...user.customClaims };
    if (account.admin) claims.admin = true;
    else delete claims.admin;
    await auth.setCustomUserClaims(user.uid, claims);
    const ref = db.doc(`users/${user.uid}`);
    const profile = await ref.get();
    await ref.set(
      {
        uid: user.uid,
        email: account.email,
        displayName: user.displayName || account.email.split('@')[0],
        ...(!profile.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
        modifiedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    const verified = await auth.getUser(user.uid);
    if ((verified.customClaims?.admin === true) !== account.admin) {
      throw new Error(`Role verification failed for ${account.email}`);
    }
    console.log(
      `Verified ${account.admin ? 'admin' : 'client'}: ${account.email}; profile in ${DATABASE_ID}.`,
    );
  }
  console.log('Sign out and back in to refresh custom claims.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
