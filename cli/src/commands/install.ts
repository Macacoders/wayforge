import path from 'path'
import fs from 'fs-extra'
import { MANAGED_DIR_MARKER, ManifestContext } from '../lib/context.js'
import { readFileOrDefault, rm } from '../lib/files.js'
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
import { isInteractive, promptYesNo } from '../lib/prompt.js'
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
	validateClaudeModel,
	validateModelOverride,
	rejectClaudeSmallModel,
} from '../lib/providers.js'
import {
	expectedClaudePaths,
	pruneStaleClaudePaths,
	syncClaudeSurface,
} from '../lib/claude.js'
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
	CLAUDE_MEMORY_FILE,
	CLAUDE_ROOT,
	CONTENT_CATEGORIES,
	LEGACY_ARTIFACT_ROOT,
	RUNTIMES,
	configFileFor,
	destRelFor,
	destRelForManagedPath,
	isLegacyManagedPath,
	isPointerPath,
	pointerPathsFor,
	posixPath,
	sourceDirFor,
} from '../lib/layout.js'
import {
	ensureRuntimePointers,
	isLinkedDirectory,
	isValidRuntimePointer,
} from '../lib/pointers.js'
import { isCleanupEligibleLegacyPath } from '../lib/legacy-cleanup.js'
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

	// Claude Code manages authentication itself: providers are ignored and the
	// model is a Claude alias/ID, not a `<provider>/<model>` pair.
	let genOpts: GenerateOptions | undefined
	if (options.runtime === 'claude') {
		rejectClaudeSmallModel(options.smallModel)
		validateClaudeModel(options.model, '--model')
		options.claudeModel = options.model ?? 'inherit'
	} else {
		const selected = parseProviders(options.providers)
		validateFreeTierRuntime(selected, options.runtime)
		validateModelOverride(options.model, '--model', selected)
		validateModelOverride(options.smallModel, '--small-model', selected)

		genOpts = {
			runtime: options.runtime,
			selected,
			modelOverride: options.model,
			smallModelOverride: options.smallModel,
			sourceDir,
		}
	}

	initManagedManifest(repo, version, options.ref || undefined, ctx)

	const conflicts = findUnmanagedConflicts(repo, sourceDir, options.runtime)
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
				// Projection runtimes (Claude) have no generated config file.
				if (!configFile) continue
				if (!genOpts) continue
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
				if (
					relPath === CLAUDE_MEMORY_FILE ||
					relPath.startsWith(`${CLAUDE_ROOT}/`)
				) {
					// The Claude surface is re-projected wholesale below; the
					// generic manifest loop only handles `.agents` content.
					continue
				}
				if (isPointerPath(relPath)) {
					if (isValidRuntimePointer(repo, relPath)) {
						managedTrackFile(path.join(repo, relPath), ctx)
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
				pruneEmptyDirs(path.join(repo, LEGACY_ARTIFACT_ROOT), ctx)
			}
			reportLegacyResiduals(
				collectLegacyResiduals(repo, options.runtime),
				ctx,
			)
			if (options.runtime === 'claude') {
				syncClaudeSurface(repo, sourceDir, options.claudeModel, ctx)
				pruneStaleClaudePaths(repo, expectedClaudePaths(sourceDir), ctx)
			}
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

	if (genOpts) {
		syncGeneratedOpenCodeJsonc(repo, options.runtime, genOpts, ctx)
	}
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

	if (options.runtime === 'claude') {
		syncClaudeSurface(repo, sourceDir, options.claudeModel, ctx)
		pruneStaleClaudePaths(repo, expectedClaudePaths(sourceDir), ctx)
	}

	const blockedPointers = ensureRuntimePointers(repo, options.runtime, ctx)

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
	if (!ctx.dryRun) {
		fs.removeSync(path.join(repo, `${MANAGED_DIR_MARKER}.tmp`))
	}
	ctx.log(`error: corrupt or truncated managed manifest: ${manifest}`)
	ctx.log(
		`  repair or remove the manifest, or remove ${LEGACY_ARTIFACT_ROOT} content manually`,
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
		showIssueCredentialAdvisory()
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

/**
 * Point the user at the two supported credential sources for `/issue`; the
 * installer no longer registers a GitHub App or writes `.gh-config/app.yml`.
 */
function showIssueCredentialAdvisory(): void {
	if (!isInteractive()) return
	console.log('\nTo use /issue, set GITHUB_TOKEN to a fine-grained PAT with:')
	console.log(
		'  Issues: read/write, Pull requests: read/write, Contents: read',
	)
	console.log('  Or run gh auth login for machine-wide GitHub credentials.')
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
		if (!isCleanupEligibleLegacyPath(repo, relPath, manifestPaths)) {
			continue
		}
		const absolute = path.join(repo, relPath)
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
	if (isLinkedDirectory(dir)) {
		return
	}
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
	const root = path.join(repo, LEGACY_ARTIFACT_ROOT)
	if (isLinkedDirectory(root)) {
		return []
	}
	if (!fs.pathExistsSync(root)) {
		return []
	}
	const pointerPrefixes = pointerPathsFor(runtime).map((p) => `${p}/`)
	const manifestPaths = readManagedManifest(repo)
	return walkFiles(root)
		.filter(
			(file) =>
				!isCleanupEligibleLegacyPath(
					repo,
					posixPath(path.relative(repo, file)),
					manifestPaths,
				),
		)
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
