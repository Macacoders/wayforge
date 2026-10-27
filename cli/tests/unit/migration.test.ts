import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { doInstall } from '../../src/commands/install.js'
import { destRelForManagedPath, sourceForDest } from '../../src/lib/layout.js'
import { readManagedManifest } from '../../src/lib/manifest.js'
import {
	captureLogs,
	expectPointer,
	installOptions,
	mockExit,
	readAgentContents,
	seedLegacyConfig,
	seedLegacyInstall,
	sourceDir,
	symlinks,
} from '../helpers/install.js'

describe('legacy layout translation', () => {
	it('maps legacy managed paths onto canonical destinations and sources', () => {
		expect(destRelForManagedPath('.opencode/agents/planner.md')).toBe(
			'.agents/agents/planner.md',
		)
		expect(sourceForDest('/source', '.opencode/skills/demo/SKILL.md')).toBe(
			path.join('/source', 'base', 'skills', 'demo', 'SKILL.md'),
		)
	})

	it('rejects legacy paths without a content category and subpath', () => {
		expect(destRelForManagedPath('.opencode/agents')).toBe(null)
		expect(sourceForDest('/source', '.opencode/AGENTS.md')).toBe(null)
	})
})

describe('legacy .opencode migration', () => {
	let tmpDir: string
	let repo: string
	let previousHome: string | undefined

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(
			path.join(os.tmpdir(), 'wayforge-migration-test-'),
		)
		repo = path.join(tmpDir, 'repo')
		fs.mkdirpSync(repo)
		previousHome = process.env.WAYFORGE_HOME
		process.env.WAYFORGE_HOME = sourceDir
	})

	afterEach(() => {
		vi.restoreAllMocks()
		if (previousHome === undefined) {
			delete process.env.WAYFORGE_HOME
		} else {
			process.env.WAYFORGE_HOME = previousHome
		}
		fs.removeSync(tmpDir)
	})

	it('migrates managed content and blocks opencode pointers on residuals', async () => {
		seedLegacyInstall(repo, ['.opencode/agents/planner.md'])
		fs.writeFileSync(
			path.join(repo, '.opencode', 'agents', 'local.md'),
			'# local agent\n',
		)
		const logs = captureLogs()
		mockExit()

		await expect(
			doInstall(installOptions(repo, 'opencode')),
		).rejects.toThrow('process.exit:1')

		const migrated = path.join(repo, '.agents', 'agents', 'planner.md')
		expect(fs.pathExistsSync(migrated)).toBe(true)
		expect(fs.readFileSync(migrated, 'utf8')).not.toBe(
			'# legacy planner.md\n',
		)
		expect(
			fs.pathExistsSync(
				path.join(repo, '.opencode', 'agents', 'planner.md'),
			),
		).toBe(false)
		expect(
			fs.readFileSync(
				path.join(repo, '.opencode', 'agents', 'local.md'),
				'utf8',
			),
		).toBe('# local agent\n')
		expect(
			fs.lstatSync(path.join(repo, '.opencode', 'agents')).isDirectory(),
		).toBe(true)

		const manifest = readManagedManifest(repo)
		expect(manifest).toContain('.agents/agents/planner.md')
		expect(manifest).not.toContain('.opencode/agents/planner.md')
		expect(manifest).not.toContain('.opencode/agents')
		expect(
			logs.some((line) => line.includes('cannot expose .agents')),
		).toBe(true)
		expect(
			logs.some((line) => line.includes('.opencode/agents/local.md')),
		).toBe(true)

		if (symlinks) {
			expectPointer(repo, '.opencode/commands', '.agents/commands')
			expect(manifest).toContain('.opencode/commands')
		}
	})

	it('reports kilo residuals without blocking .kilo pointers', async () => {
		seedLegacyInstall(repo, ['.opencode/agents/planner.md'])
		fs.writeFileSync(
			path.join(repo, '.opencode', 'agents', 'local.md'),
			'# local agent\n',
		)
		const logs = captureLogs()

		await doInstall(installOptions(repo, 'kilocode'))

		expect(
			fs.pathExistsSync(
				path.join(repo, '.agents', 'agents', 'planner.md'),
			),
		).toBe(true)
		expect(
			fs.pathExistsSync(
				path.join(repo, '.opencode', 'agents', 'planner.md'),
			),
		).toBe(false)
		expect(
			fs.readFileSync(
				path.join(repo, '.opencode', 'agents', 'local.md'),
				'utf8',
			),
		).toBe('# local agent\n')

		const manifest = readManagedManifest(repo)
		expect(manifest).toContain('.agents/agents/planner.md')
		expect(manifest).not.toContain('.opencode/agents/planner.md')
		expect(
			logs.some((line) => line.includes('legacy .opencode content')),
		).toBe(true)
		expect(
			logs.some((line) => line.includes('.opencode/agents/local.md')),
		).toBe(true)

		if (symlinks) {
			expectPointer(repo, '.kilo/agents', '.agents/agents')
			expectPointer(repo, '.kilo/commands', '.agents/commands')
			expect(manifest).toContain('.kilo/agents')
			expect(manifest).toContain('.kilo/commands')
		}
	})

	it('removes an emptied legacy tree and creates opencode pointers', async () => {
		seedLegacyInstall(repo, [
			'.opencode/agents/planner.md',
			'.opencode/commands/init.md',
			'.opencode/skills/intent/SKILL.md',
			'.opencode/plugins/ponytail/ponytail.mjs',
		])
		captureLogs()

		await doInstall(installOptions(repo, 'opencode'))

		const manifest = readManagedManifest(repo)
		expect(manifest).toContain('.agents/agents/planner.md')
		expect(manifest).toContain('.agents/commands/init.md')
		expect(manifest).toContain('.agents/skills/intent/SKILL.md')
		expect(manifest).toContain('.agents/plugins/ponytail/ponytail.mjs')
		expect(manifest).not.toContain('.opencode/agents/planner.md')
		expect(manifest).not.toContain('.opencode/commands/init.md')
		expect(manifest).not.toContain('.opencode/skills/intent/SKILL.md')
		expect(manifest).not.toContain(
			'.opencode/plugins/ponytail/ponytail.mjs',
		)
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

		if (symlinks) {
			expectPointer(repo, '.opencode/agents', '.agents/agents')
			expectPointer(repo, '.opencode/commands', '.agents/commands')
			expect(manifest).toContain('.opencode/agents')
			expect(manifest).toContain('.opencode/commands')
		}
	})

	it('keeps agent permissions and regenerates a stale layout config', async () => {
		seedLegacyInstall(repo, [
			'.opencode/agents/planner.md',
			'.opencode/commands/init.md',
			'.opencode/skills/intent/SKILL.md',
			'.opencode/plugins/ponytail/ponytail.mjs',
		])
		const configPath = seedLegacyConfig(repo)
		captureLogs()

		await doInstall(installOptions(repo, 'opencode'))

		const agents = readAgentContents(repo)
		expect(Object.keys(agents)).toHaveLength(6)
		for (const content of Object.values(agents)) {
			expect(content).toContain('permission:')
			expect(content).toContain('"rm -rf*": deny')
		}

		const config = fs.readFileSync(configPath, 'utf8')
		expect(config).toContain(
			'"plugin": ["./.agents/plugins/ponytail/ponytail.mjs"]',
		)
		expect(config).toContain('"skills": ["./.agents/skills"]')

		await doInstall(installOptions(repo, 'opencode'))

		expect(readAgentContents(repo)).toEqual(agents)
		expect(fs.readFileSync(configPath, 'utf8')).toBe(config)
	})

	it('regenerates the sibling runtime config the migration invalidated', async () => {
		seedLegacyInstall(repo, [
			'.opencode/agents/planner.md',
			'.opencode/skills/intent/SKILL.md',
			'.opencode/plugins/ponytail/ponytail.mjs',
			'opencode.jsonc',
			'kilo.jsonc',
		])
		const opencodeConfig = seedLegacyConfig(repo, 'opencode')
		const kiloConfig = seedLegacyConfig(repo, 'kilocode')
		captureLogs()

		await doInstall(installOptions(repo, 'kilocode'))

		expect(fs.pathExistsSync(
			path.join(repo, '.opencode', 'plugins', 'ponytail', 'ponytail.mjs'),
		)).toBe(false)
		for (const configPath of [opencodeConfig, kiloConfig]) {
			const config = fs.readFileSync(configPath, 'utf8')
			expect(config).toContain(
				'"plugin": ["./.agents/plugins/ponytail/ponytail.mjs"]',
			)
			expect(config).toContain('"skills": ["./.agents/skills"]')
			expect(config).not.toContain('.opencode/')
		}
	})

	it('does not create a sibling runtime config on a forced refresh', async () => {
		seedLegacyInstall(repo, ['.opencode/agents/planner.md'])
		seedLegacyConfig(repo, 'opencode')
		captureLogs()

		await doInstall(
			installOptions(repo, 'opencode', { force: true }),
		)

		expect(fs.pathExistsSync(path.join(repo, 'kilo.jsonc'))).toBe(false)
		expect(
			fs.readFileSync(path.join(repo, 'opencode.jsonc'), 'utf8'),
		).toContain('"plugin": ["./.agents/plugins/ponytail/ponytail.mjs"]')
	})

	it('preserves user-authored sibling configs during forced mixed refreshes', async () => {
		await doInstall(installOptions(repo, 'opencode'))
		await doInstall(installOptions(repo, 'kilocode'))
		const opencodeConfig = path.join(repo, 'opencode.jsonc')
		const kiloConfig = path.join(repo, 'kilo.jsonc')
		const kiloAuthored =
			'{\n  "plugin": ["./.opencode/plugins/authored.mjs"]\n}\n'
		fs.writeFileSync(kiloConfig, kiloAuthored)
		captureLogs()

		await doInstall(installOptions(repo, 'opencode', { force: true }))

		expect(fs.readFileSync(kiloConfig, 'utf8')).toBe(kiloAuthored)
		expect(fs.readFileSync(opencodeConfig, 'utf8')).toContain(
			'// Generated by wayforge bootstrap',
		)

		const opencodeAuthored =
			'{\n  "plugin": ["./.opencode/plugins/authored.mjs"]\n}\n'
		fs.writeFileSync(opencodeConfig, opencodeAuthored)
		await doInstall(installOptions(repo, 'kilocode', { force: true }))

		expect(fs.readFileSync(opencodeConfig, 'utf8')).toBe(opencodeAuthored)
		expect(fs.readFileSync(kiloConfig, 'utf8')).toContain(
			'// Generated by wayforge bootstrap',
		)
	})

	it('regenerates a stale sibling only when its generated header identifies it as managed', async () => {
		seedLegacyInstall(repo, ['.opencode/agents/planner.md'])
		const staleKiloConfig = seedLegacyConfig(repo, 'kilocode')
		const authoredOpenCodeConfig = path.join(repo, 'opencode.jsonc')
		const authoredOpenCode =
			'{\n  "plugin": ["./.opencode/plugins/custom.mjs"]\n}\n'
		fs.writeFileSync(authoredOpenCodeConfig, authoredOpenCode)
		captureLogs()

		await doInstall(installOptions(repo, 'opencode', { force: true }))

		expect(fs.readFileSync(authoredOpenCodeConfig, 'utf8')).toContain(
			'// Generated by wayforge bootstrap',
		)
		expect(fs.readFileSync(staleKiloConfig, 'utf8')).toContain(
			'"$schema": "https://app.kilo.ai/config.json"',
		)
	})

	it('leaves the legacy tree and manifest untouched in dry-run', async () => {
		seedLegacyInstall(repo, ['.opencode/agents/planner.md'])
		fs.writeFileSync(
			path.join(repo, '.opencode', 'agents', 'local.md'),
			'# local agent\n',
		)
		const manifestFile = path.join(repo, '.wayforge-managed')
		const before = fs.readFileSync(manifestFile, 'utf8')
		const logs = captureLogs()

		await doInstall({ ...installOptions(repo, 'opencode'), dryRun: true })

		expect(fs.readFileSync(manifestFile, 'utf8')).toBe(before)
		expect(
			fs.pathExistsSync(
				path.join(repo, '.opencode', 'agents', 'planner.md'),
			),
		).toBe(true)
		expect(fs.pathExistsSync(path.join(repo, '.agents'))).toBe(false)
		expect(
			fs.lstatSync(path.join(repo, '.opencode', 'agents')).isDirectory(),
		).toBe(true)
		expect(
			logs.some((line) =>
				line.includes('DRY-RUN: would remove legacy managed path'),
			),
		).toBe(true)
	})

	it('dry-run reports one residual and predicts the blocked install', async () => {
		seedLegacyInstall(repo, ['.opencode/agents/planner.md'])
		fs.writeFileSync(
			path.join(repo, '.opencode', 'agents', 'local.md'),
			'# local agent\n',
		)
		const logs = captureLogs()

		await doInstall({ ...installOptions(repo, 'opencode'), dryRun: true })

		const errorIndex = logs.findIndex((line) =>
			line.includes('cannot expose .agents artifacts'),
		)
		expect(errorIndex).toBeGreaterThan(-1)
		expect(
			logs.slice(errorIndex).filter((line) => line.includes('  - ')),
		).toEqual(['[wayforge]   - .opencode/agents/local.md'])
		expect(
			logs.some((line) =>
				line.includes('1 path(s) block the runtime pointer(s)'),
			),
		).toBe(true)
		expect(
			logs.some((line) =>
				line.includes(
					'DRY-RUN: install would fail - 1 path(s) block the runtime pointer(s)',
				),
			),
		).toBe(true)
		expect(
			logs.some((line) => line.includes('repo bootstrap complete')),
		).toBe(false)
		expect(fs.pathExistsSync(path.join(repo, '.agents'))).toBe(false)
		expect(
			fs.pathExistsSync(
				path.join(repo, '.opencode', 'agents', 'planner.md'),
			),
		).toBe(true)
	})

	it('fails fast on a corrupt managed manifest', async () => {
		seedLegacyInstall(repo, ['.opencode/agents/planner.md'])
		const manifestFile = path.join(repo, '.wayforge-managed')
		fs.writeFileSync(
			manifestFile,
			[
				'project_id: legacy-project',
				'version: 0.1.0',
				'managed_paths:',
				'',
			].join('\n'),
		)
		const before = fs.readFileSync(manifestFile, 'utf8')
		const logs = captureLogs()
		mockExit()

		await expect(
			doInstall(installOptions(repo, 'opencode')),
		).rejects.toThrow('process.exit:1')

		expect(fs.pathExistsSync(path.join(repo, '.agents'))).toBe(false)
		expect(fs.readFileSync(manifestFile, 'utf8')).toBe(before)
		expect(
			fs.pathExistsSync(path.join(repo, '.wayforge-managed.tmp')),
		).toBe(false)
		expect(
			logs.some((line) =>
				line.includes('corrupt or truncated managed manifest'),
			),
		).toBe(true)
		expect(logs.some((line) => line.includes(manifestFile))).toBe(true)
		expect(
			logs.some((line) =>
				line.includes('--force cannot classify those files'),
			),
		).toBe(true)
	})
})
