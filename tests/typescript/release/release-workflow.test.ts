// ── release-workflow.test.ts — Static contract tests for release.yml ────────
//
// Strategy:
//   - Read .github/workflows/release.yml as a string (no YAML parsing)
//   - Assert the cosign signing contract and checksum manifest contents
//   - Keep it small and string-based; do not build a workflow parser

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const workflowPath = join(__dirname, '..', '..', '..', '.github', 'workflows', 'release.yml');
const workflow = readFileSync(workflowPath, 'utf8');

// Extract the `release:` job block (from its top-level key to the next
// top-level key or EOF).
function releaseJobBlock(): string {
  const start = workflow.indexOf('\n  release:');
  expect(start).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const nextTopLevel = rest.indexOf('\n  ', rest.indexOf('\n')) >= 0
    ? rest.slice(1).search(/^  \S/m)
    : -1;
  return nextTopLevel === -1 ? rest : rest.slice(0, nextTopLevel + 1);
}

function stepBlock(name: string): string {
  const marker = `- name: ${name}`;
  const start = workflow.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const nextStep = workflow.slice(start + 1).search(/- (name:|uses:)/);
  return nextStep === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + nextStep);
}

describe('release.yml — cosign checksum bundle contract', () => {
  it('release job grants id-token: write', () => {
    expect(releaseJobBlock()).toContain('id-token: write');
  });

  it('release job grants contents: write and actions: read', () => {
    const block = releaseJobBlock();
    expect(block).toContain('contents: write');
    expect(block).toContain('actions: read');
  });

  it('Generate checksums step covers binaries, share archives, and installers', () => {
    const block = stepBlock('Generate checksums');
    expect(block).toContain('wayforge-checksums.txt');
    expect(block).toContain('install.sh');
    expect(block).toContain('install.ps1');
  });

  it('workflow installs cosign v3.1.4 via cosign-installer', () => {
    expect(workflow).toContain('sigstore/cosign-installer@v4.1.0');
    expect(workflow).toContain("cosign-release: 'v3.1.4'");
  });

  it('workflow signs the manifest with a sigstore bundle', () => {
    expect(workflow).toContain('cosign sign-blob');
    expect(workflow).toContain('--bundle wayforge-checksums.txt.sigstore.json');
  });

  it('signing happens after checksums and before Create Release', () => {
    const checksums = workflow.indexOf('Generate checksums');
    const sign = workflow.indexOf('Sign checksum manifest');
    const create = workflow.indexOf('Create Release');
    expect(checksums).toBeGreaterThan(-1);
    expect(sign).toBeGreaterThan(checksums);
    expect(create).toBeGreaterThan(sign);
  });

  it('sigstore bundle is uploaded with the release assets', () => {
    expect(stepBlock('Create Release')).toContain('wayforge-checksums.txt.sigstore.json');
  });

  it('does not publish detached .sig/.pem artifacts', () => {
    expect(workflow).not.toContain('--output-signature');
    expect(workflow).not.toContain('--output-certificate');
  });

  it('bundle is not listed inside the manifest (no circularity)', () => {
    const block = stepBlock('Generate checksums');
    expect(block).not.toContain('wayforge-checksums.txt.sigstore.json');
  });
});
