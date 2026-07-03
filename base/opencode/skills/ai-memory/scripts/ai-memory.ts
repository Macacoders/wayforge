#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Constants ───────────────────────────────────────────────────────────────

const DOCS_AI = 'docs/ai';

interface DirEntry {
  name: string;
  isDir: boolean;
}

// ── Global state ────────────────────────────────────────────────────────────

let jsonMode = false;
let dryRun = false;

/** Reset all global state to defaults — used in tests. */
function resetState(): void {
  jsonMode = false;
  dryRun = false;
}
/** @internal Setter for tests */
function _setJsonMode(v: boolean): void { jsonMode = v; }
/** @internal Setter for tests */
function _setDryRun(v: boolean): void { dryRun = v; }

// ── Usage ───────────────────────────────────────────────────────────────────

function printUsage(): void {
  const text = [
    'Usage:',
    '  ai-memory.ts [--json] status',
    '  ai-memory.ts list-plans',
    '  ai-memory.ts list-adrs',
    '  ai-memory.ts close-check',
    '  ai-memory.ts init [--dry-run]',
  ].join('\n');
  process.stdout.write(text + '\n');
}

// ── Output helper ───────────────────────────────────────────────────────────

function outputJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

// ── File system helpers ─────────────────────────────────────────────────────

function docsAiDir(): string {
  return path.resolve(process.cwd(), DOCS_AI);
}

function listDir(dir: string): DirEntry[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).map((d) => ({
      name: d.name,
      isDir: d.isDirectory(),
    }));
  } catch {
    return [];
  }
}

function readFirstLines(filePath: string, count: number): string[] {
  try {
    const content = readFileSync(filePath, 'utf8');
    return content.split('\n').slice(0, count);
  } catch {
    return [];
  }
}

function countLines(filePath: string): number {
  try {
    const content = readFileSync(filePath, 'utf8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

/** Check if git is available and we're inside a repo */
function tryGit(args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      timeout: 5000,
      cwd: process.cwd(),
    }).trim();
  } catch {
    return null;
  }
}

function workingTreeIsClean(): boolean | null {
  const status = tryGit(['status', '--porcelain']);
  if (status === null) return null; // git not available or not a repo
  return status.length === 0;
}

/** Read the first 20 lines of a plan file and extract title + status. */
function parsePlanFile(filePath: string): { title: string; status: string } {
  const lines = readFirstLines(filePath, 20);
  let title = '';
  let status = '';
  for (const line of lines) {
    const titleMatch = /^#\s+(.+)/.exec(line);
    if (titleMatch && !title) title = titleMatch[1].trim();
    const statusMatch = /\*\*Status:\*\*\s*(.+)/.exec(line);
    if (statusMatch && !status) status = statusMatch[1].trim();
  }
  return { title, status };
}

// ── Template constants (embedded for init) ────────────────────────────────

const TEMPLATE_README_MD = `# AI Memory Index

This directory is a **router**, not a summary corpus. Read this file first, then load only the smallest relevant memory file.

Do **not** load all \`docs/ai/**\` by default.

## Topic Routes

- Planning current work: \`plans/<active-plan>.md\`
- Repo boundaries/contracts: \`architecture.md\`
- Durable decisions/tradeoffs: \`decisions/*.md\`
- Shared task workflow context: \`backlog/README.md\`
- Historical continuity: \`logs/YYYY-MM.md\`

## Low-token Load Rules

1. Read this index first.
2. Load one route file at a time.
3. Stop when you have enough context to proceed safely.

## What To Persist

- Approved plans and phase status
- Architecture boundaries/invariants
- Durable decisions (ADRs)
- Short monthly logs

## What Not To Persist

- Full transcripts
- Raw diffs
- Long terminal output
- Ephemeral notes or temporary assumptions

## Ownership

- \`planner\` is the final memory owner.
- Other agents may propose updates, but \`planner\` decides what gets persisted.
`;

const TEMPLATE_ARCHITECTURE_MD = `# Architecture

## Scope

[FILL IN: What is the scope of this repository? What does it build or configure?]

## Boundaries

[FILL IN: Key architectural boundaries, invariants, and constraints.]
`;

const TEMPLATE_BACKLOG_README_MD = `# Shared Task Workflow

GitHub Issues is the operational source of truth for shared repository tasks.

Use \`/issue create <description>\` to create shared tasks.
Use \`/issue\` for list/claim/assign/release/close/prclose/show operations.

## Labels

Required labels: \`status:to-do\`, \`status:doing\`, \`status:in-review\`, \`status:blocked\`,
\`type:task\`, \`type:feature\`, \`type:bug\`, \`type:docs\`, \`type:chore\`,
\`priority:high\`, \`priority:medium\`, \`priority:low\`.
`;

