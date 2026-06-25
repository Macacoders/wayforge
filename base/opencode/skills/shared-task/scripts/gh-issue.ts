#!/usr/bin/env node

import { execSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getValidToken } from './github-app-auth.ts';

// ── Custom error for clean non-zero exit ────────────────────────────────────
// Avoids process.exit() during pending async handles, which can trigger a
// Node.js-on-Windows libuv assertion (debug builds only, no functional impact).
class ExitError extends Error {
  constructor(public code: number, message?: string) {
    super(message ?? `exit(${code})`);
    this.name = 'ExitError';
  }
}

// ── Constants ───────────────────────────────────────────────────────────────

const GITHUB_API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';

const REQUIRED_LABELS = [
  'status:to-do',
  'status:doing',
  'status:in-review',
  'status:blocked',
  'type:task',
  'type:feature',
  'type:bug',
  'type:docs',
  'type:chore',
  'priority:high',
  'priority:medium',
  'priority:low',
];

// ── Types ───────────────────────────────────────────────────────────────────

interface GitHubLabel {
  name: string;
}

interface GitHubUser {
  login: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  assignees: GitHubUser[];
  labels: GitHubLabel[];
  html_url: string;
  body?: string;
}

interface GitHubPR {
  html_url: string;
  number: number;
  title: string;
  state: string;
}

// ── Global state ────────────────────────────────────────────────────────────

let jsonMode = false;
let dryRun = false;
let repo = '';
let token = '';

/** Reset all global state to defaults — used in tests. */
export function resetState(): void {
  jsonMode = false;
  dryRun = false;
  repo = '';
  token = '';
}
/** @internal Setter for tests */
export function _setJsonMode(v: boolean): void { jsonMode = v; }
/** @internal Setter for tests */
export function _setDryRun(v: boolean): void { dryRun = v; }
/** @internal Setter for tests */
export function _setRepo(r: string): void { repo = r; }
/** @internal Setter for tests */
export function _setToken(t: string): void { token = t; }

// ── Usage ───────────────────────────────────────────────────────────────────

function printUsage(): void {
  const text = [
    'Usage:',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] check',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] labels-check',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] list',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] create <title> [--body-file <path>] [--label <name>]...',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] claim <issue-number>',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] assign <issue-number> <collaborator>',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] release <issue-number> [--blocked <reason>]',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] close <issue-number> [completion-summary]',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] prclose <issue-number> [completion-summary]',
  ].join('\n');
  process.stdout.write(text + '\n');
}

// ── Auth ────────────────────────────────────────────────────────────────────

async function resolveToken(): Promise<string> {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }
  if (process.env.GH_TOKEN) {
    return process.env.GH_TOKEN;
  }
  return getValidToken();
}

// ── Repo detection ──────────────────────────────────────────────────────────

function extractRepoFromUrl(url: string): string | null {
  // git@github.com:OWNER/REPO[.git]
  let m = new RegExp(/^git@github\.com:(.+?)(?:\.git)?$/).exec(url);
  if (m) return m[1];

  // https://github.com/OWNER/REPO[.git]
  m = new RegExp(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/).exec(url);
  if (m) return m[1];

  // ssh://git@github.com/OWNER/REPO[.git]
  m = new RegExp(/^ssh:\/\/git@github\.com\/(.+?)(?:\.git)?$/).exec(url);
  if (m) return m[1];

  return null;
}

