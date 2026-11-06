import { describe, it, expect } from 'vitest'
import {
	MIN_NODE_MAJOR,
	parseNodeMajor,
	checkNode,
} from '../../src/lib/prereq.js'

describe('parseNodeMajor', () => {
	it('parses v-prefixed versions', () => {
		expect(parseNodeMajor('v18.0.0')).toBe(18)
	})

	it('parses bare versions', () => {
		expect(parseNodeMajor('18.0.0')).toBe(18)
	})

	it('returns undefined on garbage', () => {
		expect(parseNodeMajor('not-a-version')).toBeUndefined()
		expect(parseNodeMajor('')).toBeUndefined()
	})
})

describe('checkNode', () => {
	it('returns ok with version when node reports >= 18', () => {
		const result = checkNode({ runner: () => 'v20.11.0' })

		expect(result).toEqual({ ok: true, version: 'v20.11.0' })
	})

	it('returns too old when node reports below the minimum', () => {
		const result = checkNode({ runner: () => 'v16.20.0' })

		expect(result).toEqual({ ok: false, reason: 'too old (v16)' })
	})

	it('returns not found when the runner throws (ENOENT)', () => {
		const result = checkNode({
			runner: () => {
				throw new Error('ENOENT')
			},
		})

		expect(result).toEqual({ ok: false, reason: 'not found' })
	})

	it('honors a custom minimum major', () => {
		const result = checkNode({ runner: () => 'v18.0.0', minMajor: 20 })

		expect(result).toEqual({ ok: false, reason: 'too old (v18)' })
	})

	it('trims runner output before parsing', () => {
		const result = checkNode({ runner: () => 'v22.14.0\n' })

		expect(result).toEqual({ ok: true, version: 'v22.14.0' })
	})
})

describe('MIN_NODE_MAJOR', () => {
	it('is 18', () => {
		expect(MIN_NODE_MAJOR).toBe(18)
	})
})
