import { describe, it, expect, afterEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs-extra'
import {
	resolveLatestReleaseVersion,
	resolveUpdateStateDir,
	resolveReleaseRoot,
	readUpdateCache,
	writeUpdateCache,
	isCacheFresh,
	maybeNotifyUpdate,
	shouldNotifyUpdate,
	CACHE_SCHEMA_VERSION,
	type UpdateCache,
} from '../../src/lib/release.js'
import {
	isInstalledBinary,
	resolveInstallPrefix,
} from '../../src/lib/install.js'

const BASE = path.resolve(__dirname, '..', '..', '.test-release')

function makeFetchMock(finalUrl: string) {
	return vi.fn(async () => ({ ok: true, url: finalUrl })) as unknown as typeof fetch
}

describe('resolveLatestReleaseVersion', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
		vi.unstubAllGlobals()
	})

	it('parses the release tag from the final redirect URL', async () => {
		const fetchMock = makeFetchMock(
			'https://github.com/Macacoders/wayforge/releases/tag/v1.2.3',
		)
		vi.stubGlobal('fetch', fetchMock)

		await expect(resolveLatestReleaseVersion()).resolves.toBe('v1.2.3')
		expect(fetchMock).toHaveBeenCalledWith(
			'https://github.com/Macacoders/wayforge/releases/latest',
			expect.objectContaining({ redirect: 'follow' }),
		)
	})

	it('uses WAYFORGE_RELEASE_ROOT for the lookup URL', async () => {
		const fetchMock = makeFetchMock('http://localhost:1/releases/tag/v0.2.0')
		vi.stubGlobal('fetch', fetchMock)
		vi.stubEnv('WAYFORGE_RELEASE_ROOT', 'http://localhost:1/releases/')

		await expect(resolveLatestReleaseVersion()).resolves.toBe('v0.2.0')
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:1/releases/latest',
			expect.anything(),
		)
	})

	it('rejects a final URL without a release tag', async () => {
		vi.stubGlobal(
			'fetch',
			makeFetchMock('https://github.com/Macacoders/wayforge/releases'),
		)

		await expect(resolveLatestReleaseVersion()).rejects.toThrow()
	})

	it('rejects a tag that is not valid semver', async () => {
		vi.stubGlobal(
			'fetch',
			makeFetchMock(
				'https://github.com/Macacoders/wayforge/releases/tag/not-a-version',
			),
		)

		await expect(resolveLatestReleaseVersion()).rejects.toThrow()
	})

	it('rejects a non-ok response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: false,
				status: 404,
				url: 'https://github.com/Macacoders/wayforge/releases/latest',
			})) as unknown as typeof fetch,
		)

		await expect(resolveLatestReleaseVersion()).rejects.toThrow()
	})
})

describe('resolveReleaseRoot', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('defaults to the wayforge GitHub releases root', () => {
		vi.stubEnv('WAYFORGE_RELEASE_ROOT', '')

		expect(resolveReleaseRoot()).toBe(
			'https://github.com/Macacoders/wayforge/releases',
		)
	})

	it('honours WAYFORGE_RELEASE_ROOT and strips trailing slashes', () => {
		vi.stubEnv('WAYFORGE_RELEASE_ROOT', 'http://localhost:1/releases/')

		expect(resolveReleaseRoot()).toBe('http://localhost:1/releases')
	})
})

