import path from 'path'
import type { Runtime } from '../types.js'

/** Canonical installed artifact tree for every runtime. */
export const ARTIFACT_ROOT = '.agents'

/** Legacy installed tree written by earlier installer versions. */
export const LEGACY_ARTIFACT_ROOT = '.opencode'

/** Categories installed into the artifact tree. */
export const CONTENT_CATEGORIES = [
	'agents',
	'commands',
	'skills',
	'plugins',
] as const

type ContentCategory = (typeof CONTENT_CATEGORIES)[number]

/** Categories read as generation inputs; never installed. */
export type InputCategory = 'config' | 'permissions'

/** Runtime-specific native directory used to reach the artifact tree. */
export const RUNTIME_POINTER_DIRS: Record<Runtime, string> = {
	opencode: '.opencode',
	kilocode: '.kilo',
}

/** Generated runtime config filename. */
const CONFIG_FILES: Record<Runtime, string> = {
	opencode: 'opencode.jsonc',
	kilocode: 'kilo.jsonc',
}

/** Every supported runtime. */
export const RUNTIMES = Object.keys(CONFIG_FILES) as Runtime[]

/** Repo-relative generated config path for a runtime. */
export function configFileFor(runtime: Runtime): string {
	return CONFIG_FILES[runtime]
}

/** Categories reached through a runtime directory pointer. */
export const POINTER_CATEGORIES = ['agents', 'commands'] as const

/** Repo-relative pointer directories for a runtime. */
export function pointerPathsFor(runtime: Runtime): string[] {
	const root = RUNTIME_POINTER_DIRS[runtime]
	return POINTER_CATEGORIES.map((category) => `${root}/${category}`)
}

/** Every runtime's pointer directories. */
export const POINTER_PATHS = RUNTIMES.flatMap((runtime) =>
	pointerPathsFor(runtime),
)

/** Normalize Windows backslashes to POSIX forward slashes. */
export function posixPath(p: string): string {
	return p.replace(/\\/g, '/')
}

/** True when a manifest path is a runtime pointer directory. */
export function isPointerPath(relPath: string): boolean {
	return POINTER_PATHS.includes(posixPath(relPath))
}

/** Generated config entry for the bundled plugin. */
export const PLUGIN_ENTRY = `./${ARTIFACT_ROOT}/plugins/ponytail/ponytail.mjs`

/** Generated config path for skill discovery. */
export const SKILLS_CONFIG_PATH = `./${ARTIFACT_ROOT}/skills`

/** Source directory holding a category's templates. */
export function sourceDirFor(
	sourceDir: string,
	category: ContentCategory | InputCategory,
): string {
	return path.join(sourceDir, 'base', category)
}

/** Installed tree-relative path for a category entry. */
export function destRelFor(
	category: ContentCategory,
	subpath?: string,
): string {
	return subpath
		? `${ARTIFACT_ROOT}/${category}/${subpath}`
		: `${ARTIFACT_ROOT}/${category}`
}

function isContentCategory(value: string): value is ContentCategory {
	return (CONTENT_CATEGORIES as readonly string[]).includes(value)
}

interface ArtifactRelPath {
	category: ContentCategory
	subpath: string
}

/** Split an artifact path under the canonical or legacy root. */
function parseArtifactRel(relPath: string): ArtifactRelPath | null {
	const normalized = posixPath(relPath)
	for (const root of [ARTIFACT_ROOT, LEGACY_ARTIFACT_ROOT]) {
		const prefix = `${root}/`
		if (!normalized.startsWith(prefix)) {
			continue
		}

		const rest = normalized.slice(prefix.length)
		const separator = rest.indexOf('/')
		if (separator <= 0) {
			return null
		}

		const category = rest.slice(0, separator)
		const subpath = rest.slice(separator + 1)
		if (!isContentCategory(category) || !subpath) {
			return null
		}

		return { category, subpath }
	}

	return null
}

/** True when a managed path was written by a legacy `.opencode` install. */
export function isLegacyManagedPath(relPath: string): boolean {
	return posixPath(relPath).startsWith(`${LEGACY_ARTIFACT_ROOT}/`)
}

/**
 * Canonical destination for a managed path, translating legacy `.opencode`
 * prefixes into the `.agents/` tree.
 */
export function destRelForManagedPath(relPath: string): string | null {
	const parsed = parseArtifactRel(relPath)
	return parsed ? destRelFor(parsed.category, parsed.subpath) : null
}

/**
 * Source file for a managed artifact path, or null when the path does not
 * belong to a content category under the canonical or legacy root.
 */
export function sourceForDest(
	sourceDir: string,
	relPath: string,
): string | null {
	const parsed = parseArtifactRel(relPath)
	return parsed
		? path.join(sourceDirFor(sourceDir, parsed.category), parsed.subpath)
		: null
}
