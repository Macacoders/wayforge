import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
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
	mockExit,
	pointerRootFor,
	seedLegacyConfig,
	seedLegacyInstall,
	sourceDir,
} from '../helpers/install.js'
import type { Runtime } from '../../src/types.js'

const RUNTIMES: Runtime[] = ['opencode', 'kilocode']

function installThroughCli(repo: string, providers: string): void {
	const result = spawnSync(
		process.execPath,
		[
			path.join(sourceDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
			path.join(sourceDir, 'cli', 'src', 'index.ts'),
			'install',
			'--repo',
			repo,
			'--providers',
			providers,
			'--skip-node-check',
			'--no-track',
		],
		{
			cwd: sourceDir,
			encoding: 'utf8',
			env: { ...process.env, WAYFORGE_HOME: sourceDir },
		},
	)

	expect(result.error).toBeUndefined()
	expect(result.status, result.stderr).toBe(0)
}

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

	it('installs the claude runtime without config or pointer files', async () => {
		await doInstall(installOptions(repo, 'claude'))

		expect(
			fs.pathExistsSync(
				path.join(repo, '.agents', 'agents', 'planner.md'),
			),
		).toBe(true)
		expect(
			fs.pathExistsSync(
				path.join(repo, '.agents', 'skills', 'intent', 'SKILL.md'),
			),
		).toBe(true)
		expect(
			fs.pathExistsSync(
				path.join(repo, '.agents', 'commands', 'init.md'),
			),
		).toBe(true)
		expect(fs.pathExistsSync(path.join(repo, 'AGENTS.md'))).toBe(true)

		const claudeMemory = fs.readFileSync(
			path.join(repo, 'CLAUDE.md'),
			'utf8',
		)
		expect(claudeMemory).toContain('@AGENTS.md')

		expect(fs.pathExistsSync(path.join(repo, 'opencode.jsonc'))).toBe(false)
		expect(fs.pathExistsSync(path.join(repo, 'kilo.jsonc'))).toBe(false)
		expect(fs.pathExistsSync(path.join(repo, '.opencode'))).toBe(false)
		expect(fs.pathExistsSync(path.join(repo, '.kilo'))).toBe(false)

		const manifest = readManagedManifest(repo)
		expect(manifest).toContain('CLAUDE.md')
		expect(manifest).toContain('.agents/agents/planner.md')
		expect(manifest).toContain('.claude/agents/planner.md')

		const claudeAgentsDir = path.join(repo, '.claude', 'agents')
		for (const name of [
			'planner',
			'delivery',
			'research',
			'code',
			'troubleshooter',
			'architect',
		]) {
			const agentFile = path.join(claudeAgentsDir, `${name}.md`)
			expect(fs.pathExistsSync(agentFile)).toBe(true)
			const content = fs.readFileSync(agentFile, 'utf8')
			expect(content).toContain(`name: ${name}`)
			expect(content).toMatch(/^tools: /m)
			expect(content).toContain('model: inherit')
			expect(content).not.toMatch(/^mode: /m)
			expect(content).not.toMatch(/^permission: /m)
			expect(content).not.toMatch(/^temperature: /m)
			expect(content).not.toMatch(/\ntask: /)
		}

		const codeAgent = fs.readFileSync(
			path.join(claudeAgentsDir, 'code.md'),
			'utf8',
		)
		expect(codeAgent).toContain('permissionMode: acceptEdits')

		const architectAgent = fs.readFileSync(
			path.join(claudeAgentsDir, 'architect.md'),
			'utf8',
		)
		expect(architectAgent).toContain('disallowedTools:')
		expect(architectAgent).toMatch(/^tools: (?!.*NotebookEdit)/m)

		const colliding = [
			'intent',
			'plan',
			'triage',
			'ponytail',
			'ponytail-audit',
			'ponytail-debt',
			'ponytail-gain',
			'ponytail-help',
			'ponytail-review',
		]
		const commandOnly = [
			'init',
			'issue',
			'memory',
			'load-plan',
			'implement-task',
			'review-task',
		]
		const skillOnly = [
			'ai-memory',
			'create-skill',
			'memory-maintenance',
			'shared-task',
		]

		const commandFiles = fs
			.readdirSync(path.join(repo, '.claude', 'commands'))
			.sort()
		expect(commandFiles).toEqual(
			[...commandOnly].sort().map((name) => `${name}.md`),
		)

		const skillEntries = fs
			.readdirSync(path.join(repo, '.claude', 'skills'))
			.sort()
		expect(skillEntries).toEqual([...colliding, ...skillOnly].sort())

		for (const name of colliding) {
			expect(
				fs.pathExistsSync(
					path.join(repo, '.claude', 'commands', `${name}.md`),
				),
			).toBe(false)
			const content = fs.readFileSync(
				path.join(repo, '.claude', 'skills', name, 'SKILL.md'),
				'utf8',
			)
			expect(content).toContain('$ARGUMENTS')
			expect(content).toContain('## Additional scope or clarification')
			expect(content).toMatch(/^Act as the \w+ agent\./m)
		}

		for (const name of commandOnly) {
			expect(
				fs.pathExistsSync(path.join(repo, '.claude', 'skills', name)),
			).toBe(false)
			const content = fs.readFileSync(
				path.join(repo, '.claude', 'commands', `${name}.md`),
				'utf8',
			)
			expect(content).toContain('$ARGUMENTS')
			expect(content).toMatch(/^Act as the \w+ agent\./m)
		}

		for (const name of skillOnly) {
			expectPointer(
				repo,
				`.claude/skills/${name}`,
				`.agents/skills/${name}`,
			)
		}

		const finalManifest = readManagedManifest(repo)
		expect(finalManifest).toContain('.claude/skills/intent/SKILL.md')
		expect(finalManifest).toContain('.claude/commands/init.md')
	})

	it('accepts a Claude model alias and rejects provider models for claude', async () => {
		await doInstall(installOptions(repo, 'claude', { model: 'sonnet' }))
		expect(fs.pathExistsSync(path.join(repo, 'CLAUDE.md'))).toBe(true)
		expect(
			fs
				.readFileSync(
					path.join(repo, '.claude', 'agents', 'planner.md'),
					'utf8',
				)
				.includes('model: sonnet'),
		).toBe(true)

		mockExit()
		await expect(
			doInstall(
				installOptions(path.join(tmpDir, 'repo-model'), 'claude', {
					model: 'openai/gpt-6-sol',
				}),
			),
		).rejects.toThrow('process.exit:1')

		await expect(
			doInstall(
				installOptions(path.join(tmpDir, 'repo-small'), 'claude', {
					smallModel: 'openai/gpt-5.6-luna',
				}),
			),
		).rejects.toThrow('process.exit:1')
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

	it.each([
		{
			providers: 'free-tier',
			enabledProviders: '"enabled_providers": ["opencode"]',
			providerBlocks: [] as string[],
		},
		{
			providers: 'openai,github-copilot',
			enabledProviders:
				'"enabled_providers": ["opencode", "openai", "github-copilot"]',
			providerBlocks: ['"openai":', '"github-copilot":'],
		},
	])(
		'installs an OpenCode config for $providers providers through the CLI',
		async ({ providers, enabledProviders, providerBlocks }) => {
			installThroughCli(repo, providers)

			const config = fs.readFileSync(
				path.join(repo, configFileFor('opencode')),
				'utf8',
			)
			expect(config).toContain(enabledProviders)
			expect(
				fs.pathExistsSync(path.join(repo, '.agents', 'agents')),
			).toBe(true)
			expect(
				fs.pathExistsSync(
					path.join(repo, '.agents', 'commands', 'init.md'),
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
			expectPointer(repo, '.opencode/agents', '.agents/agents')
			expectPointer(repo, '.opencode/commands', '.agents/commands')

			const manifest = readManagedManifest(repo)
			expect(manifest).toContain('.agents/agents/planner.md')
			expect(manifest).toContain('.opencode/agents')
			expect(manifest).toContain('.opencode/commands')
			for (const providerBlock of providerBlocks) {
				expect(config).toContain(providerBlock)
			}
		},
	)

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