describe('resolveUpdateStateDir', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('honours WAYFORGE_STATE_DIR', () => {
		vi.stubEnv('WAYFORGE_STATE_DIR', '/tmp/wayforge-state')

		expect(resolveUpdateStateDir()).toBe(path.resolve('/tmp/wayforge-state'))
	})

	it('treats empty-string WAYFORGE_STATE_DIR as unset', () => {
		vi.stubEnv('WAYFORGE_STATE_DIR', '')

		expect(resolveUpdateStateDir()).toBe(resolveUpdateStateDir())
		expect(path.basename(resolveUpdateStateDir())).toBe('wayforge')
	})

	it.runIf(process.platform === 'win32')(
		'uses LOCALAPPDATA on Windows without touching the real user dir',
		() => {
			const fakeLocalAppData = path.join(BASE, 'localappdata')
			fs.mkdirpSync(fakeLocalAppData)
			vi.stubEnv('WAYFORGE_STATE_DIR', '')
			vi.stubEnv('LOCALAPPDATA', fakeLocalAppData)

			expect(resolveUpdateStateDir()).toBe(
				path.join(fakeLocalAppData, 'wayforge'),
			)
		},
	)

	it.runIf(process.platform !== 'win32')(
		'uses XDG_STATE_HOME on Unix without touching the real user dir',
		() => {
			const fakeXdg = path.join(BASE, 'xdg-state')
			fs.mkdirpSync(fakeXdg)
			vi.stubEnv('WAYFORGE_STATE_DIR', '')
			vi.stubEnv('XDG_STATE_HOME', fakeXdg)

			expect(resolveUpdateStateDir()).toBe(path.join(fakeXdg, 'wayforge'))
		},
	)
})

describe('update cache', () => {
	let tempDir: string | undefined

	afterEach(() => {
		if (tempDir && fs.pathExistsSync(tempDir)) {
			fs.removeSync(tempDir)
			tempDir = undefined
		}
	})

	function stateDir(): string {
		tempDir = fs.mkdtempSync(path.join(BASE, 'state-'))
		return tempDir
	}

	function sampleCache(overrides: Partial<UpdateCache> = {}): UpdateCache {
		return {
			schemaVersion: CACHE_SCHEMA_VERSION,
			lastChecked: 1000,
			latestVersion: 'v1.2.3',
			notifiedVersion: null,
			...overrides,
		}
	}

	it('writes and reads back a cache entry', () => {
		const dir = stateDir()
		writeUpdateCache(sampleCache(), dir)

		expect(readUpdateCache(dir)).toEqual(sampleCache())
	})

	it('creates the state directory lazily on write', () => {
		const dir = path.join(stateDir(), 'nested', 'wayforge')
		writeUpdateCache(sampleCache(), dir)

		expect(fs.pathExistsSync(path.join(dir, 'update-check.json'))).toBe(true)
	})

	it('returns null for a missing cache file', () => {
		const dir = stateDir()

		expect(readUpdateCache(dir)).toBeNull()
	})

	it('returns null for a corrupt cache file', () => {
		const dir = stateDir()
		fs.writeFileSync(path.join(dir, 'update-check.json'), '{not json', 'utf8')

		expect(readUpdateCache(dir)).toBeNull()
	})

	it('returns null for an unsupported schema version', () => {
		const dir = stateDir()
		fs.writeJsonSync(path.join(dir, 'update-check.json'), {
			schemaVersion: 999,
			lastChecked: 1000,
		})

		expect(readUpdateCache(dir)).toBeNull()
	})

	it('is fresh within 24 hours and stale after', () => {
		const now = 1_000_000_000
		const fresh = sampleCache({ lastChecked: now - 23 * 60 * 60 * 1000 })
		const stale = sampleCache({ lastChecked: now - 25 * 60 * 60 * 1000 })

		expect(isCacheFresh(fresh, now)).toBe(true)
		expect(isCacheFresh(stale, now)).toBe(false)
		expect(isCacheFresh(null, now)).toBe(false)
	})
})

