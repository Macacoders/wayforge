#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getValidToken } from './gh-app-auth.ts';

const git = (args: string[], cwd?: string, t?: number) =>
  execFileSync('git', args, { encoding: 'utf8', cwd, timeout: t }).trim();

// ── Constants ───────────────────────────────────────────────────────────────

const GITHUB_API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/** Team requested as reviewer on every PR created by `prclose` (Issue #234). */
const PR_REVIEW_TEAM = 'wayforge-maintainers';

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

/** Flags accepted by `edit`; each takes exactly one value. */
const EDIT_VALUE_FLAGS = new Set([
  '--title',
  '--body-file',
  '--add-label',
  '--remove-label',
]);

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
  pull_request?: unknown;
}

interface GitHubPR {
  html_url: string;
  number: number;
  title: string;
  state: string;
}

interface GhContext {
  jsonMode: boolean;
  dryRun: boolean;
  repo: string;
  token: string;
}

// ── Usage ───────────────────────────────────────────────────────────────────

function printUsage(): void {
  const text = [
    'Usage:',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] check',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] labels-check',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] list',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] create <title> [--body-file <path>] [--label <name>]...',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] edit <issue-number> [--title <title>] [--body-file <path>] [--add-label <name>]... [--remove-label <name>]...',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] claim <issue-number>',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] assign <issue-number> <collaborator>',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] release <issue-number> [--blocked <reason>]',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] close <issue-number> [completion-summary]',
    '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] prclose <issue-number> [completion-summary]',
  '  gh-issue.ts [--repo OWNER/REPO|-R OWNER/REPO] [--json] [--dry-run] show <issue-number>',
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
    const url = git(['remote', 'get-url', 'origin'], undefined, 5000);
    const parsed = extractRepoFromUrl(url);
    if (parsed) return parsed;
    throw new Error(`unsupported git origin URL format: ${url}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('unsupported')) {
      throw err;
    }
    throw new Error('GH_REPO is not set and git remote origin is unavailable.');
  }
}

// ── GitHub API helper ───────────────────────────────────────────────────────

async function api<T>(ctx: GhContext, method: string, path: string, body?: unknown): Promise<T> {
  if (method === 'GET' && body !== undefined) {
    throw new Error('GET request must not include a body');
  }
  const url = `${GITHUB_API_BASE}${path}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${ctx.token}`,
    'X-GitHub-Api-Version': API_VERSION,
  };
  if (body !== undefined && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  const fetchOptions = {
    method,
    headers,
    body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined,
  };

  let response = await fetch(url, fetchOptions);
  if (!response.ok && response.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    response = await fetch(url, fetchOptions);
  }

  // 204 No Content — no response body
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  // Read response body text
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

// ponytail: readability — inlining at 6 call sites would be more verbose
function apiGet<T>(ctx: GhContext, path: string): Promise<T> {
  return api<T>(ctx, 'GET', path);
}

// ponytail: readability — inlining at 5 call sites would be more verbose
function apiPost<T>(ctx: GhContext, path: string, body?: unknown): Promise<T> {
  return api<T>(ctx, 'POST', path, body);
}

// ── Issue / label helper functions ──────────────────────────────────────────

async function getRepoLabels(ctx: GhContext): Promise<string[]> {
  const allLabels: string[] = [];
  let page = 1;
  while (true) {
    const labels = await apiGet<GitHubLabel[]>(ctx, `/repos/${ctx.repo}/labels?per_page=100&page=${page}`);
    if (labels.length === 0) break;
    allLabels.push(...labels.map((l) => l.name));
    page++;
  }
  return allLabels;
}

async function ensureRequiredLabels(ctx: GhContext): Promise<Set<string>> {
  const existing = await getRepoLabels(ctx);
  const existingSet = new Set(existing);
  const missing = REQUIRED_LABELS.filter((l) => !existingSet.has(l));
  if (missing.length > 0) {
    throw new Error(`missing required labels: ${missing.join(', ')}`);
  }
  return existingSet;
}

async function getIssue(ctx: GhContext, issueNumber: number): Promise<GitHubIssue> {
  return apiGet<GitHubIssue>(ctx, `/repos/${ctx.repo}/issues/${issueNumber}`);
}

function getIssueState(issue: GitHubIssue): string {
  return issue.state;
}

function getIssueAssigneeCount(issue: GitHubIssue): number {
  return issue.assignees?.length ?? 0;
}

function getIssueFirstAssignee(issue: GitHubIssue): string {
  return issue.assignees?.[0]?.login ?? '';
}

function issueHasLabel(issue: GitHubIssue, labelName: string): boolean {
  return issue.labels?.some((l) => l.name === labelName) ?? false;
}

async function addLabel(ctx: GhContext, issueNumber: number, labelName: string): Promise<void> {
  if (ctx.dryRun) {
    console.error(`[DRY-RUN] add label '${labelName}' to issue #${issueNumber}`);
    return;
  }
  await apiPost(ctx, `/repos/${ctx.repo}/issues/${issueNumber}/labels`, { labels: [labelName] });
}

