import { describe, it, expect, vi } from 'vitest'

vi.mock('child_process', () => ({
	execFileSync: vi.fn(() => '2.2.5'),
}))

import { execFileSync } from 'child_process'
import {
	parseRuntimeMajor,
	detectOpenCodeVersion,
	assertRuntimeSupported,
} from '../../src/lib/runtime-version.js'

describe('parseRuntimeMajor', () => {
	it('parses bare versions', () => {
		expect(parseRuntimeMajor('2.2.5')).toBe(2)
	})

	it('parses v-prefixed versions', () => {
		expect(parseRuntimeMajor('v2.2.5')).toBe(2)
	})

	it('trims surrounding whitespace and newlines', () => {
		expect(parseRuntimeMajor('  1.19.5\n')).toBe(1)
	})

	it('returns undefined on garbage, empty, and non-leading versions', () => {
		expect(parseRuntimeMajor('not-a-version')).toBeUndefined()
		expect(parseRuntimeMajor('')).toBeUndefined()
		expect(parseRuntimeMajor('opencode 1.19.5')).toBeUndefined()
	})
})

describe('detectOpenCodeVersion', () => {
	it('prefers a non-empty env override', () => {
		const result = detectOpenCodeVersion({
			env: { WAYFORGE_OPENCODE_VERSION: '2.2.5' },
			runner: () => '1.19.5',
		})

		expect(result).toEqual({ version: '2.2.5', source: 'env' })
	})

	it('trims the env override', () => {
		const result = detectOpenCodeVersion({
			env: { WAYFORGE_OPENCODE_VERSION: '  v2.2.5\n' },
			runner: () => '1.19.5',
		})

		expect(result).toEqual({ version: 'v2.2.5', source: 'env' })
	})

	it('treats an empty or whitespace-only env value as unset', () => {
		const empty = detectOpenCodeVersion({
			env: { WAYFORGE_OPENCODE_VERSION: '' },
			runner: () => '2.2.5',
		})
		const blank = detectOpenCodeVersion({
			env: { WAYFORGE_OPENCODE_VERSION: '   ' },
			runner: () => '2.2.5',
		})

		expect(empty).toEqual({ version: '2.2.5', source: 'binary' })
		expect(blank).toEqual({ version: '2.2.5', source: 'binary' })
	})

	it('uses the runner when no env override is set', () => {
		const result = detectOpenCodeVersion({ runner: () => '2.2.5\n' })

		expect(result).toEqual({ version: '2.2.5', source: 'binary' })
	})

	it('reports a warning when the runner throws', () => {
		const result = detectOpenCodeVersion({
			runner: () => {
				throw new Error('ENOENT')
			},
		})

		expect(result.source).toBe('binary')
		expect(result.warning).toContain('could not determine')
		expect(result.warning).toContain('assuming OpenCode 2.x')
	})

	it('reports a warning on unparsable output', () => {
		const result = detectOpenCodeVersion({ runner: () => 'garbage' })

		expect(result).toEqual({
			version: 'garbage',
			source: 'binary',
			warning: expect.stringContaining('could not determine'),
		})
	})
})

describe('assertRuntimeSupported', () => {
	it('passes with an env override at 2.x', () => {
		const result = assertRuntimeSupported('opencode', {
			env: { WAYFORGE_OPENCODE_VERSION: '2.2.5' },
			runner: () => '1.19.5',
		})

		expect(result).toEqual({ ok: true, version: '2.2.5', source: 'env' })
	})

	it('parses a v-prefixed env override', () => {
		const result = assertRuntimeSupported('opencode', {
			env: { WAYFORGE_OPENCODE_VERSION: 'v2.2.5' },
		})

		expect(result).toEqual({ ok: true, version: 'v2.2.5', source: 'env' })
	})

	it('fails when the env override is below the minimum', () => {
		const result = assertRuntimeSupported('opencode', {
			env: { WAYFORGE_OPENCODE_VERSION: '1.19.5' },
		})

		expect(result.ok).toBe(false)
		if (!result.ok) {
			expect(result.message).toContain('OpenCode 2.x is required')
			expect(result.message).toContain('@opencode/cli')
			expect(result.message).toContain('1.19.5')
			expect(result.message).toContain('WAYFORGE_OPENCODE_VERSION')
		}
	})

	it('passes with a binary-reported 2.x', () => {
		const result = assertRuntimeSupported('opencode', {
			runner: () => '2.2.5',
		})

		expect(result).toEqual({ ok: true, version: '2.2.5', source: 'binary' })
	})

	it('fails when the binary reports below the minimum', () => {
		const result = assertRuntimeSupported('opencode', {
			runner: () => '1.19.5',
		})

		expect(result.ok).toBe(false)
		if (!result.ok) {
			expect(result.message).toContain('OpenCode 2.x is required')
			expect(result.message).toContain('@opencode/cli')
			expect(result.message).toContain('1.19.5')
			expect(result.message).toContain('WAYFORGE_OPENCODE_VERSION')
		}
	})

	it('passes with a warning when the runner throws', () => {
		const result = assertRuntimeSupported('opencode', {
			runner: () => {
				throw new Error('ENOENT')
			},
		})

		expect(result).toEqual({
			ok: true,
			version: 'ENOENT',
			source: 'binary',
			warning: expect.stringContaining('could not determine'),
		})
		expect(result.ok && result.warning).toContain('assuming OpenCode 2.x')
	})

	it('passes with a warning on empty or garbage runner output', () => {
		for (const output of ['', 'garbage']) {
			const result = assertRuntimeSupported('opencode', {
				runner: () => output,
			})

			expect(result.ok).toBe(true)
			expect(result.ok && result.warning).toContain('could not determine')
			expect(result.ok && result.warning).toContain('assuming OpenCode 2.x')
		}
	})

	it('falls through an empty env override to the runner', () => {
		const result = assertRuntimeSupported('opencode', {
			env: { WAYFORGE_OPENCODE_VERSION: '' },
			runner: () => '2.2.5',
		})

		expect(result).toEqual({ ok: true, version: '2.2.5', source: 'binary' })
	})

	it('skips detection for kilocode', () => {
		const runner = vi.fn(() => '1.19.5')
		const withEnv = assertRuntimeSupported('kilocode', {
			env: { WAYFORGE_OPENCODE_VERSION: '1.19.5' },
			runner,
		})
		const withoutEnv = assertRuntimeSupported('kilocode', { runner })

		expect(withEnv).toEqual({ ok: true, source: 'assumed' })
		expect(withoutEnv).toEqual({ ok: true, source: 'assumed' })
		expect(runner).not.toHaveBeenCalled()
	})
})

describe('default runner', () => {
	it('calls execFileSync with shell: true and no platform branch', () => {
		const mocked = vi.mocked(execFileSync)

		const result = detectOpenCodeVersion()

		expect(mocked).toHaveBeenCalledWith('opencode', ['--version'], {
			shell: true,
		})
		expect(result).toEqual({ version: '2.2.5', source: 'binary' })
	})
})
