import path from 'path'
import fs from 'fs-extra'
import { resolveSourceDir } from './source-dir.js'

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)$/

interface ParsedVersion {
	major: number
	minor: number
	patch: number
}

export function parseSemver(value: string): ParsedVersion | null {
	const match = SEMVER_RE.exec(value.trim())
	if (!match) {
		return null
	}
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
	}
}

export function compareVersions(a: string, b: string): number {
	const va = parseSemver(a)
	const vb = parseSemver(b)
	if (!va || !vb) {
		throw new Error(`Invalid semver: ${!va ? a : b}`)
	}
	if (va.major !== vb.major) return va.major - vb.major
	if (va.minor !== vb.minor) return va.minor - vb.minor
	if (va.patch !== vb.patch) return va.patch - vb.patch
	return 0
}

export function isNewer(current: string, candidate: string): boolean {
	try {
		return compareVersions(candidate, current) > 0
	} catch {
		return false
	}
}

export function displayVersion(version: string): string {
	return `v${version.replace(/^v/, '')}`
}

export function getCurrentVersion(): string {
	const fromEnv = process.env.WAYFORGE_VERSION
	if (fromEnv && fromEnv.trim() !== '') {
		return fromEnv.trim()
	}
	try {
		const versionFile = path.join(resolveSourceDir(), 'VERSION')
		const raw = fs.readFileSync(versionFile, 'utf8').trim()
		if (raw !== '') {
			return raw
		}
	} catch {
		// Fall through to the default below.
	}
	return '0.0.0'
}