async function removeLabel(ctx: GhContext, issueNumber: number, labelName: string): Promise<void> {
  if (ctx.dryRun) {
    console.error(`[DRY-RUN] remove label '${labelName}' from issue #${issueNumber}`);
    return;
  }
  await api(ctx, 'DELETE', `/repos/${ctx.repo}/issues/${issueNumber}/labels/${encodeURIComponent(labelName)}`);
}

async function addAssignee(ctx: GhContext, issueNumber: number, username: string): Promise<void> {
  if (ctx.dryRun) {
    console.error(`[DRY-RUN] add assignee @${username} to issue #${issueNumber}`);
    return;
  }
  await apiPost(ctx, `/repos/${ctx.repo}/issues/${issueNumber}/assignees`, { assignees: [username] });
}

async function removeAssignee(ctx: GhContext, issueNumber: number, username: string): Promise<void> {
  if (ctx.dryRun) {
    console.error(`[DRY-RUN] remove assignee @${username} from issue #${issueNumber}`);
    return;
  }
  await api(ctx, 'DELETE', `/repos/${ctx.repo}/issues/${issueNumber}/assignees`, { assignees: [username] });
}

async function addComment(ctx: GhContext, issueNumber: number, body: string): Promise<void> {
  if (ctx.dryRun) {
    console.error(`[DRY-RUN] add comment to issue #${issueNumber}: ${body.slice(0, 80)}`);
    return;
  }
  await apiPost(ctx, `/repos/${ctx.repo}/issues/${issueNumber}/comments`, { body });
}

/** Request a team review on a PR. Non-fatal: warns on stderr if the API call fails. */
async function requestTeamReview(ctx: GhContext, prNumber: number, team: string): Promise<void> {
  if (ctx.dryRun) {
    console.error(`[DRY-RUN] request review from team '${team}' on PR #${prNumber}`);
    return;
  }
  try {
    await apiPost(ctx, `/repos/${ctx.repo}/pulls/${prNumber}/requested_reviewers`, { team_reviewers: [team] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`⚠ could not request review from team '${team}' on PR #${prNumber}: ${message}\n`);
  }
}

async function closeIssue(ctx: GhContext, issueNumber: number): Promise<void> {
  if (ctx.dryRun) {
    console.error(`[DRY-RUN] close issue #${issueNumber}`);
    return;
  }
  await api(ctx, 'PATCH', `/repos/${ctx.repo}/issues/${issueNumber}`, { state: 'closed' });
}

async function getCurrentUser(ctx: GhContext): Promise<string> {
  const user = await apiGet<{ login: string }>(ctx, '/user');
  return user.login;
}

// ── Guard helpers (with dry-run awareness) ──────────────────────────────────

async function ensureLabelPresent(ctx: GhContext, issue: GitHubIssue, labelName: string): Promise<void> {
  if (!issueHasLabel(issue, labelName)) {
    await addLabel(ctx, issue.number, labelName);
  }
}

async function ensureLabelAbsent(ctx: GhContext, issue: GitHubIssue, labelName: string): Promise<void> {
  if (issueHasLabel(issue, labelName)) {
    await removeLabel(ctx, issue.number, labelName);
  }
}

/** Reject targets that must never be mutated. GET /issues/{n} returns pull
 * requests too, and only open issues can be claimed/assigned/released/closed. */
async function ensureMutableIssue(issue: GitHubIssue): Promise<void> {
  if (issue.pull_request) {
    throw new Error(`#${issue.number} is a pull request, not an issue.`);
  }
  const state = getIssueState(issue);
  if (state !== 'open') {  // GitHub REST API always returns lowercase "open"
    throw new Error(`issue #${issue.number} is not open.`);
  }
}

/** Validate label edits before any mutation: additions must exist in the repo,
 * removals must be present on the issue. No auto-create. */
function preflightLabelEdits(
  issue: GitHubIssue,
  repoLabels: ReadonlySet<string>,
  addLabels: ReadonlySet<string>,
  removeLabels: ReadonlySet<string>,
): void {
  const unknownAdd = [...addLabels].filter((l) => !repoLabels.has(l));
  if (unknownAdd.length > 0) {
    throw new Error(`unknown labels: ${unknownAdd.join(', ')}`);
  }
  const notPresent = [...removeLabels].filter((l) => !issueHasLabel(issue, l));
  if (notPresent.length > 0) {
    throw new Error(`issue #${issue.number} does not have labels: ${notPresent.join(', ')}`);
  }
}

// ── Output helper ───────────────────────────────────────────────────────────

function output(ctx: GhContext, data: unknown): void {
  if (ctx.jsonMode) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    process.stdout.write(String(data) + '\n');
  }
}

function outputJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data) + '\n');
}

// ── Additional helpers for prclose / create ────────────────────────────────

async function getDefaultBranch(ctx: GhContext): Promise<string> {
  const repoData = await apiGet<{ default_branch: string }>(ctx, `/repos/${ctx.repo}`);
  return repoData.default_branch;
}

function getRepoRoot(): string {
  return git(['rev-parse', '--show-toplevel'], undefined, 5000);
}

function getCurrentBranch(): string {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], undefined, 5000);
}

function workingTreeIsClean(): boolean {
  const status = git(['status', '--porcelain'], undefined, 5000);
  return status.length === 0;
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.slice(0, 60).replace(/-+$/, '');
}

/** Canonical scratch path for the agent-pre-populated PR body (ADR-0027). */
function prBodyScratchPath(repoRoot: string, issueNumber: number): string {
  return path.join(repoRoot, 'temp', `pr-body-${issueNumber}.md`);
}

function buildPRBody(issueNumber: number): string {
  const repoRoot = getRepoRoot();

  // Always prepend the auto-close keyword so the issue closes when the PR merges.
  let body = `Fixes #${issueNumber}\n\n`;

  // Agent pre-population mode: read temp file if it exists
  const tempPath = prBodyScratchPath(repoRoot, issueNumber);
  if (existsSync(tempPath)) {
    body += readFileSync(tempPath, 'utf8');
    return body;
  }

  process.stderr.write(`⚠ PR body not pre-populated for #${issueNumber} — using empty template. Write ${prBodyScratchPath(repoRoot, issueNumber)} before prclose to customize the PR body.\n`);

  // Template fallback mode
  const templatePath = path.join(repoRoot, '.github', 'pull_request_template.md');

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

// ── Command handlers ──

async function cmdCheck(ctx: GhContext): Promise<void> {
  await apiGet(ctx, `/repos/${ctx.repo}`);
  if (ctx.jsonMode) {
    outputJson({ status: 'ok', repo: ctx.repo });
  } else {
    output(ctx, `OK: GitHub access verified for ${ctx.repo}`);
  }
}

async function cmdLabelsCheck(ctx: GhContext): Promise<void> {
  const existing = await getRepoLabels(ctx);
  const existingSet = new Set(existing);
  const missing = REQUIRED_LABELS.filter((l) => !existingSet.has(l));
  if (missing.length > 0) {
    if (ctx.jsonMode) {
      outputJson({ status: 'error', repo: ctx.repo, missing });
    } else {
      console.error(`Missing required labels in ${ctx.repo}:`);
      for (const label of missing) {
        console.error(`  - ${label}`);
      }
    }
    throw new Error();
  }
  if (ctx.jsonMode) {
    outputJson({ status: 'ok', repo: ctx.repo });
  } else {
    output(ctx, `OK: all required labels are present in ${ctx.repo}`);
  }
}

async function cmdList(ctx: GhContext): Promise<void> {
  await ensureRequiredLabels(ctx);
  const issues = await apiGet<GitHubIssue[]>(
    ctx,
    `/repos/${ctx.repo}/issues?state=open&per_page=100&sort=created&direction=desc`,
  );

  // Filter out pull requests (GitHub issues endpoint returns both)
  const realIssues = issues.filter((i) => !i.pull_request);

  if (ctx.jsonMode) {
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
      .map((l) => l.name);
    const statusStr = statusLabels.length ? statusLabels.join(',') : '-';
    process.stdout.write(
      `#${issue.number}\t${issue.title}\tassignee:${assigneeStr}\t${statusStr}\n`,
    );
  }
}

/** Split `--flag=value` into `['--flag', 'value']`; other args pass through. */
function splitFlagArg(arg: string): string[] {
  const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
  return eq > 0 ? [arg.slice(0, eq), arg.slice(eq + 1)] : [arg];
}

/** Reject empty/whitespace-only values for flags that must be non-empty. */
function requireNonEmptyValue(
  flag: string,
  value: string,
  message = `${flag} requires a non-empty value.`,
): void {
  if (value.trim() === '') {
    console.error(`Error: ${message}`);
    throw new Error();
  }
}

/** Resolve a `--body-file` path relative to cwd, rejecting empty paths up front. */
function resolveBodyFile(bodyFile: string): string {
  requireNonEmptyValue('--body-file', bodyFile, '--body-file requires a non-empty path.');
  return path.isAbsolute(bodyFile) ? bodyFile : path.resolve(process.cwd(), bodyFile);
}

async function cmdCreate(ctx: GhContext, args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('Error: create requires <title>.');
    throw new Error();
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
        throw new Error();
      }
      bodyFile = args[i];
    } else if (arg.startsWith('--body-file=')) {
      bodyFile = arg.slice('--body-file='.length);
    } else if (arg === '--label') {
      i++;
      if (i >= args.length) {
        console.error('Error: --label requires a value.');
        throw new Error();
      }
      labels.push(args[i]);
    } else if (arg.startsWith('--label=')) {
      labels.push(arg.slice('--label='.length));
    } else {
      console.error(`Error: unknown create option: ${arg}`);
      throw new Error();
    }
  }

  const resolvedBodyFile =
    bodyFile !== undefined ? resolveBodyFile(bodyFile) : undefined;

  if (ctx.dryRun) {
    const msg = `[DRY-RUN] would create issue with title='${title}'`;
    const parts = [msg];
    if (bodyFile) parts.push(`body-file='${bodyFile}'`);
    if (labels.length) parts.push(`labels=[${labels.join(', ')}]`);
    console.error(parts.join(' '));
    return;
  }

  const bodyPayload: { title: string; body?: string; labels?: string[] } = {
    title,
  };

  if (resolvedBodyFile !== undefined) {
    bodyPayload.body = readFileSync(resolvedBodyFile, 'utf8');
  }

  if (labels.length > 0) {
    bodyPayload.labels = labels;
  }

  await ensureRequiredLabels(ctx);

  const created = await apiPost<GitHubIssue>(ctx, `/repos/${ctx.repo}/issues`, bodyPayload);

  if (ctx.jsonMode) {
    outputJson({ number: created.number, url: created.html_url, title: created.title });
  } else {
    process.stdout.write(`${created.html_url}\n`);
  }
}

