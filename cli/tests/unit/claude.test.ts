import { describe, expect, it } from 'vitest'
import fs from 'fs-extra'
import path from 'path'
import { renderClaudeAgent } from '../../src/lib/claude.js'
import { parseAgentPermissions } from '../../src/lib/permissions.js'

const repoRoot = path.resolve(__dirname, '../../..')
const agentsDir = path.join(repoRoot, 'base', 'agents')
const permissionsFile = path.join(repoRoot, 'base', 'permissions', 'agents.yml')

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
