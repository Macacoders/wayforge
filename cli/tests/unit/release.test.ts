import { describe, it, expect, afterEach, vi } from 'vitest'
import {
	checkForUpdate,
	resolveLatestReleaseVersion,
	resolveReleaseRoot,
} from '../../src/lib/release.js'

function makeFetchMock(finalUrl: string) {
	return vi.fn(async () => ({
		ok: true,
		url: finalUrl,
	})) as unknown as typeof fetch
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
		const fetchMock = makeFetchMock(
			'http://localhost:1/releases/tag/v0.2.0',
		)
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

describe('checkForUpdate', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
		vi.unstubAllGlobals()
	})

	it('reports an update when the latest release is newer', async () => {
		vi.stubEnv('WAYFORGE_VERSION', '1.0.2')
		vi.stubGlobal(
			'fetch',
			makeFetchMock(
				'https://github.com/Macacoders/wayforge/releases/tag/v1.1.0',
			),
		)

		await expect(checkForUpdate()).resolves.toEqual({
			current: '1.0.2',
			latest: 'v1.1.0',
			updateAvailable: true,
		})
	})

	it('reports no update when the installed version is current', async () => {
		vi.stubEnv('WAYFORGE_VERSION', '1.1.0')
		vi.stubGlobal(
			'fetch',
			makeFetchMock(
				'https://github.com/Macacoders/wayforge/releases/tag/v1.1.0',
			),
		)

		await expect(checkForUpdate()).resolves.toEqual({
			current: '1.1.0',
			latest: 'v1.1.0',
			updateAvailable: false,
		})
	})

	it('reports no update when the latest release is older', async () => {
		vi.stubEnv('WAYFORGE_VERSION', '2.0.0')
		vi.stubGlobal(
			'fetch',
			makeFetchMock(
				'https://github.com/Macacoders/wayforge/releases/tag/v1.1.0',
			),
		)

		await expect(checkForUpdate()).resolves.toEqual({
			current: '2.0.0',
			latest: 'v1.1.0',
			updateAvailable: false,
		})
	})

	it('works from a source checkout via WAYFORGE_VERSION without an install fixture', async () => {
		vi.stubEnv('WAYFORGE_VERSION', '1.0.2')
		vi.stubGlobal(
			'fetch',
			makeFetchMock(
				'https://github.com/Macacoders/wayforge/releases/tag/v1.1.0',
			),
		)

		await expect(checkForUpdate()).resolves.toEqual({
			current: '1.0.2',
			latest: 'v1.1.0',
			updateAvailable: true,
		})
	})
})