async function cmdEdit(ctx: GhContext, args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('Error: edit requires <issue-number>.');
    throw new Error();
  }

  const issueNumber = Number(args[0]);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    console.error('Error: invalid issue number.');
    throw new Error();
  }

  let title: string | undefined;
  let bodyFile: string | undefined;
  const addLabels = new Set<string>();
  const removeLabels = new Set<string>();
  const tokens = args.slice(1).flatMap(splitFlagArg);

  for (let i = 0; i < tokens.length; i++) {
    const flag = tokens[i];
    if (!EDIT_VALUE_FLAGS.has(flag)) {
      console.error(`Error: unknown edit option: ${flag}`);
      throw new Error();
    }
    const value = tokens[i + 1];
    if (value === undefined) {
      console.error(`Error: ${flag} requires a value.`);
      throw new Error();
    }
    i++;
    if (flag !== '--body-file') requireNonEmptyValue(flag, value);
    if (flag === '--title') title = value;
    else if (flag === '--body-file') bodyFile = value;
    else if (flag === '--add-label') addLabels.add(value);
    else removeLabels.add(value);
  }

  const conflicting = [...addLabels].filter((l) => removeLabels.has(l));
  if (conflicting.length > 0) {
    console.error(
      `Error: cannot add and remove the same label(s): ${conflicting.join(', ')}.`,
    );
    throw new Error();
  }

  const resolvedBodyFile =
    bodyFile !== undefined ? resolveBodyFile(bodyFile) : undefined;

  if (
    title === undefined &&
    resolvedBodyFile === undefined &&
    addLabels.size === 0 &&
    removeLabels.size === 0
  ) {
    console.error(
      'Error: edit requires at least one of --title, --body-file, --add-label, --remove-label.',
    );
    throw new Error();
  }

  if (ctx.dryRun) {
    const parts = [`[DRY-RUN] would edit issue #${issueNumber}`];
    if (title !== undefined) parts.push(`title='${title}'`);
    if (bodyFile !== undefined) parts.push(`body-file='${bodyFile}'`);
    if (addLabels.size) parts.push(`add-labels=[${[...addLabels].join(', ')}]`);
    if (removeLabels.size) parts.push(`remove-labels=[${[...removeLabels].join(', ')}]`);
    console.error(parts.join(' '));
    return;
  }

  const repoLabels =
    addLabels.size > 0 ? await ensureRequiredLabels(ctx) : new Set<string>();
  const issue = await getIssue(ctx, issueNumber);
  await ensureMutableIssue(issue);
  preflightLabelEdits(issue, repoLabels, addLabels, removeLabels);

  const patch: { title?: string; body?: string } = {};
  const updatedFields: string[] = [];

  if (title !== undefined) {
    patch.title = title;
    updatedFields.push('title');
  }
  if (resolvedBodyFile !== undefined) {
    patch.body = readFileSync(resolvedBodyFile, 'utf8');
    updatedFields.push('body');
  }

  if (patch.title !== undefined || patch.body !== undefined) {
    await api(ctx, 'PATCH', `/repos/${ctx.repo}/issues/${issueNumber}`, patch);
  }

  for (const label of addLabels) {
    await addLabel(ctx, issueNumber, label);
    updatedFields.push(`label+${label}`);
  }
  for (const label of removeLabels) {
    await removeLabel(ctx, issueNumber, label);
    updatedFields.push(`label-${label}`);
  }

  if (ctx.jsonMode) {
    outputJson({ number: issueNumber, url: issue.html_url, updated_fields: updatedFields });
  } else {
    process.stdout.write(`${issue.html_url}\n`);
  }
}

