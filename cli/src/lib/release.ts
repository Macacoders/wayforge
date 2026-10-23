import { getCurrentVersion, isNewer, parseSemver } from './version.js'

export const DEFAULT_RELEASE_ROOT =
	'https://github.com/Macacoders/wayforge/releases'
const FETCH_TIMEOUT_MS = 5000

const TAG_RE = /\/tag\/(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\/?$/

export function resolveReleaseRoot(): string {
	const override = process.env.WAYFORGE_RELEASE_ROOT
	if (override && override.trim() !== '') {
		return override.trim().replace(/\/+$/, '')
	}
	return DEFAULT_RELEASE_ROOT
}

export async function resolveLatestReleaseVersion(
	options: {
		releaseRoot?: string
		fetchImpl?: typeof fetch
	} = {},
): Promise<string> {
	const root = options.releaseRoot ?? resolveReleaseRoot()
	const fetchImpl = options.fetchImpl ?? fetch
	const requestUrl = `${root}/latest`
	const response = await fetchImpl(requestUrl, {
		// Manual redirects keep the release page body off the wire; the tag
		// lives in the Location header.
		redirect: 'manual',
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		headers: { 'User-Agent': `wayforge/${getCurrentVersion()}` },
	})

	const isRedirect = response.status >= 300 && response.status < 400
	if (!isRedirect) {
		throw new Error(
			`Release lookup failed with status ${String(response.status)}`,
		)
	}
	const location = response.headers.get('location')
	if (!location) {
		throw new Error(
			`Release lookup redirected without a Location header: ${requestUrl}`,
		)
	}
	const redirectUrl = new URL(location, requestUrl)

	const tag = TAG_RE.exec(redirectUrl.pathname)?.[1]
	if (!tag || !parseSemver(tag)) {
		throw new Error(
			`Could not parse a release tag from ${redirectUrl.href}`,
		)
	}
	return tag
}

export interface ReleaseCheck {
	current: string
	latest: string
	updateAvailable: boolean
}

export async function checkForUpdate(
	options: { releaseRoot?: string; fetchImpl?: typeof fetch } = {},
): Promise<ReleaseCheck> {
	const current = getCurrentVersion()
	const latest = await resolveLatestReleaseVersion(options)
	return { current, latest, updateAvailable: isNewer(current, latest) }
}
