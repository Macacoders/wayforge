import path from 'path'
import fs from 'fs-extra'
import { resolveSourceDir } from './source-dir.js'

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

interface ParsedVersion {
	major: number
	minor: number
	patch: number
	prerelease: string[] | undefined
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
		prerelease: match[4] ? match[4].split('.') : undefined,
	}
}

function comparePrerelease(
	a: string[] | undefined,
	b: string[] | undefined,
): number {
	if (!a && !b) return 0
	// A version without a prerelease is newer than one with it.
	if (!a) return 1
	if (!b) return -1
	const shared = Math.min(a.length, b.length)
	for (let i = 0; i < shared; i++) {
		const left = a[i]
		const right = b[i]
		const leftNum = /^\d+$/.test(left) ? Number(left) : undefined
		const rightNum = /^\d+$/.test(right) ? Number(right) : undefined
		if (leftNum !== undefined && rightNum !== undefined) {
			if (leftNum !== rightNum) return leftNum - rightNum
		} else if (leftNum !== undefined) {
			return -1
		} else if (rightNum !== undefined) {
			return 1
		} else if (left !== right) {
			return left < right ? -1 : 1
		}
	}
	// A shorter prerelease that matches a longer one's prefix is older.
	if (a.length !== b.length) return a.length < b.length ? -1 : 1
	return 0
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
	return comparePrerelease(va.prerelease, vb.prerelease)
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