async function cmdClaim(ctx: GhContext, args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('Error: claim requires <issue-number>.');
    throw new Error();
  }

  const issueNumber = Number(args[0]);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    console.error('Error: invalid issue number.');
    throw new Error();
  }

  if (ctx.dryRun) {
    console.error(`[DRY-RUN] would claim issue #${issueNumber}`);
    return;
  }

  await ensureRequiredLabels(ctx);
  const issue = await getIssue(ctx, issueNumber);
  await ensureMutableIssue(issue);

  if (getIssueAssigneeCount(issue) !== 0) {
    const assignee = getIssueFirstAssignee(issue);
    throw new Error(`issue #${issueNumber} is already assigned to @${assignee}.`);
  }

  if (issueHasLabel(issue, 'status:doing')) {
    throw new Error(`issue #${issueNumber} already has status:doing.`);
  }

  const me = await getCurrentUser(ctx);
  await addAssignee(ctx, issueNumber, me);
  await ensureLabelPresent(ctx, issue, 'status:doing');
  await ensureLabelAbsent(ctx, issue, 'status:to-do');
  await addComment(ctx, issueNumber, `Claimed by @${me} and starting work.`);

  if (ctx.jsonMode) {
    outputJson({ number: issueNumber, assignee: me, status: 'doing' });
  }
}

