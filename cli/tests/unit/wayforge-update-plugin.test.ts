import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile as fsReadFile,
  readdir,
  rename as fsRename,
  unlink as fsUnlink,
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import os from 'node:os'
import path from 'node:path'

import {
  isUpdateCheckEnabled,
  resolveInstallPrefix,
  resolveCachePath,
  readCache,
  writeCache,
  buildToastMessage,
  createNotifier,
  parseSemver,
  isNewer,
} from '../../../base/plugins/wayforge-update/core.js'
import { server as opencodeServer } from '../../../base/plugins/wayforge-update/index.js'
import kiloPlugin from '../../../base/plugins/wayforge-update/kilo.js'

const RELEASE_ROOT = 'http://localhost:1/releases'
const LOOKUP_URL = `${RELEASE_ROOT}/latest`
/** Production tag URL that passes the redirect validation. */
const PROD_TAG_BASE = 'https://github.com/Macacoders/wayforge/releases/tag/'
const PROD_LOOKUP_URL = 'https://github.com/Macacoders/wayforge/releases/latest'

async function makeTempDir() {
  return mkdtemp(path.join(tmpdir(), 'wayforge-update-test-'))
}

function redirectResponse(tag: string): Response {
  return {
    ok: false,
    status: 302,
    headers: new Headers({ location: `${PROD_TAG_BASE}${tag}` }),
  } as unknown as Response
}

function redirectFetch(tag: string) {
  return vi.fn(async () => redirectResponse(tag)) as unknown as typeof fetch
}

function failingFetch() {
  return vi.fn(async () => {
    throw new Error('network down')
  }) as unknown as typeof fetch
}

function makeClient() {
  return { tui: { showToast: vi.fn(async () => undefined) } }
}

/** Real fs wrappers as spies so call counts can be asserted. */
function fsSpies() {
  return {
    readFile: vi.fn(async (p: string, enc: string) => fsReadFile(p, enc)),
    writeFile: vi.fn(async (p: string, data: string, enc: string) => {
      await writeFile(p, data, enc)
    }),
    rename: vi.fn(async (from: string, to: string) => {
      await fsRename(from, to)
    }),
    unlink: vi.fn(async (p: string) => {
      await fsUnlink(p)
    }),
  }
}

interface NotifierOptions {
  client?: unknown
  env?: Record<string, string>
  cachePath?: string
  installPrefix?: string
  fetchImpl?: typeof fetch
  now?: () => number
  readFile?: (p: string, enc: string) => Promise<string>
  writeFile?: (p: string, data: string, enc: string) => Promise<void>
  rename?: (from: string, to: string) => Promise<void>
  unlink?: (p: string) => Promise<void>
}

function makeNotifier(options: NotifierOptions) {
  return createNotifier(options)
}

async function writeVersionFile(prefix: string, version: string) {
  const dir = path.join(prefix, 'share', 'wayforge')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'VERSION'), `${version}\n`, 'utf8')
}

async function writeCacheFile(cachePath: string, value: unknown) {
  await writeFile(cachePath, JSON.stringify(value), 'utf8')
}

async function readCacheFile(cachePath: string) {
  return JSON.parse(await fsReadFile(cachePath, 'utf8'))
}

const ENABLED = { WAYFORGE_UPDATE_CHECK: '1' }

describe('runtime gate (isUpdateCheckEnabled)', () => {
  const cases: Array<[Record<string, string>, boolean]> = [
    [{}, false],
    [{ WAYFORGE_UPDATE_CHECK: '' }, false],
    [{ WAYFORGE_UPDATE_CHECK: '0' }, false],
    [{ WAYFORGE_UPDATE_CHECK: 'false' }, false],
    [{ WAYFORGE_UPDATE_CHECK: 'FALSE' }, false],
    [{ WAYFORGE_UPDATE_CHECK: 'yes' }, false],
    [{ WAYFORGE_UPDATE_CHECK: 'off' }, false],
    [{ WAYFORGE_UPDATE_CHECK: '1' }, true],
    [{ WAYFORGE_UPDATE_CHECK: 'true' }, true],
    [{ WAYFORGE_UPDATE_CHECK: 'TRUE' }, true],
    [{ WAYFORGE_UPDATE_CHECK: ' 1 ' }, true],
  ]

  for (const [env, expected] of cases) {
    it(`returns ${expected} for ${JSON.stringify(env)}`, () => {
      expect(isUpdateCheckEnabled(env)).toBe(expected)
    })
  }
})

