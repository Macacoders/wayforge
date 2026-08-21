import path from 'path'
import fs from 'fs-extra'
import { ManifestContext } from '../lib/context.js'
import { ensureDir, readFileOrDefault } from '../lib/files.js'
import {
	initManagedManifest,
	finalizeManagedManifest,
	readManagedManifest,
	isManagedFile,
	managedTrackFile,
	posixPath,
	syncManagedFile,
	syncManagedTree,
	syncManagedPathFromManifest,
	walkFiles,
} from '../lib/manifest.js'
import {
	renderAgentWithCentralPermissions,
	syncAgentsTreeWithPermissions,
} from '../lib/permissions.js'
import {
	parseProviders,
	validateFreeTierRuntime,
	validateModelOverride,
} from '../lib/providers.js'
import {
	syncGeneratedOpenCodeJsonc,
	GenerateOptions,
} from '../lib/config-gen.js'
import { trackInstalledProject } from '../lib/tracking.js'
import { cloneRef } from '../lib/git.js'
import { resolveSourceDir } from '../lib/source-dir.js'
import type { InstallOptions } from '../types.js'

// ponytail: resolved rung 6 — removed Promise.resolve() wrapper; Commander accepts void
export function installCommand(options: InstallOptions): void {
	doInstall(options)
}