async function cmdAssign(ctx: GhContext, args: string[]): Promise<void> {
  if (args.length < 2) {
    console.error('Error: assign requires <issue-number> <collaborator>.');
    throw new Error();
  }

  const issueNumber = Number(args[0]);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    console.error('Error: invalid issue number.');
    throw new Error();
  }

  const collaborator = args[1];

  if (ctx.dryRun) {
    console.error(`[DRY-RUN] would assign @${collaborator} to issue #${issueNumber}`);
    return;
  }

  await ensureRequiredLabels(ctx);
  const issue = await getIssue(ctx, issueNumber);
  await ensureMutableIssue(issue);

  if (getIssueAssigneeCount(issue) !== 0) {
    const assignee = getIssueFirstAssignee(issue);
    throw new Error(`issue #${issueNumber} is already assigned to @${assignee}.`);
  }

  if (issueHasLabel(issue, 'status:doing')) {
    throw new Error(`issue #${issueNumber} already has status:doing.`);
  }

  await addAssignee(ctx, issueNumber, collaborator);
  await ensureLabelPresent(ctx, issue, 'status:doing');
  await ensureLabelAbsent(ctx, issue, 'status:to-do');
  await addComment(ctx, issueNumber, `Assigned to @${collaborator} and marked status:doing.`);

  if (ctx.jsonMode) {
    outputJson({ number: issueNumber, assignee: collaborator, status: 'doing' });
  }
}

async function cmdRelease(ctx: GhContext, args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('Error: release requires <issue-number>.');
    throw new Error();
  }

  const issueNumber = Number(args[0]);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    console.error('Error: invalid issue number.');
    throw new Error();
  }

  let blockedReason: string | undefined;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--blocked') {
      i++;
      if (i >= args.length) {
        console.error('Error: --blocked requires a reason.');
        throw new Error();
      }
      blockedReason = args[i];
    } else {
      console.error(`Error: unknown release option: ${arg}`);
      throw new Error();
    }
  }

  if (ctx.dryRun) {
    console.error(`[DRY-RUN] would release issue #${issueNumber}${blockedReason ? ` (blocked: ${blockedReason})` : ''}`);
    return;
  }

  await ensureRequiredLabels(ctx);
  const issue = await getIssue(ctx, issueNumber);
  await ensureMutableIssue(issue);

  const me = await getCurrentUser(ctx);
  const assignee = getIssueFirstAssignee(issue);

  if (assignee && assignee !== me) {
    throw new Error(`issue #${issueNumber} is assigned to @${assignee} (not @${me}).`);
  }

  if (assignee === me) {
    await removeAssignee(ctx, issueNumber, me);
  }

  await ensureLabelAbsent(ctx, issue, 'status:doing');

  if (blockedReason) {
    await ensureLabelAbsent(ctx, issue, 'status:to-do');
    await ensureLabelPresent(ctx, issue, 'status:blocked');
    await addComment(ctx, issueNumber, `Released by @${me}. Blocked: ${blockedReason}`);
    if (ctx.jsonMode) {
      outputJson({ number: issueNumber, status: 'blocked', blocked_reason: blockedReason });
    }
  } else {
    await ensureLabelAbsent(ctx, issue, 'status:blocked');
    await ensureLabelAbsent(ctx, issue, 'status:in-review');
    await ensureLabelPresent(ctx, issue, 'status:to-do');
    await addComment(ctx, issueNumber, `Released by @${me} and returned to status:to-do.`);
    if (ctx.jsonMode) {
      outputJson({ number: issueNumber, status: 'to-do' });
    }
  }
}

async function cmdClose(ctx: GhContext, args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('Error: close requires <issue-number>.');
    throw new Error();
  }

  const issueNumber = Number(args[0]);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    console.error('Error: invalid issue number.');
    throw new Error();
  }

  const summary = args.slice(1).join(' ') || 'Completed and validated.';

  if (ctx.dryRun) {
    console.error(`[DRY-RUN] would close issue #${issueNumber}`);
    return;
  }

  await ensureRequiredLabels(ctx);
  const issue = await getIssue(ctx, issueNumber);
  await ensureMutableIssue(issue);

  await addComment(ctx, issueNumber, summary);
  await ensureLabelAbsent(ctx, issue, 'status:doing');
  await ensureLabelAbsent(ctx, issue, 'status:to-do');
  await ensureLabelAbsent(ctx, issue, 'status:in-review');
  await ensureLabelAbsent(ctx, issue, 'status:blocked');
  await closeIssue(ctx, issueNumber);

  if (ctx.jsonMode) {
    outputJson({ number: issueNumber, state: 'closed' });
  }
}

