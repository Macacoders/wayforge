import { describe, it, expect, afterEach, vi } from 'vitest'
import {
	checkForUpdate,
	resolveLatestReleaseVersion,
	resolveReleaseRoot,
} from '../../src/lib/release.js'

const RELEASE_ROOT = 'https://github.com/Macacoders/wayforge/releases'
const LOOKUP_URL = `${RELEASE_ROOT}/latest`

function redirectMock(location: string, requestUrl = LOOKUP_URL) {
	return vi.fn(async () => ({
		ok: false,
		status: 302,
		url: requestUrl,
		headers: new Headers({ location }),
	})) as unknown as typeof fetch
}

function statusMock(status: number) {
	return vi.fn(async () => ({
		ok: false,
		status,
		headers: new Headers(),
	})) as unknown as typeof fetch
}

describe('resolveLatestReleaseVersion', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
		vi.unstubAllGlobals()
	})

	it('parses the release tag from the redirect Location header', async () => {
		const fetchMock = redirectMock(`${RELEASE_ROOT}/tag/v1.2.3`)
		vi.stubGlobal('fetch', fetchMock)

		await expect(resolveLatestReleaseVersion()).resolves.toBe('v1.2.3')
		expect(fetchMock).toHaveBeenCalledWith(
			LOOKUP_URL,
			expect.objectContaining({ redirect: 'manual' }),
		)
	})

	it('resolves a relative Location header against the lookup URL', async () => {
		vi.stubGlobal(
			'fetch',
			redirectMock(
				'/releases/tag/v1.2.3',
				'http://localhost:1/releases/latest',
			),
		)

		await expect(
			resolveLatestReleaseVersion({
				releaseRoot: 'http://localhost:1/releases',
			}),
		).resolves.toBe('v1.2.3')
	})

	it('uses WAYFORGE_RELEASE_ROOT for the lookup URL', async () => {
		const fetchMock = redirectMock(
			'http://localhost:1/releases/tag/v0.2.0',
			'http://localhost:1/releases/latest',
		)
		vi.stubGlobal('fetch', fetchMock)
		vi.stubEnv('WAYFORGE_RELEASE_ROOT', 'http://localhost:1/releases/')

		await expect(resolveLatestReleaseVersion()).resolves.toBe('v0.2.0')
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:1/releases/latest',
			expect.anything(),
		)
	})

	it('rejects a redirect without a Location header', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: false,
				status: 302,
				headers: new Headers(),
			})) as unknown as typeof fetch,
		)

		await expect(resolveLatestReleaseVersion()).rejects.toThrow(
			'without a Location header',
		)
	})

	it('rejects a Location without a release tag', async () => {
		vi.stubGlobal('fetch', redirectMock(RELEASE_ROOT))

		await expect(resolveLatestReleaseVersion()).rejects.toThrow()
	})

	it('rejects a tag that is not valid semver', async () => {
		vi.stubGlobal(
			'fetch',
			redirectMock(`${RELEASE_ROOT}/tag/not-a-version`),
		)

		await expect(resolveLatestReleaseVersion()).rejects.toThrow()
	})

	it('rejects a non-redirect response', async () => {
		vi.stubGlobal('fetch', statusMock(404))

		await expect(resolveLatestReleaseVersion()).rejects.toThrow(
			'status 404',
		)
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

describe('checkForUpdate', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
		vi.unstubAllGlobals()
	})

	it('reports an update when the latest release is newer', async () => {
		vi.stubEnv('WAYFORGE_VERSION', '1.0.2')
		vi.stubGlobal('fetch', redirectMock(`${RELEASE_ROOT}/tag/v1.1.0`))

		await expect(checkForUpdate()).resolves.toEqual({
			current: '1.0.2',
			latest: 'v1.1.0',
			updateAvailable: true,
		})
	})

	it('reports no update when the installed version is current', async () => {
		vi.stubEnv('WAYFORGE_VERSION', '1.1.0')
		vi.stubGlobal('fetch', redirectMock(`${RELEASE_ROOT}/tag/v1.1.0`))

		await expect(checkForUpdate()).resolves.toEqual({
			current: '1.1.0',
			latest: 'v1.1.0',
			updateAvailable: false,
		})
	})

	it('reports no update when the latest release is older', async () => {
		vi.stubEnv('WAYFORGE_VERSION', '2.0.0')
		vi.stubGlobal('fetch', redirectMock(`${RELEASE_ROOT}/tag/v1.1.0`))

		await expect(checkForUpdate()).resolves.toEqual({
			current: '2.0.0',
			latest: 'v1.1.0',
			updateAvailable: false,
		})
	})

	it('works from a source checkout via WAYFORGE_VERSION without an install fixture', async () => {
		vi.stubEnv('WAYFORGE_VERSION', '1.0.2')
		vi.stubGlobal('fetch', redirectMock(`${RELEASE_ROOT}/tag/v1.1.0`))

		await expect(checkForUpdate()).resolves.toEqual({
			current: '1.0.2',
			latest: 'v1.1.0',
			updateAvailable: true,
		})
	})
})