// ── Path definition for init ────────────────────────────────────────────────

interface SkeletonItem {
  type: 'file' | 'dir';
  relativePath: string;
  content?: string;
}

function getSkeleton(): SkeletonItem[] {
  return [
    { type: 'file', relativePath: 'README.md', content: TEMPLATE_README_MD },
    { type: 'file', relativePath: 'architecture.md', content: TEMPLATE_ARCHITECTURE_MD },
    { type: 'file', relativePath: 'backlog/README.md', content: TEMPLATE_BACKLOG_README_MD },
    { type: 'dir', relativePath: 'decisions' },
    { type: 'dir', relativePath: 'plans' },
    { type: 'dir', relativePath: 'logs' },
  ];
}

// ── Command handlers ────────────────────────────────────────────────────────

async function cmdStatus(): Promise<void> {
  const dir = docsAiDir();

  if (!existsSync(dir)) {
    if (jsonMode) {
      outputJson({ exists: false });
    } else {
      process.stdout.write('docs/ai/ does not exist\n');
    }
    return;
  }

  // Read specific files
  const readmePath = path.join(dir, 'README.md');
  const archPath = path.join(dir, 'architecture.md');
  const backlogPath = path.join(dir, 'backlog', 'README.md');
  const decisionsPath = path.join(dir, 'decisions');
  const plansPath = path.join(dir, 'plans');
  const logsPath = path.join(dir, 'logs');

  const readmeLines = existsSync(readmePath) ? countLines(readmePath) : 0;
  const archLines = existsSync(archPath) ? countLines(archPath) : 0;
  const backlogLines = existsSync(backlogPath) ? countLines(backlogPath) : 0;
  const decisionCount = existsSync(decisionsPath) ? listDir(decisionsPath).length : 0;
  const planCount = existsSync(plansPath) ? listDir(plansPath).length : 0;
  const logCount = existsSync(logsPath) ? listDir(logsPath).length : 0;

  if (jsonMode) {
    outputJson({
      exists: true,
      files: {
        readme: { exists: readmeLines > 0, lines: readmeLines },
        architecture: { exists: archLines > 0, lines: archLines },
        backlog: { exists: backlogLines > 0, lines: backlogLines },
        decisions: { exists: decisionCount > 0 || existsSync(decisionsPath), count: decisionCount },
        plans: { exists: planCount > 0 || existsSync(plansPath), count: planCount },
        logs: { exists: logCount > 0 || existsSync(logsPath), count: logCount },
      },
    });
    return;
  }

  process.stdout.write('docs/ai/ exists\n');
  if (readmeLines > 0) process.stdout.write(`  README.md: ${readmeLines} lines\n`);
  else process.stdout.write('  README.md: missing\n');

  if (archLines > 0) process.stdout.write(`  architecture.md: ${archLines} lines\n`);
  else process.stdout.write('  architecture.md: missing\n');

  if (backlogLines > 0) process.stdout.write(`  backlog/README.md: ${backlogLines} lines\n`);
  else process.stdout.write('  backlog/README.md: missing\n');

  process.stdout.write(`  decisions/: ${decisionCount} ADRs\n`);
  process.stdout.write(`  plans/: ${planCount} plans\n`);
  process.stdout.write(`  logs/: ${logCount} monthly logs\n`);
}

