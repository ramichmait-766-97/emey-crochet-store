// Keep this launcher compatible with older system Node installations.
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { homedir } = require('node:os');
const { spawnSync } = require('node:child_process');
const root = resolve(__dirname, '..');
const candidates = [
  process.execPath,
  join(
    homedir(),
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'node',
    'bin',
    'node.exe',
  ),
];
const supported = candidates.find((candidate) => {
  if (!existsSync(candidate)) return false;
  const result = spawnSync(candidate, ['-p', 'process.versions.node'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const [major, minor] = (result.stdout || '').trim().split('.').map(Number);
  return (
    result.status === 0 &&
    ((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major === 24)
  );
});
if (!supported) {
  console.error(
    'Product seeding requires Node 22.12+ or Node 24. Install a supported Node runtime and retry.',
  );
  process.exit(1);
}
const args = process.argv.slice(2);
const login = args[0] === '--login';
const localCopy = args[0] === '--local-copy';
const script = login
  ? join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js')
  : localCopy
    ? join(root, 'scripts', 'productseed.mjs')
    : join(root, 'functions', 'scripts', 'seed-products.mjs');
const childArgs = login ? ['login', ...args.slice(1)] : localCopy ? args.slice(1) : args;
const result = spawnSync(supported, [script, ...childArgs], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status === null ? 1 : result.status;
