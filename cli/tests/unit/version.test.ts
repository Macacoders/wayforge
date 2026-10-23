import { describe, it, expect, afterEach, vi } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs-extra'
import {
	compareVersions,
	isNewer,
	getCurrentVersion,
} from '../../src/lib/version.js'

describe('compareVersions', () => {
	it('compares minor releases numerically (0.10.0 > 0.9.0)', () => {
		expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
		expect(compareVersions('0.9.0', '0.10.0')).toBeLessThan(0)
	})

	it('treats equal versions as equal', () => {
		expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
		expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
	})

	it('compares major and patch fields', () => {
		expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0)
		expect(compareVersions('1.2.4', '1.2.3')).toBeGreaterThan(0)
	})

	it('ranks a stable release above its prerelease', () => {
		expect(compareVersions('1.0.0', '1.0.0-alpha')).toBeGreaterThan(0)
		expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBeLessThan(0)
	})

	it('compares prerelease identifiers', () => {
		expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha')).toBeGreaterThan(
			0,
		)
		expect(compareVersions('1.0.0-beta', '1.0.0-alpha')).toBeGreaterThan(0)
		expect(compareVersions('1.0.0-alpha', '1.0.0-alpha')).toBe(0)
	})

	it('throws on invalid semver', () => {
		expect(() => compareVersions('not-a-version', '1.0.0')).toThrow()
	})
})

describe('isNewer', () => {
	it('returns true when the candidate is newer', () => {
		expect(isNewer('0.9.0', '0.10.0')).toBe(true)
		expect(isNewer('1.0.0-alpha', '1.0.0')).toBe(true)
	})

	it('returns false when equal or older', () => {
		expect(isNewer('1.0.0', '1.0.0')).toBe(false)
		expect(isNewer('0.10.0', '0.9.0')).toBe(false)
		expect(isNewer('1.0.0', '1.0.0-alpha')).toBe(false)
	})

	it('returns false for invalid input instead of throwing', () => {
		expect(isNewer('1.0.0', 'garbage')).toBe(false)
		expect(isNewer('garbage', '1.0.0')).toBe(false)
	})
})

describe('getCurrentVersion', () => {
	const tempDirs: string[] = []

	afterEach(() => {
		vi.unstubAllEnvs()
		for (const dir of tempDirs.splice(0)) {
			if (fs.pathExistsSync(dir)) {
				fs.removeSync(dir)
			}
		}
	})

	function makeSourceDir(version?: string): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wayforge-version-'))
		tempDirs.push(dir)
		if (version !== undefined) {
			fs.writeFileSync(path.join(dir, 'VERSION'), `${version}\n`, 'utf8')
		}
		return dir
	}

	it('prefers WAYFORGE_VERSION when non-empty', () => {
		vi.stubEnv('WAYFORGE_VERSION', '9.8.7')
		expect(getCurrentVersion()).toBe('9.8.7')
	})

	it('treats empty-string WAYFORGE_VERSION as unset', () => {
		const sourceDir = makeSourceDir('3.4.5')
		vi.stubEnv('WAYFORGE_VERSION', '')
		vi.stubEnv('WAYFORGE_HOME', sourceDir)
		expect(getCurrentVersion()).toBe('3.4.5')
	})

	it('reads VERSION from the source dir', () => {
		const sourceDir = makeSourceDir('2.3.4')
		vi.stubEnv('WAYFORGE_HOME', sourceDir)
		expect(getCurrentVersion()).toBe('2.3.4')
	})

	it('falls back to 0.0.0 when VERSION is missing', () => {
		const sourceDir = makeSourceDir()
		vi.stubEnv('WAYFORGE_HOME', sourceDir)
		expect(getCurrentVersion()).toBe('0.0.0')
	})
})