describe('resolveInstallPrefix / resolveCachePath', () => {
  it('prefers WAYFORGE_INSTALL_DIR', () => {
    expect(
      resolveInstallPrefix({ WAYFORGE_INSTALL_DIR: '/tmp/wf' }, 'linux'),
    ).toBe(path.resolve('/tmp/wf'))
  })

  it('uses LOCALAPPDATA\\wayforge on Windows', () => {
    expect(
      resolveInstallPrefix({ LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local' }, 'win32'),
    ).toBe(path.join('C:\\Users\\t\\AppData\\Local', 'wayforge'))
  })

  it('uses ~/.wayforge on non-Windows', () => {
    const prefix = resolveInstallPrefix({}, 'linux')
    expect(prefix.endsWith(path.join('.wayforge'))).toBe(true)
  })

  it('honours WAYFORGE_NOTIFIER_CACHE only in test mode', () => {
    expect(
      resolveCachePath(
        { WAYFORGE_NOTIFIER_TEST: '1', WAYFORGE_NOTIFIER_CACHE: '/tmp/cache.json' },
        'linux',
      ),
    ).toBe(path.resolve('/tmp/cache.json'))
  })

  it('ignores WAYFORGE_NOTIFIER_CACHE without the test flag', () => {
    expect(
      resolveCachePath({ WAYFORGE_NOTIFIER_CACHE: '/tmp/cache.json' }, 'linux'),
    ).toBe(path.join(os.homedir(), '.cache', 'wayforge', 'update-notifier.json'))
  })

  it('defaults to the user cache dir per platform', () => {
    expect(
      resolveCachePath({ LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local' }, 'win32'),
    ).toBe(
      path.join(
        'C:\\Users\\t\\AppData\\Local',
        'wayforge',
        'update-notifier.json',
      ),
    )
    expect(
      resolveCachePath({ XDG_CACHE_HOME: '/xdg' }, 'linux'),
    ).toBe(path.join('/xdg', 'wayforge', 'update-notifier.json'))
    expect(resolveCachePath({}, 'linux')).toBe(
      path.join(os.homedir(), '.cache', 'wayforge', 'update-notifier.json'),
    )
  })
})

describe('cache helpers', () => {
  it('discards corrupt JSON', async () => {
    const dir = await makeTempDir()
    const cachePath = path.join(dir, 'cache.json')
    await writeFile(cachePath, 'not json', 'utf8')
    expect(await readCache(cachePath, fsReadFile)).toBeNull()
  })

  it('discards a mismatched schema version', async () => {
    const dir = await makeTempDir()
    const cachePath = path.join(dir, 'cache.json')
    await writeCacheFile(cachePath, {
      schemaVersion: 2,
      lastChecked: new Date().toISOString(),
      latestVersion: null,
      notifiedVersion: null,
    })
    expect(await readCache(cachePath, fsReadFile)).toBeNull()
  })

  it('round-trips a valid cache', async () => {
    const dir = await makeTempDir()
    const cachePath = path.join(dir, 'cache.json')
    const cache = {
      schemaVersion: 1,
      lastChecked: new Date().toISOString(),
      latestVersion: 'v1.0.3',
      notifiedVersion: null,
    }
    expect(await writeCache(cachePath, cache, writeFile)).toBe(true)
    expect(await readCache(cachePath, fsReadFile)).toEqual(cache)
  })

  it('writeCache swallows failures', async () => {
    const dir = await makeTempDir()
    const failing = vi.fn(async () => {
      throw new Error('disk full')
    })
    expect(await writeCache(path.join(dir, 'x.json'), {}, failing)).toBe(false)
  })

  it('writeCache creates a missing parent directory', async () => {
    const dir = await makeTempDir()
    const cachePath = path.join(dir, 'nested', 'wayforge', 'update-notifier.json')
    const cache = {
      schemaVersion: 1,
      lastChecked: new Date().toISOString(),
      latestVersion: null,
      notifiedVersion: null,
    }
    expect(await writeCache(cachePath, cache, writeFile)).toBe(true)
    expect(existsSync(cachePath)).toBe(true)
    expect(JSON.parse(await fsReadFile(cachePath, 'utf8'))).toEqual(cache)
  })

  it('writeCache is atomic: no temp file remains after success', async () => {
    const dir = await makeTempDir()
    const cachePath = path.join(dir, 'update-notifier.json')
    const cache = {
      schemaVersion: 1,
      lastChecked: new Date().toISOString(),
      latestVersion: 'v1.0.3',
      notifiedVersion: null,
    }
    expect(await writeCache(cachePath, cache, writeFile)).toBe(true)
    expect(JSON.parse(await fsReadFile(cachePath, 'utf8'))).toEqual(cache)
    const leftovers = (await readdir(dir)).filter((f) => f.endsWith('.tmp'))
    expect(leftovers).toEqual([])
  })

  it('writeCache cleans up the temp file when rename fails', async () => {
    const dir = await makeTempDir()
    const cachePath = path.join(dir, 'update-notifier.json')
    const failingRename = vi.fn(async () => {
      throw new Error('rename failed')
    })
    const unlinkSpy = vi.fn(async (p: string) => {
      await fsUnlink(p)
    })
    expect(await writeCache(cachePath, {}, writeFile, failingRename, unlinkSpy)).toBe(false)
    expect(unlinkSpy).toHaveBeenCalledTimes(1)
    const [tempPath] = unlinkSpy.mock.calls[0]
    expect(tempPath.startsWith(cachePath)).toBe(true)
    expect(tempPath.endsWith('.tmp')).toBe(true)
    expect(existsSync(cachePath)).toBe(false)
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })
})

describe('buildToastMessage', () => {
  it('points at wfg upgrade', () => {
    expect(buildToastMessage('v1.2.3', '1.0.2')).toBe(
      'wayforge v1.2.3 is available (installed v1.0.2). Run `wfg upgrade` to update.',
    )
  })
})

describe('createNotifier', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function baseEnv() {
    return {
      ...ENABLED,
      WAYFORGE_NOTIFIER_TEST: '1',
      WAYFORGE_RELEASE_ROOT: RELEASE_ROOT,
    }
  }

  async function enabledFixture(extra: Partial<NotifierOptions> = {}) {
    const dir = await makeTempDir()
    const prefix = await makeTempDir()
    const cachePath = path.join(dir, 'update-notifier.json')
    await writeVersionFile(prefix, '1.0.2')
    const spies = fsSpies()
    const client = makeClient()
    const notifier = makeNotifier({
      client,
      env: baseEnv(),
      cachePath,
      installPrefix: prefix,
      fetchImpl: redirectFetch('v1.0.3'),
      readFile: spies.readFile,
      writeFile: spies.writeFile,
      rename: spies.rename,
      unlink: spies.unlink,
      ...extra,
    })
    return { dir, prefix, cachePath, spies, client, notifier }
  }

  it('does nothing when the gate is disabled (no cache read, no fetch, no toast)', async () => {
    const { cachePath, spies, client, notifier } = await enabledFixture({
      env: {},
      fetchImpl: redirectFetch('v1.0.3'),
    })
    const result = await notifier.checkAndNotify()
    expect(result).toMatchObject({ checked: false, notified: false })
    expect(spies.readFile).not.toHaveBeenCalled()
    expect(spies.writeFile).not.toHaveBeenCalled()
    expect(client.tui.showToast).not.toHaveBeenCalled()
    expect(cachePath).toBeTruthy()
  })

  it.each([['1'], ['true'], ['TRUE']])(
    'runs the check when WAYFORGE_UPDATE_CHECK=%s',
    async (value) => {
      const { client, notifier } = await enabledFixture({
        env: {
          WAYFORGE_UPDATE_CHECK: value,
          WAYFORGE_NOTIFIER_TEST: '1',
          WAYFORGE_RELEASE_ROOT: RELEASE_ROOT,
        },
      })
      const result = await notifier.checkAndNotify()
      expect(result.checked).toBe(true)
      expect(client.tui.showToast).toHaveBeenCalledTimes(1)
    },
  )

  it('shows one toast with the exact message and variant info for a newer version', async () => {
    const { client, notifier } = await enabledFixture()
    await notifier.checkAndNotify()
    expect(client.tui.showToast).toHaveBeenCalledTimes(1)
    expect(client.tui.showToast).toHaveBeenCalledWith({
      body: {
        message:
          'wayforge v1.0.3 is available (installed v1.0.2). Run `wfg upgrade` to update.',
        variant: 'info',
      },
    })
  })

  it('shows no toast for equal versions', async () => {
    const dir = await makeTempDir()
    const prefix = await makeTempDir()
    await writeVersionFile(prefix, '1.0.3')
    const client = makeClient()
    const notifier = makeNotifier({
      client,
      env: baseEnv(),
      cachePath: path.join(dir, 'c.json'),
      installPrefix: prefix,
      fetchImpl: redirectFetch('v1.0.3'),
      readFile: fsReadFile,
      writeFile,
    })
    const result = await notifier.checkAndNotify()
    expect(result).toMatchObject({ checked: true, updateAvailable: false, notified: false })
    expect(client.tui.showToast).not.toHaveBeenCalled()
  })

  it('does not repeat the toast once notifiedVersion is persisted', async () => {
    const { client, cachePath, notifier } = await enabledFixture()
    await notifier.checkAndNotify()
    const first = await readCacheFile(cachePath)
    expect(first.notifiedVersion).toBe('v1.0.3')

    // New notifier instance (fresh process) reading the persisted cache.
    const client2 = makeClient()
    const notifier2 = makeNotifier({
      client: client2,
      env: baseEnv(),
      cachePath,
      fetchImpl: redirectFetch('v1.0.3'),
      readFile: fsReadFile,
      writeFile,
    })
    await notifier2.checkAndNotify()
    expect(client2.tui.showToast).not.toHaveBeenCalled()
  })

  it('fresh cache performs no network request; stale cache fetches once', async () => {
    const { cachePath, notifier, client } = await enabledFixture()
    await notifier.checkAndNotify()
    expect(client.tui.showToast).toHaveBeenCalledTimes(1)

    // Fresh cache: no second fetch, no second toast.
    const fetchMock = redirectFetch('v1.0.3')
    const client2 = makeClient()
    const notifier2 = makeNotifier({
      client: client2,
      env: baseEnv(),
      cachePath,
      fetchImpl: fetchMock,
      readFile: fsReadFile,
      writeFile,
    })
    await notifier2.checkAndNotify()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(client2.tui.showToast).not.toHaveBeenCalled()

    // Stale cache: fetch called once against the test release root.
    const stale = await readCacheFile(cachePath)
    stale.lastChecked = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    stale.notifiedVersion = null
    await writeCacheFile(cachePath, stale)
    const fetchMock3 = redirectFetch('v1.0.3')
    const notifier3 = makeNotifier({
      client: makeClient(),
      env: baseEnv(),
      cachePath,
      fetchImpl: fetchMock3,
      readFile: fsReadFile,
      writeFile,
    })
    await notifier3.checkAndNotify()
    expect(fetchMock3).toHaveBeenCalledTimes(1)
    expect(fetchMock3).toHaveBeenCalledWith(
      LOOKUP_URL,
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  it('no-ops when the VERSION file is missing, even when enabled', async () => {
    const dir = await makeTempDir()
    const prefix = await makeTempDir()
    const fetchMock = redirectFetch('v1.0.3')
    const client = makeClient()
    const notifier = makeNotifier({
      client,
      env: baseEnv(),
      cachePath: path.join(dir, 'c.json'),
      installPrefix: prefix,
      fetchImpl: fetchMock,
      readFile: fsReadFile,
      writeFile,
    })
    const result = await notifier.checkAndNotify()
    expect(result).toMatchObject({ checked: false, notified: false })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(client.tui.showToast).not.toHaveBeenCalled()
  })

  it('no-ops on an unparseable VERSION file', async () => {
    const dir = await makeTempDir()
    const prefix = await makeTempDir()
    const versionDir = path.join(prefix, 'share', 'wayforge')
    await mkdir(versionDir, { recursive: true })
    await writeFile(path.join(versionDir, 'VERSION'), 'garbage', 'utf8')
    const fetchMock = redirectFetch('v1.0.3')
    const notifier = makeNotifier({
      env: baseEnv(),
      cachePath: path.join(dir, 'c.json'),
      installPrefix: prefix,
      fetchImpl: fetchMock,
      readFile: fsReadFile,
      writeFile,
    })
    const result = await notifier.checkAndNotify()
    expect(result.checked).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('tolerates a missing showToast API', async () => {
    const { notifier } = await enabledFixture({ client: {} })
    await expect(notifier.checkAndNotify()).resolves.toMatchObject({ notified: true })
  })

  it('tolerates a throwing toast', async () => {
    const client = { tui: { showToast: vi.fn(async () => { throw new Error('tui gone') }) } }
    const { notifier } = await enabledFixture({ client })
    await expect(notifier.checkAndNotify()).resolves.toMatchObject({ notified: true })
  })

  it('swallows fetch failures and still updates lastChecked', async () => {
    const { cachePath, notifier, client } = await enabledFixture({
      fetchImpl: failingFetch(),
    })
    const result = await notifier.checkAndNotify()
    expect(result).toMatchObject({ checked: true, updateAvailable: false })
    expect(client.tui.showToast).not.toHaveBeenCalled()
    const cache = await readCacheFile(cachePath)
    expect(Number.isFinite(Date.parse(cache.lastChecked))).toBe(true)
    expect(cache.latestVersion).toBeNull()
  })

  it('discards a corrupt cache and recomputes', async () => {
    const { cachePath, client, notifier } = await enabledFixture()
    await writeFile(cachePath, 'corrupt', 'utf8')
    await notifier.checkAndNotify()
    expect(client.tui.showToast).toHaveBeenCalledTimes(1)
    const cache = await readCacheFile(cachePath)
    expect(cache.schemaVersion).toBe(1)
  })

  it('discards a mismatched-schema cache and recomputes', async () => {
    const { cachePath, client, notifier } = await enabledFixture()
    await writeCacheFile(cachePath, { schemaVersion: 99, lastChecked: 'x' })
    await notifier.checkAndNotify()
    expect(client.tui.showToast).toHaveBeenCalledTimes(1)
    expect((await readCacheFile(cachePath)).schemaVersion).toBe(1)
  })

  it('falls back to in-process state when the cache write fails', async () => {
    const client = makeClient()
    const failingWrite = vi.fn(async () => {
      throw new Error('read-only fs')
    })
    const { notifier } = await enabledFixture({ client, writeFile: failingWrite })
    await notifier.checkAndNotify()
    expect(client.tui.showToast).toHaveBeenCalledTimes(1)
    // Second call in the same process must not re-toast.
    await notifier.checkAndNotify()
    expect(client.tui.showToast).toHaveBeenCalledTimes(1)
  })

  it('in-flight guard prevents duplicate concurrent checks', async () => {
    let releaseFetch: () => void = () => undefined
    let signalFetchEntered: () => void = () => undefined
    const fetchEntered = new Promise<void>((resolve) => {
      signalFetchEntered = resolve
    })
    const gatedFetch = vi.fn(() => {
      // Signal synchronously that the mock has been entered.
      signalFetchEntered()
      return new Promise((resolve) => {
        releaseFetch = () => resolve(redirectResponse('v1.0.3'))
      }) as Promise<Response>
    }) as unknown as typeof fetch
    const { client, notifier } = await enabledFixture({ fetchImpl: gatedFetch })

    const first = notifier.checkAndNotify()
    const second = notifier.checkAndNotify()
    // Wait deterministically until run() has actually reached the fetch.
    await fetchEntered
    releaseFetch()
    await Promise.all([first, second])

    expect(gatedFetch).toHaveBeenCalledTimes(1)
    expect(client.tui.showToast).toHaveBeenCalledTimes(1)
  })

  it('uses WAYFORGE_VERSION over the VERSION file in test mode', async () => {
    const dir = await makeTempDir()
    const client = makeClient()
    const notifier = makeNotifier({
      client,
      env: { ...baseEnv(), WAYFORGE_VERSION: '1.0.2' },
      cachePath: path.join(dir, 'c.json'),
      fetchImpl: redirectFetch('v1.0.3'),
      readFile: fsReadFile,
      writeFile,
    })
    const result = await notifier.checkAndNotify()
    expect(result).toMatchObject({ notified: true })
    expect(client.tui.showToast).toHaveBeenCalledTimes(1)
  })

  it('ignores WAYFORGE_VERSION without the test flag and uses the VERSION file', async () => {
    const dir = await makeTempDir()
    const prefix = await makeTempDir()
    await writeVersionFile(prefix, '1.0.2')
    const client = makeClient()
    const notifier = makeNotifier({
      client,
      env: {
        WAYFORGE_UPDATE_CHECK: '1',
        WAYFORGE_RELEASE_ROOT: RELEASE_ROOT,
        WAYFORGE_VERSION: '9.9.9',
      },
      cachePath: path.join(dir, 'c.json'),
      installPrefix: prefix,
      fetchImpl: redirectFetch('v1.0.3'),
      readFile: fsReadFile,
      writeFile,
    })
    const result = await notifier.checkAndNotify()
    expect(result).toMatchObject({ notified: true })
    // The installed version comes from the VERSION file, not the env seam.
    expect(client.tui.showToast).toHaveBeenCalledWith({
      body: expect.objectContaining({
        message: expect.stringContaining('(installed v1.0.2)'),
      }),
    })
  })

  it('no-ops on an invalid test-mode WAYFORGE_VERSION', async () => {
    const dir = await makeTempDir()
    const fetchMock = redirectFetch('v1.0.3')
    const client = makeClient()
    const notifier = makeNotifier({
      client,
      env: { ...baseEnv(), WAYFORGE_VERSION: 'garbage' },
      cachePath: path.join(dir, 'c.json'),
      fetchImpl: fetchMock,
      readFile: fsReadFile,
      writeFile,
    })
    const result = await notifier.checkAndNotify()
    expect(result).toMatchObject({ checked: false, notified: false })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(client.tui.showToast).not.toHaveBeenCalled()
  })

  it('ignores WAYFORGE_RELEASE_ROOT in production and uses the constant root', async () => {
    const dir = await makeTempDir()
    const prefix = await makeTempDir()
    await writeVersionFile(prefix, '1.0.2')
    const fetchMock = redirectFetch('v1.0.3')
    const client = makeClient()
    const notifier = makeNotifier({
      client,
      // Gate enabled but no WAYFORGE_NOTIFIER_TEST: the override is ignored.
      env: { WAYFORGE_UPDATE_CHECK: '1', WAYFORGE_RELEASE_ROOT: RELEASE_ROOT },
      cachePath: path.join(dir, 'c.json'),
      installPrefix: prefix,
      fetchImpl: fetchMock,
      readFile: fsReadFile,
      writeFile,
    })
    const result = await notifier.checkAndNotify()
    expect(result).toMatchObject({ checked: true, notified: true })
    expect(fetchMock).toHaveBeenCalledWith(PROD_LOOKUP_URL, expect.anything())
    expect(client.tui.showToast).toHaveBeenCalledTimes(1)
  })

  it('sends a constant User-Agent with no installed version', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['User-Agent']).toBe(
        'wayforge-update-notifier',
      )
      return redirectResponse('v1.0.3')
    }) as unknown as typeof fetch
    const { notifier, client } = await enabledFixture({ fetchImpl: fetchMock })
    await notifier.checkAndNotify()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(client.tui.showToast).toHaveBeenCalledTimes(1)
  })

  it('cancels the response body after the lookup', async () => {
    const cancel = vi.fn(async () => undefined)
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 302,
      headers: new Headers({ location: `${PROD_TAG_BASE}v1.0.3` }),
      body: { cancel },
    })) as unknown as typeof fetch
    const { notifier, client } = await enabledFixture({ fetchImpl: fetchMock })
    await notifier.checkAndNotify()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(client.tui.showToast).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'non-HTTPS',
      'http://github.com/Macacoders/wayforge/releases/tag/v1.0.3',
    ],
    [
      'wrong host',
      'https://evil.example/Macacoders/wayforge/releases/tag/v1.0.3',
    ],
    [
      'wrong repo path',
      'https://github.com/other/repo/releases/tag/v1.0.3',
    ],
    [
      'missing /tag/ segment',
      'https://github.com/Macacoders/wayforge/releases/download/v1.0.3/f',
    ],
    [
      'non-semver tag',
      'https://github.com/Macacoders/wayforge/releases/tag/not-a-version',
    ],
  ])('rejects a redirect with a %s location', async (_label, location) => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 302,
      headers: new Headers({ location }),
    })) as unknown as typeof fetch
    const { cachePath, client, notifier } = await enabledFixture({ fetchImpl: fetchMock })
    const result = await notifier.checkAndNotify()
    expect(result).toMatchObject({
      checked: true,
      updateAvailable: false,
      notified: false,
    })
    expect(client.tui.showToast).not.toHaveBeenCalled()
    const cache = await readCacheFile(cachePath)
    expect(cache.latestVersion).toBeNull()
  })
})