describe('isInstalledBinary', () => {
	let tempDir: string | undefined

	afterEach(() => {
		vi.unstubAllEnvs()
		vi.unstubAllGlobals()
		if (tempDir && fs.pathExistsSync(tempDir)) {
			fs.removeSync(tempDir)
			tempDir = undefined
		}
	})

	it('is false in the dev checkout (running via node/tsx)', () => {
		expect(isInstalledBinary()).toBe(false)
	})

	it('is true for a fixture install prefix', () => {
		tempDir = fs.mkdtempSync(path.join(BASE, 'installed-'))
		const prefix = path.join(tempDir, 'prefix')
		const shareDir = path.join(prefix, 'share', 'wayforge')
		fs.mkdirpSync(path.join(shareDir, 'base'))
		fs.writeFileSync(path.join(shareDir, 'VERSION'), '1.0.0\n', 'utf8')
		fs.mkdirpSync(path.join(prefix, 'bin'))
		vi.stubEnv('WAYFORGE_HOME', shareDir)
		vi.stubGlobal('process', {
			...process,
			execPath: path.join(prefix, 'bin', 'wfg.exe'),
		})

		expect(isInstalledBinary()).toBe(true)
	})

	it('is false when the binary is not wfg', () => {
		tempDir = fs.mkdtempSync(path.join(BASE, 'notwfg-'))
		const prefix = path.join(tempDir, 'prefix')
		const shareDir = path.join(prefix, 'share', 'wayforge')
		fs.mkdirpSync(path.join(shareDir, 'base'))
		fs.writeFileSync(path.join(shareDir, 'VERSION'), '1.0.0\n', 'utf8')
		vi.stubEnv('WAYFORGE_HOME', shareDir)
		vi.stubGlobal('process', {
			...process,
			execPath: path.join(prefix, 'bin', 'node.exe'),
		})

		expect(isInstalledBinary()).toBe(false)
	})
})

describe('resolveInstallPrefix', () => {
	let tempDir: string | undefined

	afterEach(() => {
		vi.unstubAllEnvs()
		vi.unstubAllGlobals()
		if (tempDir && fs.pathExistsSync(tempDir)) {
			fs.removeSync(tempDir)
			tempDir = undefined
		}
	})

	function fixturePrefix(): string {
		tempDir = fs.mkdtempSync(path.join(BASE, 'prefix-'))
		const prefix = path.join(tempDir, 'prefix')
		fs.mkdirpSync(path.join(prefix, 'share', 'wayforge'))
		fs.mkdirpSync(path.join(prefix, 'bin'))
		return prefix
	}

	it('honours WAYFORGE_INSTALL_DIR when the layout matches', () => {
		const prefix = fixturePrefix()
		vi.stubEnv('WAYFORGE_INSTALL_DIR', prefix)

		expect(resolveInstallPrefix()).toBe(path.resolve(prefix))
	})

	it('returns null when WAYFORGE_INSTALL_DIR has no share/wayforge', () => {
		const empty = fs.mkdtempSync(path.join(BASE, 'empty-'))
		tempDir = empty
		vi.stubEnv('WAYFORGE_INSTALL_DIR', empty)

		expect(resolveInstallPrefix()).toBeNull()
	})

	it('derives the prefix from the running binary path', () => {
		const prefix = fixturePrefix()
		vi.stubEnv('WAYFORGE_INSTALL_DIR', '')
		vi.stubGlobal('process', {
			...process,
			execPath: path.join(prefix, 'bin', 'wfg.exe'),
		})

		expect(resolveInstallPrefix()).toBe(path.resolve(prefix))
	})

	it('returns null for a non-install layout', () => {
		const empty = fs.mkdtempSync(path.join(BASE, 'noprefix-'))
		tempDir = empty
		vi.stubEnv('WAYFORGE_INSTALL_DIR', '')
		vi.stubGlobal('process', {
			...process,
			execPath: path.join(empty, 'bin', 'wfg.exe'),
		})

		expect(resolveInstallPrefix()).toBeNull()
	})
})

describe('shouldNotifyUpdate', () => {
	it('requires a first positional token', () => {
		expect(shouldNotifyUpdate([], true)).toBe(false)
	})

	it('skips option-only invocations like --help and --version', () => {
		expect(shouldNotifyUpdate(['--help'], true)).toBe(false)
		expect(shouldNotifyUpdate(['-v'], true)).toBe(false)
		expect(shouldNotifyUpdate(['--help', 'install'], true)).toBe(false)
	})

	it('skips each blocked command', () => {
		for (const command of ['update', 'hooks', 'uninstall', 'self-update']) {
			expect(shouldNotifyUpdate([command], true)).toBe(false)
		}
	})

	it('allows normal and unknown commands', () => {
		expect(shouldNotifyUpdate(['install'], true)).toBe(true)
		expect(shouldNotifyUpdate(['interactive'], true)).toBe(true)
		expect(shouldNotifyUpdate(['some-future-command'], true)).toBe(true)
	})

	it('requires a TTY', () => {
		expect(shouldNotifyUpdate(['install'], false)).toBe(false)
	})
})