export function doInstall(options: InstallOptions): void {
	const ctx = new ManifestContext(
		options.dryRun,
		options.force,
		options.noTrack,
	)
	const repo = path.resolve(options.repo)

	if (!fs.pathExistsSync(repo)) {
		ctx.log(`error: repo path does not exist: ${repo}`)
		process.exit(1)
	}

	ensureDir(path.join(repo, '.opencode'), ctx)

	let sourceDir = resolveSourceDir()
	let version = readFileOrDefault(sourceDir, 'VERSION', '0.0.0')
	let cleanupFn: (() => void) | undefined

	if (options.ref) {
		const cloned = cloneRef(sourceDir, options.ref, (msg) => {
			ctx.log(msg)
		})
		sourceDir = cloned.sourceDir
		version = cloned.version
		cleanupFn = cloned.cleanup
	} else if (!fs.pathExistsSync(path.join(sourceDir, 'base'))) {
		ctx.log(`error: ai-config source tree not found at ${sourceDir}`)
		ctx.log(
			'  Set AI_CONFIG_HOME to the directory containing the base/ source tree.',
		)
		process.exit(1)
	}

	const installRef = options.ref || 'develop'

	const selected = parseProviders(options.providers)
	validateFreeTierRuntime(selected, options.runtime)
	validateModelOverride(options.model, '--model', selected)
	validateModelOverride(options.smallModel, '--small-model', selected)

	const genOpts: GenerateOptions = {
		runtime: options.runtime,
		selected,
		modelOverride: options.model,
		smallModelOverride: options.smallModel,
		sourceDir,
	}

	initManagedManifest(repo, version, options.ref || undefined, ctx)

	if (fs.pathExistsSync(path.join(repo, '.ai-config-managed'))) {
		ctx.log(
			'existing install detected, refreshing managed paths from manifest',
		)

		const savedForce = ctx.force
		ctx.force = true

		const manifestPaths = readManagedManifest(repo)
		if (manifestPaths.length === 0) {
			ctx.force = savedForce
			ctx.log(
				'note: could not read existing manifest, falling back to full sync',
			)
		} else {
			const configFile =
				options.runtime === 'opencode' ? 'opencode.jsonc' : 'kilo.jsonc'
			if (savedForce) {
				syncGeneratedOpenCodeJsonc(repo, options.runtime, genOpts, ctx)
			} else {
				ctx.log(
					`kept existing ${configFile} (use --force to regenerate)`,
				)
			}

			for (const relPath of manifestPaths) {
				if (relPath === 'AGENTS.md' && !savedForce) {
					managedTrackFile(path.join(repo, 'AGENTS.md'), ctx)
					ctx.log('kept existing AGENTS.md (use --force to refresh)')
					continue
				}
				syncManagedPathFromManifest(repo, relPath, sourceDir, ctx)
			}

			if (!manifestPaths.includes('AGENTS.md')) {
				ctx.log('new managed path discovered: AGENTS.md')
				syncManagedFile(
					path.join(sourceDir, 'base', 'AGENTS.md'),
					path.join(repo, 'AGENTS.md'),
					ctx,
				)
			}

			// ponytail: debt — 4 discovery blocks below duplicate walk/relPath/guard/
			// ensureDir/syncManagedFile; extract syncNewDiscoveryDir(base, relPrefix,
			// ctx) — rung 2 — medium
			const agentsBase = path.join(
				sourceDir,
				'base',
				'opencode',
				'agents',
			)
			const agentFiles = fs.pathExistsSync(agentsBase)
				? walkFiles(agentsBase).map((f) =>
						posixPath(path.relative(agentsBase, f)),
					)
				: []
			for (const subpath of agentFiles) {
				const relPath = `.opencode/agents/${subpath}`
				if (!manifestPaths.includes(relPath)) {
					ctx.log(`new managed path discovered: ${relPath}`)
					ensureDir(path.dirname(path.join(repo, relPath)), ctx)
					syncManagedFile(
						path.join(
							sourceDir,
							'base',
							'opencode',
							'agents',
							subpath,
						),
						path.join(repo, relPath),
						ctx,
					)
				}
			}

			const commandsBase = path.join(
				sourceDir,
				'base',
				'opencode',
				'commands',
			)
			const commandFiles = fs.pathExistsSync(commandsBase)
				? walkFiles(commandsBase).map((f) =>
						posixPath(path.relative(commandsBase, f)),
					)
				: []
			for (const subpath of commandFiles) {
				if (!subpath.endsWith('.md')) continue
				const relPath = `.opencode/commands/${subpath}`
				if (!manifestPaths.includes(relPath)) {
					ctx.log(`new managed path discovered: ${relPath}`)
					syncManagedFile(
						path.join(
							sourceDir,
							'base',
							'opencode',
							'commands',
							subpath,
						),
						path.join(repo, relPath),
						ctx,
					)
				}
			}

			const skillsBase = path.join(
				sourceDir,
				'base',
				'opencode',
				'skills',
			)
			const skillFiles = fs.pathExistsSync(skillsBase)
				? walkFiles(skillsBase).map((f) =>
						posixPath(path.relative(skillsBase, f)),
					)
				: []
			for (const subpath of skillFiles) {
				const relPath = `.opencode/skills/${subpath}`
				if (!manifestPaths.includes(relPath)) {
					ctx.log(`new managed path discovered: ${relPath}`)
					ensureDir(path.dirname(path.join(repo, relPath)), ctx)
					syncManagedFile(
						path.join(
							sourceDir,
							'base',
							'opencode',
							'skills',
							subpath,
						),
						path.join(repo, relPath),
						ctx,
					)
				}
			}

			const pluginsBase = path.join(
				sourceDir,
				'base',
				'opencode',
				'plugins',
			)
			const pluginFiles = fs.pathExistsSync(pluginsBase)
				? walkFiles(pluginsBase).map((f) =>
						posixPath(path.relative(pluginsBase, f)),
					)
				: []
			for (const subpath of pluginFiles) {
				const relPath = `.opencode/plugins/${subpath}`
				if (!manifestPaths.includes(relPath)) {
					ctx.log(`new managed path discovered: ${relPath}`)
					ensureDir(path.dirname(path.join(repo, relPath)), ctx)
					syncManagedFile(
						path.join(
							sourceDir,
							'base',
							'opencode',
							'plugins',
							subpath,
						),
						path.join(repo, relPath),
						ctx,
					)
				}
			}

			rewriteAgentPaths(repo, ctx)
			injectPermissions(
				repo,
				path.join(
					sourceDir,
					'base',
					'opencode',
					'permissions',
					'agents.yml',
				),
				ctx,
			)

			ctx.force = savedForce
			finalizeManagedManifest(repo, ctx)
			trackInstalledProject(repo, version, installRef, ctx)
			ctx.log(`repo bootstrap complete for: ${repo}`)
			if (cleanupFn) cleanupFn()
			return
		}
	}

	syncGeneratedOpenCodeJsonc(repo, options.runtime, genOpts, ctx)
	syncManagedFile(
		path.join(sourceDir, 'base', 'AGENTS.md'),
		path.join(repo, 'AGENTS.md'),
		ctx,
	)
	syncAgentsTreeWithPermissions(
		path.join(sourceDir, 'base', 'opencode', 'agents'),
		path.join(repo, '.opencode', 'agents'),
		path.join(sourceDir, 'base', 'opencode', 'permissions', 'agents.yml'),
		ctx,
	)
	rewriteAgentPaths(repo, ctx)
	syncManagedTree(
		path.join(sourceDir, 'base', 'opencode', 'commands'),
		path.join(repo, '.opencode', 'commands'),
		ctx,
	)
	syncManagedTree(
		path.join(sourceDir, 'base', 'opencode', 'skills'),
		path.join(repo, '.opencode', 'skills'),
		ctx,
	)
	syncManagedTree(
		path.join(sourceDir, 'base', 'opencode', 'plugins'),
		path.join(repo, '.opencode', 'plugins'),
		ctx,
	)

	const appYml = path.join(repo, '.gh-config', 'app.yml')
	ensureDir(path.dirname(appYml), ctx)
	if (options.ghAppClientId) {
		const content = `# GitHub App Client ID for OAuth Device Flow.\n# Generated by ai-config installer.\nclient_id: ${options.ghAppClientId}\n`
		if (ctx.dryRun) {
			ctx.log(`DRY-RUN: would write GitHub App Client ID to ${appYml}`)
		} else {
			fs.writeFileSync(appYml, content)
			ctx.log(`wrote GitHub App Client ID to ${appYml}`)
		}
	} else if (!fs.pathExistsSync(appYml)) {
		const template = `# GitHub App Client ID for OAuth Device Flow.\n# \n# To enable issue management with /issue:\n#   1. Go to https://github.com/settings/apps -> New GitHub App\n#   2. Set permissions: Issues (Read & Write), Pull Requests (Read & Write)\n#   3. Under "Identifying and authorizing users", enable Device Flow\n#   4. Save, copy the Client ID (starts with "Iv1")\n#   5. Install the app on this repository/organization\n#   6. Uncomment and fill in below:\n# client_id: \n`
		if (ctx.dryRun) {
			ctx.log(
				`DRY-RUN: would write GitHub App Client ID template to ${appYml}`,
			)
		} else {
			fs.writeFileSync(appYml, template)
			ctx.log(
				`created GitHub App Client ID template at ${appYml} (fill in your Client ID)`,
			)
		}
	}

	// ponytail: temporal — remove this warning block once all users have upgraded past July 2026
	const legacyHosts = path.join(repo, '.gh-config', 'hosts.yml')
	const legacyConfig = path.join(repo, '.gh-config', '_config.yml')
	if (fs.pathExistsSync(legacyHosts)) {
		ctx.log(
			`[WARNING] Legacy PAT file detected: ${legacyHosts}. ` +
				`Auth is now handled by GitHub App Device Flow (gh-app-auth.ts). ` +
				`Consider removing this file manually if you no longer need PAT-based auth.`,
		)
	}
	if (fs.pathExistsSync(legacyConfig)) {
		ctx.log(
			`[WARNING] Legacy PAT file detected: ${legacyConfig}. ` +
				`Auth is now handled by GitHub App Device Flow (gh-app-auth.ts). ` +
				`Consider removing this file manually if you no longer need PAT-based auth.`,
		)
	}

	trackInstalledProject(repo, version, installRef, ctx)
	finalizeManagedManifest(repo, ctx)
	ctx.log(`repo bootstrap complete for: ${repo}`)
	if (cleanupFn) cleanupFn()
}