function resolveRepo(explicitRepo: string): string {
  if (explicitRepo) {
    return explicitRepo;
  }
  if (process.env.GH_REPO) {
    return process.env.GH_REPO;
  }
  try {
    const url = execSync('git remote get-url origin', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    const parsed = extractRepoFromUrl(url);
    if (parsed) return parsed;
    throw new Error(`unsupported git origin URL format: ${url}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('unsupported')) {
      throw err;
    }
    throw new ExitError(1, 'GH_REPO is not set and git remote origin is unavailable.');
  }
}

// ── GitHub API helper ───────────────────────────────────────────────────────

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${GITHUB_API_BASE}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION,
  };

  if (body !== undefined && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined,
  });

  // 204 No Content — no response body
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  // Try to parse JSON body for error details
  let responseBody: string | undefined;
  try {
    responseBody = await response.text();
  } catch {
    responseBody = undefined;
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    if (responseBody) {
      try {
        const parsed = JSON.parse(responseBody) as { message?: string };
        if (parsed.message) detail = parsed.message;
      } catch {
        detail = responseBody.slice(0, 500);
      }
    }
    throw new Error(`GitHub API error (${response.status}): ${detail}`);
  }

  if (!responseBody) {
    return undefined as unknown as T;
  }

  // Only parse JSON if content-type indicates it
  const ct = (response.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    return JSON.parse(responseBody) as T;
  }

  return responseBody as unknown as T;
}

function apiGet<T>(path: string): Promise<T> {
  return api<T>('GET', path);
}

function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return api<T>('POST', path, body);
}

function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return api<T>('PATCH', path, body);
}

function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  return api<T>('DELETE', path, body);
}

// ── Issue / label helper functions ──────────────────────────────────────────

async function getRepoLabels(): Promise<string[]> {
  const labels = await apiGet<GitHubLabel[]>(`/repos/${repo}/labels?per_page=100`);
  return labels.map((l) => l.name);
}

function getMissingRequiredLabels(existing: string[]): string[] {
  const set = new Set(existing);
  return REQUIRED_LABELS.filter((l) => !set.has(l));
}

async function ensureRequiredLabels(): Promise<void> {
  const existing = await getRepoLabels();
  const missing = getMissingRequiredLabels(existing);
  if (missing.length > 0) {
    throw new Error(`missing required labels: ${missing.join(', ')}`);
  }
}

async function getIssue(issueNumber: number): Promise<GitHubIssue> {
  return apiGet<GitHubIssue>(`/repos/${repo}/issues/${issueNumber}`);
}

async function getIssueState(issueNumber: number): Promise<string> {
  const issue = await getIssue(issueNumber);
  return issue.state;
}

async function getIssueAssigneeCount(issueNumber: number): Promise<number> {
  const issue = await getIssue(issueNumber);
  return issue.assignees?.length ?? 0;
}

async function getIssueFirstAssignee(issueNumber: number): Promise<string> {
  const issue = await getIssue(issueNumber);
  return issue.assignees?.[0]?.login ?? '';
}

async function issueHasLabel(issueNumber: number, labelName: string): Promise<boolean> {
  const issue = await getIssue(issueNumber);
  return issue.labels?.some((l) => l.name === labelName) ?? false;
}

async function addLabel(issueNumber: number, labelName: string): Promise<void> {
  if (dryRun) {
    console.error(`[DRY-RUN] add label '${labelName}' to issue #${issueNumber}`);
    return;
  }
  await apiPost(`/repos/${repo}/issues/${issueNumber}/labels`, { labels: [labelName] });
}

async function removeLabel(issueNumber: number, labelName: string): Promise<void> {
  if (dryRun) {
    console.error(`[DRY-RUN] remove label '${labelName}' from issue #${issueNumber}`);
    return;
  }
  await apiDelete(`/repos/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(labelName)}`);
}

async function addAssignee(issueNumber: number, username: string): Promise<void> {
  if (dryRun) {
    console.error(`[DRY-RUN] add assignee @${username} to issue #${issueNumber}`);
    return;
  }
  await apiPost(`/repos/${repo}/issues/${issueNumber}/assignees`, { assignees: [username] });
}

async function removeAssignee(issueNumber: number, username: string): Promise<void> {
  if (dryRun) {
    console.error(`[DRY-RUN] remove assignee @${username} from issue #${issueNumber}`);
    return;
  }
  await apiDelete(`/repos/${repo}/issues/${issueNumber}/assignees`, { assignees: [username] });
}

async function addComment(issueNumber: number, body: string): Promise<void> {
  if (dryRun) {
    console.error(`[DRY-RUN] add comment to issue #${issueNumber}: ${body.slice(0, 80)}`);
    return;
  }
  await apiPost(`/repos/${repo}/issues/${issueNumber}/comments`, { body });
}

async function closeIssue(issueNumber: number): Promise<void> {
  if (dryRun) {
    console.error(`[DRY-RUN] close issue #${issueNumber}`);
    return;
  }
  await apiPatch(`/repos/${repo}/issues/${issueNumber}`, { state: 'closed' });
}

async function getCurrentUser(): Promise<string> {
  const user = await apiGet<{ login: string }>('/user');
  return user.login;
}

// ── Guard helpers (with dry-run awareness) ──────────────────────────────────

async function ensureLabelPresent(issueNumber: number, labelName: string): Promise<void> {
  if (!(await issueHasLabel(issueNumber, labelName))) {
    await addLabel(issueNumber, labelName);
  }
}

async function ensureLabelAbsent(issueNumber: number, labelName: string): Promise<void> {
  if (await issueHasLabel(issueNumber, labelName)) {
    await removeLabel(issueNumber, labelName);
  }
}

async function ensureOpenIssue(issueNumber: number): Promise<void> {
  const state = await getIssueState(issueNumber);
  if (state !== 'open' && state !== 'OPEN') {
    throw new Error(`issue #${issueNumber} is not open.`);
  }
}

// ── Output helper ───────────────────────────────────────────────────────────

function output(data: unknown): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    process.stdout.write(String(data) + '\n');
  }
}

function outputJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data) + '\n');
}

// ── Additional helpers for prclose / create ────────────────────────────────

async function getDefaultBranch(): Promise<string> {
  const repoData = await apiGet<{ default_branch: string }>(`/repos/${repo}`);
  return repoData.default_branch;
}

function getRepoRoot(): string {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf8', timeout: 5000 }).trim();
}

function getCurrentBranch(): string {
  return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', timeout: 5000 }).trim();
}

function workingTreeIsClean(): boolean {
  const status = execSync('git status --porcelain', { encoding: 'utf8', timeout: 5000 }).trim();
  return status.length === 0;
}

function slugify(text: string): string {
  // Match the Bash tr + sed pipeline: lowercase, collapse non-alnum to '-', strip edges, truncate 60
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length <= 60) return slug.replace(/-+$/, '');

  // Try to break at a word boundary to avoid mid-word truncation
  const candidate = slug.slice(0, 61);
  const lastHyphen = candidate.lastIndexOf('-');
  if (lastHyphen > 0) {
    return candidate.slice(0, lastHyphen).replace(/-+$/, '');
  }
  return slug.slice(0, 60).replace(/-+$/, '');
}

function buildPRBody(issueNumber: number): string {
  const repoRoot = getRepoRoot();
  const tempPath = path.join(repoRoot, 'temp', `pr-body-${issueNumber}.md`);
  const tempDir = path.dirname(tempPath);
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  if (existsSync(tempPath)) {
    return readFileSync(tempPath, 'utf8');
  }

  const templatePath = path.join(repoRoot, '.github', 'pull_request_template.md');
  let body = `Fixes #${issueNumber}\n\n`;

  if (existsSync(templatePath)) {
    body += readFileSync(templatePath, 'utf8');
  } else {
    body += [
      '## Summary',
      '',
      '_Describe the purpose and scope of this change. What problem does it solve? What does it implement?_',
      '',
      '## Testing',
      '',
      '_Describe how you validated this change. List tests run, commands executed, or review scenarios checked._',
      '',
      '## Breaking changes',
      '',
      '_List any breaking changes to contracts, workflows, configuration, or APIs. If none, state "None."_',
    ].join('\n');
  }

  return body;
}

// ── Command handlers (Stage 1: check + labels-check implemented; others stubbed) ──

async function cmdCheck(): Promise<void> {
  await apiGet(`/repos/${repo}`);
  if (jsonMode) {
    outputJson({ status: 'ok', repo });
  } else {
    output(`OK: GitHub access verified for ${repo}`);
  }
}

