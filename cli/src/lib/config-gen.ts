import fs from 'fs-extra'
import path from 'path'
import { ManifestContext, MANAGED_OPENCODE_HEADER } from './context.js'
import { ensureDir, rm, writeFile } from './files.js'
import type { Provider, Runtime } from '../types.js'
import { validateFreeTierRuntime, resolveDefaultModels } from './providers.js'
import {
	LEGACY_ARTIFACT_ROOT,
	PLUGIN_ENTRY,
	RUNTIME_SHAPES,
	SKILLS_CONFIG_PATH,
	configFileFor,
	schemaUrlFor,
	sourceDirFor,
} from './layout.js'
import { isManagedOpenCodeFile } from './manifest.js'

export interface GenerateOptions {
	runtime: Runtime
	selected: Provider[]
	modelOverride?: string
	smallModelOverride?: string
	sourceDir: string
}

export function readFragment(sourceDir: string, subPath: string): string {
	const file = path.join(sourceDirFor(sourceDir, 'config'), subPath)
	if (!fs.pathExistsSync(file)) {
		console.error(`error: missing config fragment: ${file}`)
		process.exit(1)
	}
	// Bash $(<file) command substitution strips a single trailing newline,
	// NOT all whitespace. Preserve fragment indentation.
	const raw = fs.readFileSync(file, 'utf8')
	// Normalize CRLF -> LF so generated output stays LF-only even when the
	// working tree is checked out with CRLF (Windows). No-op on LF platforms.
	const normalized = raw.replace(/\r\n/g, '\n')
	return normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
}

export function buildEnabledProvidersJson(
	selected: Provider[],
	runtime: Runtime,
): string {
	const parts: string[] = []

	if (runtime === 'opencode') {
		parts.push('"opencode"')
	}

	for (const provider of selected) {
		if (provider === 'free-tier') {
			continue
		}
		parts.push(`"${provider}"`)
	}

	return parts.join(', ')
}

export function buildProviderBlockJson(
	selected: Provider[],
	runtime: Runtime,
	sourceDir: string,
): string {
	const fragments: string[] = []

	if (runtime === 'opencode') {
		fragments.push(
			readFragment(sourceDir, 'providers/opencode-provider-block.jsonc'),
		)
	}

	if (selected.includes('openai')) {
		fragments.push(
			readFragment(sourceDir, 'providers/openai-provider-block.jsonc'),
		)
	}

	if (selected.includes('github-copilot')) {
		fragments.push(
			readFragment(
				sourceDir,
				'providers/github-copilot-provider-block.jsonc',
			),
		)
	}

	if (selected.includes('laberit')) {
		fragments.push(
			readFragment(sourceDir, 'providers/laberit-provider-block.jsonc'),
		)
	}

	if (selected.includes('opencode-go')) {
		fragments.push(
			readFragment(
				sourceDir,
				'providers/opencode-go-provider-block.jsonc',
			),
		)
	}

	return fragments.join(',\n')
}

const OPENCODE_HIDDEN = ['build', 'general', 'explore', 'plan']
const KILOCODE_HIDDEN = [
	'plan',
	'general',
	'explore',
	'debug',
	'orchestrator',
	'ask',
]

export function buildAgentBlockJson(
	selected: Provider[],
	sourceDir: string,
	runtime: Runtime,
): string {
	let fragment: string

	if (selected.includes('openai') && selected.includes('github-copilot')) {
		fragment = readFragment(
			sourceDir,
			'agents/balanced-openai-github-copilot-agent-block.jsonc',
		)
	} else if (
		selected.includes('opencode-go') &&
		selected.includes('laberit')
	) {
		fragment = readFragment(
			sourceDir,
			'agents/balanced-opencode-go-laberit-agent-block.jsonc',
		)
	} else if (selected.length === 1 && selected[0] === 'github-copilot') {
		fragment = readFragment(
			sourceDir,
			'agents/balanced-github-copilot-only-agent-block.jsonc',
		)
	} else if (selected.length === 1 && selected[0] === 'laberit') {
		fragment = readFragment(
			sourceDir,
			'agents/balanced-laberit-only-agent-block.jsonc',
		)
	} else if (selected.length === 1 && selected[0] === 'opencode-go') {
		fragment = readFragment(
			sourceDir,
			'agents/balanced-opencode-go-only-agent-block.jsonc',
		)
	} else if (selected.every((p) => p === 'free-tier')) {
		fragment = readFragment(sourceDir, 'agents/free-tier-agent-block.jsonc')
	} else {
		fragment = readFragment(
			sourceDir,
			'agents/balanced-openai-only-agent-block.jsonc',
		)
	}

	// Append runtime-specific hidden entries before the closing }
	const hiddenAgents =
		runtime === 'kilocode' ? KILOCODE_HIDDEN : OPENCODE_HIDDEN
	const hiddenEntries = hiddenAgents
		.map((name) => `    "${name}": {\n      "hidden": true\n    }`)
		.join(',\n')

	const lastBrace = fragment.lastIndexOf('}')
	const beforeBrace = fragment.slice(0, lastBrace).trimEnd()
	const hasEntries = beforeBrace.endsWith('}')
	const separator = hasEntries ? ',\n' : '\n'

	return (
		beforeBrace +
		separator +
		hiddenEntries +
		'\n  ' +
		fragment.slice(lastBrace)
	)
}

