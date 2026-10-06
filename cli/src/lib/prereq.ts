import { execFileSync } from 'child_process'

export const MIN_NODE_MAJOR = 18

export function parseNodeMajor(version: string): number | undefined {
	const match = /^v?(\d+)/.exec(version.trim())
	if (!match) return undefined
	return Number(match[1])
}

export function checkNode(opts?: {
	runner?: (cmd: string, args: string[]) => string
	minMajor?: number
}): { ok: true; version: string } | { ok: false; reason: string } {
	const minMajor = opts?.minMajor ?? MIN_NODE_MAJOR
	const runner =
		opts?.runner ??
		((cmd: string, args: string[]) => execFileSync(cmd, args).toString())

	let version: string
	try {
		version = runner('node', ['--version']).trim()
	} catch {
		return { ok: false, reason: 'not found' }
	}

	const major = parseNodeMajor(version)
	if (major === undefined) {
		return { ok: false, reason: 'not found' }
	}
	if (major < minMajor) {
		return { ok: false, reason: `too old (v${String(major)})` }
	}
	return { ok: true, version }
}