describe('entrypoints', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  async function entrypointEnv() {
    const dir = await makeTempDir()
    vi.stubEnv('WAYFORGE_UPDATE_CHECK', '1')
    vi.stubEnv('WAYFORGE_NOTIFIER_TEST', '1')
    vi.stubEnv('WAYFORGE_VERSION', '1.0.2')
    vi.stubEnv('WAYFORGE_RELEASE_ROOT', RELEASE_ROOT)
    vi.stubEnv('WAYFORGE_NOTIFIER_CACHE', path.join(dir, 'update-notifier.json'))
    return dir
  }

  function sessionCreated() {
    return { event: { type: 'session.created', properties: {} } }
  }

  it('OpenCode server() returns an event hook and toasts on session.created', async () => {
    await entrypointEnv()
    const fetchMock = redirectFetch('v1.0.3')
    vi.stubGlobal('fetch', fetchMock)
    const client = makeClient()

    const hooks = await opencodeServer({ client } as never)
    expect(typeof hooks.event).toBe('function')

    await hooks.event(sessionCreated())
    // Fire-and-forget: the toast lands asynchronously after the hook returns.
    await vi.waitFor(() => {
      expect(client.tui.showToast).toHaveBeenCalledTimes(1)
    })
    expect(client.tui.showToast).toHaveBeenCalledWith({
      body: {
        message:
          'wayforge v1.0.3 is available (installed v1.0.2). Run `wfg upgrade` to update.',
        variant: 'info',
      },
    })
  })

  it('OpenCode event hook ignores non-session.created events', async () => {
    await entrypointEnv()
    const fetchMock = redirectFetch('v1.0.3')
    vi.stubGlobal('fetch', fetchMock)
    const client = makeClient()

    const hooks = await opencodeServer({ client } as never)
    await hooks.event({ event: { type: 'message.updated', properties: {} } })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(client.tui.showToast).not.toHaveBeenCalled()
  })

  it('OpenCode event hook returns before the fetch resolves (fire-and-forget)', async () => {
    await entrypointEnv()
    let releaseFetch: () => void = () => undefined
    let signalFetchEntered: () => void = () => undefined
    const fetchEntered = new Promise<void>((resolve) => {
      signalFetchEntered = resolve
    })
    const gatedFetch = vi.fn(() => {
      signalFetchEntered()
      return new Promise((resolve) => {
        releaseFetch = () => resolve(redirectResponse('v1.0.3'))
      }) as Promise<Response>
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', gatedFetch)
    const client = makeClient()

    const hooks = await opencodeServer({ client } as never)
    // The hook must return immediately, while the fetch is still pending.
    expect(hooks.event(sessionCreated())).toBeUndefined()
    await fetchEntered
    expect(client.tui.showToast).not.toHaveBeenCalled()

    releaseFetch()
    await vi.waitFor(() => {
      expect(client.tui.showToast).toHaveBeenCalledTimes(1)
    })
    expect(client.tui.showToast).toHaveBeenCalledTimes(1)
  })

  it('Kilo default export has id and server, and its event hook calls the shared core', async () => {
    await entrypointEnv()
    const fetchMock = redirectFetch('v1.0.3')
    vi.stubGlobal('fetch', fetchMock)
    const client = makeClient()

    expect(kiloPlugin.id).toBe('wayforge-update')
    expect(typeof kiloPlugin.server).toBe('function')

    const hooks = kiloPlugin.server({ client } as never)
    await hooks.event(sessionCreated())
    // Fire-and-forget: the toast lands asynchronously after the hook returns.
    await vi.waitFor(() => {
      expect(client.tui.showToast).toHaveBeenCalledTimes(1)
    })
    expect(client.tui.showToast).toHaveBeenCalledWith({
      body: {
        message:
          'wayforge v1.0.3 is available (installed v1.0.2). Run `wfg upgrade` to update.',
        variant: 'info',
      },
    })
  })

  it('Kilo event hook respects the disabled gate', async () => {
    await entrypointEnv()
    vi.stubEnv('WAYFORGE_UPDATE_CHECK', '0')
    const fetchMock = redirectFetch('v1.0.3')
    vi.stubGlobal('fetch', fetchMock)
    const client = makeClient()

    const hooks = kiloPlugin.server({ client } as never)
    await hooks.event(sessionCreated())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(client.tui.showToast).not.toHaveBeenCalled()
  })

  /**
   * Real-fs end-to-end: no injected fs primitives, no WAYFORGE_VERSION —
   * the VERSION file and the cache (with a missing parent directory) are
   * exercised exactly as in a real session.
   */
  async function realFsEnv() {
    const prefix = await makeTempDir()
    await writeVersionFile(prefix, '1.0.2')
    const cacheDir = await makeTempDir()
    const cachePath = path.join(cacheDir, 'not-created-yet', 'wayforge', 'update-notifier.json')
    vi.stubEnv('WAYFORGE_UPDATE_CHECK', '1')
    vi.stubEnv('WAYFORGE_NOTIFIER_TEST', '1')
    vi.stubEnv('WAYFORGE_INSTALL_DIR', prefix)
    vi.stubEnv('WAYFORGE_RELEASE_ROOT', RELEASE_ROOT)
    vi.stubEnv('WAYFORGE_NOTIFIER_CACHE', cachePath)
    return cachePath
  }

  const entrypoints = [
    { name: 'OpenCode', load: opencodeServer },
    { name: 'Kilo', load: (ctx: unknown) => kiloPlugin.server(ctx) },
  ]

  it.each(entrypoints)(
    '$name entrypoint works with real fs: reads VERSION, creates cache dir, persists notifiedVersion',
    async ({ load }) => {
      const cachePath = await realFsEnv()
      const fetchMock = redirectFetch('v1.0.3')
      vi.stubGlobal('fetch', fetchMock)
      const client = makeClient()

      const hooks = await load({ client } as never)
      await hooks.event(sessionCreated())
      await vi.waitFor(() => {
        expect(client.tui.showToast).toHaveBeenCalledTimes(1)
      })
      expect(client.tui.showToast).toHaveBeenCalledWith({
        body: {
          message:
            'wayforge v1.0.3 is available (installed v1.0.2). Run `wfg upgrade` to update.',
          variant: 'info',
        },
      })
      expect(existsSync(cachePath)).toBe(true)
      const cache = JSON.parse(await fsReadFile(cachePath, 'utf8'))
      expect(cache.notifiedVersion).toBe('v1.0.3')

      // Simulate a new process: fresh notifier, same env, real fs.
      const fetchMock2 = redirectFetch('v1.0.3')
      vi.stubGlobal('fetch', fetchMock2)
      const client2 = makeClient()
      const hooks2 = await load({ client: client2 } as never)
      await hooks2.event(sessionCreated())
      await vi.waitFor(() => {
        expect(fetchMock2).not.toHaveBeenCalled()
      })
      expect(client2.tui.showToast).not.toHaveBeenCalled()
    },
  )

  it('package.json marks the plugin as ESM with index.js as main', async () => {
    const pkg = JSON.parse(
      await fsReadFile(
        path.resolve(import.meta.dirname, '../../../base/plugins/wayforge-update/package.json'),
        'utf8',
      ),
    )
    expect(pkg.type).toBe('module')
    expect(pkg.main).toBe('index.js')
  })

  it('plugin files contain no runtime SDK imports', async () => {
    const base = path.resolve(import.meta.dirname, '../../../base/plugins/wayforge-update')
    for (const file of ['core.js', 'index.js', 'kilo.js']) {
      const source = await fsReadFile(path.join(base, file), 'utf8')
      expect(source).not.toMatch(/@opencode-ai\/plugin/)
      expect(source).not.toMatch(/@kilocode\/plugin/)
    }
  })
})

describe('semver helpers', () => {
  it('parseSemver accepts optional v prefix and rejects garbage', () => {
    expect(parseSemver('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 })
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 })
    expect(parseSemver('abc')).toBeNull()
  })

  it('isNewer compares numerically', () => {
    expect(isNewer('1.0.2', 'v1.0.3')).toBe(true)
    expect(isNewer('1.0.10', '1.0.9')).toBe(false)
    expect(isNewer('1.0.2', 'not-a-version')).toBe(false)
  })
})
