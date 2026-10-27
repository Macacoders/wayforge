import path from 'path'
import fs from 'fs-extra'
import { MANAGED_DIR_MARKER, ManifestContext } from '../lib/context.js'
import { ensureDir, readFileOrDefault, rm } from '../lib/files.js'
import {
	initManagedManifest,
	finalizeManagedManifest,
	readManagedManifest,
	isManagedFile,
	managedTrackFile,
	syncManagedFile,
	syncManagedTree,
	syncManagedPathFromManifest,
	walkFiles,
} from '../lib/manifest.js'
import { promptYesNo } from '../lib/prompt.js'
import {
	findUnmanagedConflicts,
	resolveUnmanagedConflicts,
} from '../lib/reconcile.js'
import type { PromptFn } from '../lib/reconcile.js'
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
	isLayoutStaleConfig,
	GenerateOptions,
} from '../lib/config-gen.js'
import { trackInstalledProject } from '../lib/tracking.js'
import { cloneRef } from '../lib/git.js'
import { resolveSourceDir } from '../lib/source-dir.js'
import { checkNode } from '../lib/prereq.js'
import {
	ARTIFACT_ROOT,
	CONTENT_CATEGORIES,
	LEGACY_ARTIFACT_ROOT,
	RUNTIMES,
	configFileFor,
	destRelFor,
	destRelForManagedPath,
	isLegacyManagedPath,
	pointerPathsFor,
	posixPath,
	sourceDirFor,
} from '../lib/layout.js'
import { ensureRuntimePointers, isPointerPath } from '../lib/pointers.js'
import type { InstallOptions, Runtime } from '../types.js'

export async function installCommand(options: InstallOptions): Promise<void> {
	await doInstall(options)
}

