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

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number]

/** Categories read as generation inputs; never installed. */
export const INPUT_CATEGORIES = ['config', 'permissions'] as const

export type InputCategory = (typeof INPUT_CATEGORIES)[number]

/** Runtime-specific native directory used to reach the artifact tree. */
export const RUNTIME_POINTER_DIRS: Record<Runtime, string> = {
	opencode: '.opencode',
	kilocode: '.kilo',
}

/** Categories reached through a runtime directory pointer. */
export const POINTER_CATEGORIES = ['agents', 'commands'] as const

export type PointerCategory = (typeof POINTER_CATEGORIES)[number]

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

/**
 * Source file for a managed artifact path, or null when the path does not
 * belong to a content category in the canonical tree.
 */
export function sourceForDest(
	sourceDir: string,
	relPath: string,
): string | null {
	const prefix = `${ARTIFACT_ROOT}/`
	if (!relPath.startsWith(prefix)) {
		return null
	}

	const rest = relPath.slice(prefix.length)
	const separator = rest.indexOf('/')
	if (separator <= 0) {
		return null
	}

	const category = rest.slice(0, separator)
	const subpath = rest.slice(separator + 1)
	if (!isContentCategory(category) || !subpath) {
		return null
	}

	return path.join(sourceDirFor(sourceDir, category), subpath)
}
