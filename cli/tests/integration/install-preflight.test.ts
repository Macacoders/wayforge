import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { doInstall } from '../../src/commands/install.js'
import {
	captureLogs,
	installOptions,
	mockExit,
	sourceDir,
} from '../helpers/install.js'

describe('install preflight runtime gate', () => {
	let tmpDir: string
	let repo: string
	let logs: string[]

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wayforge-preflight-'))
		repo = path.join(tmpDir, 'repo')
		fs.mkdirpSync(repo)
		vi.stubEnv('WAYFORGE_HOME', sourceDir)
		logs = captureLogs()
		mockExit()
	})

	afterEach(() => {
		vi.unstubAllEnvs()
		vi.restoreAllMocks()
		fs.removeSync(tmpDir)
	})

	function expectRepoUntouched(): void {
		expect(fs.pathExistsSync(path.join(repo, '.wayforge-managed'))).toBe(
			false,
		)
		expect(fs.pathExistsSync(path.join(repo, '.agents'))).toBe(false)
		expect(fs.pathExistsSync(path.join(repo, '.opencode'))).toBe(false)
		expect(fs.pathExistsSync(path.join(repo, 'opencode.jsonc'))).toBe(false)
		expect(fs.pathExistsSync(path.join(repo, 'AGENTS.md'))).toBe(false)
	}

	it('rejects an unsupported OpenCode major in dry-run before any mutation', async () => {
		vi.stubEnv('WAYFORGE_OPENCODE_VERSION', '1.19.5')

		await expect(
			doInstall(installOptions(repo, 'opencode', { dryRun: true })),
		).rejects.toThrow('process.exit:1')

		expect(
			logs.some(
				(line) =>
					line.includes('OpenCode 2.x is required') &&
					line.includes('@opencode/cli') &&
					line.includes('1.19.5') &&
					line.includes('WAYFORGE_OPENCODE_VERSION'),
			),
		).toBe(true)
		expectRepoUntouched()
	})

	it('rejects an unsupported OpenCode major in a real install', async () => {
		vi.stubEnv('WAYFORGE_OPENCODE_VERSION', '1.19.5')

		await expect(
			doInstall(installOptions(repo, 'opencode')),
		).rejects.toThrow('process.exit:1')

		expectRepoUntouched()
	})

	it('proceeds with a supported OpenCode major in dry-run without writing', async () => {
		vi.stubEnv('WAYFORGE_OPENCODE_VERSION', '2.2.5')

		await doInstall(installOptions(repo, 'opencode', { dryRun: true }))

		expectRepoUntouched()
	})

	it('never gates the kilocode runtime on the OpenCode version', async () => {
		vi.stubEnv('WAYFORGE_OPENCODE_VERSION', '1.19.5')

		await doInstall(installOptions(repo, 'kilocode'))

		expect(fs.pathExistsSync(path.join(repo, 'kilo.jsonc'))).toBe(true)
		expect(
			logs.some((line) => line.includes('OpenCode 2.x is required')),
		).toBe(false)
	})

	it('documents both supported runtimes in install --help', () => {
		const result = spawnSync(
			process.execPath,
			[
				path.join(sourceDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
				path.join(sourceDir, 'cli', 'src', 'index.ts'),
				'install',
				'--help',
			],
			{
				cwd: sourceDir,
				encoding: 'utf8',
				env: { ...process.env, WAYFORGE_HOME: sourceDir },
			},
		)

		expect(result.status).toBe(0)
		expect(result.stdout).toContain('opencode (OpenCode 2.x)')
		expect(result.stdout).toContain('kilocode (Kilo Code 1.x-compatible)')
	})
})