export async function doInstall(
	options: InstallOptions,
	promptFn: PromptFn = promptYesNo,
): Promise<void> {
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

	if (!options.skipNodeCheck) {
		const node = checkNode()
		if (node.ok) {
			ctx.log(`Node.js ${node.version} detected`)
		} else if (options.dryRun) {
			ctx.log(
				`DRY-RUN: Node.js check failed (${node.reason}), continuing`,
			)
		} else {
			ctx.log(
				`error: Node.js >= 18 is required (${node.reason}; ` +
					'install corepack/npm or run the wayforge release installer)',
			)
			process.exit(1)
		}
	}

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
		ctx.log(`error: wayforge source tree not found at ${sourceDir}`)
		ctx.log(
			'  Set WAYFORGE_HOME to the directory containing the base/ source tree.',
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

	const conflicts = findUnmanagedConflicts(repo, sourceDir)
	ctx.overrideUnmanaged = await resolveUnmanagedConflicts(
		conflicts,
		ctx,
		promptFn,
	)

	if (fs.pathExistsSync(path.join(repo, '.wayforge-managed'))) {
		ctx.log(
			'existing install detected, refreshing managed paths from manifest',
		)

		const savedForce = ctx.force
		ctx.force = true

		const manifestPaths = readManagedManifest(repo)
		if (manifestPaths.length === 0) {
			failCorruptManifest(repo, ctx, cleanupFn)
		} else {
			// Refresh every generated config whose paths the migration invalidated.
			// A mixed install holds one config per runtime, and Kilo also merges a
			// root `opencode.jsonc`, so a stale sibling config would keep pointing
			// at plugin/skills paths the migration just deleted.
			for (const runtime of RUNTIMES) {
				const configFile = configFileFor(runtime)
				const configPath = path.join(repo, configFile)
				const exists = fs.pathExistsSync(configPath)
				const selectedRuntime = runtime === options.runtime
				// Never create a config for a runtime this repo did not install.
				if (!selectedRuntime && !exists) continue
				const shouldRegenerate = selectedRuntime
					? savedForce || !exists || isLayoutStaleConfig(configPath)
					: isLayoutStaleConfig(configPath)
				if (shouldRegenerate) {
					syncGeneratedOpenCodeJsonc(
						repo,
						runtime,
						{
							...genOpts,
							runtime,
						},
						ctx,
					)
				} else if (selectedRuntime) {
					ctx.log(
						`kept existing ${configFile} (use --force to regenerate)`,
					)
				}
			}

			for (const relPath of manifestPaths) {
				if (isPointerPath(relPath)) {
					const pointer = path.join(repo, relPath)
					if (fs.pathExistsSync(pointer)) {
						managedTrackFile(pointer, ctx)
					}
					continue
				}
				if (relPath === 'AGENTS.md' && !savedForce) {
					managedTrackFile(path.join(repo, 'AGENTS.md'), ctx)
					ctx.log('kept existing AGENTS.md (use --force to refresh)')
					continue
				}
				const destRel = destRelForManagedPath(relPath) ?? relPath
				syncManagedPathFromManifest(repo, destRel, sourceDir, ctx)
			}

			if (!manifestPaths.includes('AGENTS.md')) {
				ctx.log('new managed path discovered: AGENTS.md')
				syncManagedFile(
					path.join(sourceDir, 'base', 'AGENTS.md'),
					path.join(repo, 'AGENTS.md'),
					ctx,
				)
			}

			for (const category of CONTENT_CATEGORIES) {
				const categoryBase = sourceDirFor(sourceDir, category)
				const files = fs.pathExistsSync(categoryBase)
					? walkFiles(categoryBase).map((f) =>
							posixPath(path.relative(categoryBase, f)),
						)
					: []
				for (const subpath of files) {
					if (category === 'commands' && !subpath.endsWith('.md')) {
						continue
					}
					const relPath = destRelFor(category, subpath)
					if (manifestPaths.includes(relPath)) continue
					ctx.log(`new managed path discovered: ${relPath}`)
					syncManagedFile(
						path.join(categoryBase, subpath),
						path.join(repo, relPath),
						ctx,
					)
				}
			}

			injectPermissions(
				repo,
				path.join(sourceDirFor(sourceDir, 'permissions'), 'agents.yml'),
				ctx,
			)

			const hadLegacyPaths = manifestPaths.some(
				(relPath) =>
					isLegacyManagedPath(relPath) && !isPointerPath(relPath),
			)
			removeManagedLegacyPaths(repo, manifestPaths, ctx)
			if (hadLegacyPaths) {
				pruneEmptyDirs(legacyArtifactRoot(repo), ctx)
			}
			reportLegacyResiduals(
				collectLegacyResiduals(repo, options.runtime),
				ctx,
			)
			const blockedPointers = ensureRuntimePointers(
				repo,
				options.runtime,
				ctx,
			)

			ctx.force = savedForce
			finalizeManagedManifest(repo, ctx)
			trackInstalledProject(repo, version, installRef, ctx)
			finalizeBlocked(repo, blockedPointers, ctx, cleanupFn)
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
		sourceDirFor(sourceDir, 'agents'),
		path.join(repo, destRelFor('agents')),
		path.join(sourceDirFor(sourceDir, 'permissions'), 'agents.yml'),
		ctx,
	)
	for (const category of CONTENT_CATEGORIES) {
		if (category === 'agents') continue
		syncManagedTree(
			sourceDirFor(sourceDir, category),
			path.join(repo, destRelFor(category)),
			ctx,
		)
	}

	const blockedPointers = ensureRuntimePointers(repo, options.runtime, ctx)

	const appYml = path.join(repo, '.gh-config', 'app.yml')
	ensureDir(path.dirname(appYml), ctx)
	if (options.ghAppClientId) {
		const content = `# GitHub App Client ID for OAuth Device Flow.\n# Generated by wayforge installer.\nclient_id: ${options.ghAppClientId}\n`
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
	finalizeBlocked(repo, blockedPointers, ctx, cleanupFn)
	if (cleanupFn) cleanupFn()
}

/**
 * A manifest that exists but lists no paths cannot classify legacy files, so a
 * full sync would strand them behind pointers it can never unblock.
 */
function failCorruptManifest(
	repo: string,
	ctx: ManifestContext,
	cleanupFn: (() => void) | undefined,
): void {
	const manifest = path.join(repo, MANAGED_DIR_MARKER)
	fs.removeSync(path.join(repo, `${MANAGED_DIR_MARKER}.tmp`))
	ctx.log(`error: corrupt or truncated managed manifest: ${manifest}`)
	ctx.log(
		'  repair or remove the manifest, or remove .opencode content manually',
	)
	ctx.log(
		'  --force cannot classify those files: the manifest no longer traces them',
	)
	if (cleanupFn) cleanupFn()
	process.exit(1)
}

/**
 * Report the install outcome, or the dry-run prediction of a blocked install,
 * instead of claiming success when pointers stay blocked.
 */
function finalizeBlocked(
	repo: string,
	blockedPointers: string[],
	ctx: ManifestContext,
	cleanupFn: (() => void) | undefined,
): void {
	if (blockedPointers.length === 0) {
		ctx.log(`repo bootstrap complete for: ${repo}`)
		return
	}
	if (ctx.dryRun) {
		ctx.log(
			`DRY-RUN: install would fail - ${String(blockedPointers.length)} path(s) block the runtime pointer(s)`,
		)
		return
	}
	if (cleanupFn) cleanupFn()
	process.exit(1)
}

function legacyArtifactRoot(repo: string): string {
	return path.join(repo, LEGACY_ARTIFACT_ROOT)
}

// ponytail: temporal — the legacy `.opencode` migration helpers below are
// removable once installs made before the `.agents/` layout have upgraded.
/** Remove legacy managed files that were synced into the canonical tree. */
function removeManagedLegacyPaths(
	repo: string,
	manifestPaths: string[],
	ctx: ManifestContext,
): void {
	for (const relPath of manifestPaths) {
		if (!isLegacyManagedPath(relPath) || isPointerPath(relPath)) {
			continue
		}
		const absolute = path.join(repo, relPath)
		if (!fs.pathExistsSync(absolute)) {
			continue
		}
		const lstat = fs.lstatSync(absolute)
		if (!lstat.isFile() && !lstat.isSymbolicLink()) {
			continue
		}
		if (!isManagedFile(absolute)) {
			continue
		}
		rm(absolute, ctx)
		if (ctx.dryRun) {
			ctx.log(`DRY-RUN: would remove legacy managed path: ${relPath}`)
		} else {
			ctx.log(`removed legacy managed path: ${relPath}`)
		}
	}
}

/** Remove empty directories bottom-up, including the directory itself. */
function pruneEmptyDirs(dir: string, ctx: ManifestContext): void {
	if (!fs.pathExistsSync(dir)) {
		return
	}
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory() && !entry.isSymbolicLink()) {
			pruneEmptyDirs(path.join(dir, entry.name), ctx)
		}
	}
	if (fs.readdirSync(dir).length > 0) {
		return
	}
	if (ctx.dryRun) {
		ctx.log(`DRY-RUN: would remove empty directory: ${dir}`)
		return
	}
	fs.rmdirSync(dir)
	ctx.log(`removed empty directory: ${dir}`)
}

/**
 * Non-managed files still under the legacy tree. Managed files are excluded so
 * a dry-run reports the same residuals it would leave after a real cleanup.
 * Paths under this runtime's pointer directories are excluded too, because
 * `ensureRuntimePointers` already reports them (ponytail: resolved rung 2 —
 * both share the pointer list declared in `layout.ts`).
 */
function collectLegacyResiduals(repo: string, runtime: Runtime): string[] {
	const root = legacyArtifactRoot(repo)
	if (!fs.pathExistsSync(root)) {
		return []
	}
	const pointerPrefixes = pointerPathsFor(runtime).map((p) => `${p}/`)
	return walkFiles(root)
		.filter((file) => !isManagedFile(file))
		.map((file) => posixPath(path.relative(repo, file)))
		.filter(
			(relPath) =>
				!pointerPrefixes.some((prefix) => relPath.startsWith(prefix)),
		)
}

function reportLegacyResiduals(
	residuals: string[],
	ctx: ManifestContext,
): void {
	if (residuals.length === 0) {
		return
	}
	ctx.log(
		`warning: legacy ${LEGACY_ARTIFACT_ROOT} content is not managed by wayforge:`,
	)
	for (const residual of residuals) {
		ctx.log(`  - ${residual}`)
	}
	ctx.log(
		`  move these paths into ${ARTIFACT_ROOT}/ or remove them; ` +
			`managed ${LEGACY_ARTIFACT_ROOT} files were migrated automatically`,
	)
}

function injectPermissions(
	repo: string,
	permissionsFile: string,
	ctx: ManifestContext,
): void {
	const agentsDir = path.join(repo, destRelFor('agents'))
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
