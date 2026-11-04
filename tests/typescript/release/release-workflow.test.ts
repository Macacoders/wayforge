// ── release-workflow.test.ts — Static contract tests for release.yml ────────
//
// Strategy:
//   - Read .github/workflows/release.yml as a string (no YAML parsing)
//   - Assert the cosign signing contract and checksum manifest contents
//   - Keep it small and string-based; do not build a workflow parser

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const workflowPath = join(
	__dirname,
	'..',
	'..',
	'..',
	'.github',
	'workflows',
	'release.yml',
)
const workflow = readFileSync(workflowPath, 'utf8')

// Extract the `release:` job block (from its top-level key to the next
// top-level key or EOF).
function releaseJobBlock(): string {
	const start = workflow.indexOf('\n  release:')
	expect(start).toBeGreaterThan(-1)
	const rest = workflow.slice(start + 1)
	const firstLineEnd = rest.indexOf('\n')
	const next = rest.slice(firstLineEnd + 1).search(/^  \S/m)
	return next === -1 ? rest : rest.slice(0, firstLineEnd + 1 + next)
}

function stepBlock(name: string): string {
	const marker = `- name: ${name}`
	const start = workflow.indexOf(marker)
	expect(start).toBeGreaterThan(-1)
	const nextStep = workflow.slice(start + 1).search(/- (name:|uses:)/)
	return nextStep === -1
		? workflow.slice(start)
		: workflow.slice(start, start + 1 + nextStep)
}

describe('release.yml — cosign checksum bundle contract', () => {
	it('release job grants id-token: write', () => {
		expect(releaseJobBlock()).toContain('id-token: write')
	})

	it('release job grants contents: write and actions: read', () => {
		const block = releaseJobBlock()
		expect(block).toContain('contents: write')
		expect(block).toContain('actions: read')
	})

	it('Generate checksums step covers binaries, share archives, and installers', () => {
		const block = stepBlock('Generate checksums')
		expect(block).toContain('wayforge-checksums.txt')
		expect(block).toContain('install.sh')
		expect(block).toContain('install.ps1')
	})

	it('workflow installs cosign v3.1.4 via cosign-installer', () => {
		expect(workflow).toContain('sigstore/cosign-installer@')
		expect(workflow).toContain("cosign-release: 'v3.1.4'")
	})

	it('workflow signs the manifest with a sigstore bundle', () => {
		expect(workflow).toContain('cosign sign-blob')
		expect(workflow).toContain(
			'--bundle wayforge-checksums.txt.sigstore.json',
		)
	})

	it('signing happens after checksums and before Create draft release', () => {
		const checksums = workflow.indexOf('Generate checksums')
		const sign = workflow.indexOf('Sign checksum manifest')
		const create = workflow.indexOf('Create draft release')
		expect(checksums).toBeGreaterThan(-1)
		expect(sign).toBeGreaterThan(checksums)
		expect(create).toBeGreaterThan(sign)
	})

	it('sigstore bundle is uploaded with the release assets', () => {
		expect(stepBlock('Upload release assets')).toContain(
			'wayforge-checksums.txt.sigstore.json',
		)
	})

	it('does not publish detached .sig/.pem artifacts', () => {
		expect(workflow).not.toContain('--output-signature')
		expect(workflow).not.toContain('--output-certificate')
	})

	it('bundle is not listed inside the manifest (no circularity)', () => {
		const block = stepBlock('Generate checksums')
		expect(block).not.toContain('wayforge-checksums.txt.sigstore.json')
	})
})

describe('release.yml — least-privilege and pinning', () => {
	it('top-level permissions grant only contents: read', () => {
		const start = workflow.indexOf('permissions:')
		expect(start).toBeGreaterThan(-1)
		const jobs = workflow.indexOf('jobs:')
		const block = workflow.slice(start, jobs)
		expect(block).toContain('contents: read')
		expect(block).not.toContain('contents: write')
		expect(block).not.toContain('actions:')
		expect(block).not.toContain('id-token:')
	})

	it('build-binaries job grants contents: read', () => {
		const start = workflow.indexOf('  build-binaries:')
		const release = workflow.indexOf('\n  release:')
		const block = workflow.slice(start, release)
		expect(block).toContain('permissions:')
		expect(block).toContain('contents: read')
	})

	it('every uses: action is SHA-pinned with a version comment', () => {
		const usesLines = workflow
			.split('\n')
			.filter((line) => line.trim().match(/^(?:- )?uses:/))
		expect(usesLines.length).toBeGreaterThan(0)
		for (const line of usesLines) {
			expect(line).toMatch(/uses:\s+\S+@[0-9a-f]{40}\s+#\s+v[\d.]+/)
		}
	})

	it('every checkout step sets persist-credentials: false', () => {
		const checkoutCount = workflow
			.split('\n')
			.filter((line) =>
				line.trim().match(/^(?:- )?uses: actions\/checkout@/),
			).length
		expect(checkoutCount).toBe(2)
		const occurrences =
			workflow.split('persist-credentials: false').length - 1
		expect(occurrences).toBe(2)
	})
})

describe('release.yml — draft-first publish flow', () => {
	it('Create draft release step creates a draft', () => {
		const block = stepBlock('Create draft release')
		expect(block).toContain('--draft')
		expect(block).toContain('gh release create')
	})

	it('Upload release assets step uses --clobber', () => {
		const block = stepBlock('Upload release assets')
		expect(block).toContain('--clobber')
		expect(block).toContain('gh release upload')
	})

	it('Verify signature bundle asset step fails closed on a missing bundle', () => {
		const block = stepBlock('Verify signature bundle asset')
		expect(block).toContain('wayforge-checksums.txt.sigstore.json')
		expect(block).toContain('exit 1')
	})

	it('Publish release step unpublishes the draft after verification', () => {
		const block = stepBlock('Publish release')
		expect(block).toContain('--draft=false')
		const verify = workflow.indexOf('Verify signature bundle asset')
		const publish = workflow.indexOf('Publish release')
		expect(publish).toBeGreaterThan(verify)
	})

	it('does not skip an existing release (repair instead)', () => {
		expect(workflow).not.toContain('already exists — skipping')
		expect(workflow).not.toContain('exit 0')
	})
})
