import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import type { ManifestContext } from './context.js'
import { ensureDir } from './files.js'
import {
	ARTIFACT_ROOT,
	POINTER_CATEGORIES,
	POINTER_PATHS,
	RUNTIME_POINTER_DIRS,
	posixPath,
} from './layout.js'
import { isManagedFile, managedTrackFile } from './manifest.js'
import type { Runtime } from '../types.js'

/**
 * Probe whether the platform can create directory symlinks. Windows without
 * Developer Mode/admin cannot, so callers fall back to junctions (ADR-0031).
 *
 * The probe runs on `dir` when given, because symlink support is a property of
 * the destination filesystem, not of the process: WSL `/mnt/c`, exFAT, and SMB
 * repos reject symlinks even when `os.tmpdir()` accepts them.
 */
export function canSymlink(dir: string = os.tmpdir()): boolean {
	try {
		const root = fs.mkdtempSync(path.join(dir, 'wayforge-link-probe-'))
		try {
			fs.mkdirSync(path.join(root, 'target'))
			fs.symlinkSync('target', path.join(root, 'link'), 'dir')
		} finally {
			fs.removeSync(root)
		}
		return true
	} catch {
		return false
	}
}

/** True when a manifest path is a runtime pointer directory. */
export function isPointerPath(relPath: string): boolean {
	return POINTER_PATHS.includes(posixPath(relPath))
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
 *
 * Only leaves are reported: an emptied subdirectory does not block the pointer,
 * because the install prunes empty directories before linking. Symlinks are
 * leaves (never descended into), so their targets are never reported or read.
 */
function collectResiduals(root: string, ctx: ManifestContext): string[] {
	const found: string[] = []
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		const full = path.join(root, entry.name)
		if (ctx.dryRun && isManagedFile(full)) {
			continue
		}
		if (entry.isDirectory() && !entry.isSymbolicLink()) {
			found.push(...collectResiduals(full, ctx))
			continue
		}
		found.push(full)
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
 * Create one pointer, falling back from a symlink to a junction when the
 * destination filesystem rejects symlinks despite the probe. Returns false when
 * neither mechanism works so the caller reports a residual with remediation
 * instead of aborting the install on a raw OS error.
 */
function createPointer(
	link: string,
	managedRel: string,
	relativeTarget: string,
	type: 'dir' | 'junction',
	ctx: ManifestContext,
): boolean {
	const absoluteTarget = path.resolve(path.dirname(link), relativeTarget)
	const attempts: { type: 'dir' | 'junction'; target: string }[] =
		type === 'dir'
			? [
					{ type: 'dir', target: relativeTarget },
					{ type: 'junction', target: absoluteTarget },
				]
			: [{ type: 'junction', target: absoluteTarget }]

	let failure: NodeJS.ErrnoException | undefined
	for (const attempt of attempts) {
		try {
			fs.symlinkSync(attempt.target, link, attempt.type)
			managedTrackFile(link, ctx)
			ctx.log(
				`created ${attempt.type} pointer: ${managedRel} -> ${attempt.target}`,
			)
			return true
		} catch (error) {
			failure = error as NodeJS.ErrnoException
		}
	}

	ctx.log(
		`error: cannot create runtime pointer ${managedRel} ` +
			`(${failure?.code ?? 'unknown'}); this filesystem supports neither ` +
			'symlinks nor junctions',
	)
	return false
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
	const symlinks = canSymlink(repo)
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
					// Only empty directories can be left here, so this removes no
					// user content; nested empty directories are pruned too.
					fs.removeSync(link)
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
		if (!createPointer(link, managedRel, relativeTarget, type, ctx)) {
			residuals.push(managedRel)
		}
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
