import { execFileSync } from 'child_process'
import { RUNTIME_SHAPES } from './layout.js'
import type { Runtime } from '../types.js'

export type VersionSource = 'env' | 'binary' | 'assumed'

export interface RuntimeSupportOk {
	ok: true
	version?: string
	source: VersionSource
	warning?: string
}

export interface RuntimeSupportFailure {
	ok: false
	version?: string
	source: VersionSource
	message: string
}

export type RuntimeSupport = RuntimeSupportOk | RuntimeSupportFailure

export function parseRuntimeMajor(version: string): number | undefined {
	const match = /^v?(\d+)/.exec(version.trim())
	if (!match) return undefined
	return Number(match[1])
}

export function detectOpenCodeVersion(opts?: {
	env?: NodeJS.ProcessEnv
	runner?: (cmd: string, args: string[]) => string
}): { version?: string; source: VersionSource; warning?: string } {
	const override = opts?.env?.WAYFORGE_OPENCODE_VERSION?.trim()
	if (override) {
		return { version: override, source: 'env' }
	}

	const runner =
		opts?.runner ??
		((cmd: string, args: string[]) =>
			execFileSync(cmd, args, { shell: true }).toString())

	let raw: string
	try {
		raw = runner('opencode', ['--version']).trim()
	} catch (error) {
		raw = error instanceof Error ? error.message : String(error)
	}

	const major = parseRuntimeMajor(raw)
	if (major === undefined) {
		return {
			version: raw,
			source: 'binary',
			warning:
				'could not determine the OpenCode version; assuming OpenCode 2.x.',
		}
	}
	return { version: raw, source: 'binary' }
}

export function assertRuntimeSupported(
	runtime: Runtime,
	opts?: {
		env?: NodeJS.ProcessEnv
		runner?: (cmd: string, args: string[]) => string
	},
): RuntimeSupport {
	const minMajor = RUNTIME_SHAPES[runtime].minimumOpenCodeMajor
	if (minMajor === undefined) {
		return { ok: true, source: 'assumed' }
	}

	const detected = detectOpenCodeVersion(opts)
	const major = parseRuntimeMajor(detected.version ?? '')
	if (major === undefined) {
		return {
			ok: true,
			version: detected.version,
			source: detected.source,
			warning: detected.warning,
		}
	}
	if (major < minMajor) {
		return {
			ok: false,
			version: detected.version,
			source: detected.source,
			message:
				`OpenCode ${String(minMajor)}.x is required (found ${String(
					detected.version,
				)}). ` +
				'Install @opencode/cli or set WAYFORGE_OPENCODE_VERSION.',
		}
	}
	return {
		ok: true,
		version: detected.version,
		source: detected.source,
		warning: detected.warning,
	}
}
