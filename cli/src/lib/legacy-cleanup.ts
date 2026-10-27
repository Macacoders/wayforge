import fs from 'fs-extra'
import path from 'path'
import { isManagedFile } from './manifest.js'
import { isLegacyManagedPath, POINTER_PATHS, posixPath } from './layout.js'

/** Whether a manifest entry is a legacy file a refresh may safely remove. */
export function isCleanupEligibleLegacyPath(
	repo: string,
	relPath: string,
	manifestPaths: readonly string[],
): boolean {
	if (
		!manifestPaths.includes(relPath) ||
		!isLegacyManagedPath(relPath) ||
		POINTER_PATHS.includes(posixPath(relPath))
	) {
		return false
	}
	// Do not resolve a legacy leaf through a link (including a runtime pointer).
	// `unlink(.opencode/agents/planner.md)` would otherwise remove the target
	// file in `.agents`, not a legacy file. Check every parent with lstat before
	// inspecting the leaf so no cleanup decision traverses a linked parent.
	const parents = posixPath(relPath).split('/').slice(0, -1)
	let parent = repo
	for (const segment of parents) {
		parent = path.join(parent, segment)
		let stat: fs.Stats
		try {
			stat = fs.lstatSync(parent)
		} catch {
			return false
		}
		if (!stat.isDirectory() || stat.isSymbolicLink()) {
			return false
		}
	}
	const absolute = path.join(repo, relPath)
	if (!fs.pathExistsSync(absolute)) return false
	const lstat = fs.lstatSync(absolute)
	return (lstat.isFile() || lstat.isSymbolicLink()) && isManagedFile(absolute)
}
