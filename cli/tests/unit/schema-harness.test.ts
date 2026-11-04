import { describe, expect, it } from 'vitest'
import {
	expectValidOpenCodeV2Config,
	parseGeneratedConfig,
	validateOpenCodeV2Config,
} from '../helpers/schema.js'
import { MANAGED_OPENCODE_HEADER } from '../../src/lib/context.js'
import fs from 'fs-extra'
import path from 'path'

const MINIMAL_VALID = {
	$schema: 'https://opencode.ai/config.json',
	agents: {},
	providers: {},
	plugins: [],
	permissions: [],
}

const fixturePath = path.join(
	__dirname,
	'../fixtures/opencode-v2-config.schema.json',
)

describe('parseGeneratedConfig', () => {
	it('strips the managed header and parses a valid JSON body', () => {
		const content = [
			MANAGED_OPENCODE_HEADER,
			'{',
			'  "$schema": "https://opencode.ai/config.json"',
			'}',
			'',
		].join('\n')
		expect(parseGeneratedConfig(content)).toEqual({
			$schema: 'https://opencode.ai/config.json',
		})
	})

	it('throws when the body after the header is not JSON', () => {
		const content = [MANAGED_OPENCODE_HEADER, 'not json at all', ''].join(
			'\n',
		)
		expect(() => parseGeneratedConfig(content)).toThrow()
	})
})

describe('validateOpenCodeV2Config', () => {
	it('returns [] for the minimal valid V2 sample', () => {
		expect(validateOpenCodeV2Config(MINIMAL_VALID)).toEqual([])
	})

	it('returns a non-empty error list for permissions as a string', () => {
		const errors = validateOpenCodeV2Config({
			...MINIMAL_VALID,
			permissions: 'allow',
		})
		expect(errors.length).toBeGreaterThan(0)
	})

	it('returns a non-empty error list for agents as an array', () => {
		const errors = validateOpenCodeV2Config({
			...MINIMAL_VALID,
			agents: [],
		})
		expect(errors.length).toBeGreaterThan(0)
	})
})

describe('expectValidOpenCodeV2Config', () => {
	it('does not throw for the minimal valid V2 sample', () => {
		expect(() => expectValidOpenCodeV2Config(MINIMAL_VALID)).not.toThrow()
	})

	it('throws naming the failing property for a single-error document', () => {
		expect(() =>
			expectValidOpenCodeV2Config({ permissions: 'allow' }),
		).toThrow(/permissions/)
	})

	it('joins multiple errors with newlines', () => {
		expect(() =>
			expectValidOpenCodeV2Config({
				permissions: 'allow',
				agents: [],
			}),
		).toThrow(/\n/)
	})
})

describe('vendored fixture', () => {
	it('has no models.dev reference and declares a $schema', () => {
		const text = fs.readFileSync(fixturePath, 'utf8')
		expect(text).not.toContain('models.dev')
		expect(text).toContain('"$schema"')
	})

	it('README names the source URL and the transform', () => {
		const readme = fs.readFileSync(
			path.join(__dirname, '../fixtures/README.md'),
			'utf8',
		)
		expect(readme).toContain('https://opencode.ai/config.json')
		expect(readme).toContain('https://models.dev/model-schema.json')
		expect(readme).toContain('"type": "string"')
	})
})
