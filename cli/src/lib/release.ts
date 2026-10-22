import path from 'path'
import os from 'os'
import fs from 'fs-extra'
import { isInstalledBinary } from './install.js'
import { getCurrentVersion, isNewer, parseSemver } from './version.js'

export const DEFAULT_RELEASE_ROOT =
	'https://github.com/Macacoders/wayforge/releases'
export const CACHE_SCHEMA_VERSION = 1
const CACHE_FILE = 'update-check.json'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 5000

const TAG_RE = /\/tag\/(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\/?$/

export interface UpdateCache {
	schemaVersion: number
	lastChecked: number
	latestVersion: string | null
	notifiedVersion: string | null
}

export function resolveReleaseRoot(): string {
	const override = process.env.WAYFORGE_RELEASE_ROOT
	if (override && override.trim() !== '') {
		return override.trim().replace(/\/+$/, '')
	}
	return DEFAULT_RELEASE_ROOT
}

export function resolveUpdateStateDir(): string {
	// Deliberately different from tracking.resolveStateDir(): this cache is
	// per-user state (XDG_STATE_HOME on Unix), not per-install data.
	const override = process.env.WAYFORGE_STATE_DIR
	if (override && override.trim() !== '') {
		return path.resolve(override.trim())
	}
	if (process.platform === 'win32') {
		const localAppData = process.env.LOCALAPPDATA
		if (localAppData && localAppData.trim() !== '') {
			return path.join(localAppData, 'wayforge')
		}
		const appData = process.env.APPDATA
		if (appData && appData.trim() !== '') {
			return path.join(appData, 'wayforge')
		}
		return path.join(os.homedir(), '.wayforge')
	}
	const xdg = process.env.XDG_STATE_HOME
	const base =
		xdg && xdg.trim() !== '' && path.isAbsolute(xdg)
			? xdg
			: path.join(os.homedir(), '.local', 'state')
	return path.join(base, 'wayforge')
}

function cachePath(stateDir: string): string {
	return path.join(stateDir, CACHE_FILE)
}

export function readUpdateCache(
	stateDir: string = resolveUpdateStateDir(),
): UpdateCache | null {
	try {
		const data = fs.readJsonSync(
			cachePath(stateDir),
		) as Partial<UpdateCache>
		if (data.schemaVersion !== CACHE_SCHEMA_VERSION) {
			return null
		}
		if (typeof data.lastChecked !== 'number') {
			return null
		}
		return {
			schemaVersion: CACHE_SCHEMA_VERSION,
			lastChecked: data.lastChecked,
			latestVersion:
				typeof data.latestVersion === 'string'
					? data.latestVersion
					: null,
			notifiedVersion:
				typeof data.notifiedVersion === 'string'
					? data.notifiedVersion
					: null,
		}
	} catch {
		return null
	}
}

export function writeUpdateCache(
	cache: UpdateCache,
	stateDir: string = resolveUpdateStateDir(),
): void {
	try {
		fs.ensureDirSync(stateDir)
		fs.writeJsonSync(cachePath(stateDir), cache)
	} catch {
		// Best effort: an unwritable state directory disables the notice.
	}
}

export function isCacheFresh(
	cache: UpdateCache | null,
	now: number = Date.now(),
): boolean {
	if (!cache) {
		return false
	}
	const age = now - cache.lastChecked
	return Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS
}

export async function resolveLatestReleaseVersion(
	options: {
		releaseRoot?: string
		fetchImpl?: typeof fetch
	} = {},
): Promise<string> {
	const root = options.releaseRoot ?? resolveReleaseRoot()
	const fetchImpl = options.fetchImpl ?? fetch
	const response = await fetchImpl(`${root}/latest`, {
		redirect: 'follow',
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		headers: { 'User-Agent': `wayforge/${getCurrentVersion()}` },
	})
	if (!response.ok) {
		throw new Error(
			`Release lookup failed with status ${String(response.status)}`,
		)
	}
	const tag = TAG_RE.exec(response.url)?.[1]
	if (!tag || !parseSemver(tag)) {
		throw new Error(`Could not parse a release tag from ${response.url}`)
	}
	return tag
}

export interface NotifyOptions {
	isTTY?: boolean
	fetchImpl?: typeof fetch
	now?: number
	stderr?: (line: string) => void
}

// Commands that must never trigger the automatic update notice. `update` and
// `hooks` do not exist yet; they are blocked defensively for #238.
const UPDATE_CHECK_BLOCKED_COMMANDS = new Set([
	'update',
	'hooks',
	'uninstall',
	'self-update',
])

export function shouldNotifyUpdate(argv: string[], isTTY: boolean): boolean {
	if (!isTTY) {
		return false
	}
	if (argv.length === 0) {
		return false
	}
	const first = argv[0]
	if (first.startsWith('-')) {
		return false
	}
	return !UPDATE_CHECK_BLOCKED_COMMANDS.has(first)
}

export async function maybeNotifyUpdate(
	options: NotifyOptions = {},
): Promise<void> {
	try {
		const env = process.env
		if (env.WAYFORGE_NO_UPDATE_CHECK === '1') {
			return
		}
		if (env.CI) {
			return
		}
		const isTTY = options.isTTY ?? process.stdout.isTTY
		if (!isTTY) {
			return
		}
		if (!isInstalledBinary()) {
			return
		}

		const stateDir = resolveUpdateStateDir()
		const now = options.now ?? Date.now()
		const current = getCurrentVersion()
		let cache = readUpdateCache(stateDir)
		if (!cache || !isCacheFresh(cache, now)) {
			const previous = cache
			try {
				const latestVersion = await resolveLatestReleaseVersion({
					fetchImpl: options.fetchImpl,
				})
				cache = {
					schemaVersion: CACHE_SCHEMA_VERSION,
					lastChecked: now,
					latestVersion,
					notifiedVersion: previous?.notifiedVersion ?? null,
				}
			} catch {
				// Cache the failed attempt too, so an outage cannot make every
				// command pay the 5-second timeout for the next 24 hours.
				cache = {
					schemaVersion: CACHE_SCHEMA_VERSION,
					lastChecked: now,
					latestVersion: previous?.latestVersion ?? null,
					notifiedVersion: previous?.notifiedVersion ?? null,
				}
			}
			writeUpdateCache(cache, stateDir)
		}

		const latest = cache.latestVersion
		if (!latest || !parseSemver(latest)) {
			return
		}
		if (!isNewer(current, latest)) {
			return
		}
		if (cache.notifiedVersion === latest) {
			return
		}
		writeUpdateCache({ ...cache, notifiedVersion: latest }, stateDir)
		const emit =
			options.stderr ?? ((line: string) => process.stderr.write(line))
		emit(
			`[wayforge] update available: ${latest} (current v${current.replace(/^v/, '')}). Run 'wfg self-update' to upgrade.\n`,
		)
	} catch {
		// The notice is informational and must never fail the command.
	}
}