function rewriteAgentPaths(repo: string, ctx: ManifestContext): void {
	const agentsDir = path.join(repo, '.opencode', 'agents')
	if (!fs.pathExistsSync(agentsDir)) return
	const files = walkFiles(agentsDir).filter((f) => f.endsWith('.md'))
	for (const file of files) {
		const content = fs.readFileSync(file, 'utf8')
		if (content.includes('base/opencode/')) {
			const updated = content.replaceAll('base/opencode/', '.opencode/')
			if (ctx.dryRun) {
				ctx.log(
					`DRY-RUN: would rewrite paths in ${path.relative(repo, file)}`,
				)
			} else {
				fs.writeFileSync(file, updated)
			}
		}
	}
}

function injectPermissions(
	repo: string,
	permissionsFile: string,
	ctx: ManifestContext,
): void {
	const agentsDir = path.join(repo, '.opencode', 'agents')
	if (!fs.pathExistsSync(agentsDir)) return
	const entries = fs.readdirSync(agentsDir, { withFileTypes: true })
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith('.md')) continue
		const agentFile = path.join(agentsDir, entry.name)
		if (!isManagedFile(agentFile)) continue
		const agentName = entry.name.replace(/\.md$/, '')
		const tmpFile = agentFile + '.perm-tmp'
		renderAgentWithCentralPermissions(
			agentFile,
			tmpFile,
			agentName,
			permissionsFile,
			ctx,
		)
		if (!ctx.dryRun) {
			fs.moveSync(tmpFile, agentFile, { overwrite: true })
		}
	}
}
