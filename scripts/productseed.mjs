import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = 'C:\\firebase-seed';
const args = process.argv.slice(2);

function run(node, script, commandArgs, cwd) {
  const result = spawnSync(node, [script, ...commandArgs], {
    cwd,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, PATH: `${dirname(node)};${process.env.PATH ?? ''}` },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed (exit ${result.status}): ${script}`);
}

function copy(relative) {
  const target = join(destination, relative);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(source, relative), target);
}

try {
  if (resolve(source).toLowerCase() === resolve(destination).toLowerCase()) {
    throw new Error(
      'Run productseed from the source project, not the managed C:\\firebase-seed copy.',
    );
  }
  console.log(`Copying seed files to ${destination}...`);
  for (const relative of [
    'functions/package.json',
    'functions/package-lock.json',
    'functions/scripts/seed-products.mjs',
    'functions/scripts/seed-product-matching.mjs',
    'functions/scripts/init-admin-app.mjs',
  ])
    copy(relative);
  for (const file of readdirSync(join(source, 'src/assets/products'))) {
    if (file.endsWith('.webp')) copy(join('src/assets/products', file));
  }

  // Preserve any credentials already placed in the local seed folder. When the
  // source uses its default credential file, pass its path rather than copying it.
  if (
    !process.env.GOOGLE_APPLICATION_CREDENTIALS &&
    !existsSync(join(destination, 'serviceAccount.json')) &&
    existsSync(join(source, 'serviceAccount.json'))
  ) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = join(source, 'serviceAccount.json');
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = resolve(
      source,
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
    );
  }

  const functionsDir = join(destination, 'functions');
  const signature = createHash('sha256')
    .update(readFileSync(join(functionsDir, 'package.json')))
    .update(readFileSync(join(functionsDir, 'package-lock.json')))
    .update(process.versions.node.split('.')[0])
    .digest('hex');
  const stamp = join(functionsDir, '.productseed-dependencies');
  if (
    !existsSync(join(functionsDir, 'node_modules/firebase-admin/package.json')) ||
    !existsSync(stamp) ||
    readFileSync(stamp, 'utf8').trim() !== signature
  ) {
    let npmCli = process.env.npm_execpath;
    if (!npmCli || !existsSync(npmCli))
      throw new Error('Run this script with npm run productseed.');
    const npmPackage = JSON.parse(
      readFileSync(resolve(dirname(npmCli), '../package.json'), 'utf8'),
    );
    if (Number(npmPackage.version.split('.')[0]) < 10) {
      // Older system npm cannot consume this project's lockfile. Bootstrap a
      // pinned modern npm locally without changing the system installation.
      const tooling = join(destination, '.tooling', 'npm-10.9.4');
      const modernNpm = join(tooling, 'package/bin/npm-cli.js');
      const ready = join(tooling, '.ready');
      if (!existsSync(ready) || !existsSync(modernNpm)) {
        console.log('Preparing npm 10 for the local seed runner...');
        const metadataResponse = await fetch('https://registry.npmjs.org/npm/10.9.4');
        if (!metadataResponse.ok) throw new Error('Could not download npm metadata.');
        const metadata = await metadataResponse.json();
        const response = await fetch(metadata.dist.tarball);
        if (!response.ok) throw new Error('Could not download the npm runtime.');
        const archive = Buffer.from(await response.arrayBuffer());
        const integrity = 'sha512-' + createHash('sha512').update(archive).digest('base64');
        if (integrity !== metadata.dist.integrity)
          throw new Error('npm download integrity verification failed.');
        mkdirSync(tooling, { recursive: true });
        const archivePath = join(tooling, 'npm.tgz');
        writeFileSync(archivePath, archive);
        const extraction = spawnSync('tar.exe', ['-xzf', archivePath, '-C', tooling], {
          stdio: 'inherit',
          windowsHide: true,
        });
        if (extraction.error) throw extraction.error;
        if (extraction.status !== 0) throw new Error('Could not extract the local npm runtime.');
        writeFileSync(ready, '10.9.4');
      }
      npmCli = modernNpm;
    }
    console.log('Installing seed dependencies on the local disk...');
    run(
      process.execPath,
      npmCli,
      ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
      functionsDir,
    );
    writeFileSync(stamp, signature);
  }
  console.log('Launching product seed from C:\\firebase-seed\\functions\\scripts...');
  run(process.execPath, join(functionsDir, 'scripts/seed-products.mjs'), args, destination);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
