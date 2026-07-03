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

interface DocEntry {
  file: string;
  label: string;
  extra?: string;
}

// ── Global state ────────────────────────────────────────────────────────────

let jsonMode = false;
let dryRun = false;

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

// ponytail: inline git wrapper matches gh-issue.ts pattern;
// extract to shared scripts/lib/git.ts when skill scripts get a shared lib
const git = (args: string[], cwd?: string, t?: number): string =>
  execFileSync('git', args, { encoding: 'utf8', cwd, timeout: t }).trim();

function workingTreeIsClean(): boolean | null {
  try { return git(['status', '--porcelain'], process.cwd(), 5000).length === 0; }
  catch { return null; }
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

const adrFileFilter = (e: DirEntry): boolean =>
  !e.isDir && e.name.startsWith('ADR-') && e.name.endsWith('.md');

async function listDocs(opts: {
  dirName: string;
  entityName: string;
  jsonKey: string;
  fileFilter: (e: DirEntry) => boolean;
  parseFn: (filePath: string) => { label: string; extra?: string };
  textFormatter: (d: DocEntry) => string;
  jsonFormatter: (d: DocEntry) => unknown;
}): Promise<DocEntry[]> {
  const dir = path.join(docsAiDir(), opts.dirName);

  if (!existsSync(dir)) {
    if (jsonMode) {
      outputJson({ [opts.jsonKey]: [] });
    } else {
      process.stdout.write(`docs/ai/${opts.dirName}/ does not exist\n`);
    }
    return [];
  }

  const entries = listDir(dir)
    .filter(opts.fileFilter)
    .sort((a, b) => a.name.localeCompare(b.name));

  const docs: DocEntry[] = entries.map((e) => {
    const parsed = opts.parseFn(path.join(dir, e.name));
    return { file: e.name, label: parsed.label, extra: parsed.extra };
  });

  if (jsonMode) {
    outputJson({ [opts.jsonKey]: docs.map(opts.jsonFormatter) });
    return docs;
  }

  if (docs.length === 0) {
    process.stdout.write(`No ${opts.entityName} files found in docs/ai/${opts.dirName}/\n`);
    return docs;
  }

  for (const d of docs) {
    process.stdout.write(opts.textFormatter(d));
  }
  return docs;
}

// ponytail: closeCheck now composes from shared helpers;
// could further extract to pure data-return functions for cleaner composition
function getActivePlans(): { file: string; status: string; isActive: boolean }[] {
  const plansDir = path.join(docsAiDir(), 'plans');
  if (!existsSync(plansDir)) return [];

  const planFiles = listDir(plansDir)
    .filter((e) => !e.isDir && e.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name));

  return planFiles.map((entry) => {
    const filePath = path.join(plansDir, entry.name);
    const { title, status } = parsePlanFile(filePath);
    const isActive = !/completed|cancelled|done/i.test(status);
    return { file: entry.name, status, isActive };
  });
}

function getArchitectureInfo(): { exists: boolean; lines: number } {
  const archPath = path.join(docsAiDir(), 'architecture.md');
  if (!existsSync(archPath)) return { exists: false, lines: 0 };
  return { exists: true, lines: readFirstLines(archPath, Number.MAX_SAFE_INTEGER).length };
}

