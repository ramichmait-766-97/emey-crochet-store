// Run directly from PowerShell so VMware UNC paths do not go through CMD.
// Read-only: no Firebase credentials, request authorization, or log lines are printed.
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;
const https = require('node:https');

const localProject = path.join(process.env.LOCALAPPDATA || '', 'EmeyCrochet', 'deploy', 'project');
const uploadHost = 'upload-firebasehosting.googleapis.com';

function inspectLastDeploy() {
  const logPath = path.join(localProject, 'firebase-debug.log');
  if (!fs.existsSync(logPath)) {
    console.log('Previous deploy log: not found on this computer.');
    return;
  }
  const log = fs.readFileSync(logPath, 'utf8');
  const codes = [...new Set(log.match(/\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ENOTFOUND|EAI_AGAIN|CERT_[A-Z_]+|UNABLE_TO_[A-Z_]+|UND_ERR_[A-Z_]+)\b/g) || [])];
  console.log(`Deploy error codes: ${codes.join(', ') || 'none recorded'}`);
  console.log(`Deploy mentions request timeout: ${/Timeout reached|timed? ?out|AbortError/i.test(log)}`);
  const hashes = new Set([...log.matchAll(/\/files\/([a-f0-9]{64})/g)].map((match) => match[1]));
  const cacheDir = path.join(localProject, '.firebase');
  if (!fs.existsSync(cacheDir)) return;
  for (const name of fs.readdirSync(cacheDir).filter((name) => /^hosting\..*\.cache$/.test(name))) {
    for (const row of fs.readFileSync(path.join(cacheDir, name), 'utf8').split('\n')) {
      const [file, , hash] = row.trim().split(',');
      if (!hashes.has(hash)) continue;
      const candidate = path.resolve(localProject, 'dist', 'emey-crochet-store', 'browser', file);
      const buildRoot = path.resolve(localProject, 'dist', 'emey-crochet-store', 'browser') + path.sep;
      if (!candidate.startsWith(buildRoot) || !fs.existsSync(candidate)) continue;
      const bytes = fs.statSync(candidate).size;
      console.log(`Attempted file: ${file}; ${bytes} bytes; CLI deadline ${Math.min(Math.max(Math.round(bytes / 1000) * 20, 30000), 7200000)} ms`);
    }
  }
}

function probe(hostname, family) {
  return new Promise((resolve) => {
    const start = Date.now();
    let finished = false;
    let timer;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      console.log(`${hostname} (${family === 4 ? 'IPv4' : 'default'}): ${result}; ${Date.now() - start} ms`);
      resolve();
    };
    const request = https.request({ hostname, path: '/', method: 'HEAD', family, agent: false }, (response) => {
      response.resume();
      finish(`HTTP ${response.statusCode}, TLS connected`);
    });
    request.on('error', (error) => finish(`connection failed: ${error.code || error.name}`));
    timer = setTimeout(() => {
      finish('connection deadline exceeded (10 seconds)');
      request.destroy();
    }, 10000);
    request.end();
  });
}

async function main() {
  console.log(`Node ${process.versions.node}; platform ${process.platform}`);
  console.log(`Proxy environment configured: ${['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy'].some((key) => !!process.env[key])}`);
  inspectLastDeploy();
  try {
    const addresses = await dns.lookup(uploadHost, { all: true });
    console.log(`Upload DNS: ${addresses.filter((a) => a.family === 4).length} IPv4, ${addresses.filter((a) => a.family === 6).length} IPv6 addresses`);
  } catch (error) {
    console.log(`Upload DNS failed: ${error.code || error.name}`);
  }
  // HTTP 401/403/404 still proves that the unauthenticated network/TLS probe reached Google.
  await probe(uploadHost);
  await probe(uploadHost, 4);
  await probe('firebasehosting.googleapis.com', 4);
  console.log('Diagnostic complete. No files uploaded or database changes made.');
}

main().catch((error) => {
  console.error(`Diagnostic failed: ${error.code || error.name}`);
  process.exitCode = 1;
});
