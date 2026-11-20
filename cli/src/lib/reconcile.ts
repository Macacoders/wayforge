import fs from 'fs-extra'
import path from 'path'
import { ManifestContext } from './context.js'
import {
	isManagedDir,
	isManagedFile,
	isManagedPath,
	walkFiles,
} from './manifest.js'
import { expectedClaudePaths } from './claude.js'
import {
	CONTENT_CATEGORIES,
	destRelFor,
	posixPath,
	sourceDirFor,
} from './layout.js'
import { isInteractive } from './prompt.js'
import type { Runtime } from '../types.js'

export interface UnmanagedConflict {
	relPath: string
	dstPath: string
}

export function findUnmanagedConflicts(
	repo: string,
	sourceDir: string,
	runtime: Runtime,
): UnmanagedConflict[] {
	const conflicts: UnmanagedConflict[] = []

	for (const sub of CONTENT_CATEGORIES) {
		const srcBase = sourceDirFor(sourceDir, sub)
		if (!fs.pathExistsSync(srcBase)) {
			continue
		}
		for (const srcFile of walkFiles(srcBase)) {
			const rel = posixPath(path.relative(srcBase, srcFile))
			const relPath = destRelFor(sub, rel)
			const dstPath = path.join(repo, relPath)
			if (fs.pathExistsSync(dstPath) && !isManagedFile(dstPath)) {
				conflicts.push({ relPath, dstPath })
			}
		}
	}

	if (runtime === 'claude') {
		const seen = new Set(conflicts.map((conflict) => conflict.relPath))
		for (const rel of expectedClaudePaths(sourceDir)) {
			if (seen.has(rel)) {
				continue
			}
			const dstPath = path.join(repo, rel)
			if (
				fs.pathExistsSync(dstPath) &&
				!isManagedPath(repo, rel) &&
				!isManagedFile(dstPath) &&
				!isManagedDir(dstPath)
			) {
				conflicts.push({ relPath: rel, dstPath })
			}
		}
	}

	return conflicts
}

export type PromptFn = (question: string) => Promise<boolean>

export async function resolveUnmanagedConflicts(
	conflicts: UnmanagedConflict[],
	ctx: ManifestContext,
	promptFn: PromptFn,
): Promise<Set<string>> {
	if (conflicts.length === 0) {
		return new Set<string>()
	}

	if (ctx.force) {
		return new Set(conflicts.map((c) => c.dstPath))
	}

	if (ctx.dryRun) {
		ctx.log(
			`DRY-RUN: would prompt to override ${String(conflicts.length)} unmanaged file(s)`,
		)
		for (const conflict of conflicts) {
			ctx.log(`DRY-RUN: would prompt about: ${conflict.relPath}`)
		}
		return new Set<string>()
	}

	if (!isInteractive()) {
		ctx.log(
			`warning: ${String(conflicts.length)} unmanaged file(s) conflict with managed templates (use --force to override):`,
		)
		for (const conflict of conflicts) {
			ctx.log(`  ${conflict.relPath}`)
		}
		return new Set<string>()
	}

	ctx.log(
		`The following ${String(conflicts.length)} file(s) conflict with managed templates:`,
	)
	for (const conflict of conflicts) {
		ctx.log(`  ${conflict.relPath}`)
	}

	const answer = await promptFn(
		`Override these ${String(conflicts.length)} file(s) with the managed templates? [y/N]: `,
	)
	if (answer) {
		return new Set(conflicts.map((c) => c.dstPath))
	}
	return new Set<string>()
}
