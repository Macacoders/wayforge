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

/** Top-level config key names a runtime expects in its generated config. */
export interface RuntimeShapeKeys {
	agents: string
	providers: string
	plugins: string
	permissions: string
}

/** Runtime-specific shape of the generated config file. */
export interface RuntimeShape {
	/** Generated runtime config filename. */
	configFile: string
	/** JSON schema URL referenced by the generated config. */
	schemaUrl: string
	/** Top-level key names used by the runtime's config schema. */
	keys: RuntimeShapeKeys
	/** Repo-relative plugin entrypoints, POSIX separators. */
	pluginEntries: readonly string[]
	/** Minimum OpenCode major version; undefined when not applicable. */
	minimumOpenCodeMajor?: number
}

function pluginEntry(name: string, file?: string): string {
	return file
		? `./${ARTIFACT_ROOT}/plugins/${name}/${file}`
		: `./${ARTIFACT_ROOT}/plugins/${name}`
}

/** Runtime-specific config shape data; the single source of truth. */
export const RUNTIME_SHAPES: Record<Runtime, RuntimeShape> = {
	opencode: {
		configFile: 'opencode.jsonc',
		schemaUrl: 'https://opencode.ai/config.json',
		keys: {
			agents: 'agents',
			providers: 'providers',
			plugins: 'plugins',
			permissions: 'permissions',
		},
		pluginEntries: [
			pluginEntry('ponytail'),
			pluginEntry('session-tracker'),
			pluginEntry('token-counter'),
		],
		minimumOpenCodeMajor: 2,
	},
	kilocode: {
		configFile: 'kilo.jsonc',
		schemaUrl: 'https://app.kilo.ai/config.json',
		keys: {
			agents: 'agent',
			providers: 'provider',
			plugins: 'plugin',
			permissions: 'permission',
		},
		pluginEntries: [
			pluginEntry('ponytail', 'ponytail.mjs'),
			pluginEntry('session-tracker', 'index.js'),
			pluginEntry('token-counter', 'index.js'),
		],
	},
}

/** Every supported runtime. */
export const RUNTIMES = Object.keys(RUNTIME_SHAPES) as Runtime[]

/** Repo-relative generated config path for a runtime. */
export function configFileFor(runtime: Runtime): string {
	return RUNTIME_SHAPES[runtime].configFile
}

/** Schema URL referenced by a runtime's generated config. */
export function schemaUrlFor(runtime: Runtime): string {
	return RUNTIME_SHAPES[runtime].schemaUrl
}

/** Plugin entrypoints for a runtime, as a fresh array. */
export function pluginEntriesFor(runtime: Runtime): string[] {
	return [...RUNTIME_SHAPES[runtime].pluginEntries]
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