async function cmdLabelsCheck(): Promise<void> {
  const existing = await getRepoLabels();
  const missing = getMissingRequiredLabels(existing);
  if (missing.length > 0) {
    if (jsonMode) {
      outputJson({ status: 'error', repo, missing });
    } else {
      console.error(`Missing required labels in ${repo}:`);
      for (const label of missing) {
        console.error(`  - ${label}`);
      }
    }
    throw new ExitError(1);
  }
  if (jsonMode) {
    outputJson({ status: 'ok', repo });
  } else {
    output(`OK: all required labels are present in ${repo}`);
  }
}

async function cmdList(): Promise<void> {
  await ensureRequiredLabels();
  const issues = await apiGet<Array<GitHubIssue & { pull_request?: unknown }>>(
    `/repos/${repo}/issues?state=open&per_page=100&sort=created&direction=desc`,
  );

  // Filter out pull requests (GitHub issues endpoint returns both)
  const realIssues = issues.filter((i) => !i.pull_request);

  if (jsonMode) {
    outputJson(
      realIssues.map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state,
        assignees: (i.assignees ?? []).map((a) => a.login),
        labels: (i.labels ?? []).map((l) => l.name),
        status_labels: (i.labels ?? [])
          .filter((l) => l.name.startsWith('status:'))
          .map((l) => l.name),
      })),
    );
    return;
  }

  for (const issue of realIssues) {
    const assigneeStr =
      issue.assignees?.length ? issue.assignees.map((a) => a.login).join(',') : '-';
    const statusLabels = (issue.labels ?? [])
      .filter((l) => l.name.startsWith('status:'))
      .map((l) => l.name.replace(/^status:/, ''));
    const statusStr = statusLabels.length ? statusLabels.join(',') : '-';
    process.stdout.write(
      `#${issue.number}\t${issue.title}\tassignee:${assigneeStr}\tstatus:${statusStr}\n`,
    );
  }
}

async function cmdCreate(args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('Error: create requires <title>.');
    throw new ExitError(1);
  }

  const title = args[0];
  let bodyFile: string | undefined;
  const labels: string[] = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--body-file') {
      i++;
      if (i >= args.length) {
        console.error('Error: --body-file requires a path.');
        throw new ExitError(1);
      }
      bodyFile = args[i];
    } else if (arg.startsWith('--body-file=')) {
      bodyFile = arg.slice('--body-file='.length);
    } else if (arg === '--label') {
      i++;
      if (i >= args.length) {
        console.error('Error: --label requires a value.');
        throw new ExitError(1);
      }
      labels.push(args[i]);
    } else if (arg.startsWith('--label=')) {
      labels.push(arg.slice('--label='.length));
    } else {
      console.error(`Error: unknown create option: ${arg}`);
      throw new ExitError(1);
    }
  }

  if (dryRun) {
    const msg = `[DRY-RUN] would create issue with title='${title}'`;
    const parts = [msg];
    if (bodyFile) parts.push(`body-file='${bodyFile}'`);
    if (labels.length) parts.push(`labels=[${labels.join(', ')}]`);
    console.error(parts.join(' '));
    return;
  }

  await ensureRequiredLabels();

  const bodyPayload: { title: string; body?: string; labels?: string[] } = {
    title,
  };

  if (bodyFile) {
    let resolvedFile = bodyFile;
    if (!path.isAbsolute(bodyFile)) {
      resolvedFile = path.resolve(process.cwd(), bodyFile);
    }
    bodyPayload.body = readFileSync(resolvedFile, 'utf8');
  }

  if (labels.length > 0) {
    bodyPayload.labels = labels;
  }

  const created = await apiPost<GitHubIssue>(`/repos/${repo}/issues`, bodyPayload);

  if (jsonMode) {
    outputJson({ number: created.number, url: created.html_url, title: created.title });
  } else {
    process.stdout.write(`${created.html_url}\n`);
  }
}

