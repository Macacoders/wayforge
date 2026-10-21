import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const AUTH_SCRIPT = path.join(REPO_ROOT, 'base/opencode/skills/shared-task/scripts/gh-app-auth.ts');
const ISSUE_SCRIPT = path.join(REPO_ROOT, 'base/opencode/skills/shared-task/scripts/gh-issue.ts');

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve('tsx/cli');

function run(args: string[], opts?: { env?: Record<string, string> }): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(process.execPath, [TSX_CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...opts?.env },
    timeout: 15000,
  });
  return {
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    status: result.status ?? (result.error ? 1 : 0),
  };
}

describe('gh-app-auth.ts E2E', () => {
  it('shows help and exits 0', () => {
    const r = run([AUTH_SCRIPT, '--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage:');
  });

  it('without credentials exits 1', () => {
    const r = run([AUTH_SCRIPT], { env: { GH_APP_CLIENT_ID: '', GH_CONFIG_DIR: '/tmp/nonexistent-gh-config' } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('No GitHub App Client ID');
  });
});

describe('gh-issue.ts help', () => {
  // Credential-hostile env: if --help/help reached token resolution, the
  // device flow would fail (missing client id / no cache) with exit != 0.
  const hostileEnv = {
    GITHUB_TOKEN: '',
    GH_TOKEN: '',
    GH_APP_CLIENT_ID: '',
    GH_CONFIG_DIR: '/tmp/nonexistent-gh-config',
  };

  it('--help prints usage and exits 0 without credentials', () => {
    const r = run([ISSUE_SCRIPT, '--help'], { env: hostileEnv });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage:');
  });

  it('help prints usage and exits 0 without credentials', () => {
    const r = run([ISSUE_SCRIPT, 'help'], { env: hostileEnv });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage:');
  });
});

describe('gh-issue.ts dry-run lifecycle', () => {
  const base = [ISSUE_SCRIPT, '--repo', 'test/repo', '--dry-run'];

  it('create prints dry-run message', () => {
    const r = run([...base, 'create', 'E2E Test Issue', '--label', 'type:task']);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("[DRY-RUN] would create issue with title='E2E Test Issue'");
  });

  it('edit prints dry-run message', () => {
    const r = run([...base, 'edit', '1', '--title', 'Renamed']);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('[DRY-RUN] would edit issue #1');
  });

  it('edit with empty --body-file= fails', () => {
    const r = run([...base, 'edit', '1', '--body-file=']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--body-file requires a non-empty path');
  });

  it('edit with empty --body-file value fails', () => {
    const r = run([...base, 'edit', '1', '--body-file', '']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--body-file requires a non-empty path');
  });

  it('claim prints dry-run message', () => {
    const r = run([...base, 'claim', '1']);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('[DRY-RUN] would claim issue #1');
  });

  it('assign prints dry-run message', () => {
    const r = run([...base, 'assign', '1', 'test-user']);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('[DRY-RUN] would assign @test-user');
  });

  it('release prints dry-run message', () => {
    const r = run([...base, 'release', '1']);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('[DRY-RUN] would release issue #1');
  });

  it('release --blocked prints dry-run message', () => {
    const r = run([...base, 'release', '1', '--blocked', 'waiting on dep']);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('[DRY-RUN] would release issue #1 (blocked: waiting on dep)');
  });

  it('close prints dry-run message', () => {
    const r = run([...base, 'close', '1']);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('[DRY-RUN] would close issue #1');
  });

  it('prclose prints dry-run messages', () => {
    const r = run([...base, 'prclose', '1']);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('would create PR');
    expect(r.stderr).toContain('would update labels');
  });
});

describe('gh-issue.ts auth integration', () => {
  it('no token or git remote fails', () => {
    const r = run([ISSUE_SCRIPT, '--repo', 'test/repo', 'check'], {
      env: { GITHUB_TOKEN: '', GH_TOKEN: '', GH_REPO: '' },
    });
    expect(r.status).not.toBe(0);
  });

  it('fake token reaches API and gets 401', () => {
    const r = run([ISSUE_SCRIPT, '--repo', 'test/repo', 'check'], {
      env: { GITHUB_TOKEN: 'fake_token' },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('Bad credentials');
  });
});

describe('gh-issue.ts error handling', () => {
  const base = [ISSUE_SCRIPT, '--repo', 'test/repo', '--dry-run'];

  it('unknown command shows error', () => {
    const r = run([...base, 'bogus']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('unknown command');
  });

  it('create without title fails', () => {
    const r = run([...base, 'create']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('requires <title>');
  });
});
