import fs from 'fs-extra'
import path from 'path'
import { ManifestContext } from './context.js'
import { isManagedFile, posixPath, walkFiles } from './manifest.js'
import { CONTENT_CATEGORIES, destRelFor, sourceDirFor } from './layout.js'
import { isInteractive } from './prompt.js'

export interface UnmanagedConflict {
	relPath: string
	dstPath: string
}

export function findUnmanagedConflicts(
	repo: string,
	sourceDir: string,
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
