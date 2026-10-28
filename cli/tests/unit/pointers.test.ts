import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { ManifestContext } from '../../src/lib/context.js'
import {
	initManagedManifest,
	finalizeManagedManifest,
	readManagedManifest,
} from '../../src/lib/manifest.js'
import {
	canSymlink,
	ensureRuntimePointers,
} from '../../src/lib/pointers.js'
import { isPointerPath } from '../../src/lib/layout.js'
import type { Runtime } from '../../src/types.js'

const symlinks = canSymlink()

function makeCtx(dryRun = false): ManifestContext {
	return new ManifestContext(dryRun, false, false)
}

function expectPointer(link: string, target: string): void {
	expect(fs.lstatSync(link).isSymbolicLink()).toBe(true)
	expect(path.resolve(path.dirname(link), fs.readlinkSync(link))).toBe(
		path.resolve(target),
	)
}

describe('ensureRuntimePointers', () => {
	let tmpDir: string
	let repo: string

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(
			path.join(os.tmpdir(), 'wayforge-pointer-test-'),
		)
		repo = path.join(tmpDir, 'repo')
		fs.mkdirpSync(path.join(repo, '.agents', 'agents'))
		fs.mkdirpSync(path.join(repo, '.agents', 'commands'))
		fs.writeFileSync(
			path.join(repo, '.agents', 'agents', 'planner.md'),
			'# planner',
		)
	})

	afterEach(() => {
		vi.restoreAllMocks()
		fs.removeSync(tmpDir)
	})

	function track(runtime: Runtime, ctx = makeCtx()): string[] {
		initManagedManifest(repo, '0.1.0', undefined, ctx)
		const blocked = ensureRuntimePointers(repo, runtime, ctx)
		finalizeManagedManifest(repo, ctx)
		return blocked
	}

	it.skipIf(!symlinks)(
		'links opencode agents and commands to .agents and tracks them',
		() => {
			const blocked = track('opencode')

			expect(blocked).toEqual([])
			expectPointer(
				path.join(repo, '.opencode', 'agents'),
				path.join(repo, '.agents', 'agents'),
			)
			expectPointer(
				path.join(repo, '.opencode', 'commands'),
				path.join(repo, '.agents', 'commands'),
			)

			const manifest = readManagedManifest(repo)
			expect(manifest).toContain('.opencode/agents')
			expect(manifest).toContain('.opencode/commands')
		},
	)

	it.skipIf(!symlinks)(
		'links kilo pointers under .kilo and ignores .opencode residuals',
		() => {
			fs.mkdirpSync(path.join(repo, '.opencode', 'agents'))
			fs.writeFileSync(
				path.join(repo, '.opencode', 'agents', 'local.md'),
				'# local',
			)

			const blocked = track('kilocode')

			expect(blocked).toEqual([])
			expectPointer(
				path.join(repo, '.kilo', 'agents'),
				path.join(repo, '.agents', 'agents'),
			)
			expectPointer(
				path.join(repo, '.kilo', 'commands'),
				path.join(repo, '.agents', 'commands'),
			)
			expect(
				fs.readFileSync(
					path.join(repo, '.opencode', 'agents', 'local.md'),
					'utf8',
				),
			).toBe('# local')
		},
	)

	it.skipIf(!symlinks)('is idempotent across re-runs', () => {
		track('opencode')
		const secondRun = makeCtx()
		const blocked = track('opencode', secondRun)

		expect(blocked).toEqual([])
		expectPointer(
			path.join(repo, '.opencode', 'agents'),
			path.join(repo, '.agents', 'agents'),
		)
		const manifest = readManagedManifest(repo)
		expect(
			manifest.filter((entry) => entry === '.opencode/agents'),
		).toHaveLength(1)
		expect(
			manifest.filter((entry) => entry === '.opencode/commands'),
		).toHaveLength(1)
	})

	it.skipIf(!symlinks)(
		'replaces an empty pointer directory with a pointer',
		() => {
			fs.mkdirpSync(path.join(repo, '.opencode', 'agents'))

			const blocked = track('opencode')

			expect(blocked).toEqual([])
			expectPointer(
				path.join(repo, '.opencode', 'agents'),
				path.join(repo, '.agents', 'agents'),
			)
			expectPointer(
				path.join(repo, '.opencode', 'commands'),
				path.join(repo, '.agents', 'commands'),
			)
		},
	)

	it.skipIf(!symlinks)(
		'preserves a non-empty directory, reports residuals, and still links the free category',
		() => {
			fs.mkdirpSync(path.join(repo, '.opencode', 'agents'))
			fs.writeFileSync(
				path.join(repo, '.opencode', 'agents', 'local.md'),
				'# local',
			)
			const ctx = makeCtx()
			const logSpy = vi.spyOn(ctx, 'log').mockImplementation(() => {})

			const blocked = track('opencode', ctx)

			expect(blocked).toEqual(['.opencode/agents/local.md'])
			expect(
				fs
					.lstatSync(path.join(repo, '.opencode', 'agents'))
					.isDirectory(),
			).toBe(true)
			expect(
				fs.readFileSync(
					path.join(repo, '.opencode', 'agents', 'local.md'),
					'utf8',
				),
			).toBe('# local')
			expectPointer(
				path.join(repo, '.opencode', 'commands'),
				path.join(repo, '.agents', 'commands'),
			)
			expect(logSpy).toHaveBeenCalledWith(
				expect.stringContaining('cannot expose .agents artifacts'),
			)
			expect(logSpy).toHaveBeenCalledWith('  - .opencode/agents/local.md')
			expect(logSpy).toHaveBeenCalledWith(
				expect.stringContaining('move these paths into .agents/'),
			)
		},
	)

	function seedLegacyPointerDir(): void {
		fs.mkdirpSync(path.join(repo, '.opencode', 'agents'))
		fs.writeFileSync(
			path.join(repo, '.opencode', 'agents', 'planner.md'),
			'# planner',
		)
		fs.writeFileSync(
			path.join(repo, '.opencode', 'agents', 'local.md'),
			'# local',
		)
		fs.writeFileSync(
			path.join(repo, '.wayforge-managed'),
			[
				'project_id: pointer-test',
				'managed_paths:',
				'- .opencode/agents/planner.md',
				'',
			].join('\n'),
		)
	}

	it('dry-run residual collection skips only cleanup-eligible legacy files', () => {
		seedLegacyPointerDir()
		const ctx = makeCtx(true)

		const blocked = track('opencode', ctx)

		expect(blocked).toEqual(['.opencode/agents/local.md'])
	})

	it('does not probe or create target-repository artifacts in dry-run', () => {
		const ctx = makeCtx(true)
		const probeSpy = vi.spyOn(fs, 'mkdtempSync')

		const blocked = track('opencode', ctx)

		expect(blocked).toEqual([])
		expect(probeSpy).not.toHaveBeenCalled()
		expect(fs.readdirSync(repo)).toEqual(['.agents'])
	})

	it.skipIf(!symlinks)('real runs inspect legacy files that remain on disk', () => {
		seedLegacyPointerDir()

		const blocked = track('opencode')

		expect(blocked.sort()).toEqual([
			'.opencode/agents/local.md',
			'.opencode/agents/planner.md',
		])
	})

	it.skipIf(!symlinks)(
		'blocks on a pointer path that is the wrong symlink',
		() => {
			fs.mkdirpSync(path.join(repo, '.opencode'))
			fs.symlinkSync(
				path.join('..', '.agents', 'commands'),
				path.join(repo, '.opencode', 'agents'),
				'dir',
			)

			const blocked = track('opencode')

			expect(blocked).toEqual(['.opencode/agents'])
			expect(
				path.resolve(
					path.dirname(path.join(repo, '.opencode', 'agents')),
					fs.readlinkSync(path.join(repo, '.opencode', 'agents')),
				),
			).toBe(path.resolve(repo, '.agents', 'commands'))
		},
	)

	it('logs intended actions in dry-run without creating pointers', () => {
		const ctx = makeCtx(true)
		const logSpy = vi.spyOn(ctx, 'log').mockImplementation(() => {})

		const blocked = track('opencode', ctx)

		expect(blocked).toEqual([])
		expect(fs.pathExistsSync(path.join(repo, '.opencode'))).toBe(false)
		expect(
			logSpy.mock.calls.some(([message]) =>
				String(message).includes('DRY-RUN: would create runtime pointer'),
			),
		).toBe(true)
	})

	it.skipIf(!symlinks)(
		'blocks a linked runtime root without reading or creating through it',
		() => {
			const target = path.join(tmpDir, 'linked-opencode')
			fs.mkdirpSync(path.join(target, 'agents', 'empty'))
			fs.writeFileSync(path.join(target, 'agents', 'local.md'), '# local')
			fs.symlinkSync(target, path.join(repo, '.opencode'), 'dir')

			const dryBlocked = track('opencode', makeCtx(true))
			const realBlocked = track('opencode')

			expect(dryBlocked).toEqual(['.opencode'])
			expect(realBlocked).toEqual(dryBlocked)
			expect(fs.readFileSync(path.join(target, 'agents', 'local.md'), 'utf8')).toBe(
				'# local',
			)
			expect(fs.pathExistsSync(path.join(target, 'agents', 'empty'))).toBe(true)
			expect(fs.pathExistsSync(path.join(target, 'commands'))).toBe(false)
		},
	)

	it('reports a residual instead of crashing when the filesystem rejects both mechanisms', () => {
		const original = fs.symlinkSync.bind(fs)
		vi.spyOn(fs, 'symlinkSync').mockImplementation((target, link, type) => {
			if (String(link).includes('wayforge-link-probe-')) {
				original(target, link, type)
				return
			}
			const error = new Error('EPERM: operation not permitted')
			;(error as NodeJS.ErrnoException).code = 'EPERM'
			throw error
		})
		const ctx = makeCtx()
		const logSpy = vi.spyOn(ctx, 'log').mockImplementation(() => {})

		const blocked = track('opencode', ctx)

		expect(blocked).toEqual(['.opencode/agents', '.opencode/commands'])
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				'cannot create runtime pointer .opencode/agents (EPERM)',
			),
		)
		expect(fs.pathExistsSync(path.join(repo, '.opencode', 'agents'))).toBe(
			false,
		)
	})

	it('reports only the blocking files, not their parent directories', () => {
		fs.mkdirpSync(path.join(repo, '.opencode', 'agents', 'nested'))
		fs.writeFileSync(
			path.join(repo, '.opencode', 'agents', 'nested', 'local.md'),
			'# local',
		)

		const blocked = track('opencode')

		expect(blocked).toEqual(['.opencode/agents/nested/local.md'])
	})

	it.skipIf(!symlinks)(
		'replaces a pointer directory that only holds empty subdirectories',
		() => {
			fs.mkdirpSync(path.join(repo, '.opencode', 'agents', 'empty'))

			const blocked = track('opencode')

			expect(blocked).toEqual([])
			expectPointer(
				path.join(repo, '.opencode', 'agents'),
				path.join(repo, '.agents', 'agents'),
			)
		},
	)

	it('falls back to an absolute junction target when symlinks are unavailable', () => {
		const calls: { target: string; type?: string }[] = []
		vi.spyOn(fs, 'symlinkSync').mockImplementation((target, link, type) => {
			// The capability probe fails, so the installer picks junctions.
			if (String(link).includes('wayforge-link-probe-')) {
				const error = new Error('EPERM: operation not permitted')
				;(error as NodeJS.ErrnoException).code = 'EPERM'
				throw error
			}
			// Record the call without touching the filesystem: a real `dir`
			// symlink here would throw on the Windows hosts this covers.
			calls.push({ target: String(target), type })
		})

		const blocked = track('opencode')

		expect(blocked).toEqual([])
		const agentsCall = calls.find((call) =>
			call.target.endsWith(path.join('.agents', 'agents')),
		)
		expect(agentsCall?.type).toBe('junction')
		const agentsTarget = agentsCall?.target
		expect(path.isAbsolute(agentsTarget ?? '')).toBe(true)
		expect(path.resolve(agentsTarget ?? '')).toBe(
			path.join(repo, '.agents', 'agents'),
		)
	})
})

describe('isPointerPath', () => {
	it('matches runtime pointer directories for every runtime', () => {
		expect(isPointerPath('.opencode/agents')).toBe(true)
		expect(isPointerPath('.opencode/commands')).toBe(true)
		expect(isPointerPath('.kilo/agents')).toBe(true)
		expect(isPointerPath('.kilo/commands')).toBe(true)
	})

	it('does not match artifact paths or other categories', () => {
		expect(isPointerPath('.agents/agents')).toBe(false)
		expect(isPointerPath('.opencode/skills')).toBe(false)
		expect(isPointerPath('.kilo/agents/planner.md')).toBe(false)
	})
})
