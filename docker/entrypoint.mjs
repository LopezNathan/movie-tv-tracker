import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const authMode = process.env.AUTH_MODE || 'tailnet-single-user';
if (!['cloudflare-access', 'tailnet-single-user'].includes(authMode)) {
  console.error(`Unsupported AUTH_MODE: ${authMode}`);
  process.exit(1);
}

const required = [
  'TMDB_API_TOKEN',
  ...(authMode === 'cloudflare-access'
    ? ['CF_ACCESS_TEAM_DOMAIN', 'CF_ACCESS_AUD']
    : ['APP_USER_EMAIL']),
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}

const runtimeDirectory = mkdtempSync(join(tmpdir(), 'scene-'));
const environmentFile = join(runtimeDirectory, '.dev.vars');
const configFile = '/app/docker/wrangler.jsonc';
const persistenceDirectory = '/data';
const wrangler = '/app/node_modules/.bin/wrangler';
const port = process.env.PORT || '8787';

let accessJwks;
if (authMode === 'cloudflare-access') {
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(
    /\/$/,
    '',
  );
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) {
    console.error(`Failed to fetch Cloudflare Access signing keys: HTTP ${response.status}`);
    process.exit(1);
  }
  const jwks = await response.json();
  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
    console.error('Cloudflare Access returned no signing keys.');
    process.exit(1);
  }
  accessJwks = Buffer.from(JSON.stringify(jwks.keys)).toString('base64');
}

const bindings = {
  ENVIRONMENT: 'production',
  AUTH_MODE: authMode,
  TMDB_API_TOKEN: process.env.TMDB_API_TOKEN,
  ...(authMode === 'cloudflare-access'
    ? {
        CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN,
        CF_ACCESS_AUD: process.env.CF_ACCESS_AUD,
        CF_ACCESS_JWKS_B64: accessJwks,
        ...(process.env.MOBILE_API_HOST ? { MOBILE_API_HOST: process.env.MOBILE_API_HOST } : {}),
        ...(process.env.BROWSER_APP_HOST ? { BROWSER_APP_HOST: process.env.BROWSER_APP_HOST } : {}),
      }
    : { APP_USER_EMAIL: process.env.APP_USER_EMAIL }),
};
writeFileSync(
  environmentFile,
  `${Object.entries(bindings)
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join('\n')}\n`,
  { mode: 0o600 },
);

const commonArguments = ['--config', configFile, '--env-file', environmentFile];
const migration = spawnSync(
  wrangler,
  [
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '--persist-to',
    persistenceDirectory,
    ...commonArguments,
  ],
  { stdio: 'inherit' },
);
if (migration.status !== 0) {
  rmSync(runtimeDirectory, { recursive: true, force: true });
  process.exit(migration.status ?? 1);
}

const worker = spawn(
  wrangler,
  [
    'dev',
    '--local',
    '--ip',
    '0.0.0.0',
    '--port',
    port,
    '--persist-to',
    persistenceDirectory,
    '--log-level',
    'info',
    ...commonArguments,
  ],
  { stdio: 'inherit' },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => worker.kill(signal));
}

worker.on('exit', (code, signal) => {
  rmSync(runtimeDirectory, { recursive: true, force: true });
  process.exit(code ?? (signal ? 0 : 1));
});
