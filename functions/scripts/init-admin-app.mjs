import {
  existsSync,
  readFileSync,
  mkdtempSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';

export const PROJECT_ID = 'emey-crochet-store';
export const DATABASE_ID = 'maindb';

const FIREBASE_CLI_CLIENT_ID =
  process.env.FIREBASE_CLIENT_ID ||
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
// Public installed-app OAuth client value, matching firebase-tools/lib/api.js.
const FIREBASE_CLI_CLIENT_SECRET = process.env.FIREBASE_CLIENT_SECRET || 'j9iVZfS8kkCEFUPaAeJV0sAi';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

function serviceAccountPath() {
  return process.env.GOOGLE_APPLICATION_CREDENTIALS || join(repoRoot, 'serviceAccount.json');
}

function firebaseCliRefreshToken() {
  const configPath = [
    join(homedir(), '.config', 'configstore', 'firebase-tools.json'),
    ...(process.env.APPDATA
      ? [join(process.env.APPDATA, 'configstore', 'firebase-tools.json')]
      : []),
  ].find((path) => existsSync(path));
  if (!configPath) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  return parsed?.tokens?.refresh_token ?? parsed?.refresh_token ?? null;
}

function credentialFromEnvironment() {
  const saPath = serviceAccountPath();
  if (existsSync(saPath) && saPath.endsWith('.json')) {
    const credentials = JSON.parse(readFileSync(saPath, 'utf8'));
    if (credentials.type === 'service_account') return cert(credentials);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = saPath;
    return applicationDefault();
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return applicationDefault();

  const cliToken = firebaseCliRefreshToken();
  if (cliToken) {
    // Firestore rejects admin.refreshToken(). Supply the same authorized-user
    // credentials through ADC so both Firestore and Auth can use the CLI login.
    const tempDirectory = mkdtempSync(join(tmpdir(), 'emey-seed-adc-'));
    const adcPath = join(tempDirectory, 'credentials.json');
    writeFileSync(
      adcPath,
      JSON.stringify({
        type: 'authorized_user',
        client_id: FIREBASE_CLI_CLIENT_ID,
        client_secret: FIREBASE_CLI_CLIENT_SECRET,
        refresh_token: cliToken,
      }),
      { mode: 0o600 },
    );
    process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath;
    process.once('exit', () => {
      try {
        unlinkSync(adcPath);
        rmdirSync(tempDirectory);
      } catch {
        // Do not mask the original seed result if temporary-file cleanup fails.
      }
    });
    return applicationDefault();
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
