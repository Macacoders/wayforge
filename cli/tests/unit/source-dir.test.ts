import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest'
import path from 'path'
import fs from 'fs-extra'
import { resolveSourceDir } from '../../src/lib/source-dir.js'

const BASE = path.resolve(__dirname, '..', '..', '.test-source-dir')

describe('resolveSourceDir', () => {
	let tempDir: string | undefined

	beforeAll(() => {
		fs.mkdirpSync(BASE)
	})

	afterEach(() => {
		vi.unstubAllEnvs()
		vi.unstubAllGlobals()
		if (tempDir && fs.pathExistsSync(tempDir)) {
			fs.removeSync(tempDir)
			tempDir = undefined
		}
	})

	afterAll(() => {
		if (fs.pathExistsSync(BASE)) {
			fs.removeSync(BASE)
		}
	})

	it('returns AI_CONFIG_HOME when env var is set', () => {
		const customPath = '/custom/ai/config/path'
		vi.stubEnv('AI_CONFIG_HOME', customPath)

		const result = resolveSourceDir()

		expect(result).toBe(path.resolve(customPath))
	})

	it('treats empty-string AI_CONFIG_HOME as unset', () => {
		vi.stubEnv('AI_CONFIG_HOME', '')

		const result = resolveSourceDir()

		const expectedDevFallback = path.resolve(__dirname, '..', '..', '..')
		expect(result).toBe(expectedDevFallback)
	})

	it('returns repo root via dev fallback when env unset', () => {
		vi.stubEnv('AI_CONFIG_HOME', undefined)

		const result = resolveSourceDir()

		const expectedRepoRoot = path.resolve(__dirname, '..', '..', '..')
		expect(result).toBe(expectedRepoRoot)
	})

	it('resolves location-based share dir when base/ exists beside execPath', () => {
		tempDir = fs.mkdtempSync(path.join(BASE, 'installed-'))
		const prefix = path.join(tempDir, 'prefix')
		fs.mkdirpSync(path.join(prefix, 'bin'))
		fs.mkdirpSync(path.join(prefix, 'share', 'ai-config', 'base'))
		vi.stubGlobal('process', {
			...process,
			execPath: path.join(prefix, 'bin', 'ai-config'),
		})

		const result = resolveSourceDir()

		expect(result).toBe(path.join(prefix, 'share', 'ai-config'))
	})

	it('falls through to dev fallback when location-based base/ is absent', () => {
		tempDir = fs.mkdtempSync(path.join(BASE, 'not-installed-'))
		const prefix = path.join(tempDir, 'prefix')
		fs.mkdirpSync(path.join(prefix, 'bin'))
		vi.stubGlobal('process', {
			...process,
			execPath: path.join(prefix, 'bin', 'ai-config'),
		})

		const result = resolveSourceDir()

		const expectedDevFallback = path.resolve(__dirname, '..', '..', '..')
		expect(result).toBe(expectedDevFallback)
	})
})
