// ── gh-app-auth.test.ts — Unit tests for gh-app-auth.ts ─────────────────────
// Tests require vitest 4.x. Run: npx vitest run tests/typescript/gh-issue/gh-app-auth.test.ts
//
// Strategy:
//   - Mock fs.promises and statSync for token cache I/O
//   - Mock timers/promises setTimeout to avoid real delays
//   - Mock global fetch for GitHub API calls
//   - Mock open module (dynamic import in openBrowser)
//   - Use vi.hoisted for mock factories
//   - Define local TokenCache interface since it's not exported

import * as path from 'path';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Module-level mocks (hoisted by vitest) ──────────────────────────────────

const mockReadFile = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());
const mockStatSync = vi.hoisted(() => vi.fn());

vi.mock('fs', () => ({
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
  },
  statSync: mockStatSync,
}));

const mockSetTimeout = vi.hoisted(() => vi.fn());
vi.mock('timers/promises', () => ({
  setTimeout: mockSetTimeout,
}));

vi.mock('open', () => ({
  default: vi.fn(),
}));

const mockExecSync = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}));

// ── Stub globals before imports ─────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Module under test (top-level import for most tests) ─────────────────────

import * as authModule from '../../../base/skills/shared-task/scripts/gh-app-auth.ts';

// Re-exported as a let so getClientId tests can load a fresh instance
let auth: typeof authModule = authModule;

// ── Local types ─────────────────────────────────────────────────────────────

interface TokenCache {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  refresh_token_expires_at?: number;
}

// ── Test helpers ────────────────────────────────────────────────────────────

function okResponse(data: unknown, status = 200) {
  return {
    ok: true,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => data,
  };
}



// ── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  // Restore any spies (Date.now) from previous tests
  vi.restoreAllMocks();

  // Reset all mock function implementations
  mockReadFile.mockReset();
  mockWriteFile.mockReset();
  mockMkdir.mockReset();
  mockStatSync.mockReset();
  mockSetTimeout.mockReset();
  mockFetch.mockReset();
  mockExecSync.mockReset();

  // Use a fixed config dir so we don't depend on cwd or homedir
  process.env.GH_CONFIG_DIR = '/tmp/.gh-config';
  // Default: set GH_APP_CLIENT_ID so most tests don't need to think about it
  process.env.GH_APP_CLIENT_ID = 'Iv1-default-client-id';

  // Default: setTimeout resolves immediately (no real delay)
  mockSetTimeout.mockResolvedValue(undefined);

  // Silence the module's own stderr logging (noisy error/device-flow paths).
  // Tests that assert on stderr re-spy inside the test body; vi.spyOn returns
  // the existing mock in that case, so their assertions still observe calls.
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

// ─────────────────────────────────────────────────────────────────────────────
// getClientId
// ─────────────────────────────────────────────────────────────────────────────

