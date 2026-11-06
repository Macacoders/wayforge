import fs from 'fs-extra'
import path from 'path'
import type { ManifestContext } from './context.js'
import { writeFile } from './files.js'
import { isManagedFile, readFileLines, syncManagedTree } from './manifest.js'

/**
 * Scan `agents.yml` for one agent's permission entries and return the block
 * lines relative to the agent key (without the `permission:` header), or null
 * when the agent has no entry. Shared by `renderAgentPermissionBlock` and
 * `parseAgentPermissions` so both see the same parsed surface.
 */
function agentPermissionLines(
	agentName: string,
	permissionsFile: string,
): string[] | null {
	const lines = readFileLines(permissionsFile)

	let inAgents = false
	let agentsIndent = 0
	let capturing = false
	let targetIndent = 0
	const output: string[] = []

	for (const line of lines) {
		if (!inAgents) {
			const trimmed = line.trim()
			if (trimmed === 'agents:') {
				inAgents = true
				agentsIndent = line.length - line.trimStart().length
			}
			continue
		}

		if (line.trim() === '') {
			continue
		}

		const indent = line.length - line.trimStart().length

		if (indent <= agentsIndent) {
			inAgents = false
			continue
		}

		if (indent === agentsIndent + 2) {
			const agentMatch = matchAgentKey(line.slice(indent))
			if (agentMatch) {
				if (agentMatch === agentName) {
					capturing = true
					targetIndent = indent
				} else if (capturing) {
					break
				} else {
					capturing = false
				}
				continue
			}
		}

		if (!capturing) {
			continue
		}

		if (indent <= targetIndent) {
			break
		}

		if (line.trim().startsWith('#')) {
			continue
		}

		output.push(line.slice(targetIndent))
	}

	return capturing ? output : null
}

export function renderAgentPermissionBlock(
	agentName: string,
	permissionsFile: string,
): string {
	const blockLines = agentPermissionLines(agentName, permissionsFile)

	if (blockLines === null) {
		throw new Error(
			`missing permissions in ${permissionsFile} for agent '${agentName}'`,
		)
	}

	return ['permission:', ...blockLines].join('\n')
}

