import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { doInstall } from '../../src/commands/install.js'
import { uninstallCommand } from '../../src/commands/uninstall.js'
import { readManagedManifest } from '../../src/lib/manifest.js'
import {
	configFileFor,
	expectPointer,
	installOptions,
	pointerRootFor,
	seedLegacyConfig,
	seedLegacyInstall,
	sourceDir,
} from '../helpers/install.js'
import type { Runtime } from '../../src/types.js'

const RUNTIMES: Runtime[] = ['opencode', 'kilocode']

describe('install layout integration', () => {
	let tmpDir: string
	let repo: string
	let logs: string[]

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wayforge-integration-'))
		repo = path.join(tmpDir, 'repo')
		fs.mkdirpSync(repo)
		vi.stubEnv('WAYFORGE_HOME', sourceDir)
		logs = []
		vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
			logs.push(args.map((arg) => String(arg)).join(' '))
		})
	})

	afterEach(() => {
		vi.unstubAllEnvs()
		vi.restoreAllMocks()
		fs.removeSync(tmpDir)
	})

	describe.each(RUNTIMES)('%s runtime', (runtime) => {
		it('installs the .agents tree, generated config, and pointers', async () => {
			await doInstall(installOptions(repo, runtime))

			for (const category of [
				'agents',
				'commands',
				'skills',
				'plugins',
			]) {
				expect(
					fs
						.statSync(path.join(repo, '.agents', category))
						.isDirectory(),
				).toBe(true)
			}
			expect(fs.pathExistsSync(path.join(repo, 'AGENTS.md'))).toBe(true)
			expect(
				fs.pathExistsSync(
					path.join(repo, '.agents', 'agents', 'planner.md'),
				),
			).toBe(true)
			expect(
				fs.pathExistsSync(
					path.join(repo, '.agents', 'commands', 'init.md'),
				),
			).toBe(true)
			expect(
				fs.pathExistsSync(
					path.join(repo, '.agents', 'skills', 'intent', 'SKILL.md'),
				),
			).toBe(true)
			expect(
				fs.pathExistsSync(
					path.join(
						repo,
						'.agents',
						'plugins',
						'ponytail',
						'ponytail.mjs',
					),
				),
			).toBe(true)

			const config = fs.readFileSync(
				path.join(repo, configFileFor(runtime)),
				'utf8',
			)
			expect(config).toContain(
				'"plugin": ["./.agents/plugins/ponytail/ponytail.mjs"]',
			)
			expect(config).toContain('"skills": ["./.agents/skills"]')
			expect(config).not.toContain('.opencode/')

			const pointerRoot = pointerRootFor(runtime)
			expectPointer(repo, `${pointerRoot}/agents`, '.agents/agents')
			expectPointer(repo, `${pointerRoot}/commands`, '.agents/commands')

			const otherRoot = runtime === 'opencode' ? '.kilo' : '.opencode'
			expect(fs.pathExistsSync(path.join(repo, otherRoot))).toBe(false)

			const manifest = readManagedManifest(repo)
			expect(manifest).toContain('.agents/agents/planner.md')
			expect(manifest).toContain('.agents/commands/init.md')
			expect(manifest).toContain('.agents/skills/intent/SKILL.md')
			expect(manifest).toContain('.agents/plugins/ponytail/ponytail.mjs')
			expect(manifest).toContain(`${pointerRoot}/agents`)
			expect(manifest).toContain(`${pointerRoot}/commands`)
			expect(manifest).not.toContain('.opencode/agents/planner.md')
		})

		it('is idempotent across reinstalls', async () => {
			await doInstall(installOptions(repo, runtime))
			const configBefore = fs.readFileSync(
				path.join(repo, configFileFor(runtime)),
				'utf8',
			)
			const manifestBefore = readManagedManifest(repo).sort()

			await doInstall(installOptions(repo, runtime))

			expect(
				fs.readFileSync(
					path.join(repo, configFileFor(runtime)),
					'utf8',
				),
			).toBe(configBefore)
			const manifestAfter = readManagedManifest(repo)
			expect(manifestAfter.sort()).toEqual(manifestBefore)
			for (const pointerRel of [
				`${pointerRootFor(runtime)}/agents`,
				`${pointerRootFor(runtime)}/commands`,
			]) {
				expect(
					manifestAfter.filter((entry) => entry === pointerRel),
				).toHaveLength(1)
			}
		})
	})

	it('generates both configs and pointer sets for a mixed install', async () => {
		await doInstall(installOptions(repo, 'opencode'))
		await doInstall(installOptions(repo, 'kilocode'))

		expect(fs.pathExistsSync(path.join(repo, 'opencode.jsonc'))).toBe(true)
		expect(fs.pathExistsSync(path.join(repo, 'kilo.jsonc'))).toBe(true)

		expectPointer(repo, '.opencode/agents', '.agents/agents')
		expectPointer(repo, '.opencode/commands', '.agents/commands')
		expectPointer(repo, '.kilo/agents', '.agents/agents')
		expectPointer(repo, '.kilo/commands', '.agents/commands')

		const manifest = readManagedManifest(repo)
		for (const pointerRel of [
			'.opencode/agents',
			'.opencode/commands',
			'.kilo/agents',
			'.kilo/commands',
		]) {
			expect(manifest).toContain(pointerRel)
			expect(
				manifest.filter((entry) => entry === pointerRel),
			).toHaveLength(1)
		}
	})

	it('migrates a seeded legacy install into the .agents layout', async () => {
		seedLegacyInstall(repo, [
			'.opencode/agents/planner.md',
			'.opencode/commands/init.md',
			'.opencode/skills/intent/SKILL.md',
			'.opencode/plugins/ponytail/ponytail.mjs',
		])
		seedLegacyConfig(repo, 'opencode')

		await doInstall(installOptions(repo, 'opencode'))

		const manifest = readManagedManifest(repo)
		expect(manifest).toContain('.agents/agents/planner.md')
		expect(manifest).toContain('.agents/commands/init.md')
		expect(manifest).not.toContain('.opencode/agents/planner.md')
		expect(manifest).not.toContain('.opencode/commands/init.md')
		expect(
			logs.some((line) =>
				line.includes(
					'removed legacy managed path: .opencode/agents/planner.md',
				),
			),
		).toBe(true)

		expectPointer(repo, '.opencode/agents', '.agents/agents')
		expectPointer(repo, '.opencode/commands', '.agents/commands')

		const agentsDir = path.join(repo, '.agents', 'agents')
		const agentFiles = fs
			.readdirSync(agentsDir)
			.filter((name) => name.endsWith('.md'))
		expect(agentFiles).toHaveLength(6)
		for (const name of agentFiles) {
			const content = fs.readFileSync(path.join(agentsDir, name), 'utf8')
			expect(content).toContain('permission:')
			expect(content).toContain('"rm -rf*": deny')
		}

		const config = fs.readFileSync(
			path.join(repo, configFileFor('opencode')),
			'utf8',
		)
		expect(config).toContain(
			'"plugin": ["./.agents/plugins/ponytail/ponytail.mjs"]',
		)
		expect(config).toContain('"skills": ["./.agents/skills"]')
	})

	it('uninstall removes the .agents tree, pointers, and manifest', async () => {
		await doInstall(installOptions(repo, 'opencode'))

		uninstallCommand({ repo, dryRun: false })

		expect(fs.pathExistsSync(path.join(repo, '.agents'))).toBe(false)
		expect(fs.pathExistsSync(path.join(repo, '.opencode', 'agents'))).toBe(
			false,
		)
		expect(
			fs.pathExistsSync(path.join(repo, '.opencode', 'commands')),
		).toBe(false)
		expect(fs.pathExistsSync(path.join(repo, '.wayforge-managed'))).toBe(
			false,
		)
		expect(fs.pathExistsSync(path.join(repo, 'AGENTS.md'))).toBe(false)
	})
})