async function cmdClaim(args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('Error: claim requires <issue-number>.');
    throw new ExitError(1);
  }

  const issueNumber = Number(args[0]);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    console.error('Error: invalid issue number.');
    throw new ExitError(1);
  }

  if (dryRun) {
    console.error(`[DRY-RUN] would claim issue #${issueNumber}`);
    return;
  }

  await ensureRequiredLabels();
  await ensureOpenIssue(issueNumber);

  if ((await getIssueAssigneeCount(issueNumber)) !== 0) {
    const assignee = await getIssueFirstAssignee(issueNumber);
    throw new Error(`issue #${issueNumber} is already assigned to @${assignee}.`);
  }

  if (await issueHasLabel(issueNumber, 'status:doing')) {
    throw new Error(`issue #${issueNumber} already has status:doing.`);
  }

  const me = await getCurrentUser();
  await addAssignee(issueNumber, me);
  await ensureLabelPresent(issueNumber, 'status:doing');
  await ensureLabelAbsent(issueNumber, 'status:to-do');
  await addComment(issueNumber, `Claimed by @${me} and starting work.`);

  if (jsonMode) {
    outputJson({ number: issueNumber, assignee: me, status: 'doing' });
  }
}

async function cmdAssign(args: string[]): Promise<void> {
  if (args.length < 2) {
    console.error('Error: assign requires <issue-number> <collaborator>.');
    throw new ExitError(1);
  }

  const issueNumber = Number(args[0]);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    console.error('Error: invalid issue number.');
    throw new ExitError(1);
  }

  const collaborator = args[1];

  await ensureRequiredLabels();
  await ensureOpenIssue(issueNumber);

  if ((await getIssueAssigneeCount(issueNumber)) !== 0) {
    const assignee = await getIssueFirstAssignee(issueNumber);
    throw new Error(`issue #${issueNumber} is already assigned to @${assignee}.`);
  }

  if (await issueHasLabel(issueNumber, 'status:doing')) {
    throw new Error(`issue #${issueNumber} already has status:doing.`);
  }

  await addAssignee(issueNumber, collaborator);
  await ensureLabelPresent(issueNumber, 'status:doing');
  await ensureLabelAbsent(issueNumber, 'status:to-do');
  await addComment(issueNumber, `Assigned to @${collaborator} and marked status:doing.`);

  if (jsonMode) {
    outputJson({ number: issueNumber, assignee: collaborator, status: 'doing' });
  }
}

async function cmdRelease(args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('Error: release requires <issue-number>.');
    throw new ExitError(1);
  }

  const issueNumber = Number(args[0]);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    console.error('Error: invalid issue number.');
    throw new ExitError(1);
  }

  let blockedReason: string | undefined;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--blocked') {
      i++;
      if (i >= args.length) {
        console.error('Error: --blocked requires a reason.');
        throw new ExitError(1);
      }
      blockedReason = args[i];
    } else {
      console.error(`Error: unknown release option: ${arg}`);
      throw new ExitError(1);
    }
  }

  await ensureRequiredLabels();
  await ensureOpenIssue(issueNumber);

  const me = await getCurrentUser();
  const assignee = await getIssueFirstAssignee(issueNumber);

  if (assignee && assignee !== me) {
    throw new Error(`issue #${issueNumber} is assigned to @${assignee} (not @${me}).`);
  }

  if (assignee === me) {
    await removeAssignee(issueNumber, me);
  }

  await ensureLabelAbsent(issueNumber, 'status:doing');

  if (blockedReason) {
    await ensureLabelAbsent(issueNumber, 'status:to-do');
    await ensureLabelPresent(issueNumber, 'status:blocked');
    await addComment(issueNumber, `Released by @${me}. Blocked: ${blockedReason}`);
    if (jsonMode) {
      outputJson({ number: issueNumber, status: 'blocked', blocked_reason: blockedReason });
    }
  } else {
    await ensureLabelAbsent(issueNumber, 'status:blocked');
    await ensureLabelAbsent(issueNumber, 'status:in-review');
    await ensureLabelPresent(issueNumber, 'status:to-do');
    await addComment(issueNumber, `Released by @${me} and returned to status:to-do.`);
    if (jsonMode) {
      outputJson({ number: issueNumber, status: 'to-do' });
    }
  }
}

