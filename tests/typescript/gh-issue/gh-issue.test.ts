// ── gh-issue.test.ts — Unit tests for gh-issue.ts ───────────────────────────
// Tests require vitest 4.x. Run: npx vitest run
//
// Strategy:
//   - Mock child_process.execSync globally (git commands)
//   - Mock global fetch (GitHub API)
//   - Set GITHUB_TOKEN env to bypass auth module
//   - Use exported functions from gh-issue.ts directly

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Module-level mocks (hoisted by vitest) ──────────────────────────────────

const mockExecSync = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ execSync: mockExecSync }));

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  readFileSync: mockReadFileSync,
}));
vi.mock('../../../base/opencode/skills/shared-task/scripts/github-app-auth.ts', () => ({
  getValidToken: vi.fn().mockRejectedValue(new Error('auth mock')),
}));

// ── Stub globals before imports ─────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Bypass real auth module — use env var
process.env.GITHUB_TOKEN = 'test-token-value';

// ── Module under test ──────────────────────────────────────────────────────

import * as gh from '../../../base/opencode/skills/shared-task/scripts/gh-issue.ts';

// ── Test helpers ────────────────────────────────────────────────────────────

function okResponse(data: unknown, status = 200) {
  return {
    ok: true,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(data),
  };
}

function errorResponse(status: number, message: string) {
  return {
    ok: false,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({ message }),
  };
}

/** All 12 required labels as GitHub API objects */
const ALL_REQUIRED_LABELS_API = gh.REQUIRED_LABELS.map((name) => ({ name }));

/** Default issue response (open, unassigned, status:to-do) */
const DEFAULT_ISSUE = {
  number: 1,
  title: 'Test Issue',
  state: 'open',
  assignees: [],
  labels: [{ name: 'status:to-do' }],
  html_url: 'https://github.com/test/repo/issues/1',
};

