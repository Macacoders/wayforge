import { execFileSync } from 'node:child_process';

/**
 * Run a git command and return trimmed stdout.
 * Throws on non-zero exit (inherits execFileSync behavior).
 */
export function git(args: string[], cwd?: string, timeout?: number): string {
  const opts: { encoding: 'utf8'; cwd?: string; timeout?: number } = { encoding: 'utf8' };
  if (cwd !== undefined) opts.cwd = cwd;
  if (timeout !== undefined) opts.timeout = timeout;
  return execFileSync('git', args, opts).trim();
}
