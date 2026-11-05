import { describe, expect, it } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import {
	projectedSkillNames,
	renderClaudeAgent,
	renderClaudeCommand,
	renderClaudeSkill,
	syncClaudeSkillsAndCommands,
} from '../../src/lib/claude.js'
import { ManifestContext } from '../../src/lib/context.js'
import { initManagedManifest } from '../../src/lib/manifest.js'
import { parseAgentPermissions } from '../../src/lib/permissions.js'

const repoRoot = path.resolve(__dirname, '../../..')
const agentsDir = path.join(repoRoot, 'base', 'agents')
const commandsDir = path.join(repoRoot, 'base', 'commands')
const skillsDir = path.join(repoRoot, 'base', 'skills')
const permissionsFile = path.join(repoRoot, 'base', 'permissions', 'agents.yml')

const COLLIDING = [
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
const COMMAND_ONLY = [
	'init',
	'issue',
	'memory',
	'load-plan',
	'implement-task',
	'review-task',
]
const SKILL_ONLY = [
	'ai-memory',
	'create-skill',
	'memory-maintenance',
	'shared-task',
]

interface ExpectedAgent {
	tools: string
	disallowedTools: string | null
	permissionMode: string
}

const EXPECTED: Record<string, ExpectedAgent> = {
	planner: {
		tools: 'Read, Grep, Glob, Bash, PowerShell, WebFetch, WebSearch, Skill, TodoWrite, AskUserQuestion, Edit, Write, Agent(research, code, architect)',
		disallowedTools: null,
		permissionMode: 'default',
	},
	delivery: {
		tools: 'Read, Grep, Glob, Bash, PowerShell, WebFetch, WebSearch, Skill, TodoWrite, AskUserQuestion, Edit, Write, Agent(research, code, architect)',
		disallowedTools: null,
		permissionMode: 'default',
	},
	troubleshooter: {
		tools: 'Read, Grep, Glob, Bash, PowerShell, WebFetch, WebSearch, Skill, TodoWrite, AskUserQuestion, Edit, Write',
		disallowedTools: null,
		permissionMode: 'default',
	},
	research: {
		tools: 'Read, Grep, Glob, Bash, PowerShell, WebFetch, WebSearch, Skill, TodoWrite, Edit, Write',
		disallowedTools: null,
		permissionMode: 'default',
	},
	code: {
		tools: 'Read, Grep, Glob, Bash, PowerShell, WebFetch, WebSearch, Skill, TodoWrite, Edit, Write, NotebookEdit',
		disallowedTools: null,
		permissionMode: 'acceptEdits',
	},
	architect: {
		tools: 'Read, Grep, Glob, Bash, PowerShell, WebFetch, WebSearch, Skill, TodoWrite',
		disallowedTools: 'Edit, Write, NotebookEdit',
		permissionMode: 'default',
	},
}

const agentNames = Object.keys(EXPECTED)

function sourceDescription(agentName: string): string {
	const content = fs.readFileSync(
		path.join(agentsDir, `${agentName}.md`),
		'utf8',
	)
	const match = content.match(/^description:\s*(.+)$/m)
	expect(match).not.toBeNull()
	return match![1].trim()
}

function frontmatter(content: string): Record<string, string> {
	const lines = content.split('\n')
	const end = lines.indexOf('---', 1)
	const result: Record<string, string> = {}
	for (const line of lines.slice(1, end)) {
		const match = line.match(/^([A-Za-z_-]+):\s*(.*)$/)
		if (match) result[match[1]] = match[2]
	}
	return result
}

describe('renderClaudeAgent', () => {
	it.each(agentNames)('%s translates frontmatter from agents.yml', (name) => {
		const expected = EXPECTED[name]
		const content = renderClaudeAgent(
			name,
			path.join(agentsDir, `${name}.md`),
			permissionsFile,
			undefined,
		)
		const fm = frontmatter(content)

		expect(fm.name).toBe(name)
		expect(fm.description).toBe(sourceDescription(name))
		expect(fm.model).toBe('inherit')
		expect(fm.permissionMode).toBe(expected.permissionMode)
		expect(fm.tools).toBe(expected.tools)
		if (expected.disallowedTools === null) {
			expect(fm.disallowedTools).toBeUndefined()
		} else {
			expect(fm.disallowedTools).toBe(expected.disallowedTools)
		}
		expect(content).not.toMatch(/^mode:/m)
		expect(content).not.toMatch(/^permission:/m)
		expect(content).not.toMatch(/^temperature:/m)
		expect(content).not.toMatch(/^task:/m)
	})

	it.each(agentNames)('%s pins the installer-selected model', (name) => {
		const content = renderClaudeAgent(
			name,
			path.join(agentsDir, `${name}.md`),
			permissionsFile,
			'sonnet',
		)
		expect(frontmatter(content).model).toBe('sonnet')
	})

	it('keeps the body markdown and strips permission blocks', () => {
		const content = renderClaudeAgent(
			'planner',
			path.join(agentsDir, 'planner.md'),
			permissionsFile,
			undefined,
		)
		expect(content).toContain('# Planner Agent')
		expect(content).toContain('Coordinate `research` subagents')
	})

	it('regression: architect cannot edit, code uses acceptEdits', () => {
		const architect = frontmatter(
			renderClaudeAgent(
				'architect',
				path.join(agentsDir, 'architect.md'),
				permissionsFile,
				undefined,
			),
		)
		expect(architect.tools).not.toContain('Edit')
		expect(architect.tools.split(', ')).not.toContain('Write')
		expect(architect.disallowedTools).toContain('Edit')
		expect(architect.permissionMode).toBe('default')

		const code = frontmatter(
			renderClaudeAgent(
				'code',
				path.join(agentsDir, 'code.md'),
				permissionsFile,
				undefined,
			),
		)
		expect(code.permissionMode).toBe('acceptEdits')
		expect(code.tools).toContain('NotebookEdit')
	})
})

describe('parseAgentPermissions', () => {
	it('returns the structured planner permissions', () => {
		const perms = parseAgentPermissions('planner', permissionsFile)
		expect(perms.read).toBe('allow')
		expect(perms.edit).toBe('ask')
		expect(perms.question).toBe('allow')
		expect(perms.bash?.['*']).toBe('allow')
		expect(perms.bash?.['sudo*']).toBe('deny')
		expect(perms.externalDirectory?.['*']).toBe('deny')
		expect(perms.task).toBeNull()
		expect(perms.taskAllowList).toEqual(['research', 'code', 'architect'])
	})

	it('returns scalar task deny for code', () => {
		const perms = parseAgentPermissions('code', permissionsFile)
		expect(perms.task).toBe('deny')
		expect(perms.taskAllowList).toBeNull()
		expect(perms.question).toBeNull()
	})

	it('throws for an unknown agent', () => {
		expect(() =>
			parseAgentPermissions('nonexistent-agent', permissionsFile),
		).toThrow(/missing permissions in .* for agent 'nonexistent-agent'/)
	})
})

describe('projectedSkillNames', () => {
	it('derives the collision sets from base commands and skills', () => {
		const projection = projectedSkillNames(repoRoot)
		expect(projection.colliding.sort()).toEqual([...COLLIDING].sort())
		expect(projection.commandOnly.sort()).toEqual([...COMMAND_ONLY].sort())
		expect(projection.skillOnly.sort()).toEqual([...SKILL_ONLY].sort())
	})
})

describe('renderClaudeSkill', () => {
	it.each(COLLIDING)(
		'%s keeps the skill frontmatter and folds in the role line and $ARGUMENTS',
		(name) => {
			const content = renderClaudeSkill(
				name,
				path.join(skillsDir, name, 'SKILL.md'),
				path.join(commandsDir, `${name}.md`),
			)
			expect(content.startsWith('---\nname: ')).toBe(true)
			expect(content).toContain('## Additional scope or clarification')
			expect(content).toContain('$ARGUMENTS')
			expect(content).toMatch(
				/^Act as the \w+ agent\. Read \.claude\/agents\/\w+\.md and follow its instructions\.$/m,
			)
			expect(content).not.toMatch(/^agent: /m)
		},
	)
})

describe('renderClaudeCommand', () => {
	it.each(COMMAND_ONLY)(
		'%s keeps the description, role line, and $ARGUMENTS body',
		(name) => {
			const content = renderClaudeCommand(
				name,
				path.join(commandsDir, `${name}.md`),
			)
			expect(content).toMatch(/^description: "/m)
			expect(content).toContain('$ARGUMENTS')
			expect(content).toMatch(/^Act as the \w+ agent\./m)
		},
	)

	it('emits a valid YAML description for init (colon inside the text)', () => {
		const sourceDescription = fs
			.readFileSync(path.join(commandsDir, 'init.md'), 'utf8')
			.match(/^description:\s*(.+)$/m)![1]
			.trim()
		const content = renderClaudeCommand(
			'init',
			path.join(commandsDir, 'init.md'),
		)
		expect(content.split('\n')[1]).toBe(
			`description: ${JSON.stringify(sourceDescription)}`,
		)
	})
})

describe('syncClaudeSkillsAndCommands', () => {
	function skillCommandRepo(): string {
		const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'wayforge-claude-'))
		// The link/copy targets must exist: mirror base skills into .agents.
		fs.copySync(skillsDir, path.join(repo, '.agents', 'skills'))
		return repo
	}

	it('writes exactly one entrypoint per name', () => {
		const repo = skillCommandRepo()
		try {
			const ctx = new ManifestContext(false, false, true)
			initManagedManifest(repo, '0.0.0', undefined, ctx)
			syncClaudeSkillsAndCommands(repo, repoRoot, ctx)

			const commandFiles = fs
				.readdirSync(path.join(repo, '.claude', 'commands'))
				.sort()
			expect(commandFiles).toEqual(
				[...COMMAND_ONLY].sort().map((name) => `${name}.md`),
			)

			const skillEntries = fs
				.readdirSync(path.join(repo, '.claude', 'skills'))
				.sort()
			expect(skillEntries).toEqual([...COLLIDING, ...SKILL_ONLY].sort())

			for (const name of COLLIDING) {
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
				expect(content).toContain('Act as the ')
			}

			for (const name of COMMAND_ONLY) {
				expect(
					fs.pathExistsSync(
						path.join(repo, '.claude', 'skills', name),
					),
				).toBe(false)
			}

			for (const name of SKILL_ONLY) {
				const entry = path.join(repo, '.claude', 'skills', name)
				expect(fs.statSync(entry).isDirectory()).toBe(true)
				expect(fs.pathExistsSync(path.join(entry, 'SKILL.md'))).toBe(
					true,
				)
			}

			const duplicated = [...COLLIDING, ...COMMAND_ONLY].filter(
				(name) =>
					fs.pathExistsSync(
						path.join(repo, '.claude', 'commands', `${name}.md`),
					) &&
					fs.pathExistsSync(
						path.join(repo, '.claude', 'skills', name),
					),
			)
			expect(duplicated).toEqual([])
		} finally {
			fs.removeSync(repo)
		}
	})

	it('dry-run writes nothing and does not probe symlinks', () => {
		const repo = skillCommandRepo()
		try {
			syncClaudeSkillsAndCommands(
				repo,
				repoRoot,
				new ManifestContext(true, false, true),
			)
			expect(fs.pathExistsSync(path.join(repo, '.claude'))).toBe(false)
		} finally {
			fs.removeSync(repo)
		}
	})
})
