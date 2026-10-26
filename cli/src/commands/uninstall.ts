import path from 'path'
import fs from 'fs-extra'
import { ManifestContext } from '../lib/context.js'
import { rm } from '../lib/files.js'
import { readManagedManifest } from '../lib/manifest.js'
import { removeTrackingEntry } from '../lib/tracking.js'

export interface UninstallOptions {
	repo: string
	dryRun: boolean
}

// ponytail: resolved rung 6 — removed Promise.resolve() wrapper; Commander accepts void
export function uninstallCommand(options: UninstallOptions): void {
	doUninstall(options)
}

function doUninstall(options: UninstallOptions): void {
	const ctx = new ManifestContext(options.dryRun, false, false)
	// Resolve once so the empty-directory walk below can never climb past the
	// repository when `--repo .` or a relative path with `..` segments is used.
	const repo = path.resolve(options.repo)

	if (!fs.pathExistsSync(repo)) {
		ctx.log(`error: repo path does not exist: ${repo}`)
		process.exit(1)
	}

	const manifestPaths = readManagedManifest(repo)
	if (manifestPaths.length === 0) {
		ctx.log(`error: no .wayforge-managed found in ${repo}`)
		process.exit(1)
	}

	let removedFiles = 0
	for (const relPath of manifestPaths) {
		const absPath = path.join(repo, relPath)
		if (fs.pathExistsSync(absPath)) {
			const lstat = fs.lstatSync(absPath)
			if (lstat.isFile() || lstat.isSymbolicLink()) {
				removedFiles++
			}
		}
		rm(absPath, ctx)
	}

	const manifestPath = path.join(repo, '.wayforge-managed')
	if (fs.pathExistsSync(manifestPath)) {
		rm(manifestPath, ctx)
	}

	let cleanedDirs = 0
	for (const relPath of manifestPaths) {
		const absPath = path.join(repo, relPath)
		let dir = path.dirname(absPath)
		const resolvedRepo = path.resolve(repo)

		while (dir !== resolvedRepo) {
			if (ctx.dryRun) {
				if (
					fs.pathExistsSync(dir) &&
					fs.statSync(dir).isDirectory() &&
					fs.readdirSync(dir).length === 0
				) {
					cleanedDirs++
					ctx.log(`DRY-RUN: would remove empty directory: ${dir}`)
				}
			} else {
				try {
					fs.rmdirSync(dir)
					cleanedDirs++
					ctx.log(`removed empty directory: ${dir}`)
				} catch {
					// Directory not empty or already removed; continue walking up.
				}
			}

			const parent = path.dirname(dir)
			if (parent === dir) {
				break
			}
			dir = parent
		}
	}

	removeTrackingEntry(repo, ctx)

	if (ctx.dryRun) {
		ctx.log(
			`DRY-RUN: summary: would remove ${String(removedFiles)} managed file(s), would clean ${String(cleanedDirs)} empty directory(ies)`,
		)
	} else {
		ctx.log(
			`summary: removed ${String(removedFiles)} managed file(s), cleaned ${String(cleanedDirs)} empty directory(ies)`,
		)
	}
}