/** Helper: makes mockFetch respond to labels endpoint */
function mockLabelsResponse(): void {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/labels?per_page=100')) {
      return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

/** Helper: makes mockFetch respond to labels + a specific endpoint */
function mockWithLabels(
  urlPattern: string | RegExp,
  data: unknown,
  method = 'GET',
): void {
  mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
    const reqMethod = opts?.method ?? 'GET';
    const matches =
      typeof urlPattern === 'string' ? url.includes(urlPattern) : urlPattern.test(url);

    if (url.includes('/labels?per_page=100') && reqMethod === 'GET') {
      return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
    }
    if (matches && reqMethod === method) {
      return Promise.resolve(okResponse(data));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${reqMethod} ${url}`));
  });
}

// ── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  gh.resetState();
  process.env.GITHUB_TOKEN = 'test-token-value';
  delete process.env.GH_TOKEN;
  delete process.env.GH_REPO;
  mockFetch.mockReset();
  mockExecSync.mockReset();
  mockExistsSync.mockReset();
  mockMkdirSync.mockReset();
  mockReadFileSync.mockReset();
  // Default: no temp/template files exist; readFileSync returns empty
  mockExistsSync.mockReturnValue(false);
  mockReadFileSync.mockReturnValue('');

  // Default execSync: git origin, repo root, current branch, clean tree
  mockExecSync.mockImplementation((cmd: string) => {
    const map: Record<string, string> = {
      'git remote get-url origin': 'git@github.com:owner/repo.git',
      'git rev-parse --show-toplevel': '/tmp/repo',
      'git rev-parse --abbrev-ref HEAD': 'feature/test',
      'git status --porcelain': '',
    };
    const trimmed = cmd.trim();
    if (map[trimmed] !== undefined) return map[trimmed];
    throw new Error(`Unexpected execSync: ${cmd}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure functions
// ─────────────────────────────────────────────────────────────────────────────

describe('extractRepoFromUrl', () => {
  it('parses git@github.com:OWNER/REPO.git', () => {
    expect(gh.extractRepoFromUrl('git@github.com:foo/bar.git')).toBe('foo/bar');
  });

  it('parses git@github.com:OWNER/REPO (no suffix)', () => {
    expect(gh.extractRepoFromUrl('git@github.com:foo/bar')).toBe('foo/bar');
  });

  it('parses https://github.com/OWNER/REPO.git', () => {
    expect(gh.extractRepoFromUrl('https://github.com/foo/bar.git')).toBe('foo/bar');
  });

  it('parses https://github.com/OWNER/REPO (no suffix)', () => {
    expect(gh.extractRepoFromUrl('https://github.com/foo/bar')).toBe('foo/bar');
  });

  it('parses ssh://git@github.com/OWNER/REPO.git', () => {
    expect(gh.extractRepoFromUrl('ssh://git@github.com/foo/bar.git')).toBe('foo/bar');
  });

  it('returns null for unsupported URL', () => {
    expect(gh.extractRepoFromUrl('https://gitlab.com/foo/bar')).toBeNull();
  });
});

describe('getMissingRequiredLabels', () => {
  it('returns empty array when all labels exist', () => {
    const missing = gh.getMissingRequiredLabels(gh.REQUIRED_LABELS);
    expect(missing).toEqual([]);
  });

  it('returns missing labels when some are absent', () => {
    const missing = gh.getMissingRequiredLabels(['status:to-do', 'type:task']);
    expect(missing).toContain('status:doing');
    expect(missing).toContain('status:in-review');
    expect(missing).toContain('status:blocked');
    expect(missing).not.toContain('status:to-do');
    expect(missing).not.toContain('type:task');
  });

  it('returns all labels when none exist', () => {
    const missing = gh.getMissingRequiredLabels([]);
    expect(missing).toEqual(gh.REQUIRED_LABELS);
  });
});

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(gh.slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(gh.slugify('Fix bug #123!')).toBe('fix-bug-123');
  });

  it('collapses multiple hyphens', () => {
    expect(gh.slugify('a---b---c')).toBe('a-b-c');
  });

  it('strips leading and trailing hyphens', () => {
    expect(gh.slugify('--hello-world--')).toBe('hello-world');
  });

  it('truncates to 60 characters', () => {
    const long = 'a'.repeat(100);
    const slug = gh.slugify(long);
    expect(slug.length).toBeLessThanOrEqual(60);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth resolution
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveToken', () => {
  it('returns GITHUB_TOKEN env var', async () => {
    process.env.GITHUB_TOKEN = 'from-env';
    process.env.GH_TOKEN = 'should-be-ignored';
    const token = await gh.resolveToken();
    expect(token).toBe('from-env');
  });

  it('falls back to GH_TOKEN env var', async () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = 'from-gh-env';
    const token = await gh.resolveToken();
    expect(token).toBe('from-gh-env');
  });

  it('throws when no env vars set and auth fails', async () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    await expect(gh.resolveToken()).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Repo resolution
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveRepo', () => {
  it('returns the explicit repo argument', () => {
    const result = gh.resolveRepo('explicit/one');
    expect(result).toBe('explicit/one');
  });

  it('returns GH_REPO env var when no explicit repo', () => {
    process.env.GH_REPO = 'env/repo';
    const result = gh.resolveRepo('');
    expect(result).toBe('env/repo');
  });

  it('falls back to git remote origin', () => {
    const result = gh.resolveRepo('');
    expect(result).toBe('owner/repo');
  });

  it('throws when git origin is unavailable', () => {
    mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });
    expect(() => gh.resolveRepo('')).toThrow('GH_REPO is not set');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Check operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdCheck', () => {
  it('succeeds with human-readable output', async () => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    mockFetch.mockResolvedValue(okResponse({ full_name: 'test/repo' }));

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdCheck();
    expect(stdout.join('')).toContain('OK: GitHub access verified for test/repo');
  });

  it('succeeds with JSON output', async () => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    gh._setJsonMode(true);
    mockFetch.mockResolvedValue(okResponse({ full_name: 'test/repo' }));

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdCheck();
    const json = JSON.parse(stdout.join(''));
    expect(json).toEqual({ status: 'ok', repo: 'test/repo' });
  });

  it('throws on 404', async () => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    mockFetch.mockResolvedValue(errorResponse(404, 'Not Found'));

    await expect(gh.cmdCheck()).rejects.toThrow('GitHub API error (404)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Labels-check operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdLabelsCheck', () => {
  it('succeeds when all required labels exist', async () => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    mockFetch.mockResolvedValue(okResponse(ALL_REQUIRED_LABELS_API));

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdLabelsCheck();
    expect(stdout.join('')).toContain('OK: all required labels are present');
  });

  it('fails with numeric exit code when labels are missing', async () => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    mockFetch.mockResolvedValue(okResponse([{ name: 'status:to-do' }, { name: 'type:task' }]));

    await expect(gh.cmdLabelsCheck()).rejects.toThrow(gh.ExitError);
  });

  it('returns JSON error when labels are missing in JSON mode', async () => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    gh._setJsonMode(true);
    mockFetch.mockResolvedValue(okResponse([{ name: 'status:to-do' }]));

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await expect(gh.cmdLabelsCheck()).rejects.toThrow(gh.ExitError);
    const json = JSON.parse(stdout.join(''));
    expect(json).toMatchObject({ status: 'error', repo: 'test/repo' });
    expect(json.missing.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// List operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdList', () => {
  const fakeIssues = [
    {
      number: 1,
      title: 'Issue One',
      state: 'open',
      assignees: [{ login: 'user1' }],
      labels: [{ name: 'status:doing' }, { name: 'type:task' }],
      html_url: 'https://github.com/test/repo/issues/1',
    },
    {
      number: 2,
      title: 'Issue Two',
      state: 'open',
      assignees: [],
      labels: [{ name: 'status:to-do' }, { name: 'type:feature' }],
      html_url: 'https://github.com/test/repo/issues/2',
    },
  ];

  it('outputs tab-separated lines for each issue', async () => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    mockWithLabels('/issues?state=open', fakeIssues);

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdList();
    const output = stdout.join('');
    expect(output).toContain('#1\tIssue One\tassignee:user1\tstatus:doing');
    expect(output).toContain('#2\tIssue Two\tassignee:-\tstatus:to-do');
  });

  it('filters out pull requests', async () => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    const issuesWithPr = [
      ...fakeIssues,
      { number: 3, title: 'PR', state: 'open', assignees: [], labels: [], html_url: '', pull_request: {} },
    ];
    mockWithLabels('/issues?state=open', issuesWithPr);

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdList();
    const output = stdout.join('');
    expect(output).not.toContain('#3');
    expect(output).toContain('#1');
  });

  it('returns JSON array in --json mode', async () => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    gh._setJsonMode(true);
    mockWithLabels('/issues?state=open', fakeIssues);

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdList();
    const json = JSON.parse(stdout.join(''));
    expect(json).toHaveLength(2);
    expect(json[0]).toMatchObject({ number: 1, title: 'Issue One' });
    expect(json[1]).toMatchObject({ number: 2, title: 'Issue Two' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Create operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdCreate', () => {
  const CREATED_ISSUE = {
    number: 42,
    title: 'New Issue',
    html_url: 'https://github.com/test/repo/issues/42',
    state: 'open',
    assignees: [],
    labels: [],
  };

  it('creates an issue with title only', async () => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    mockWithLabels('/issues', CREATED_ISSUE, 'POST');

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdCreate(['My Issue']);
    expect(stdout.join('')).toContain(CREATED_ISSUE.html_url);
  });

  it('creates an issue with labels', async () => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    mockWithLabels('/issues', CREATED_ISSUE, 'POST');

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdCreate(['Test', '--label', 'status:doing', '--label', 'type:bug']);
    expect(stdout.join('')).toContain(CREATED_ISSUE.html_url);
  });

  it('uses --dry-run and does not call API', async () => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    gh._setDryRun(true);

    await gh.cmdCreate(['Dry Run Title']);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns JSON in --json mode', async () => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    gh._setJsonMode(true);
    mockWithLabels('/issues', CREATED_ISSUE, 'POST');

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdCreate(['My Issue']);
    const json = JSON.parse(stdout.join(''));
    expect(json).toMatchObject({ number: 42, url: CREATED_ISSUE.html_url, title: 'New Issue' });
  });

  it('throws when title is missing', async () => {
    await expect(gh.cmdCreate([])).rejects.toThrow(gh.ExitError);
  });

  it('throws on unknown option', async () => {
    await expect(gh.cmdCreate(['Title', '--bogus'])).rejects.toThrow(gh.ExitError);
  });

  it('throws when --body-file has no path', async () => {
    await expect(gh.cmdCreate(['Title', '--body-file'])).rejects.toThrow(gh.ExitError);
  });

  it('throws when --label has no value', async () => {
    await expect(gh.cmdCreate(['Title', '--label'])).rejects.toThrow(gh.ExitError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Claim operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdClaim', () => {
  beforeEach(() => {
    gh._setRepo('test/repo');
    gh._setToken('t');
  });

  it('claims an open unassigned issue', async () => {
    // Labels → Issue view → Issue view (assignee count) → Issue view (labels) → User → Assignee POST
    let callCount = 0;
    mockFetch.mockImplementation((url: string) => {
      callCount++;
      if (url.includes('/labels?per_page=100')) {
        return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
      }
      if (url.includes('/issues/1')) {
        return Promise.resolve(okResponse(DEFAULT_ISSUE));
      }
      if (url.includes('/user')) {
        return Promise.resolve(okResponse({ login: 'testuser' }));
      }
      if (url.includes('/assignees')) {
        return Promise.resolve(okResponse({}));
      }
      if (url.includes('/comments')) {
        return Promise.resolve(okResponse({}));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    await gh.cmdClaim(['1']);
    // Should not throw — means flow completed
  });

  it('throws when issue is already assigned', async () => {
    const assignedIssue = { ...DEFAULT_ISSUE, assignees: [{ login: 'other' }] };
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(assignedIssue));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await expect(gh.cmdClaim(['1'])).rejects.toThrow('already assigned');
  });

  it('throws when issue already has status:doing', async () => {
    const doingIssue = { ...DEFAULT_ISSUE, labels: [{ name: 'status:doing' }] };
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(doingIssue));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await expect(gh.cmdClaim(['1'])).rejects.toThrow('already has status:doing');
  });

  it('throws when issue is closed', async () => {
    const closedIssue = { ...DEFAULT_ISSUE, state: 'closed' };
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(closedIssue));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await expect(gh.cmdClaim(['1'])).rejects.toThrow('not open');
  });

  it('does not mutate in --dry-run', async () => {
    gh._setDryRun(true);
    // No fetch mocks needed — dry-run should return before any API call
    await gh.cmdClaim(['1']);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('outputs JSON in --json mode', async () => {
    gh._setJsonMode(true);

    let callCount = 0;
    mockFetch.mockImplementation((url: string) => {
      callCount++;
      if (url.includes('/labels?per_page=100')) return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(DEFAULT_ISSUE));
      if (url.includes('/user')) return Promise.resolve(okResponse({ login: 'testuser' }));
      if (url.includes('/assignees')) return Promise.resolve(okResponse({}));
      if (url.includes('/comments')) return Promise.resolve(okResponse({}));
      if (url.includes('/labels')) return Promise.resolve(okResponse({}));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdClaim(['1']);
    const json = JSON.parse(stdout.join(''));
    expect(json).toMatchObject({ number: 1, assignee: 'testuser', status: 'doing' });
  });

  it('throws when issue number is missing', async () => {
    await expect(gh.cmdClaim([])).rejects.toThrow(gh.ExitError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Assign operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdAssign', () => {
  beforeEach(() => {
    gh._setRepo('test/repo');
    gh._setToken('t');
  });

  it('assigns a collaborator to an open unassigned issue', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(DEFAULT_ISSUE));
      if (url.includes('/assignees')) return Promise.resolve(okResponse({}));
      if (url.includes('/comments')) return Promise.resolve(okResponse({}));
      if (url.includes('/labels')) return Promise.resolve(okResponse({}));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await gh.cmdAssign(['1', 'collabuser']);
  });

  it('throws when collaborator is missing', async () => {
    await expect(gh.cmdAssign(['1'])).rejects.toThrow(gh.ExitError);
  });

  it('throws when issue is already assigned', async () => {
    const assigned = { ...DEFAULT_ISSUE, assignees: [{ login: 'other' }] };
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(assigned));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await expect(gh.cmdAssign(['1', 'user'])).rejects.toThrow('already assigned');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Release operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdRelease', () => {
  beforeEach(() => {
    gh._setRepo('test/repo');
    gh._setToken('t');
  });

  it('releases issue back to status:to-do', async () => {
    const assignedToMe = { ...DEFAULT_ISSUE, assignees: [{ login: 'testuser' }] };
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(assignedToMe));
      if (url.includes('/user')) return Promise.resolve(okResponse({ login: 'testuser' }));
      if (url.includes('/assignees')) return Promise.resolve(okResponse({}));
      if (url.includes('/comments')) return Promise.resolve(okResponse({}));
      if (url.includes('/labels')) return Promise.resolve(okResponse({}));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await gh.cmdRelease(['1']);
  });

  it('handles --blocked reason', async () => {
    const assignedToMe = { ...DEFAULT_ISSUE, assignees: [{ login: 'testuser' }] };
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(assignedToMe));
      if (url.includes('/user')) return Promise.resolve(okResponse({ login: 'testuser' }));
      if (url.includes('/assignees')) return Promise.resolve(okResponse({}));
      if (url.includes('/comments')) return Promise.resolve(okResponse({}));
      if (url.includes('/labels')) return Promise.resolve(okResponse({}));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await gh.cmdRelease(['1', '--blocked', 'Waiting for review']);
  });

  it('throws when assigned to another user', async () => {
    const assignedToOther = { ...DEFAULT_ISSUE, assignees: [{ login: 'other' }] };
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(assignedToOther));
      if (url.includes('/user')) return Promise.resolve(okResponse({ login: 'testuser' }));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await expect(gh.cmdRelease(['1'])).rejects.toThrow('assigned to');
  });

  it('throws when --blocked has no reason', async () => {
    await expect(gh.cmdRelease(['1', '--blocked'])).rejects.toThrow(gh.ExitError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Close operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdClose', () => {
  beforeEach(() => {
    gh._setRepo('test/repo');
    gh._setToken('t');
  });

  it('closes an open issue with custom summary', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(DEFAULT_ISSUE));
      if (url.includes('/comments')) return Promise.resolve(okResponse({}));
      if (url.includes('/labels')) return Promise.resolve(okResponse({}));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await gh.cmdClose(['1', 'Fixed', 'the', 'bug']);
  });

  it('uses default summary when none provided', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(DEFAULT_ISSUE));
      if (url.includes('/comments')) return Promise.resolve(okResponse({}));
      if (url.includes('/labels')) return Promise.resolve(okResponse({}));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await gh.cmdClose(['1']);
  });

  it('throws when issue is already closed', async () => {
    const closed = { ...DEFAULT_ISSUE, state: 'closed' };
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
      if (url.includes('/issues/1')) return Promise.resolve(okResponse(closed));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await expect(gh.cmdClose(['1'])).rejects.toThrow('not open');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Prclose operation
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdPrclose', () => {
  beforeEach(() => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    mockExecSync.mockImplementation((cmd: string) => {
      const map: Record<string, string> = {
        'git rev-parse --show-toplevel': '/tmp/repo',
        'git rev-parse --abbrev-ref HEAD': 'feature/test',
        'git status --porcelain': '',
      };
      const trimmed = cmd.trim();
      if (map[trimmed] !== undefined) return map[trimmed];
      throw new Error(`Unexpected execSync: ${cmd}`);
    });
  });

  it('works with --dry-run on feature branch', async () => {
    gh._setDryRun(true);
    mockLabelsResponse();

    await gh.cmdPrclose(['1', 'Ready for review']);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('works with --dry-run on protected branch', async () => {
    gh._setDryRun(true);
    mockExecSync.mockImplementation((cmd: string) => {
      const map: Record<string, string> = {
        'git rev-parse --show-toplevel': '/tmp/repo',
        'git rev-parse --abbrev-ref HEAD': 'main',
        'git status --porcelain': '',
      };
      const trimmed = cmd.trim();
      if (map[trimmed] !== undefined) return map[trimmed];
      throw new Error(`Unexpected execSync: ${cmd}`);
    });

    await gh.cmdPrclose(['1']);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when on non-protected branch with dirty tree', async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      const map: Record<string, string> = {
        'git rev-parse --show-toplevel': '/tmp/repo',
        'git rev-parse --abbrev-ref HEAD': 'feature/test',
        'git status --porcelain': 'M some-file.ts',
      };
      const trimmed = cmd.trim();
      if (map[trimmed] !== undefined) return map[trimmed];
      throw new Error(`Unexpected execSync: ${cmd}`);
    });

    await expect(gh.cmdPrclose(['1'])).rejects.toThrow('clean working tree');
  });

  it('throws when no active branch', async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.trim() === 'git rev-parse --abbrev-ref HEAD') return 'HEAD';
      return '';
    });

    await expect(gh.cmdPrclose(['1'])).rejects.toThrow('active local branch');
  });

  it('performs full API flow on a feature branch and outputs PR URL', async () => {
    // Full non-dry-run flow on feature/test branch
    const PR_RESPONSE = {
      html_url: 'https://github.com/test/repo/pull/42',
      number: 42,
      title: 'PR Title',
      state: 'open',
    };

    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET';
      if (url.includes('/labels?per_page=100')) { return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API)); }
      if (url.includes('/issues/1') && method === 'GET') { return Promise.resolve(okResponse(DEFAULT_ISSUE)); }
      if (url === 'https://api.github.com/repos/test/repo' && method === 'GET') {
        return Promise.resolve(okResponse({ default_branch: 'main' }));
      }
      if (url.includes('/pulls') && method === 'POST') { return Promise.resolve(okResponse(PR_RESPONSE)); }
      if (url.includes('/comments') && method === 'POST') { return Promise.resolve(okResponse({})); }
      if (url.includes('/labels/') && method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204, headers: new Headers(), text: async () => '' });
      }
      if (url.includes('/issues/1/labels') && method === 'POST') { return Promise.resolve(okResponse({})); }
      return Promise.reject(new Error(`Unexpected fetch: ${method} ${url}`));
    });

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.cmdPrclose(['1', 'Ready for review']);
    expect(stdout.join('')).toContain(PR_RESPONSE.html_url);
  });

  it('throws when issue number is missing', async () => {
    await expect(gh.cmdPrclose([])).rejects.toThrow(gh.ExitError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildPRBody
// ─────────────────────────────────────────────────────────────────────────────

describe('buildPRBody', () => {
  it('reads from temp file when it exists', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('Custom body from temp/pr-body-1.md');

    const body = gh.buildPRBody(1);
    expect(body).toBe('Custom body from temp/pr-body-1.md');
  });

  it('falls back to PR template when temp file is missing', () => {
    // Call 1: existsSync(tempDir) → false → mkdirSync
    // Call 2: existsSync(tempPath) → false
    // Call 3: existsSync(templatePath) → true → readFileSync
    mockExistsSync
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValue('Template content\n# PR Title');

    const body = gh.buildPRBody(1);
    expect(body).toContain('Fixes #1');
    expect(body).toContain('Template content');
  });

  it('generates default body when no files exist', () => {
    mockExistsSync.mockReturnValue(false);

    const body = gh.buildPRBody(1);
    expect(body.startsWith('Fixes #1')).toBe(true);
    expect(body).toContain('## Summary');
    expect(body).toContain('## Testing');
    expect(body).toContain('## Breaking changes');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// main() dispatch
// ─────────────────────────────────────────────────────────────────────────────

describe('main() dispatch', () => {
  it('runs cmdCheck when command is "check"', async () => {
    gh._setRepo('test/repo');
    gh._setToken('t');
    mockFetch.mockResolvedValue(okResponse({ full_name: 'test/repo' }));

    // Stub process.argv
    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts', '--repo', 'test/repo', 'check'];

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.main();
    expect(stdout.join('')).toContain('OK: GitHub access verified');

    process.argv = origArgv;
  });

  it('shows usage and exits for unknown command', async () => {
    process.env.GITHUB_TOKEN = 't';
    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts', '--repo', 'test/repo', 'bogus'];

    await expect(gh.main()).rejects.toThrow(gh.ExitError);

    process.argv = origArgv;
  });

  it('parses --dry-run flag and skips API calls for dry-run-aware command', async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts', '--dry-run', '--repo', 'test/repo', 'prclose', '1'];

    // Set up execSync for prclose local checks
    mockExecSync.mockImplementation((cmd: string) => {
      const map: Record<string, string> = {
        'git rev-parse --show-toplevel': '/tmp/repo',
        'git rev-parse --abbrev-ref HEAD': 'feature/test',
        'git status --porcelain': '',
      };
      const trimmed = cmd.trim();
      if (map[trimmed] !== undefined) return map[trimmed];
      throw new Error(`Unexpected execSync: ${cmd}`);
    });

    await gh.main();
    expect(mockFetch).not.toHaveBeenCalled();

    process.argv = origArgv;
  });

  it('parses --json flag and outputs JSON via check', async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts', '--json', '--repo', 'test/repo', 'check'];

    mockFetch.mockResolvedValue(okResponse({ full_name: 'test/repo' }));

    const stdout: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });

    await gh.main();
    const json = JSON.parse(stdout.join(''));
    expect(json).toEqual({ status: 'ok', repo: 'test/repo' });

    process.argv = origArgv;
  });

  it('parses --repo flag and dispatches to list without throwing', async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts', '--repo', 'custom/repo', 'list'];

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/labels?per_page=100')) {
        return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API));
      }
      if (url.includes('/issues?state=open')) {
        return Promise.resolve(okResponse([]));
      }
      return Promise.reject(new Error(`Unexpected: ${url}`));
    });

    await expect(gh.main()).resolves.toBeUndefined();

    process.argv = origArgv;
  });

  it('throws ExitError when no command is provided', async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts'];

    await expect(gh.main()).rejects.toThrow(gh.ExitError);

    process.argv = origArgv;
  });

  it('dispatches to cmdClaim through main()', async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'gh-issue.ts', '--repo', 'test/repo', 'claim', '1'];

    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET';
      if (url.includes('/labels?per_page=100')) { return Promise.resolve(okResponse(ALL_REQUIRED_LABELS_API)); }
      if (url.includes('/issues/1') && method === 'GET') { return Promise.resolve(okResponse(DEFAULT_ISSUE)); }
      if (url.includes('/user')) { return Promise.resolve(okResponse({ login: 'testuser' })); }
      if (url.includes('/assignees') && method === 'POST') { return Promise.resolve(okResponse({})); }
      if (url.includes('/comments') && method === 'POST') { return Promise.resolve(okResponse({})); }
      if (url.includes('/labels/') && method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204, headers: new Headers(), text: async () => '' });
      }
      if (url.includes('/labels') && method === 'POST') { return Promise.resolve(okResponse({})); }
      return Promise.reject(new Error(`Unexpected: ${method} ${url}`));
    });

    await expect(gh.main()).resolves.toBeUndefined();

    process.argv = origArgv;
  });
});