async function cmdClose(args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('Error: close requires <issue-number>.');
    throw new ExitError(1);
  }

  const issueNumber = Number(args[0]);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    console.error('Error: invalid issue number.');
    throw new ExitError(1);
  }

  const summary = args.slice(1).join(' ') || 'Completed and validated.';

  await ensureRequiredLabels();
  await ensureOpenIssue(issueNumber);

  await addComment(issueNumber, summary);
  await ensureLabelAbsent(issueNumber, 'status:doing');
  await ensureLabelAbsent(issueNumber, 'status:to-do');
  await ensureLabelAbsent(issueNumber, 'status:in-review');
  await ensureLabelAbsent(issueNumber, 'status:blocked');
  await closeIssue(issueNumber);

  if (jsonMode) {
    outputJson({ number: issueNumber, state: 'closed' });
  }
}

async function cmdPrclose(args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('Error: prclose requires <issue-number>.');
    throw new ExitError(1);
  }

  const issueNumber = Number(args[0]);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    console.error('Error: invalid issue number.');
    throw new ExitError(1);
  }

  const summary = args.slice(1).join(' ') || 'Ready for review via PR.';

  // ── Local checks (no API calls) ──────────────────────────────────────────
  // Get current branch
  let currentBranch: string;
  try {
    currentBranch = getCurrentBranch();
  } catch {
    throw new Error('prclose requires an active local branch.');
  }
  if (!currentBranch || currentBranch === 'HEAD') {
    throw new Error('prclose requires an active local branch.');
  }

  // Check protected branches
  const protectedBranches = new Set(['main', 'master', 'develop']);
  const isProtected = protectedBranches.has(currentBranch);

  // Non-protected branch: require clean tree
  if (!isProtected) {
    try {
      if (!workingTreeIsClean()) {
        throw new Error('prclose requires a clean working tree. Commit or stash changes first.');
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('clean working tree')) {
        throw err;
      }
      throw new Error('prclose requires a clean working tree. Commit or stash changes first.');
    }
  }

  // Early dry-run guard — skip all API calls
  if (dryRun) {
    console.error(`[DRY-RUN] would create PR for issue #${issueNumber}`);
    console.error(`[DRY-RUN] would update labels to status:in-review`);
    return;
  }

  // ── API calls ───────────────────────────────────────────────────────────
  await ensureRequiredLabels();
  await ensureOpenIssue(issueNumber);

  // Get issue title for PR / feature branch
  const issueTitle = (await getIssue(issueNumber)).title;

  // Handle protected branch auto-commit
  let branchWasCreated = false;
  if (isProtected) {
    const slug = slugify(issueTitle);
    const featureBranch = `feature/issue-${issueNumber}-${slug}`;
    process.stdout.write(`On protected branch '${currentBranch}'. Creating feature branch '${featureBranch}'...\n`);
    execFileSync('git', ['checkout', '-b', featureBranch], { encoding: 'utf8', timeout: 15000 });
    execFileSync('git', ['add', '-A'], { encoding: 'utf8', timeout: 15000 });
    execFileSync('git', ['commit', '-m', `[Issue #${issueNumber}] ${issueTitle}`], {
      encoding: 'utf8',
      timeout: 15000,
    });
    execFileSync('git', ['push', '-u', 'origin', featureBranch], { encoding: 'utf8', timeout: 30000 });
    currentBranch = featureBranch;
    branchWasCreated = true;
  }

  // Build PR body
  const prBody = buildPRBody(issueNumber);

  // Get default branch for PR base
  const defaultBranch = await getDefaultBranch();

  // Get current user for PR assignee
  const me = await getCurrentUser();

  // Create PR
  const pr = await apiPost<GitHubPR>(`/repos/${repo}/pulls`, {
    title: `[Issue #${issueNumber}] '${issueTitle}'`,
    head: currentBranch,
    base: defaultBranch,
    body: prBody,
    maintainer_can_modify: true,
    assignees: [me],
  });
  const prUrl = pr.html_url;
  process.stdout.write(`${prUrl}\n`);

  // Comment on issue
  await addComment(issueNumber, `${summary}\n\nPull request: ${prUrl}`);

  // Update labels
  await ensureLabelAbsent(issueNumber, 'status:doing');
  await ensureLabelAbsent(issueNumber, 'status:to-do');
  await ensureLabelAbsent(issueNumber, 'status:blocked');
  await ensureLabelPresent(issueNumber, 'status:in-review');

  if (jsonMode) {
    outputJson({ number: issueNumber, pr_url: prUrl, status: 'in-review' });
  }
}

