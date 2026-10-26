import fs from 'fs-extra'
import path from 'path'
import { ManifestContext, MANAGED_OPENCODE_HEADER } from './context.js'
import { ensureDir, rm, writeFile } from './files.js'
import type { Provider, Runtime } from '../types.js'
import { validateFreeTierRuntime, resolveDefaultModels } from './providers.js'

export interface GenerateOptions {
	runtime: Runtime
	selected: Provider[]
	modelOverride?: string
	smallModelOverride?: string
	sourceDir: string
}

export function readFragment(sourceDir: string, subPath: string): string {
	const file = path.join(sourceDir, 'base', 'config', subPath)
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

	const schemaUrl =
		opts.runtime === 'opencode'
			? 'https://opencode.ai/config.json'
			: 'https://app.kilo.ai/config.json'

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
  "plugin": ["./.opencode/plugins/ponytail/ponytail.mjs"],
  "permission": {
    "skill": {
      "*": "allow"
    }
  }
}
`
}

export function syncGeneratedOpenCodeJsonc(
	repo: string,
	runtime: Runtime,
	opts: GenerateOptions,
	ctx: ManifestContext,
): void {
	const configFile = runtime === 'opencode' ? 'opencode.jsonc' : 'kilo.jsonc'
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
