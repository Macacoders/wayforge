import fs from 'fs-extra'
import path from 'path'
import Ajv2020 from 'ajv/dist/2020.js'

// Vendored point-in-time copy of https://opencode.ai/config.json (see
// ../fixtures/README.md). Compiled once at module load so tests stay offline.
const schemaText = fs.readFileSync(
	path.join(__dirname, '../fixtures/opencode-v2-config.schema.json'),
	'utf8',
)

const ajv = new Ajv2020({
	allErrors: true,
	strict: false,
	validateFormats: false,
})

const validate = ajv.compile(JSON.parse(schemaText))

/**
 * Strip the managed header line and parse the JSON body.
 *
 * The first line is always dropped positionally because generated configs
 * always start with the managed header; the remainder is parsed as JSON.
 */
export function parseGeneratedConfig(content: string): unknown {
	const firstNewline = content.indexOf('\n')
	const body = firstNewline === -1 ? '' : content.slice(firstNewline + 1)
	return JSON.parse(body)
}

/** Validate against the vendored OpenCode V2 schema; empty list when valid. */
export function validateOpenCodeV2Config(value: unknown): string[] {
	validate(value)
	return (validate.errors ?? []).map(
		(e) => `${e.instancePath} ${e.message}`.trim(),
	)
}

/** Assert a value is a valid OpenCode V2 config; throws with joined errors. */
export function expectValidOpenCodeV2Config(value: unknown): void {
	const errors = validateOpenCodeV2Config(value)
	if (errors.length > 0) {
		throw new Error(errors.join('\n'))
	}
}