function countAdrs(): number {
  const decisionsDir = path.join(docsAiDir(), 'decisions');
  if (!existsSync(decisionsDir)) return 0;
  return listDir(decisionsDir).filter(adrFileFilter).length;
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

  const items = [
    { key: 'readme', label: 'README.md', path: path.join(dir, 'README.md'), type: 'file' as const },
    { key: 'architecture', label: 'architecture.md', path: path.join(dir, 'architecture.md'), type: 'file' as const },
    { key: 'backlog', label: 'backlog/README.md', path: path.join(dir, 'backlog', 'README.md'), type: 'file' as const },
    { key: 'decisions', label: 'decisions/', path: path.join(dir, 'decisions'), type: 'dir' as const },
    { key: 'plans', label: 'plans/', path: path.join(dir, 'plans'), type: 'dir' as const },
    { key: 'logs', label: 'logs/', path: path.join(dir, 'logs'), type: 'dir' as const },
  ];

  const values = new Map<string, number>();
  for (const item of items) {
    if (!existsSync(item.path)) {
      values.set(item.key, 0);
    } else if (item.type === 'file') {
      values.set(item.key, readFirstLines(item.path, Number.MAX_SAFE_INTEGER).length);
    } else {
      values.set(item.key, listDir(item.path).length);
    }
  }

  if (jsonMode) {
    outputJson({
      exists: true,
      files: {
        readme: { exists: (values.get('readme') ?? 0) > 0, lines: values.get('readme') ?? 0 },
        architecture: { exists: (values.get('architecture') ?? 0) > 0, lines: values.get('architecture') ?? 0 },
        backlog: { exists: (values.get('backlog') ?? 0) > 0, lines: values.get('backlog') ?? 0 },
        decisions: { exists: (values.get('decisions') ?? 0) > 0 || existsSync(path.join(dir, 'decisions')), count: values.get('decisions') ?? 0 },
        plans: { exists: (values.get('plans') ?? 0) > 0 || existsSync(path.join(dir, 'plans')), count: values.get('plans') ?? 0 },
        logs: { exists: (values.get('logs') ?? 0) > 0 || existsSync(path.join(dir, 'logs')), count: values.get('logs') ?? 0 },
      },
    });
    return;
  }

  process.stdout.write('docs/ai/ exists\n');
  for (const item of items) {
    const value = values.get(item.key) ?? 0;
    if (item.type === 'file') {
      process.stdout.write(value > 0 ? `  ${item.label}: ${value} lines\n` : `  ${item.label}: missing\n`);
    } else {
      const noun = item.key === 'decisions' ? 'ADRs' : item.key === 'plans' ? 'plans' : 'monthly logs';
      process.stdout.write(`  ${item.label}: ${value} ${noun}\n`);
    }
  }
}

async function cmdListPlans(): Promise<void> {
  await listDocs({
    dirName: 'plans',
    entityName: 'plan',
    jsonKey: 'plans',
    fileFilter: (e) => !e.isDir && e.name.endsWith('.md'),
    parseFn: (filePath) => {
      const { title, status } = parsePlanFile(filePath);
      return { label: title, extra: status };
    },
    jsonFormatter: (d) => ({ file: d.file, title: d.label, status: d.extra ?? '' }),
    textFormatter: (d) => {
      let out = `${d.file}\n`;
      if (d.label) out += `  Title: ${d.label}\n`;
      if (d.extra) out += `  Status: ${d.extra}\n`;
      if (!d.label && !d.extra) out += `  (no heading or status found)\n`;
      return out;
    },
  });
}

async function cmdListAdrs(): Promise<void> {
  await listDocs({
    dirName: 'decisions',
    entityName: 'ADR',
    jsonKey: 'adrs',
    fileFilter: adrFileFilter,
    parseFn: (filePath) => {
      const lines = readFirstLines(filePath, 5);
      for (const line of lines) {
        const match = /^#\s+(ADR-\d+):\s*(.+)/.exec(line);
        if (match) {
          return { label: `${match[1]}: ${match[2].trim()}` };
        }
      }
      return { label: '' };
    },
    jsonFormatter: (d) => {
      if (!d.label) return { file: d.file, number: '', title: '' };
      const match = /^(ADR-\d+):\s*(.+)$/.exec(d.label);
      if (match) {
        return { file: d.file, number: match[1], title: match[2].trim() };
      }
      return { file: d.file, number: '', title: d.label };
    },
    textFormatter: (d) =>
      d.label ? `${d.label}\n` : `${d.file}: (unparsable heading)\n`,
  });
}

async function cmdCloseCheck(): Promise<void> {
  const dir = docsAiDir();
  const aiExists = existsSync(dir);

  // Plan candidates: plans not marked as completed
  const plans = aiExists ? getActivePlans() : [];
  const activePlans = plans.filter((p) => p.isActive);
  const activePlanCount = activePlans.length;
  const activePlanDetails = activePlans.map((p) => `${p.file} — ${p.status || '(no status)'}`);

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
  const { exists: archExists, lines: archLines } = aiExists
    ? getArchitectureInfo()
    : { exists: false, lines: 0 };

  // ADR count
  const adrCount = aiExists ? countAdrs() : 0;

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
  getSkeleton, listDir, main, outputJson,
  printUsage, readFirstLines, workingTreeIsClean,
};

// ── Main entry guard ────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const argv1 = process.argv[1] ?? '';
const argv2 = process.argv[2] ?? '';
const base = path.basename(__filename);
if (argv1.endsWith(base) || argv2.endsWith(base)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