async function cmdShow(ctx: GhContext, args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('Error: show requires <issue-number>.');
    throw new Error();
  }

  const issueNumber = Number(args[0]);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    console.error('Error: invalid issue number.');
    throw new Error();
  }

  const issue = await getIssue(ctx, issueNumber);

  if (ctx.jsonMode) {
    outputJson({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      assignees: (issue.assignees ?? []).map((a) => a.login),
      labels: (issue.labels ?? []).map((l) => l.name),
      body: issue.body ?? '',
      url: issue.html_url,
    });
    return;
  }

  const assigneeStr =
    issue.assignees?.length ? issue.assignees.map((a) => a.login).join(', ') : '(unassigned)';
  const labelsStr =
    issue.labels?.length ? issue.labels.map((l) => l.name).join(', ') : '(none)';

  process.stdout.write(
    `Issue #${issue.number}: ${issue.title}\n` +
    `State: ${issue.state}\n` +
    `Assignees: ${assigneeStr}\n` +
    `Labels: ${labelsStr}\n` +
    `\n${issue.body ?? '(no description)'}\n`,
  );
}

async function cmdPrclose(ctx: GhContext, args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('Error: prclose requires <issue-number>.');
    throw new Error();
  }

  const issueNumber = Number(args[0]);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    console.error('Error: invalid issue number.');
    throw new Error();
  }

  const summary = args.slice(1).join(' ') || 'Ready for review via PR.';

  // Early dry-run guard — skip all local git checks and API calls
  if (ctx.dryRun) {
    console.error(`[DRY-RUN] would create PR for issue #${issueNumber}`);
    console.error(`[DRY-RUN] would request review from team '${PR_REVIEW_TEAM}'`);
    console.error(`[DRY-RUN] would update labels to status:in-review`);
    return;
  }

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

  // ── Target validation before any mutation ───────────────────────────────
  await ensureRequiredLabels(ctx);
  const issue = await getIssue(ctx, issueNumber);
  await ensureMutableIssue(issue);

  // ── API calls ───────────────────────────────────────────────────────────

  // Get issue title for PR / feature branch
  const issueTitle = issue.title;

  // Handle protected branch auto-commit
  let branchWasCreated = false;
  if (isProtected) {
    const slug = slugify(issueTitle);
    const featureBranch = `feature/issue-${issueNumber}-${slug}`;
    process.stdout.write(`On protected branch '${currentBranch}'. Creating feature branch '${featureBranch}'...\n`);
    // Transparency: print exactly what the auto-commit will include (tracked +
    // untracked, minus gitignored) before anything is staged.
    const pendingChanges = git(['status', '--porcelain'], undefined, 15000);
    process.stdout.write(`Staging all working-tree changes (tracked + untracked, gitignored excluded) on '${featureBranch}':\n${pendingChanges}\n`);
    git(['checkout', '-b', featureBranch], undefined, 15000);
    git(['add', '-A'], undefined, 15000);  // stage all changes incl. untracked files (gitignored excluded)
    git(['commit', '-m', `[Issue #${issueNumber}] ${issueTitle}`], undefined, 15000);
    git(['push', '-u', 'origin', featureBranch], undefined, 30000);
    currentBranch = featureBranch;
    branchWasCreated = true;
  }

  // Build PR body
  const prBody = buildPRBody(issueNumber);

  // Get default branch for PR base
  const defaultBranch = await getDefaultBranch(ctx);

  // Get current user for PR assignee
  const me = await getCurrentUser(ctx);

  // Create PR
  const pr = await apiPost<GitHubPR>(ctx, `/repos/${ctx.repo}/pulls`, {
    title: `[Issue #${issueNumber}] '${issueTitle}'`,
    head: currentBranch,
    base: defaultBranch,
    body: prBody,
    maintainer_can_modify: true,
  });
  await addAssignee(ctx, pr.number, me);
  await requestTeamReview(ctx, pr.number, PR_REVIEW_TEAM);
  const prUrl = pr.html_url;
  process.stdout.write(`${prUrl}\n`);

  // Clean up temp file if it was consumed
  const tempPath = prBodyScratchPath(getRepoRoot(), issueNumber);
  try {
    unlinkSync(tempPath);
  } catch { /* temp file may not exist — tolerate ENOENT */ }

  // Comment on issue
  await addComment(ctx, issueNumber, `${summary}\n\nPull request: ${prUrl}`);

  // Update labels
  await ensureLabelAbsent(ctx, issue, 'status:doing');
  await ensureLabelAbsent(ctx, issue, 'status:to-do');
  await ensureLabelAbsent(ctx, issue, 'status:blocked');
  await ensureLabelPresent(ctx, issue, 'status:in-review');

  if (ctx.jsonMode) {
    outputJson({ number: issueNumber, pr_url: prUrl, status: 'in-review' });
  }
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function main(
  argv: string[] = process.argv.slice(2),
  opts?: { repo?: string; token?: string; jsonMode?: boolean; dryRun?: boolean },
): Promise<void> {
  // --help anywhere in argv — early return before parsing, token resolution, and
  // any network work (mirrors gh-app-auth.ts main()). No auth required.
  if (argv.includes('--help')) {
    printUsage();
    return;
  }

  // Parse global-level arguments
  let explicitRepo = '';
  let jsonMode = false;
  let dryRun = false;
  const remainingArgs: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--repo' || arg === '-R') {
      i++;
      if (i >= argv.length) {
        console.error('Error: --repo/-R requires OWNER/REPO value.');
        throw new Error();
      }
      explicitRepo = argv[i];
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
    throw new Error();
  }

  const command = remainingArgs[0];
  const cmdArgs = remainingArgs.slice(1);

  // `help` command — early return before token/repo resolution (no auth needed).
  if (command === 'help') {
    printUsage();
    return;
  }

  // Resolve auth token (may throw if no token available and device flow fails)
  const token = opts?.token ?? (dryRun ? '' : await resolveToken());

  // Resolve repository owner/name
  const repo = opts?.repo ?? resolveRepo(explicitRepo);

  const ctx: GhContext = {
    jsonMode: opts?.jsonMode ?? jsonMode,
    dryRun: opts?.dryRun ?? dryRun,
    repo,
    token,
  };

  // Dispatch
  switch (command) {
    case 'check':
      await cmdCheck(ctx);
      break;
    case 'labels-check':
      await cmdLabelsCheck(ctx);
      break;
    case 'list':
      await cmdList(ctx);
      break;
    case 'create':
      await cmdCreate(ctx, cmdArgs);
      break;
    case 'edit':
      await cmdEdit(ctx, cmdArgs);
      break;
    case 'claim':
      await cmdClaim(ctx, cmdArgs);
      break;
    case 'assign':
      await cmdAssign(ctx, cmdArgs);
      break;
    case 'release':
      await cmdRelease(ctx, cmdArgs);
      break;
    case 'close':
      await cmdClose(ctx, cmdArgs);
      break;
    case 'prclose':
      await cmdPrclose(ctx, cmdArgs);
      break;
    case 'show':
      await cmdShow(ctx, cmdArgs);
      break;
    case 'raw':
      console.error('Error: raw subcommand is not available in the TypeScript implementation.');
      throw new Error();
    default:
      console.error(`Error: unknown command: ${command}`);
      printUsage();
      throw new Error();
  }
}

// ── Exports for testing ─────────────────────────────────────────────────────

export {
  addAssignee, addComment, addLabel, api, apiGet, apiPost, buildPRBody, closeIssue, cmdAssign, cmdCheck, cmdClaim, cmdClose, cmdCreate, cmdEdit, cmdLabelsCheck,
  cmdList, cmdPrclose, cmdRelease, cmdShow, ensureLabelAbsent, ensureLabelPresent, ensureMutableIssue, ensureRequiredLabels, extractRepoFromUrl, getCurrentUser, getDefaultBranch, getIssue, getIssueAssigneeCount,
  getIssueFirstAssignee, getIssueState, getRepoLabels, issueHasLabel, output,
  outputJson, PR_REVIEW_TEAM, prBodyScratchPath, printUsage, removeAssignee, removeLabel, requestTeamReview, REQUIRED_LABELS, resolveRepo, resolveToken, slugify
};

// ── Main entry guard ─────────────────────────────────────────────────────────
// Only auto-execute when run directly via `npx tsx gh-issue.ts`.
// When imported as a module (e.g., in tests), main() is not called automatically.

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().then(
    () => { process.exitCode = 0; },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (message) console.error(message);
      process.exitCode = 1;
    },
  );
}