describe('maybeNotifyUpdate', () => {
	const NOW = 1_000_000_000
	let tempDir: string | undefined
	let lines: string[]

	afterEach(() => {
		vi.unstubAllEnvs()
		vi.unstubAllGlobals()
		if (tempDir && fs.pathExistsSync(tempDir)) {
			fs.removeSync(tempDir)
			tempDir = undefined
		}
	})

	function installFixture(version = '1.0.0'): string {
		tempDir = fs.mkdtempSync(path.join(BASE, 'notify-'))
		const prefix = path.join(tempDir, 'prefix')
		const shareDir = path.join(prefix, 'share', 'wayforge')
		fs.mkdirpSync(path.join(shareDir, 'base'))
		fs.writeFileSync(path.join(shareDir, 'VERSION'), `${version}\n`, 'utf8')
		fs.mkdirpSync(path.join(prefix, 'bin'))
		vi.stubEnv('WAYFORGE_VERSION', '')
		vi.stubEnv('WAYFORGE_STATE_DIR', path.join(tempDir, 'state'))
		vi.stubEnv('WAYFORGE_HOME', shareDir)
		vi.stubGlobal('process', {
			...process,
			execPath: path.join(prefix, 'bin', 'wfg.exe'),
		})
		return shareDir
	}

	function notifyOptions(
		overrides: {
			isTTY?: boolean
			fetchImpl?: typeof fetch
			now?: number
		} = {},
	) {
		lines = []
		return {
			isTTY: overrides.isTTY ?? true,
			fetchImpl: overrides.fetchImpl,
			now: overrides.now ?? NOW,
			stderr: (line: string) => {
				lines.push(line)
			},
		}
	}

	function seedCache(overrides: Partial<UpdateCache> = {}): void {
		const stateDir = resolveUpdateStateDir()
		writeUpdateCache(
			{
				schemaVersion: CACHE_SCHEMA_VERSION,
				lastChecked: NOW,
				latestVersion: null,
				notifiedVersion: null,
				...overrides,
			},
			stateDir,
		)
	}

	it('prints the exact notice and caches the result', async () => {
		installFixture()
		const fetchMock = vi.fn(async () => ({
			ok: true,
			url: 'https://github.com/Macacoders/wayforge/releases/tag/v9.0.0',
		})) as unknown as typeof fetch

		await maybeNotifyUpdate(notifyOptions({ fetchImpl: fetchMock }))

		expect(lines).toEqual([
			"[wayforge] update available: v9.0.0 (current v1.0.0). Run 'wfg self-update' to upgrade.\n",
		])
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(readUpdateCache(resolveUpdateStateDir())).toEqual({
			schemaVersion: CACHE_SCHEMA_VERSION,
			lastChecked: NOW,
			latestVersion: 'v9.0.0',
			notifiedVersion: 'v9.0.0',
		})
	})

	it('does not fetch or print again for a notified version', async () => {
		installFixture()
		const fetchMock = vi.fn() as unknown as typeof fetch
		seedCache({ latestVersion: 'v9.0.0', notifiedVersion: 'v9.0.0' })

		await maybeNotifyUpdate(notifyOptions({ fetchImpl: fetchMock }))

		expect(lines).toEqual([])
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('prints once per latestVersion from a fresh cache without fetching', async () => {
		installFixture()
		const fetchMock = vi.fn() as unknown as typeof fetch
		seedCache({ latestVersion: 'v9.0.0', notifiedVersion: null })

		await maybeNotifyUpdate(notifyOptions({ fetchImpl: fetchMock }))

		expect(lines).toHaveLength(1)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('respects WAYFORGE_NO_UPDATE_CHECK=1', async () => {
		installFixture()
		const fetchMock = vi.fn() as unknown as typeof fetch
		vi.stubEnv('WAYFORGE_NO_UPDATE_CHECK', '1')

		await maybeNotifyUpdate(notifyOptions({ fetchImpl: fetchMock }))

		expect(lines).toEqual([])
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('is skipped in CI', async () => {
		installFixture()
		const fetchMock = vi.fn() as unknown as typeof fetch
		vi.stubEnv('CI', '1')

		await maybeNotifyUpdate(notifyOptions({ fetchImpl: fetchMock }))

		expect(lines).toEqual([])
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('is skipped when stdout is not a TTY', async () => {
		installFixture()
		const fetchMock = vi.fn() as unknown as typeof fetch

		await maybeNotifyUpdate(
			notifyOptions({ isTTY: false, fetchImpl: fetchMock }),
		)

		expect(lines).toEqual([])
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('is skipped when not running from an installed binary', async () => {
		vi.stubEnv('WAYFORGE_STATE_DIR', path.join(BASE, 'unused-state'))
		const fetchMock = vi.fn() as unknown as typeof fetch

		await maybeNotifyUpdate(notifyOptions({ fetchImpl: fetchMock }))

		expect(lines).toEqual([])
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('never throws on network failure and stays silent', async () => {
		installFixture()
		const fetchMock = vi.fn(async () => {
			throw new Error('network down')
		}) as unknown as typeof fetch

		await expect(
			maybeNotifyUpdate(notifyOptions({ fetchImpl: fetchMock })),
		).resolves.toBeUndefined()

		expect(lines).toEqual([])
		expect(readUpdateCache(resolveUpdateStateDir())).toEqual({
			schemaVersion: CACHE_SCHEMA_VERSION,
			lastChecked: NOW,
			latestVersion: null,
			notifiedVersion: null,
		})
	})

	it('caches a failed attempt so the next 24 hours make no fetch', async () => {
		installFixture()
		const failing = vi.fn(async () => {
			throw new Error('network down')
		}) as unknown as typeof fetch
		await maybeNotifyUpdate(notifyOptions({ fetchImpl: failing }))

		const fetchMock = vi.fn(async () => ({
			ok: true,
			url: 'https://github.com/Macacoders/wayforge/releases/tag/v9.0.0',
		})) as unknown as typeof fetch
		await maybeNotifyUpdate(
			notifyOptions({
				fetchImpl: fetchMock,
				now: NOW + 60 * 60 * 1000,
			}),
		)

		expect(fetchMock).not.toHaveBeenCalled()
		expect(lines).toEqual([])
	})

	it('emits the notice before the awaited call resolves', async () => {
		installFixture()
		const order: string[] = []
		const fetchMock = vi.fn(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0))
			return {
				ok: true,
				url: 'https://github.com/Macacoders/wayforge/releases/tag/v9.0.0',
			}
		}) as unknown as typeof fetch

		await maybeNotifyUpdate({
			isTTY: true,
			fetchImpl: fetchMock,
			now: NOW,
			stderr: () => {
				order.push('notice')
			},
		})
		order.push('command')

		expect(order).toEqual(['notice', 'command'])
	})

	it('refreshes a stale cache and prints the new notice', async () => {
		installFixture()
		const fetchMock = vi.fn(async () => ({
			ok: true,
			url: 'https://github.com/Macacoders/wayforge/releases/tag/v9.0.0',
		})) as unknown as typeof fetch
		seedCache({
			lastChecked: NOW - 25 * 60 * 60 * 1000,
			latestVersion: 'v1.0.0',
			notifiedVersion: 'v1.0.0',
		})

		await maybeNotifyUpdate(notifyOptions({ fetchImpl: fetchMock }))

		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(lines).toEqual([
			"[wayforge] update available: v9.0.0 (current v1.0.0). Run 'wfg self-update' to upgrade.\n",
		])
		expect(readUpdateCache(resolveUpdateStateDir())?.latestVersion).toBe('v9.0.0')
	})

	it('stays silent when the installed version is up to date', async () => {
		installFixture('9.0.0')
		const fetchMock = vi.fn(async () => ({
			ok: true,
			url: 'https://github.com/Macacoders/wayforge/releases/tag/v9.0.0',
		})) as unknown as typeof fetch

		await maybeNotifyUpdate(notifyOptions({ fetchImpl: fetchMock }))

		expect(lines).toEqual([])
	})
})