describe('getClientId', () => {
  // Each test needs a fresh module instance because _clientId caches between
  // calls and is not exported/reset from outside.
  beforeEach(async () => {
    // Don't inherit cached client ID from other tests
    delete process.env.GH_APP_CLIENT_ID;

    // Clear module evaluation cache and re-load a fresh instance
    vi.resetModules();
    auth = await import(
      '../../../base/skills/shared-task/scripts/gh-app-auth.ts'
    );
  });

  it('returns GH_APP_CLIENT_ID env var', async () => {
    process.env.GH_APP_CLIENT_ID = 'Iv1-test-env';
    await expect(auth.getClientId()).resolves.toBe('Iv1-test-env');
  });

  it('caches the client ID after first call', async () => {
    process.env.GH_APP_CLIENT_ID = 'Iv1-cached';
    await auth.getClientId(); // sets _clientId = 'Iv1-cached'

    // Change env — should still return the cached value
    process.env.GH_APP_CLIENT_ID = 'Iv1-changed';
    await expect(auth.getClientId()).resolves.toBe('Iv1-cached');
  });

  it('reads client_id from app.yml when env var is not set', async () => {
    mockReadFile.mockResolvedValue('client_id: Iv1-from-file\n');
    await expect(auth.getClientId()).resolves.toBe('Iv1-from-file');
    expect(mockReadFile).toHaveBeenCalled();
  });

  it('parses client_id from app.yml ignoring other content', async () => {
    mockReadFile.mockResolvedValue(
      'other: value\nclient_id: Iv1-file2\nanother: field\n'
    );
    await expect(auth.getClientId()).resolves.toBe('Iv1-file2');
  });

  it('throws when neither env var nor app.yml is available', async () => {
    mockReadFile.mockRejectedValue(
      Object.assign(new Error('file not found'), { code: 'ENOENT' })
    );
    await expect(auth.getClientId()).rejects.toThrow(
      'No GitHub App Client ID configured'
    );
  });

  it('throws on non-ENOENT file read error', async () => {
    mockReadFile.mockRejectedValue(new Error('Permission denied'));
    await expect(auth.getClientId()).rejects.toThrow(
      'No GitHub App Client ID configured'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// readCache
// ─────────────────────────────────────────────────────────────────────────────

describe('readCache', () => {
  beforeEach(() => {
    // Point back to the original module instance
    auth = authModule;
  });

  it('returns valid TokenCache when JSON has access_token', async () => {
    const cacheData = {
      access_token: 'ghu_xxx',
      refresh_token: 'ghr_xxx',
      expires_at: 9_999_999_999,
    };
    mockReadFile.mockResolvedValue(JSON.stringify(cacheData));
    const result = await auth.readCache();
    expect(result).toEqual(cacheData);
  });

  it('returns null on ENOENT and logs info', async () => {
    const infoSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const result = await auth.readCache();
    expect(result).toBeNull();
    expect(infoSpy).toHaveBeenCalledWith('Token cache not found; proceeding without cached credentials.\n');
    infoSpy.mockRestore();
  });

  it('returns null on malformed JSON', async () => {
    mockReadFile.mockResolvedValue('not valid json {{{');
    const result = await auth.readCache();
    expect(result).toBeNull();
  });

  it('returns null on empty string', async () => {
    mockReadFile.mockResolvedValue('');
    const result = await auth.readCache();
    expect(result).toBeNull();
  });

  it('returns null on array JSON', async () => {
    mockReadFile.mockResolvedValue('[]');
    const result = await auth.readCache();
    expect(result).toBeNull();
  });

  it('returns null on null JSON', async () => {
    mockReadFile.mockResolvedValue('null');
    const result = await auth.readCache();
    expect(result).toBeNull();
  });

  it('returns null when access_token is missing from valid JSON', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ refresh_token: 'ghr_xxx' })
    );
    const result = await auth.readCache();
    expect(result).toBeNull();
  });

  it('logs warning on non-ENOENT error and returns null', async () => {
    const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockReadFile.mockRejectedValue(new Error('Permission denied'));
    const result = await auth.readCache();
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// writeCache
// ─────────────────────────────────────────────────────────────────────────────

describe('writeCache', () => {
  beforeEach(() => {
    auth = authModule;
  });

  it('creates directories and writes token file with 0o600 mode', async () => {
    const cache: TokenCache = {
      access_token: 'ghu_new',
      refresh_token: 'ghr_new',
      expires_at: 12_345,
    };

    const configDir = process.env.GH_CONFIG_DIR!;
    const expectedTokenPath = path.join(configDir, 'github-token.json');
    const expectedDir = path.dirname(expectedTokenPath);

    await auth.writeCache(cache);
    expect(mockMkdir).toHaveBeenCalledWith(expectedDir, {
      recursive: true,
    });
    expect(mockWriteFile).toHaveBeenCalledWith(
      expectedTokenPath,
      JSON.stringify(cache, null, 2),
      { mode: 0o600, flag: 'w' }
    );

    // On Windows, verify icacls was called to restrict ACL
    if (process.platform === 'win32') {
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('icacls'),
        expect.objectContaining({ stdio: 'ignore' })
      );
    } else {
      expect(mockExecSync).not.toHaveBeenCalled();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isValid (pure function — no mock setup needed)
// ─────────────────────────────────────────────────────────────────────────────

describe('isValid', () => {
  it('returns true for fresh token far in the future', () => {
    const farFuture = Math.floor(Date.now() / 1000) + 3600;
    expect(
      auth.isValid({ access_token: 'ghu_xxx', expires_at: farFuture })
    ).toBe(true);
  });

  it('returns false for expired token', () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    expect(
      auth.isValid({ access_token: 'ghu_xxx', expires_at: past })
    ).toBe(false);
  });

  it('returns false when expires_at is missing', () => {
    expect(auth.isValid({ access_token: 'ghu_xxx' })).toBe(false);
  });

  it('returns false when token expires within SAFETY_MARGIN (30s < 60s)', () => {
    const almostExpired = Math.floor(Date.now() / 1000) + 30;
    expect(
      auth.isValid({ access_token: 'ghu_xxx', expires_at: almostExpired })
    ).toBe(false);
  });

  it('returns false when token expires exactly at SAFETY_MARGIN boundary (60s)', () => {
    const atBoundary = Math.floor(Date.now() / 1000) + 60;
    // SAFETY_MARGIN is 60, so now + 60 is NOT < expires_at → invalid
    expect(
      auth.isValid({ access_token: 'ghu_xxx', expires_at: atBoundary })
    ).toBe(false);
  });

  it('returns true when token expires just past SAFETY_MARGIN (61s)', () => {
    const safe = Math.floor(Date.now() / 1000) + 61;
    expect(
      auth.isValid({ access_token: 'ghu_xxx', expires_at: safe })
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toTokenCache
// ─────────────────────────────────────────────────────────────────────────────

describe('toTokenCache', () => {
  it('converts full response with all optional fields', () => {
    const before = Math.floor(Date.now() / 1000);
    const result = auth.toTokenCache({
      access_token: 'ghu_full',
      refresh_token: 'ghr_full',
      expires_in: 28_800,
      refresh_token_expires_in: 15_811_200,
    });
    expect(result.access_token).toBe('ghu_full');
    expect(result.refresh_token).toBe('ghr_full');
    expect(result.expires_at).toBeDefined();
    expect(typeof result.expires_at).toBe('number');
    expect(result.expires_at).toBeGreaterThanOrEqual(before + 28_800 - 2);
    expect(result.expires_at).toBeLessThanOrEqual(before + 28_800 + 2);
    expect(result.refresh_token_expires_at).toBeDefined();
    expect(typeof result.refresh_token_expires_at).toBe('number');
  });

  it('handles minimal response with only access_token', () => {
    const result = auth.toTokenCache({ access_token: 'ghu_min' });
    expect(result.access_token).toBe('ghu_min');
    expect(result.refresh_token).toBeUndefined();
    expect(result.expires_at).toBeUndefined();
    expect(result.refresh_token_expires_at).toBeUndefined();
  });

it('handles expires_in as string (coerces to number)', () => {
      const before = Math.floor(Date.now() / 1000);
      const result = auth.toTokenCache({
        access_token: 'ghu_str',
        expires_in: '3600',
      });
      expect(result.access_token).toBe('ghu_str');
      // Coercion should produce a defined expires_at within +/-2 seconds of now+3600
      expect(result.expires_at).toBeDefined();
      expect(typeof result.expires_at).toBe('number');
      expect(result.expires_at).toBeGreaterThanOrEqual(before + 3600 - 2);
      expect(result.expires_at).toBeLessThanOrEqual(before + 3600 + 2);
    });

  it('handles refresh_token_expires_in as string (coerces to number and warns)', () => {
    const before = Math.floor(Date.now() / 1000);
    const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = auth.toTokenCache({
      access_token: 'ghu_refresh_str',
      refresh_token: 'ghr_refresh_str',
      refresh_token_expires_in: '15811200',
    });
    expect(result.access_token).toBe('ghu_refresh_str');
    expect(result.refresh_token).toBe('ghr_refresh_str');
    // Coercion should produce a defined refresh_token_expires_at within +/-2 seconds of now+15811200
    expect(result.refresh_token_expires_at).toBeDefined();
    expect(typeof result.refresh_token_expires_at).toBe('number');
    expect(result.refresh_token_expires_at).toBeGreaterThanOrEqual(before + 15811200 - 2);
    expect(result.refresh_token_expires_at).toBeLessThanOrEqual(before + 15811200 + 2);
    // Warning log should be emitted when coercion occurs
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('refresh_token_expires_in received as string, coerced to number')
    );
    warnSpy.mockRestore();
  });

  it('preserves refresh_token but omits expires_at when expires_in is missing', () => {
    const result = auth.toTokenCache({
      access_token: 'ghu_part',
      refresh_token: 'ghr_part',
    });
    expect(result.access_token).toBe('ghu_part');
    expect(result.refresh_token).toBe('ghr_part');
    expect(result.expires_at).toBeUndefined();
    expect(result.refresh_token_expires_at).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// refreshAccessToken
// ─────────────────────────────────────────────────────────────────────────────

describe('refreshAccessToken', () => {
  beforeEach(() => {
    auth = authModule;
  });

  it('returns a TokenCache on successful refresh', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        access_token: 'ghu_refreshed',
        refresh_token: 'ghr_new',
        expires_in: 28_800,
      })
    );
    const result = await auth.refreshAccessToken('ghr_old');
    expect(result.access_token).toBe('ghu_refreshed');
    expect(result.refresh_token).toBe('ghr_new');
    expect(result.expires_at).toBeDefined();
  });

  it('throws when response has no access_token', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        error: 'bad_refresh_token',
        error_description: 'The refresh token is invalid',
      })
    );
    await expect(auth.refreshAccessToken('ghr_bad')).rejects.toThrow(
      'Refresh failed'
    );
  });

  it('throws on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'));
    await expect(auth.refreshAccessToken('ghr_xxx')).rejects.toThrow(
      'Network failure'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// doDeviceFlow
// ─────────────────────────────────────────────────────────────────────────────

describe('doDeviceFlow', () => {
  // Track a synthetic clock so the polling loop advances predictably
  let now: number;

  beforeEach(() => {
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    // Advance the clock by the requested interval on each setTimeout
    mockSetTimeout.mockImplementation(async (ms: number) => {
      now += ms;
    });

    auth = authModule;
  });

  it('completes full device flow successfully', async () => {
    mockFetch
      .mockResolvedValueOnce(
        okResponse({
          device_code: 'dc_abc',
          user_code: '123-456',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        })
      )
      .mockResolvedValueOnce(
        okResponse({
          access_token: 'ghu_device',
          refresh_token: 'ghr_device',
          expires_in: 28_800,
        })
      );

    const result = await auth.doDeviceFlow();
    expect(result.access_token).toBe('ghu_device');
    expect(result.refresh_token).toBe('ghr_device');
  });

  it('handles slow_down by increasing poll interval', async () => {
    mockFetch
      .mockResolvedValueOnce(
        okResponse({
          device_code: 'dc_slow',
          user_code: '222-333',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        })
      )
      .mockResolvedValueOnce(okResponse({ error: 'slow_down' }))
      .mockResolvedValueOnce(
        okResponse({
          access_token: 'ghu_slow',
          expires_in: 28_800,
        })
      );

    const result = await auth.doDeviceFlow();
    expect(result.access_token).toBe('ghu_slow');
    // First poll at 5000ms, second poll at 10000ms (slow_down adds 5000)
    expect(mockSetTimeout).toHaveBeenCalledTimes(2);
    expect(mockSetTimeout.mock.calls[0][0]).toBe(5000);
    expect(mockSetTimeout.mock.calls[1][0]).toBe(10000);
  });

  it('throws expired_token error', async () => {
    mockFetch
      .mockResolvedValueOnce(
        okResponse({
          device_code: 'dc_expire',
          user_code: '444-555',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        })
      )
      .mockResolvedValueOnce(okResponse({ error: 'expired_token' }));

    await expect(auth.doDeviceFlow()).rejects.toThrow('Device code expired');
  });

  it('throws access_denied error', async () => {
    mockFetch
      .mockResolvedValueOnce(
        okResponse({
          device_code: 'dc_denied',
          user_code: '666-777',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        })
      )
      .mockResolvedValueOnce(okResponse({ error: 'access_denied' }));

    await expect(auth.doDeviceFlow()).rejects.toThrow('Authorization denied');
  });

  it('throws on initial device_code error', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({
        error: 'access_denied',
        error_description: 'Device flow is not enabled',
      })
    );

    await expect(auth.doDeviceFlow()).rejects.toThrow(
      'Device flow not available'
    );
  });

  it('throws on polling timeout when expires_in is exhausted', async () => {
    // Short expires_in (1s) and interval (1s) so the loop exits after 1 poll
    mockFetch
      .mockResolvedValueOnce(
        okResponse({
          device_code: 'dc_timeout',
          user_code: '888-999',
          verification_uri: 'https://github.com/login/device',
          expires_in: 1,
          interval: 1,
        })
      )
      // Poll returns authorization_pending — loop continues then times out
      .mockResolvedValueOnce(okResponse({ error: 'authorization_pending' }));

    await expect(auth.doDeviceFlow()).rejects.toThrow('Device code expired');
  });

  it('uses custom interval from device response', async () => {
    mockFetch
      .mockResolvedValueOnce(
        okResponse({
          device_code: 'dc_custom',
          user_code: '000-111',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 10,
        })
      )
      .mockResolvedValueOnce(
        okResponse({
          access_token: 'ghu_custom',
          expires_in: 28_800,
        })
      );

    const result = await auth.doDeviceFlow();
    expect(result.access_token).toBe('ghu_custom');
    expect(mockSetTimeout).toHaveBeenCalledWith(10000); // 10 * 1000
  });

  it('caps poll interval after repeated slow_down', async () => {
    mockFetch
      .mockResolvedValueOnce(
        okResponse({
          device_code: 'dc_cap',
          user_code: '111-222',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        })
      )
      // 6 slow_down responses: 5k → 10k → 15k → 20k → 25k → 30k → 30k
      .mockResolvedValueOnce(okResponse({ error: 'slow_down' }))
      .mockResolvedValueOnce(okResponse({ error: 'slow_down' }))
      .mockResolvedValueOnce(okResponse({ error: 'slow_down' }))
      .mockResolvedValueOnce(okResponse({ error: 'slow_down' }))
      .mockResolvedValueOnce(okResponse({ error: 'slow_down' }))
      .mockResolvedValueOnce(okResponse({ error: 'slow_down' }))
      .mockResolvedValueOnce(
        okResponse({
          access_token: 'ghu_capped',
          expires_in: 28_800,
        })
      );

    const result = await auth.doDeviceFlow();
    expect(result.access_token).toBe('ghu_capped');
    // 6 slow_downs produce 7 setTimeout calls with capped progression
    expect(mockSetTimeout).toHaveBeenCalledTimes(7);
    expect(mockSetTimeout.mock.calls[0][0]).toBe(5000);
    expect(mockSetTimeout.mock.calls[1][0]).toBe(10000);
    expect(mockSetTimeout.mock.calls[2][0]).toBe(15000);
    expect(mockSetTimeout.mock.calls[3][0]).toBe(20000);
    expect(mockSetTimeout.mock.calls[4][0]).toBe(25000);
    expect(mockSetTimeout.mock.calls[5][0]).toBe(30000);
    expect(mockSetTimeout.mock.calls[6][0]).toBe(30000);
  });

  it('throws error when max poll retries exceeded', async () => {
    // Set short interval and long expires_in so retry limit is reached first
    mockFetch
      .mockResolvedValueOnce(
        okResponse({
          device_code: 'dc_retry',
          user_code: '333-444',
          verification_uri: 'https://github.com/login/device',
          expires_in: 99999, // Long enough to not expire
          interval: 0,       // Immediate retry
        })
      );

    // Add 61 authorization_pending responses (to exceed MAX_POLL_RETRIES = 60)
    for (let i = 0; i < 61; i++) {
      mockFetch.mockResolvedValueOnce(okResponse({ error: 'authorization_pending' }));
    }

    await expect(auth.doDeviceFlow()).rejects.toThrow(
      'maximum polling retries reached'
    );
  });

  it('logs message on slow_down', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    mockFetch
      .mockResolvedValueOnce(
        okResponse({
          device_code: 'dc_log',
          user_code: '555-666',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        })
      )
      .mockResolvedValueOnce(okResponse({ error: 'slow_down' }))
      .mockResolvedValueOnce(
        okResponse({
          access_token: 'ghu_log',
          expires_in: 28_800,
        })
      );

    await auth.doDeviceFlow();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('slow_down')
    );
    stderrSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getValidToken (integration)
// ─────────────────────────────────────────────────────────────────────────────

describe('getValidToken', () => {
  beforeEach(() => {
    auth = authModule;
  });

  describe('cache hit paths', () => {
    it('returns cached access_token when token is still valid', async () => {
      const farFuture = Math.floor(Date.now() / 1000) + 3600;
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          access_token: 'ghu_cached',
          expires_at: farFuture,
        })
      );

      const result = await auth.getValidToken();
      expect(result).toBe('ghu_cached');
      // refreshAccessToken / doDeviceFlow should NOT have been called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('refreshes token when cache is expired and refresh succeeds', async () => {
      const past = Math.floor(Date.now() / 1000) - 100;
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          access_token: 'ghu_expired',
          refresh_token: 'ghr_expired',
          expires_at: past,
        })
      );
      mockFetch.mockResolvedValue(
        okResponse({
          access_token: 'ghu_refreshed',
          refresh_token: 'ghr_new',
          expires_in: 28_800,
        })
      );

      const result = await auth.getValidToken();
      expect(result).toBe('ghu_refreshed');
      // The refreshed token should have been written to cache
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('attempts refresh when refresh_token_expires_at is in the future', async () => {
      const past = Math.floor(Date.now() / 1000) - 100;
      const futureRefresh = Math.floor(Date.now() / 1000) + 86400;
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          access_token: 'ghu_expired',
          refresh_token: 'ghr_fresh',
          expires_at: past,
          refresh_token_expires_at: futureRefresh,
        })
      );
      mockFetch.mockResolvedValue(
        okResponse({
          access_token: 'ghu_refreshed_future',
          refresh_token: 'ghr_new_future',
          expires_in: 28_800,
        })
      );

      const result = await auth.getValidToken();
      expect(result).toBe('ghu_refreshed_future');
      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  describe('device flow fallback paths', () => {
    // These paths call doDeviceFlow which needs a controlled clock and
    // immediate setTimeout resolution.
    let now: number;

    beforeEach(() => {
      now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      mockSetTimeout.mockImplementation(async (ms: number) => {
        now += ms;
      });
    });

    it('falls back to device flow when refresh fails', async () => {
      const past = Math.floor(Date.now() / 1000) - 100;
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          access_token: 'ghu_stale',
          refresh_token: 'ghr_stale',
          expires_at: past,
        })
      );

      // Refresh fails → falls through to device flow
      mockFetch
        .mockResolvedValueOnce(okResponse({ error: 'bad_refresh_token' }))
        .mockResolvedValueOnce(
          okResponse({
            device_code: 'dc_fallback',
            user_code: '555-666',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 5,
          })
        )
        .mockResolvedValueOnce(
          okResponse({
            access_token: 'ghu_fallback',
            expires_in: 28_800,
          })
        );

      const result = await auth.getValidToken();
      expect(result).toBe('ghu_fallback');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('runs device flow when no cache exists', async () => {
      mockReadFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      mockFetch
        .mockResolvedValueOnce(
          okResponse({
            device_code: 'dc_new',
            user_code: '111-222',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 5,
          })
        )
        .mockResolvedValueOnce(
          okResponse({
            access_token: 'ghu_new',
            expires_in: 28_800,
          })
        );

      const result = await auth.getValidToken();
      expect(result).toBe('ghu_new');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('handles malformed JSON in cache gracefully and falls through', async () => {
      mockReadFile.mockResolvedValue('not valid json {{{');

      mockFetch
        .mockResolvedValueOnce(
          okResponse({
            device_code: 'dc_malformed',
            user_code: '333-444',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 5,
          })
        )
        .mockResolvedValueOnce(
          okResponse({
            access_token: 'ghu_malformed',
            expires_in: 28_800,
          })
        );

      const result = await auth.getValidToken();
      expect(result).toBe('ghu_malformed');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('skips refresh when refresh_token_expires_at is in the past', async () => {
      const past = Math.floor(Date.now() / 1000) - 100;
      const pastRefresh = Math.floor(Date.now() / 1000) - 1;
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          access_token: 'ghu_stale',
          refresh_token: 'ghr_stale',
          expires_at: past,
          refresh_token_expires_at: pastRefresh,
        })
      );

      mockFetch
        .mockResolvedValueOnce(
          okResponse({
            device_code: 'dc_skip_refresh',
            user_code: '999-000',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 5,
          })
        )
        .mockResolvedValueOnce(
          okResponse({
            access_token: 'ghu_skip_refresh',
            expires_in: 28_800,
          })
        );

      const result = await auth.getValidToken();
      expect(result).toBe('ghu_skip_refresh');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('throws total failure when device flow also fails', async () => {
      mockReadFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      mockFetch.mockResolvedValueOnce(
        okResponse({
          error: 'access_denied',
          error_description: 'User denied authorization',
        })
      );

      await expect(auth.getValidToken()).rejects.toThrow(
        'Device flow not available'
      );
    });
  });
});
