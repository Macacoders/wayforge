import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import { resolveSourceDir } from '../../src/lib/source-dir.js'

describe('resolveSourceDir', () => {
	const originalEnv = process.env.AI_CONFIG_HOME
	const originalExecPath = process.execPath
	const originalVersionsBun = process.versions.bun

	beforeEach(() => {
		vi.resetModules()
	})

	afterEach(() => {
		vi.unstubAllEnvs()
		vi.restoreAllMocks()
		if (originalEnv === undefined) {
			delete process.env.AI_CONFIG_HOME
		} else {
			process.env.AI_CONFIG_HOME = originalEnv
		}
		Object.defineProperty(process, 'execPath', {
			value: originalExecPath,
			writable: true,
			configurable: true,
		})
		Object.defineProperty(process.versions, 'bun', {
			value: originalVersionsBun,
			writable: true,
			configurable: true,
		})
	})

	it('returns AI_CONFIG_HOME when env var is set', () => {
		const customPath = '/custom/ai/config/path'
		vi.stubEnv('AI_CONFIG_HOME', customPath)

		const result = resolveSourceDir()

		expect(result).toBe(path.resolve(customPath))
	})

	it('treats empty-string AI_CONFIG_HOME as unset', () => {
		vi.stubEnv('AI_CONFIG_HOME', '')
		Object.defineProperty(process.versions, 'bun', {
			value: undefined,
			writable: true,
			configurable: true,
		})

		const result = resolveSourceDir()

		// Should fall through to dev fallback
		const expectedDevFallback = path.resolve(__dirname, '..', '..', '..')
		expect(result).toBe(expectedDevFallback)
	})

	it('returns dirname of execPath when process.versions.bun is truthy', () => {
		delete process.env.AI_CONFIG_HOME
		const binaryPath = '/opt/ai-config/bin/ai-config'
		Object.defineProperty(process, 'execPath', {
			value: binaryPath,
			writable: true,
			configurable: true,
		})
		Object.defineProperty(process.versions, 'bun', {
			value: '1.0.0',
			writable: true,
			configurable: true,
		})

		const result = resolveSourceDir()

		expect(result).toBe(path.dirname(binaryPath))
	})

	it('returns repo root via dev fallback when env unset and not compiled', () => {
		delete process.env.AI_CONFIG_HOME
		Object.defineProperty(process.versions, 'bun', {
			value: undefined,
			writable: true,
			configurable: true,
		})

		const result = resolveSourceDir()

		// Helper is at cli/src/lib/source-dir.ts, so __dirname in helper = <repo>/cli/src/lib
		// path.resolve(<repo>/cli/src/lib, '..', '..', '..') = <repo>
		// Test is at cli/tests/unit/source-dir.test.ts, so __dirname in test = <repo>/cli/tests/unit
		// path.resolve(<repo>/cli/tests/unit, '..', '..', '..') = <repo>
		const expectedRepoRoot = path.resolve(__dirname, '..', '..', '..')
		expect(result).toBe(expectedRepoRoot)
		expect(result.endsWith('ai-config')).toBe(true)
	})
})