function matchAgentKey(trimmed: string): string | null {
	// Match /^([^:#]+):[[:space:]]*$/ from awk
	const match = trimmed.match(/^([^:#]+):\s*$/)
	if (!match) {
		return null
	}
	return match[1].trim()
}

/** Permission values parsed from one agent's `agents.yml` entry. */
export interface AgentPermissions {
	read: string
	edit: string
	question: string | null
	bash: Record<string, string> | null
	externalDirectory: Record<string, string> | null
	/** Scalar `task` value (`deny`), or null when `task` is a map. */
	task: string | null
	/** Subagent names allowed by a `task` map, in file order. */
	taskAllowList: string[] | null
}

type PermissionValue = string | Record<string, string>

/**
 * Parse the flat `key: value` / nested-map block lines produced by
 * `agentPermissionLines`. Keys may be quoted (`"*": allow`); values are plain
 * scalars. No YAML dependency: the file contract is flat YAML (ADR-0009).
 */
function parsePermissionBlock(
	lines: string[],
): Record<string, PermissionValue> {
	const result: Record<string, PermissionValue> = {}
	let currentKey: string | null = null

	for (const line of lines) {
		const trimmed = line.trim()
		if (trimmed === '') continue
		const match = trimmed.match(/^("[^"]+"|[^:#]+):\s*(.*)$/)
		if (!match) continue
		const key = match[1].replace(/^"|"$/g, '')
		const value = match[2]
		if (line.length - line.trimStart().length === 2) {
			if (value === '') {
				currentKey = key
				result[key] = {}
			} else {
				currentKey = null
				result[key] = value
			}
		} else if (currentKey) {
			;(result[currentKey] as Record<string, string>)[key] = value
		}
	}

	return result
}

function asString(value: PermissionValue | undefined): string | null {
	return typeof value === 'string' ? value : null
}

function asMap(
	value: PermissionValue | undefined,
): Record<string, string> | null {
	return value && typeof value === 'object' ? value : null
}

/**
 * Structured view of one agent's `agents.yml` entry, for consumers that need
 * permission semantics (the Claude projection) instead of the rendered block.
 */
export function parseAgentPermissions(
	agentName: string,
	permissionsFile: string,
): AgentPermissions {
	const blockLines = agentPermissionLines(agentName, permissionsFile)
	if (blockLines === null) {
		throw new Error(
			`missing permissions in ${permissionsFile} for agent '${agentName}'`,
		)
	}

	const parsed = parsePermissionBlock(blockLines)
	const task = parsed.task
	let taskAllowList: string[] | null = null
	if (task && typeof task === 'object') {
		taskAllowList = Object.entries(task)
			.filter(([key, value]) => key !== '*' && value === 'allow')
			.map(([key]) => key)
	}

	return {
		read: asString(parsed.read) ?? '',
		edit: asString(parsed.edit) ?? '',
		question: asString(parsed.question),
		bash: asMap(parsed.bash),
		externalDirectory: asMap(parsed.external_directory),
		task: asString(task),
		taskAllowList,
	}
}

export function renderAgentWithCentralPermissions(
	srcFile: string,
	dstFile: string,
	agentName: string,
	permissionsFile: string,
	ctx: ManifestContext,
): void {
	let permissionBlock: string
	try {
		permissionBlock = renderAgentPermissionBlock(agentName, permissionsFile)
	} catch {
		ctx.log(
			`error: missing permissions in ${permissionsFile} for agent '${agentName}'`,
		)
		process.exit(1)
	}

	if (permissionBlock === '') {
		ctx.log(
			`error: missing permissions in ${permissionsFile} for agent '${agentName}'`,
		)
		process.exit(1)
	}

	if (ctx.dryRun) {
		ctx.log(`DRY-RUN: would render centralized permissions: ${dstFile}`)
		return
	}

	const lines = readFileLines(srcFile)
	const output: string[] = []

	let inFrontmatter = false
	let frontmatterDone = false
	let skippingPermission = false
	let permissionIndent = -1
	let inserted = false

	for (const line of lines) {
		if (line === '---') {
			if (!inFrontmatter) {
				inFrontmatter = true
				output.push(line)
				continue
			}

			if (!frontmatterDone) {
				if (!inserted) {
					inserted = insertPermissionBlock(output, permissionBlock, 0)
				}
				frontmatterDone = true
				inFrontmatter = false
				output.push(line)
				continue
			}
		}

		if (!inFrontmatter || frontmatterDone) {
			output.push(line)
			continue
		}

		const indent = line.length - line.trimStart().length
		const trimmed = line.slice(indent).trim()

		if (skippingPermission) {
			if (trimmed === '' || indent > permissionIndent) {
				continue
			}
			skippingPermission = false
		}

		if (trimmed === 'permission:') {
			skippingPermission = true
			permissionIndent = indent
			continue
		}

		output.push(line)

		if (!inserted && trimmed.startsWith('description:')) {
			inserted = insertPermissionBlock(output, permissionBlock, indent)
		}
	}

	writeFile(dstFile, output.join('\n'), ctx)
}

function insertPermissionBlock(
	output: string[],
	permissionBlock: string,
	indent: number,
): boolean {
	const prefix = ' '.repeat(indent)
	const blockLines = permissionBlock.split('\n')
	for (const bl of blockLines) {
		output.push(prefix + bl)
	}
	return true
}

export function syncAgentsTreeWithPermissions(
	srcDir: string,
	dstDir: string,
	permissionsFile: string,
	ctx: ManifestContext,
): void {
	const result = syncManagedTree(srcDir, dstDir, ctx)
	if (result.action !== 'copied') {
		return
	}

	const entries = fs.readdirSync(srcDir, { withFileTypes: true })
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith('.md')) {
			continue
		}

		const agentFile = entry.name
		const agentName = agentFile.slice(0, -3)
		const dstAgent = path.join(dstDir, agentFile)

		if (!isManagedFile(dstAgent)) {
			ctx.log(
				`skip conflict with unmanaged path (preserving local content): ${dstAgent}`,
			)
			continue
		}

		renderAgentWithCentralPermissions(
			path.join(srcDir, agentFile),
			dstAgent,
			agentName,
			permissionsFile,
			ctx,
		)
	}
}
