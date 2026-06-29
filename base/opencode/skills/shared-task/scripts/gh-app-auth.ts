import { promises as fs, statSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { setTimeout } from 'timers/promises';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const SAFETY_MARGIN_SECONDS = 60;

let _clientId: string | null = null;

export async function getClientId(): Promise<string> {
  if (_clientId) return _clientId;

  // 1. GH_APP_CLIENT_ID env var (explicit override)
  if (process.env.GH_APP_CLIENT_ID) {
    _clientId = process.env.GH_APP_CLIENT_ID;
    return _clientId;
  }

  // 2. GH_CONFIG_DIR/app.yml — per-repo config (gitignored)
  try {
    const appYml = await fs.readFile(path.join(getConfigDir(), 'app.yml'), 'utf8');
    const match = appYml.match(/^client_id:\s*(\S+)/m);
    if (match) {
      _clientId = match[1];
      return _clientId;
    }
  } catch {
    // file doesn't exist or is unreadable
  }

  throw new Error(
    'No GitHub App Client ID configured.\n\n' +
    'Create a GitHub App for issue/PR management:\n' +
    '  1. Go to https://github.com/settings/apps\n' +
    '  2. Click "New GitHub App"\n' +
    '  3. Set permissions: Issues (Read & Write), Pull Requests (Read & Write)\n' +
    '  4. Under "Identifying and authorizing users", enable Device Flow\n' +
    '  5. Save the app, copy the Client ID (starts with "Iv1")\n' +
    '  6. Install the app on the target repository/organization\n' +
    '  7. Create .gh-config/app.yml with:  client_id: <your-client-id>\n' +
    '     Or set:  export GH_APP_CLIENT_ID=<your-client-id>'
  );
}

interface TokenCache {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  refresh_token_expires_at?: number;
}

function logInfo(message: string): void {
  process.stderr.write(`${message}\n`);
}

function logError(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
}

function getConfigDir(): string {
  if (process.env.GH_CONFIG_DIR) {
    return process.env.GH_CONFIG_DIR;
  }

  const cwd = process.cwd();
  const localConfig = path.join(cwd, '.gh-config');
  try {
    const stat = statSync(localConfig);
    if (stat.isDirectory()) {
      return localConfig;
    }
  } catch {
    // fall through to default fallback
  }

  return path.join(os.homedir(), '.config', 'opencode');
}

function getTokenPath(): string {
  return path.join(getConfigDir(), 'github-token.json');
}

export async function readCache(): Promise<TokenCache | null> {
  try {
    const raw = await fs.readFile(getTokenPath(), 'utf8');
    const parsed = JSON.parse(raw) as TokenCache;
    if (parsed.access_token) {
      return parsed;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      logInfo(`Warning: could not read token cache: ${String(err)}`);
    }
  }
  return null;
}

export async function writeCache(cache: TokenCache): Promise<void> {
  const tokenPath = getTokenPath();
  await fs.mkdir(path.dirname(tokenPath), { recursive: true });
  await fs.writeFile(tokenPath, JSON.stringify(cache, null, 2), {
    mode: 0o600,
    flag: 'w',
  });
}

export function isValid(cache: TokenCache): boolean {
  if (!cache.expires_at) {
    return false;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  return nowSeconds + SAFETY_MARGIN_SECONDS < cache.expires_at;
}

async function postForm(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(params);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok && !data.error) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return data;
}

async function openBrowser(url: string): Promise<void> {
  try {
    const openModule = (await import('open')) as { default?: (target: string) => Promise<unknown> };
    if (openModule.default) {
      await openModule.default(url);
    }
  } catch {
    // Optional dependency; ignore failures silently.
  }
}

export function toTokenCache(response: Record<string, unknown>): TokenCache {
  const cache: TokenCache = {
    access_token: String(response.access_token),
  };

  if (typeof response.refresh_token === 'string') {
    cache.refresh_token = response.refresh_token;
  }
  if (typeof response.expires_in === 'number') {
    cache.expires_at = Math.floor(Date.now() / 1000) + response.expires_in;
  }
  if (typeof response.refresh_token_expires_in === 'number') {
    cache.refresh_token_expires_at = Math.floor(Date.now() / 1000) + response.refresh_token_expires_in;
  }

  return cache;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenCache> {
  const response = await postForm(ACCESS_TOKEN_URL, {
    client_id: await getClientId(),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  if (!response.access_token) {
    const error = response.error_description || response.error;
    throw new Error(`Refresh failed: ${error}`);
  }

  return toTokenCache(response);
}

export async function doDeviceFlow(): Promise<TokenCache> {
  const deviceResponse = await postForm(DEVICE_CODE_URL, {
    client_id: await getClientId(),
  });

  if (deviceResponse.error) {
    const desc = deviceResponse.error_description || deviceResponse.error_uri || '';
    throw new Error(`Device flow not available: ${deviceResponse.error}${desc ? ` — ${desc}` : ''}. Ensure Device Flow is enabled in your GitHub App settings.`);
  }

  const deviceCode = String(deviceResponse.device_code);
  const userCode = String(deviceResponse.user_code);
  const verificationUri = String(deviceResponse.verification_uri);
  const expiresIn = typeof deviceResponse.expires_in === 'number' ? deviceResponse.expires_in : 900;
  const intervalSeconds = typeof deviceResponse.interval === 'number' ? deviceResponse.interval : 5;

  logInfo('');
  logInfo(`Please authorize this device at: ${verificationUri}`);
  logInfo(`Enter code: ${userCode}`);
  logInfo('');

  await openBrowser(verificationUri);

  const expiresAt = Date.now() + expiresIn * 1000;
  let pollIntervalMs = intervalSeconds * 1000;

  while (Date.now() < expiresAt) {
    await setTimeout(pollIntervalMs);

    const tokenResponse = await postForm(ACCESS_TOKEN_URL, {
      client_id: await getClientId(),
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });

    if (tokenResponse.access_token) {
      return toTokenCache(tokenResponse);
    }

    const error = tokenResponse.error;
    switch (error) {
      case 'authorization_pending':
        break;
      case 'slow_down':
        pollIntervalMs += 5000;
        break;
      case 'expired_token':
        throw new Error('Device code expired before authorization.');
      case 'access_denied':
        throw new Error('Authorization denied by user.');
      default:
        throw new Error(`Device flow error: ${error}`);
    }
  }

  throw new Error('Device code expired before authorization.');
}

export async function getValidToken(): Promise<string> {
  const cache = await readCache();

  if (cache) {
    if (isValid(cache)) {
      return cache.access_token;
    }

    if (cache.refresh_token) {
      try {
        const refreshed = await refreshAccessToken(cache.refresh_token);
        await writeCache(refreshed);
        return refreshed.access_token;
      } catch (err) {
        logInfo(`Token refresh failed: ${err instanceof Error ? err.message : String(err)}`);
        logInfo('Falling back to device flow.');
      }
    }
  }

  const tokens = await doDeviceFlow();
  await writeCache(tokens);
  return tokens.access_token;
}

function usage(): void {
  process.stdout.write(`Usage: npx tsx gh-app-auth.ts [--token] [--help]

Options:
  --token   Output only the token string (stdout). All logs go to stderr.
  --help    Show this help message.
`);
}

async function main(): Promise<void> {
  let tokenOnlyMode = false;
  const args = process.argv.slice(2);
  tokenOnlyMode = args.includes('--token');

  if (args.includes('--help')) {
    usage();
    return;
  }

  try {
    const token = await getValidToken();
    process.stdout.write(`${token}\n`);
  } catch (err) {
    logError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
if (
  __filename === process.argv[1] ||
  process.argv.slice(1).some((arg) => arg === __filename || arg.endsWith(path.basename(__filename)))
) {
  main().then(
    () => {
      process.exitCode = 0;
    },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (message) process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    },
  );
}
