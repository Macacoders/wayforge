import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { ManifestContext } from '../../src/lib/context.js'
import {
	syncManagedFile,
	syncManagedTree,
	initManagedManifest,
	readManagedManifest,
	finalizeManagedManifest,
} from '../../src/lib/manifest.js'

function makeCtx(dryRun = false): ManifestContext {
	return new ManifestContext(dryRun, false, false)
}

describe('syncManagedFile override behavior', () => {
	let tmpDir: string
	let repo: string

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-config-override-test-'))
		repo = path.join(tmpDir, 'repo')
		fs.mkdirpSync(repo)
	})

	afterEach(() => {
		fs.removeSync(tmpDir)
	})

	it('overwrites an unmanaged dst when overrideUnmanaged includes dst and force is true', () => {
		const ctx = makeCtx()
		initManagedManifest(repo, '0.1.0', undefined, ctx)

		const src = path.join(tmpDir, 'src.md')
		const dst = path.join(repo, '.opencode', 'agents', 'planner.md')
		fs.mkdirpSync(path.dirname(dst))
		fs.writeFileSync(src, '# source content')
		fs.writeFileSync(dst, '# local content')

		ctx.force = true
		ctx.overrideUnmanaged.add(dst)
		syncManagedFile(src, dst, ctx)

		expect(fs.readFileSync(dst, 'utf8')).toBe('# source content')

		finalizeManagedManifest(repo, ctx)
		expect(readManagedManifest(repo)).toContain('.opencode/agents/planner.md')
	})

	it('skips an unmanaged dst when overrideUnmanaged is empty', () => {
		const ctx = makeCtx()
		initManagedManifest(repo, '0.1.0', undefined, ctx)

		const src = path.join(tmpDir, 'src.md')
		const dst = path.join(repo, '.opencode', 'agents', 'planner.md')
		fs.mkdirpSync(path.dirname(dst))
		fs.writeFileSync(src, '# source content')
		fs.writeFileSync(dst, '# local content')

		ctx.force = true
		// overrideUnmanaged left empty
		syncManagedFile(src, dst, ctx)

		expect(fs.readFileSync(dst, 'utf8')).toBe('# local content')
	})
})

describe('syncManagedTree override behavior', () => {
	let tmpDir: string
	let repo: string
	let srcDir: string
	let dstDir: string

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(
			path.join(os.tmpdir(), 'ai-config-tree-override-test-'),
		)
		repo = path.join(tmpDir, 'repo')
		srcDir = path.join(tmpDir, 'source', '.opencode', 'agents')
		dstDir = path.join(repo, '.opencode', 'agents')
		fs.mkdirpSync(srcDir)
		fs.mkdirpSync(dstDir)
	})

	afterEach(() => {
		fs.removeSync(tmpDir)
	})

	it('overwrites an unmanaged file when overrideUnmanaged includes its path', () => {
		const ctx = makeCtx()
		initManagedManifest(repo, '0.1.0', undefined, ctx)

		const srcFile = path.join(srcDir, 'planner.md')
		const dstFile = path.join(dstDir, 'planner.md')
		fs.writeFileSync(srcFile, '# source planner')
		fs.writeFileSync(dstFile, '# local planner')

		ctx.overrideUnmanaged.add(dstFile)
		const result = syncManagedTree(srcDir, dstDir, ctx)

		expect(result.action).toBe('copied')
		expect(fs.readFileSync(dstFile, 'utf8')).toBe('# source planner')
	})

	it('preserves an unmanaged file when overrideUnmanaged is empty', () => {
		const ctx = makeCtx()
		initManagedManifest(repo, '0.1.0', undefined, ctx)

		const srcFile = path.join(srcDir, 'planner.md')
		const dstFile = path.join(dstDir, 'planner.md')
		fs.writeFileSync(srcFile, '# source planner')
		fs.writeFileSync(dstFile, '# local planner')

		const result = syncManagedTree(srcDir, dstDir, ctx)

		expect(result.action).toBe('skipped')
		expect(fs.readFileSync(dstFile, 'utf8')).toBe('# local planner')
	})
})