async function cmdListPlans(): Promise<void> {
  const plansDir = path.join(docsAiDir(), 'plans');

  if (!existsSync(plansDir)) {
    if (jsonMode) {
      outputJson({ plans: [] });
    } else {
      process.stdout.write('docs/ai/plans/ does not exist\n');
    }
    return;
  }

  const entries = listDir(plansDir);
  const planFiles = entries
    .filter((e) => !e.isDir && e.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const result: Array<{ file: string; title: string; status: string }> = [];

  for (const entry of planFiles) {
    const filePath = path.join(plansDir, entry.name);
    const { title, status } = parsePlanFile(filePath);
    result.push({ file: entry.name, title, status });
  }

  if (jsonMode) {
    outputJson({ plans: result });
    return;
  }

  if (result.length === 0) {
    process.stdout.write('No plan files found in docs/ai/plans/\n');
    return;
  }

  for (const p of result) {
    process.stdout.write(`${p.file}\n`);
    if (p.title) process.stdout.write(`  Title: ${p.title}\n`);
    if (p.status) process.stdout.write(`  Status: ${p.status}\n`);
    if (!p.title && !p.status) process.stdout.write('  (no heading or status found)\n');
  }
}

async function cmdListAdrs(): Promise<void> {
  const decisionsDir = path.join(docsAiDir(), 'decisions');

  if (!existsSync(decisionsDir)) {
    if (jsonMode) {
      outputJson({ adrs: [] });
    } else {
      process.stdout.write('docs/ai/decisions/ does not exist\n');
    }
    return;
  }

  const entries = listDir(decisionsDir);
  const adrFiles = entries
    .filter((e) => !e.isDir && e.name.startsWith('ADR-') && e.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const result: Array<{ file: string; number: string; title: string }> = [];

  for (const entry of adrFiles) {
    const filePath = path.join(decisionsDir, entry.name);
    const lines = readFirstLines(filePath, 5);

    let number = '';
    let title = '';

    for (const line of lines) {
      const match = /^#\s+(ADR-\d+):\s*(.+)/.exec(line);
      if (match) {
        number = match[1];
        title = match[2].trim();
        break;
      }
    }

    result.push({ file: entry.name, number, title });
  }

  if (jsonMode) {
    outputJson({ adrs: result });
    return;
  }

  if (result.length === 0) {
    process.stdout.write('No ADR files found in docs/ai/decisions/\n');
    return;
  }

  for (const a of result) {
    if (a.number && a.title) {
      process.stdout.write(`${a.number}: ${a.title}\n`);
    } else {
      process.stdout.write(`${a.file}: (unparsable heading)\n`);
    }
  }
}

async function cmdCloseCheck(): Promise<void> {
  const dir = docsAiDir();
  const aiExists = existsSync(dir);

  // Plan candidates: plans not marked as completed
  let activePlanCount = 0;
  let activePlanDetails: string[] = [];

  if (aiExists) {
    const plansDir = path.join(dir, 'plans');
    if (existsSync(plansDir)) {
      const entries = listDir(plansDir);
      const planFiles = entries
        .filter((e) => !e.isDir && e.name.endsWith('.md'))
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of planFiles) {
        const filePath = path.join(plansDir, entry.name);
        const { title, status } = parsePlanFile(filePath);
        // Consider anything without "Completed" / "Cancelled" / "Done" as active
        const isActive = !/completed|cancelled|done/i.test(status);
        if (isActive) {
          activePlanCount++;
          activePlanDetails.push(`${entry.name} — ${status || '(no status)'}`);
        }
      }
    }
  }

  // Monthly log: check current month and recent months
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.md`;
  let currentLogExists = false;
  let recentLogCount = 0;

  if (aiExists) {
    const logsDir = path.join(dir, 'logs');
    if (existsSync(logsDir)) {
      const logFiles = listDir(logsDir).filter((e) => !e.isDir && e.name.endsWith('.md'));
      recentLogCount = logFiles.length;
      currentLogExists = logFiles.some((e) => e.name === currentMonth);
    }
  }

  // Architecture presence
  let archExists = false;
  let archLines = 0;
  if (aiExists) {
    const archPath = path.join(dir, 'architecture.md');
    if (existsSync(archPath)) {
      archExists = true;
      archLines = countLines(archPath);
    }
  }

  // ADR count
  let adrCount = 0;
  if (aiExists) {
    const decisionsDir = path.join(dir, 'decisions');
    if (existsSync(decisionsDir)) {
      adrCount = listDir(decisionsDir).filter((e) => !e.isDir && e.name.startsWith('ADR-') && e.name.endsWith('.md')).length;
    }
  }

  // Worktree state
  const isClean = workingTreeIsClean();

  if (jsonMode) {
    outputJson({
      plan: {
        active_count: activePlanCount,
        active_plans: activePlanDetails,
      },
      log: {
        current_month_exists: currentLogExists,
        current_month: currentMonth,
        recent_log_count: recentLogCount,
      },
      architecture: {
        exists: archExists,
        lines: archLines,
      },
      adr: {
        count: adrCount,
      },
      worktree: {
        clean: isClean === null ? null : isClean,
        git_available: isClean !== null,
      },
    });
    return;
  }

  process.stdout.write('Closeout Checklist\n');
  process.stdout.write('==================\n');

  // Plan
  if (activePlanCount === 0) {
    process.stdout.write('[PLAN] No active plan candidates found.\n');
  } else {
    process.stdout.write(`[PLAN] Active plan candidates: ${activePlanCount}\n`);
    for (const detail of activePlanDetails) {
      process.stdout.write(`       ${detail}\n`);
    }
  }

  // Log
  if (currentLogExists) {
    process.stdout.write(`[LOG]  Monthly log for ${currentMonth.replace('.md', '')}: present\n`);
  } else if (recentLogCount > 0) {
    process.stdout.write(`[LOG]  Monthly log for ${currentMonth.replace('.md', '')}: missing (${recentLogCount} log(s) found for other months)\n`);
  } else {
    process.stdout.write('[LOG]  No monthly logs found.\n');
  }

  // Architecture
  if (archExists) {
    process.stdout.write(`[ARCH] architecture.md: present (${archLines} lines)\n`);
  } else {
    process.stdout.write('[ARCH] architecture.md: missing\n');
  }

  // ADR
  process.stdout.write(`[ADR]  ${adrCount} ADR file(s)\n`);

  // Worktree
  if (isClean === null) {
    process.stdout.write('[GIT]  Worktree: could not determine (git unavailable or not a repo)\n');
  } else if (isClean) {
    process.stdout.write('[GIT]  Worktree: clean\n');
  } else {
    process.stdout.write('[GIT]  Worktree: dirty\n');
  }
}

async function cmdInit(): Promise<void> {
  const root = docsAiDir();
  const skeleton = getSkeleton();
  const created: string[] = [];
  const skipped: string[] = [];

  for (const item of skeleton) {
    const fullPath = path.join(root, item.relativePath);

    if (existsSync(fullPath)) {
      skipped.push(item.relativePath);
      continue;
    }

    if (item.type === 'dir') {
      if (dryRun) {
        created.push(item.relativePath + '/ (directory)');
      } else {
        mkdirSync(fullPath, { recursive: true });
        created.push(item.relativePath + '/');
      }
    } else {
      // File — ensure parent dir exists
      const parentDir = path.dirname(fullPath);
      if (!existsSync(parentDir)) {
        if (!dryRun) {
          mkdirSync(parentDir, { recursive: true });
        }
      }
      if (dryRun) {
        created.push(item.relativePath);
      } else {
        writeFileSync(fullPath, (item.content ?? ''), 'utf8');
        created.push(item.relativePath);
      }
    }
  }

  if (jsonMode) {
    outputJson({
      dry_run: dryRun,
      created,
      skipped,
    });
    return;
  }

  if (dryRun) {
    process.stdout.write('[DRY-RUN] Would create the following in docs/ai/:\n');
  } else {
    process.stdout.write('Initialized docs/ai/ skeleton:\n');
  }

  for (const c of created) {
    process.stdout.write(`  + ${c}\n`);
  }
  for (const s of skipped) {
    process.stdout.write(`  ~ ${s} (already exists, skipped)\n`);
  }

  if (created.length === 0 && !dryRun) {
    process.stdout.write('  (nothing to create — all items already exist)\n');
  }
}

// ── Main entry point ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Parse global-level arguments
  const allArgs = process.argv.slice(2);
  const remainingArgs: string[] = [];

  for (let i = 0; i < allArgs.length; i++) {
    const arg = allArgs[i];

    if (arg === '--json') {
      jsonMode = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else {
      remainingArgs.push(arg);
    }
  }

  if (remainingArgs.length === 0) {
    printUsage();
    throw new Error();
  }

  const command = remainingArgs[0];
  const cmdArgs = remainingArgs.slice(1);

  switch (command) {
    case 'status':
      await cmdStatus();
      break;
    case 'list-plans':
      await cmdListPlans();
      break;
    case 'list-adrs':
      await cmdListAdrs();
      break;
    case 'close-check':
      await cmdCloseCheck();
      break;
    case 'init':
      await cmdInit();
      break;
    case '--help':
    case '-h':
      printUsage();
      break;
    default:
      console.error(`Error: unknown command: ${command}`);
      printUsage();
      throw new Error();
  }
}

// ── Exports for testing ─────────────────────────────────────────────────────

export {
  cmdCloseCheck, cmdInit, cmdListAdrs, cmdListPlans, cmdStatus,
  countLines, getSkeleton, listDir, main, outputJson,
  printUsage, readFirstLines, resetState, _setDryRun, _setJsonMode, tryGit, workingTreeIsClean,
};

// ── Main entry guard ────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
if (
  __filename === process.argv[1] ||
  process.argv.slice(1).some((arg) => arg === __filename || arg.endsWith(path.basename(__filename)))
) {
  main().then(
    () => {
      process.exitCode = 0;
    },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (message) console.error(message);
      process.exitCode = 1;
    },
  );
}
