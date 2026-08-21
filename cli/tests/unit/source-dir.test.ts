import { describe, it, expect, afterEach, vi } from 'vitest'
import path from 'path'
import { resolveSourceDir } from '../../src/lib/source-dir.js'

describe('resolveSourceDir', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
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
})
