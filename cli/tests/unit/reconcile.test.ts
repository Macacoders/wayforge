import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { ManifestContext } from '../../src/lib/context.js'
import {
	findUnmanagedConflicts,
	resolveUnmanagedConflicts,
	type UnmanagedConflict,
} from '../../src/lib/reconcile.js'

vi.mock('../../src/lib/prompt.js', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('../../src/lib/prompt.js')>()
	return {
		...actual,
		isInteractive: vi.fn(),
	}
})

import { isInteractive } from '../../src/lib/prompt.js'

function makeSourceTree(sourceDir: string): void {
	const subs = ['agents', 'commands', 'skills', 'plugins']
	for (const sub of subs) {
		fs.mkdirpSync(path.join(sourceDir, 'base', 'opencode', sub))
		fs.writeFileSync(
			path.join(sourceDir, 'base', 'opencode', sub, 'managed.md'),
			`# ${sub} managed`,
		)
	}
}

function setupTargetRepo(repo: string): void {
	const subs = ['agents', 'commands', 'skills', 'plugins']
	for (const sub of subs) {
		fs.mkdirpSync(path.join(repo, '.opencode', sub))

		// unmanaged matching file
		fs.writeFileSync(
			path.join(repo, '.opencode', sub, 'managed.md'),
			`# ${sub} local`,
		)

		// managed file with sidecar marker
		fs.writeFileSync(
			path.join(repo, '.opencode', sub, 'tracked.md'),
			`# ${sub} tracked`,
		)
		fs.writeFileSync(
			path.join(repo, '.opencode', sub, 'tracked.md.ai-config-managed'),
			'generated-by=ai-config-bootstrap',
		)

		// user-only file with no source counterpart
		fs.writeFileSync(
			path.join(repo, '.opencode', sub, 'user-only.md'),
			`# ${sub} user only`,
		)
	}
}

function makeCtx(): ManifestContext {
	return new ManifestContext(false, false, false)
}

describe('findUnmanagedConflicts', () => {
	let tmpDir: string
	let repo: string
	let sourceDir: string

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-config-reconcile-'))
		repo = path.join(tmpDir, 'repo')
		sourceDir = path.join(tmpDir, 'source')
		fs.mkdirpSync(repo)
		fs.mkdirpSync(sourceDir)
		makeSourceTree(sourceDir)
		setupTargetRepo(repo)
	})

	afterEach(() => {
		fs.removeSync(tmpDir)
	})

	it('returns unmanaged matching files across agents, commands, skills, plugins', () => {
		const conflicts = findUnmanagedConflicts(repo, sourceDir)
		const relPaths = conflicts.map((c) => c.relPath).sort()

		expect(relPaths).toEqual([
			'.opencode/agents/managed.md',
			'.opencode/commands/managed.md',
			'.opencode/plugins/managed.md',
			'.opencode/skills/managed.md',
		])
	})

	it('excludes managed files and user-only files', () => {
		const conflicts = findUnmanagedConflicts(repo, sourceDir)
		const relPaths = new Set(conflicts.map((c) => c.relPath))

		expect(relPaths.has('.opencode/agents/tracked.md')).toBe(false)
		expect(relPaths.has('.opencode/agents/user-only.md')).toBe(false)
		expect(relPaths.has('.opencode/plugins/tracked.md')).toBe(false)
		expect(relPaths.has('.opencode/plugins/user-only.md')).toBe(false)
	})

	it('returns absolute dstPath for each conflict', () => {
		const conflicts = findUnmanagedConflicts(repo, sourceDir)

		for (const conflict of conflicts) {
			expect(conflict.dstPath).toBe(path.join(repo, conflict.relPath))
			expect(fs.pathExistsSync(conflict.dstPath)).toBe(true)
		}
	})
})

describe('resolveUnmanagedConflicts', () => {
	let conflicts: UnmanagedConflict[]
	let ctx: ManifestContext

	beforeEach(() => {
		conflicts = [
			{ relPath: '.opencode/agents/managed.md', dstPath: '/repo/.opencode/agents/managed.md' },
			{ relPath: '.opencode/commands/plan.md', dstPath: '/repo/.opencode/commands/plan.md' },
		]
		ctx = makeCtx()
		vi.mocked(isInteractive).mockReset()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('returns all dstPaths when ctx.force is true', async () => {
		ctx.force = true

		const result = await resolveUnmanagedConflicts(conflicts, ctx, vi.fn())

		expect([...result]).toEqual(conflicts.map((c) => c.dstPath))
	})

	it('returns empty set and logs under dry-run', async () => {
		ctx.dryRun = true
		const logSpy = vi.spyOn(ctx, 'log').mockImplementation(() => {})

		const result = await resolveUnmanagedConflicts(conflicts, ctx, vi.fn())

		expect(result.size).toBe(0)
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining('DRY-RUN: would prompt to override'),
		)
		logSpy.mockRestore()
	})

	it('returns empty set and logs warning when non-interactive', async () => {
		vi.mocked(isInteractive).mockReturnValue(false)
		const logSpy = vi.spyOn(ctx, 'log').mockImplementation(() => {})

		const result = await resolveUnmanagedConflicts(conflicts, ctx, vi.fn())

		expect(result.size).toBe(0)
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				'unmanaged file(s) conflict with managed templates',
			),
		)
		logSpy.mockRestore()
	})

	it('returns all dstPaths when interactive prompt answers yes', async () => {
		vi.mocked(isInteractive).mockReturnValue(true)
		const promptFn = vi.fn().mockResolvedValue(true)
		const logSpy = vi.spyOn(ctx, 'log').mockImplementation(() => {})

		const result = await resolveUnmanagedConflicts(conflicts, ctx, promptFn)

		expect([...result]).toEqual(conflicts.map((c) => c.dstPath))
		expect(promptFn).toHaveBeenCalledTimes(1)
		expect(promptFn).toHaveBeenCalledWith(
			expect.stringContaining('Override these'),
		)
		logSpy.mockRestore()
	})

	it('returns empty set when interactive prompt answers no', async () => {
		vi.mocked(isInteractive).mockReturnValue(true)
		const promptFn = vi.fn().mockResolvedValue(false)
		const logSpy = vi.spyOn(ctx, 'log').mockImplementation(() => {})

		const result = await resolveUnmanagedConflicts(conflicts, ctx, promptFn)

		expect(result.size).toBe(0)
		expect(promptFn).toHaveBeenCalledTimes(1)
		logSpy.mockRestore()
	})

	it('returns empty set for empty conflicts without prompting', async () => {
		vi.mocked(isInteractive).mockReturnValue(true)
		const promptFn = vi.fn().mockResolvedValue(true)

		const result = await resolveUnmanagedConflicts([], ctx, promptFn)

		expect(result.size).toBe(0)
		expect(promptFn).not.toHaveBeenCalled()
	})
})
