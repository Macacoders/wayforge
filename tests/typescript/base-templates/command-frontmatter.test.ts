import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const AGENTS_DIR = path.join(REPO_ROOT, 'base/agents');
const COMMANDS_DIR = path.join(REPO_ROOT, 'base/commands');

const agentIds = fs
    .readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.basename(f, '.md'));

function extractAgentValue(file: string): string | undefined {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    if (lines[0]?.trim() !== '---') return undefined;
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
    if (end === -1) return undefined;
    const match = lines
        .slice(1, end)
        .join('\n')
        .match(/^agent:\s*(.*)$/m);
    return match?.[1];
}

describe('base/commands frontmatter agent', () => {
    it('declares a single known agent id when agent: is present', () => {
        const commands = fs
            .readdirSync(COMMANDS_DIR)
            .filter((f) => f.endsWith('.md'));
        expect(
            commands.length,
            'no commands parsed — check COMMANDS_DIR',
        ).toBeGreaterThan(0);
        for (const name of commands) {
            const value = extractAgentValue(
                path.join(COMMANDS_DIR, name),
            );
            if (value === undefined) continue;
            const trimmed = value.trim();
            expect(
                trimmed,
                `${name}: agent value must be non-empty`,
            ).not.toBe('');
            expect(
                trimmed,
                `${name}: agent must be a single id, no comma`,
            ).not.toMatch(/,/);
            expect(
                agentIds,
                `${name}: unknown agent '${trimmed}' (known: ${agentIds.join(', ')})`,
            ).toContain(trimmed);
        }
    });

    it('pins memory.md to planner', () => {
        const value = extractAgentValue(
            path.join(COMMANDS_DIR, 'memory.md'),
        );
        expect(value?.trim()).toBe('planner');
    });
});