// ── Main entry point ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Parse global-level arguments
  const allArgs = process.argv.slice(2);
  let explicitRepo = '';
  const remainingArgs: string[] = [];

  for (let i = 0; i < allArgs.length; i++) {
    const arg = allArgs[i];

    if (arg === '--repo' || arg === '-R') {
      i++;
      if (i >= allArgs.length) {
        console.error('Error: --repo/-R requires OWNER/REPO value.');
        throw new ExitError(1);
      }
      explicitRepo = allArgs[i];
    } else if (arg.startsWith('--repo=') || arg.startsWith('-R=')) {
      const eqIdx = arg.indexOf('=');
      explicitRepo = arg.slice(eqIdx + 1);
    } else if (arg === '--json') {
      jsonMode = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else {
      remainingArgs.push(arg);
    }
  }

  if (remainingArgs.length === 0) {
    printUsage();
    throw new ExitError(1);
  }

  const command = remainingArgs[0];
  const cmdArgs = remainingArgs.slice(1);

  // Resolve auth token (may throw if no token available and device flow fails)
  if (!dryRun) {
    token = await resolveToken();
  }

  // Resolve repository owner/name
  repo = resolveRepo(explicitRepo);

  // Dispatch
  switch (command) {
    case 'check':
      await cmdCheck();
      break;
    case 'labels-check':
      await cmdLabelsCheck();
      break;
    case 'list':
      await cmdList();
      break;
    case 'create':
      await cmdCreate(cmdArgs);
      break;
    case 'claim':
      await cmdClaim(cmdArgs);
      break;
    case 'assign':
      await cmdAssign(cmdArgs);
      break;
    case 'release':
      await cmdRelease(cmdArgs);
      break;
    case 'close':
      await cmdClose(cmdArgs);
      break;
    case 'prclose':
      await cmdPrclose(cmdArgs);
      break;
    case 'raw':
      console.error('Error: raw subcommand is not available in the TypeScript implementation.');
      throw new ExitError(1);
    default:
      console.error(`Error: unknown command: ${command}`);
      printUsage();
      throw new ExitError(1);
  }
}

// ── Exports for testing ─────────────────────────────────────────────────────

export {
  addAssignee, addComment, addLabel, api, apiDelete, apiGet, apiPatch, apiPost, buildPRBody, closeIssue, cmdAssign, cmdCheck, cmdClaim, cmdClose, cmdCreate, cmdLabelsCheck,
  cmdList, cmdPrclose, cmdRelease, ensureLabelAbsent, ensureLabelPresent, ensureOpenIssue, ensureRequiredLabels, ExitError, extractRepoFromUrl, getCurrentUser, getDefaultBranch, getIssue, getIssueAssigneeCount,
  getIssueFirstAssignee, getIssueState, getMissingRequiredLabels, getRepoLabels, issueHasLabel, main, output,
  outputJson, printUsage, removeAssignee, removeLabel, REQUIRED_LABELS, resolveRepo, resolveToken, slugify
};

// ── Main entry guard ─────────────────────────────────────────────────────────
// Only auto-execute when run directly via `npx tsx gh-issue.ts`.
// When imported as a module (e.g., in tests), main() is not called automatically.

const __filename = fileURLToPath(import.meta.url);
if (
  __filename === process.argv[1] ||
  process.argv.slice(1).some((arg) => arg === __filename || arg.endsWith(path.basename(__filename)))
) {
  // Use .then/.catch instead of top-level await so we can set exitCode without
  // calling process.exit() during pending async handles (avoids Node-on-Windows
  // libuv assertion in debug builds).
  main().then(
    () => {
      process.exitCode = 0;
    },
    (err: unknown) => {
      if (err instanceof ExitError) {
        process.exitCode = err.code;
      } else {
        const message = err instanceof Error ? err.message : String(err);
        if (message) console.error(message);
        process.exitCode = 1;
      }
    },
  );
}
