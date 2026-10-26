import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import type { ManifestContext } from './context.js'
import { ensureDir } from './files.js'
import {
	ARTIFACT_ROOT,
	POINTER_CATEGORIES,
	RUNTIME_POINTER_DIRS,
} from './layout.js'
import { isManagedFile, managedTrackFile, posixPath } from './manifest.js'
import type { Runtime } from '../types.js'

/**
 * Probe whether the platform can create directory symlinks. Windows without
 * Developer Mode/admin cannot, so callers fall back to junctions (ADR-0031).
 */
export function canSymlink(): boolean {
	try {
		const dir = fs.mkdtempSync(
			path.join(os.tmpdir(), 'wayforge-link-probe-'),
		)
		try {
			fs.mkdirSync(path.join(dir, 'target'))
			fs.symlinkSync('target', path.join(dir, 'link'), 'dir')
		} finally {
			fs.removeSync(dir)
		}
		return true
	} catch {
		return false
	}
}

/** True when a manifest path is a runtime pointer directory. */
export function isPointerPath(relPath: string): boolean {
	const normalized = posixPath(relPath)
	for (const pointerRoot of Object.values(RUNTIME_POINTER_DIRS)) {
		for (const category of POINTER_CATEGORIES) {
			if (normalized === `${pointerRoot}/${category}`) {
				return true
			}
		}
	}
	return false
}

function lstatIfExists(target: string): fs.Stats | null {
	try {
		return fs.lstatSync(target)
	} catch {
		return null
	}
}

/**
 * Files under a pointer directory that would remain after a real run. A
 * dry-run keeps managed legacy files on disk, so skip them here to report the
 * same residual set the real run leaves behind.
 */
function collectResiduals(root: string, ctx: ManifestContext): string[] {
	const found: string[] = []
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		const full = path.join(root, entry.name)
		if (ctx.dryRun && isManagedFile(full)) {
			continue
		}
		found.push(full)
		if (entry.isDirectory() && !entry.isSymbolicLink()) {
			found.push(...collectResiduals(full, ctx))
		}
	}
	return found
}

function pointsAt(link: string, relativeTarget: string): boolean {
	const raw = fs.readlinkSync(link)
	if (posixPath(raw) === relativeTarget) {
		return true
	}
	const base = path.dirname(link)
	return path.resolve(base, raw) === path.resolve(base, relativeTarget)
}

/**
 * Create the runtime-native pointers that make `.agents/` visible to a runtime.
 *
 * Uses a relative directory symlink when the platform supports it, otherwise a
 * junction with an absolute target. Existing correct pointers are re-tracked;
 * empty directories are replaced; anything else is reported and left untouched.
 *
 * ponytail: debt — generated stub files (copying `.agents/` content into the
 * native directory) are deferred; the chain is symlink → junction → stub
 * (ADR-0046 decision 6).
 *
 * Returns the repo-relative paths that blocked a pointer, if any.
 */
export function ensureRuntimePointers(
	repo: string,
	runtime: Runtime,
	ctx: ManifestContext,
): string[] {
	const symlinks = canSymlink()
	const pointerRoot = RUNTIME_POINTER_DIRS[runtime]
	const residuals: string[] = []

	for (const category of POINTER_CATEGORIES) {
		const link = path.join(repo, pointerRoot, category)
		const managedRel = posixPath(path.relative(repo, link))
		const relativeTarget = posixPath(
			path.join('..', ARTIFACT_ROOT, category),
		)
		const existing = lstatIfExists(link)

		if (existing) {
			if (existing.isSymbolicLink()) {
				if (pointsAt(link, relativeTarget)) {
					managedTrackFile(link, ctx)
					ctx.log(`runtime pointer already present: ${managedRel}`)
					continue
				}
				residuals.push(managedRel)
				continue
			}
			if (existing.isDirectory()) {
				const entries = collectResiduals(link, ctx)
				if (entries.length > 0) {
					residuals.push(
						...entries.map((entry) =>
							posixPath(path.relative(repo, entry)),
						),
					)
					continue
				}
				if (ctx.dryRun) {
					ctx.log(
						`DRY-RUN: would remove empty directory: ${managedRel}`,
					)
				} else {
					fs.rmdirSync(link)
					ctx.log(`removed empty directory: ${managedRel}`)
				}
			} else {
				residuals.push(managedRel)
				continue
			}
		}

		const target = symlinks
			? relativeTarget
			: path.resolve(path.dirname(link), relativeTarget)
		const type = symlinks ? 'dir' : 'junction'

		if (ctx.dryRun) {
			ctx.log(
				`DRY-RUN: would create ${type} pointer: ${managedRel} -> ${target}`,
			)
			continue
		}

		ensureDir(path.dirname(link), ctx)
		fs.symlinkSync(target, link, type)
		managedTrackFile(link, ctx)
		ctx.log(`created ${type} pointer: ${managedRel} -> ${target}`)
	}

	if (residuals.length > 0) {
		ctx.log(
			`error: cannot expose ${ARTIFACT_ROOT} artifacts to ${runtime}: ` +
				`${String(residuals.length)} path(s) block the runtime pointer(s)`,
		)
		for (const residual of residuals) {
			ctx.log(`  - ${residual}`)
		}
		ctx.log(
			`  move these paths into ${ARTIFACT_ROOT}/ or remove them, then rerun the install`,
		)
	}

	return residuals
}
