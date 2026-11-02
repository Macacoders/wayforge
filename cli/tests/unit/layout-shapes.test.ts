import { describe, it, expect } from 'vitest'
import {
	PLUGIN_ENTRY,
	RUNTIME_SHAPES,
	RUNTIMES,
	configFileFor,
	pluginEntriesFor,
	schemaUrlFor,
} from '../../src/lib/layout.js'
import type { Runtime } from '../../src/types.js'

const expected = {
	opencode: {
		configFile: 'opencode.jsonc',
		schemaUrl: 'https://opencode.ai/config.json',
		keys: {
			agents: 'agents',
			providers: 'providers',
			plugins: 'plugins',
			permissions: 'permissions',
		},
		pluginEntries: [
			'./.agents/plugins/ponytail',
			'./.agents/plugins/session-tracker',
			'./.agents/plugins/token-counter',
		],
		minimumOpenCodeMajor: 2,
	},
	kilocode: {
		configFile: 'kilo.jsonc',
		schemaUrl: 'https://app.kilo.ai/config.json',
		keys: {
			agents: 'agent',
			providers: 'provider',
			plugins: 'plugin',
			permissions: 'permission',
		},
		pluginEntries: [
			'./.agents/plugins/ponytail/ponytail.mjs',
			'./.agents/plugins/session-tracker/index.js',
			'./.agents/plugins/token-counter/index.js',
		],
		minimumOpenCodeMajor: undefined,
	},
} satisfies Record<Runtime, object>

describe.each(RUNTIMES)('RUNTIME_SHAPES[%s]', (runtime) => {
	it('matches the descriptor table', () => {
		expect(RUNTIME_SHAPES[runtime]).toEqual(expected[runtime])
	})

	it('exposes configFileFor from the descriptor', () => {
		expect(configFileFor(runtime)).toBe(
			RUNTIME_SHAPES[runtime].configFile,
		)
	})

	it('exposes the schema URL from the descriptor', () => {
		expect(schemaUrlFor(runtime)).toBe(expected[runtime].schemaUrl)
	})

	it('exposes plugin entries from the descriptor', () => {
		expect(pluginEntriesFor(runtime)).toEqual(
			expected[runtime].pluginEntries,
		)
		for (const entry of pluginEntriesFor(runtime)) {
			expect(entry.startsWith('./.agents/plugins/')).toBe(true)
			expect(entry).not.toContain('.opencode/')
			expect(entry).not.toContain('\\')
		}
	})
})

describe('RUNTIMES', () => {
	it('contains exactly opencode and kilocode', () => {
		expect(RUNTIMES).toEqual(['opencode', 'kilocode'])
	})
})

describe('plugin entry shapes', () => {
	it('uses directory entries for opencode', () => {
		for (const entry of pluginEntriesFor('opencode')) {
			expect(entry).not.toMatch(/\.(mjs|js)$/)
		}
	})

	it('uses file entries for kilocode', () => {
		for (const entry of pluginEntriesFor('kilocode')) {
			expect(entry).toMatch(/\/[^/]+\.(mjs|js)$/)
		}
	})
})

describe('PLUGIN_ENTRY', () => {
	it('is the ponytail V1 file entry', () => {
		expect(PLUGIN_ENTRY).toBe('./.agents/plugins/ponytail/ponytail.mjs')
	})

	it('is included in the kilocode plugin entries', () => {
		expect(pluginEntriesFor('kilocode')).toContain(PLUGIN_ENTRY)
	})
})

describe('minimumOpenCodeMajor', () => {
	it('is 2 for opencode and undefined for kilocode', () => {
		expect(RUNTIME_SHAPES.opencode.minimumOpenCodeMajor).toBe(2)
		expect(RUNTIME_SHAPES.kilocode.minimumOpenCodeMajor).toBeUndefined()
	})
})

describe('pluginEntriesFor immutability', () => {
	it('returns a fresh array so mutation does not leak', () => {
		const entries = pluginEntriesFor('opencode')
		entries.push('./.agents/plugins/injected')
		expect(pluginEntriesFor('opencode')).not.toContain(
			'./.agents/plugins/injected',
		)
	})
})
