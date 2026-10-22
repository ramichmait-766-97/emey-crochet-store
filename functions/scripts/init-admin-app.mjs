import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, cert, initializeApp, refreshToken } from 'firebase-admin/app';

export const PROJECT_ID = 'emey-crochet-store';
export const DATABASE_ID = 'maindb';

const FIREBASE_CLI_CLIENT_ID =
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLI_CLIENT_SECRET = 'jEQPZWylFrEsnqzpsZ7Q-gM4';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

function serviceAccountPath() {
  return process.env.GOOGLE_APPLICATION_CREDENTIALS || join(repoRoot, 'serviceAccount.json');
}

function firebaseCliRefreshToken() {
  const configPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!existsSync(configPath)) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  return parsed?.tokens?.refresh_token ?? parsed?.refresh_token ?? null;
}

function credentialFromEnvironment() {
  const saPath = serviceAccountPath();
  if (existsSync(saPath) && saPath.endsWith('.json')) {
    return cert(JSON.parse(readFileSync(saPath, 'utf8')));
  }

  const cliToken = firebaseCliRefreshToken();
  if (cliToken) {
    return refreshToken({
      type: 'authorized_user',
      client_id: FIREBASE_CLI_CLIENT_ID,
      client_secret: FIREBASE_CLI_CLIENT_SECRET,
      refresh_token: cliToken,
    });
  }

  return applicationDefault();
}

export function initAdminApp() {
  process.env.GOOGLE_CLOUD_PROJECT ??= PROJECT_ID;
  process.env.GCLOUD_PROJECT ??= PROJECT_ID;

  return initializeApp({
    credential: credentialFromEnvironment(),
    projectId: PROJECT_ID,
  });
}