export function generateOpenCodeJsonc(opts: GenerateOptions): string {
	validateFreeTierRuntime(opts.selected, opts.runtime)

	const defaults = resolveDefaultModels(opts.selected)
	let finalModel = defaults.model
	let finalSmallModel = defaults.smallModel

	if (opts.modelOverride) {
		finalModel = opts.modelOverride
	}
	if (opts.smallModelOverride) {
		finalSmallModel = opts.smallModelOverride
	}

	const schemaUrl = schemaUrlFor(opts.runtime)

	const enabledProvidersJson = buildEnabledProvidersJson(
		opts.selected,
		opts.runtime,
	)
	const providerBlock = buildProviderBlockJson(
		opts.selected,
		opts.runtime,
		opts.sourceDir,
	)
	const agentBlock = buildAgentBlockJson(
		opts.selected,
		opts.sourceDir,
		opts.runtime,
	)
	const agentSection = agentBlock ? `${agentBlock},\n  ` : ''

	return `${MANAGED_OPENCODE_HEADER}
{
  "\$schema": "${schemaUrl}",
  "enabled_providers": [${enabledProvidersJson}],
  "model": "${finalModel}",
  "small_model": "${finalSmallModel}",
  "default_agent": "planner",
  "share": "disabled",
  ${agentSection}"provider": {
${providerBlock}
  },
  "plugin": ["${PLUGIN_ENTRY}"],
  "skills": ["${SKILLS_CONFIG_PATH}"],
  "permission": {
    "skill": {
      "*": "allow"
    }
  }
}
`
}

/**
 * True when a wayforge-owned config still describes the legacy `.opencode`
 * layout (a migrated install deletes those plugins/skills), so it must be
 * regenerated instead of kept.
 */
export function isLayoutStaleConfig(filePath: string): boolean {
	if (!isManagedOpenCodeFile(filePath)) {
		return false
	}
	const content = fs.readFileSync(filePath, 'utf8')
	return (
		content.includes(`${LEGACY_ARTIFACT_ROOT}/`) ||
		!content.includes('"skills"')
	)
}

/** Exact top-level key match: `"key":` with closing quote, not a substring. */
function hasExactKey(content: string, key: string): boolean {
	return new RegExp(`"${key}"\\s*:`).test(content)
}

/**
 * Runtime-aware staleness check for wayforge-managed configs. Beyond the
 * legacy-layout checks shared with `isLayoutStaleConfig`, an OpenCode config
 * is stale when it lacks any native V2 key or still carries a V1 singular
 * key. Kilo configs are only judged by the shared checks for as long as
 * Kilo stays V1.
 *
 * Not wired into install yet: Plan B calls this after V2 config generation
 * lands (issue #278), so refreshing an OpenCode config does not regenerate
 * the current V1 shape and immediately judge it stale again.
 */
export function isRuntimeConfigStale(
	runtime: Runtime,
	filePath: string,
): boolean {
	if (!isManagedOpenCodeFile(filePath)) {
		return false
	}
	const content = fs.readFileSync(filePath, 'utf8')
	if (
		content.includes(`${LEGACY_ARTIFACT_ROOT}/`) ||
		!content.includes('"skills"')
	) {
		return true
	}
	if (runtime !== 'opencode') {
		return false
	}
	// Required native V2 keys for OpenCode, read explicitly from the
	// descriptor (RuntimeShapeKeys has no index signature, so Object.values
	// would degrade to any[]).
	const opencodeKeys = RUNTIME_SHAPES.opencode.keys
	const requiredKeys = [
		opencodeKeys.agents,
		opencodeKeys.providers,
		opencodeKeys.plugins,
		opencodeKeys.permissions,
	]
	// The kilocode values are the V1 singular set for as long as Kilo stays
	// V1; revisit this derivation if Kilo ships V2 (issue #277).
	const kilocodeKeys = RUNTIME_SHAPES.kilocode.keys
	const legacyKeys = [
		kilocodeKeys.agents,
		kilocodeKeys.providers,
		kilocodeKeys.plugins,
		kilocodeKeys.permissions,
	]
	return (
		requiredKeys.some((key) => !hasExactKey(content, key)) ||
		legacyKeys.some((key) => hasExactKey(content, key))
	)
}

export function syncGeneratedOpenCodeJsonc(
	repo: string,
	runtime: Runtime,
	opts: GenerateOptions,
	ctx: ManifestContext,
): void {
	const configFile = configFileFor(runtime)
	const dst = path.join(repo, configFile)
	const parent = path.dirname(dst)

	if (fs.pathExistsSync(dst)) {
		const lstat = fs.lstatSync(dst)
		if (lstat.isSymbolicLink()) {
			if (!ctx.force) {
				const target = fs.readlinkSync(dst)
				ctx.log(
					`skip existing symlink (use --force to replace): ${dst} -> ${target}`,
				)
				return
			}
			rm(dst, ctx)
		} else {
			if (!ctx.force) {
				ctx.log(
					`skip existing non-symlink (use --force to regenerate): ${dst}`,
				)
				return
			}
			rm(dst, ctx)
		}
	}

	ensureDir(parent, ctx)
	const content = generateOpenCodeJsonc(opts)
	writeFile(dst, content, ctx)
	if (!ctx.dryRun) {
		ctx.log(`wrote runtime config: ${dst}`)
	}
}
