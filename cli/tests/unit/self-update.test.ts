import { describe, it, expect, afterEach, vi } from 'vitest'
import path from 'path'
import os from 'os'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import http from 'node:http'
import type { AddressInfo } from 'net'
import { spawnSync } from 'node:child_process'
import {
	selfUpdate,
	replaceInstall,
	cleanupStaleBackups,
	parseChecksums,
	sha256File,
} from '../../src/lib/self-update.js'

const BASE = path.resolve(__dirname, '..', '..', '.test-self-update')
fs.ensureDirSync(BASE)

let tempDirs: string[] = []

function makeTempDir(label: string): string {
	const dir = fs.mkdtempSync(path.join(BASE, `${label}-`))
	tempDirs.push(dir)
	return dir
}

function writeFixtureShare(root: string, version: string): void {
	fs.mkdirpSync(path.join(root, 'base', 'opencode'))
	fs.writeFileSync(
		path.join(root, 'base', 'opencode', 'agent.md'),
		'fixture',
		'utf8',
	)
	fs.writeFileSync(path.join(root, 'VERSION'), `${version}\n`, 'utf8')
}

function buildShareArchive(
	fixtureDir: string,
	archivePath: string,
	entries: string[],
): void {
	const result = spawnSync('tar', ['-czf', archivePath, '-C', fixtureDir, ...entries])
	if (result.status !== 0) {
		throw new Error(`test fixture: tar failed: ${result.stderr?.toString()}`)
	}
}

function binaryAssetName(): string {
	const ext = process.platform === 'win32' ? '.exe' : ''
	return `wayforge-${process.platform}-${process.arch}${ext}`
}

function shareAssetName(tag: string): string {
	const version = tag.replace(/^v/, '')
	return process.platform === 'win32'
		? `wayforge-share-${version}.zip`
		: `wayforge-share-${version}.tar.gz`
}

function checksumsText(entries: Array<[string, Buffer | string]>): string {
	return entries
		.map(([name, content]) => {
			const hash = crypto.createHash('sha256').update(content).digest('hex')
			return `${hash}  ${name}`
		})
		.join('\n')
}

interface Route {
	body: Buffer
}

function startServer(routes: Record<string, Route>): {
	url: string
	close: () => Promise<void>
	requested: string[]
} {
	const requested: string[] = []
	const server = http.createServer((req, res) => {
		const target = req.url ?? ''
		if (target === '/releases/latest') {
			res.writeHead(302, { Location: '/releases/tag/v9.0.0' })
			res.end()
			return
		}
		const route = routes[target]
		if (!route) {
			res.writeHead(404)
			res.end()
			return
		}
		requested.push(target)
		res.writeHead(200)
		res.end(route.body)
	})
	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as AddressInfo
			resolve({
				url: `http://127.0.0.1:${String(port)}/releases`,
				close: () =>
					new Promise((resolveClose) => server.close(resolveClose)),
				requested,
			})
		})
	})
}

function installFixture(version = '1.0.0'): string {
	const prefix = makeTempDir('prefix')
	const shareDir = path.join(prefix, 'share', 'wayforge')
	writeFixtureShare(shareDir, version)
	fs.mkdirpSync(path.join(prefix, 'bin'))
	fs.writeFileSync(
		path.join(prefix, 'bin', process.platform === 'win32' ? 'wfg.exe' : 'wfg'),
		'old-binary',
		'utf8',
	)
	vi.stubEnv('WAYFORGE_VERSION', version)
	vi.stubEnv('WAYFORGE_HOME', shareDir)
	vi.stubGlobal('process', {
		...process,
		execPath: path.join(
			prefix,
			'bin',
			process.platform === 'win32' ? 'wfg.exe' : 'wfg',
		),
	})
	return prefix
}

function collectLogs(): { lines: string[]; log: (line: string) => void } {
	const lines: string[] = []
	return { lines, log: (line: string) => lines.push(line) }
}

afterEach(async () => {
	vi.unstubAllEnvs()
	vi.unstubAllGlobals()
	for (const dir of tempDirs) {
		if (fs.pathExistsSync(dir)) {
			fs.removeSync(dir)
		}
	}
	tempDirs = []
})

describe('parseChecksums', () => {
	it('parses sha256sum-format lines', () => {
		const text =
			'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  wayforge-linux-x64\n' +
			'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  wayforge-share-9.0.0.tar.gz\n'
		const parsed = parseChecksums(text)

		expect(parsed.get('wayforge-linux-x64')).toBe(
			'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		)
		expect(parsed.get('wayforge-share-9.0.0.tar.gz')).toBe(
			'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
		)
	})

	it('skips blank and malformed lines and lowercases hashes', () => {
		const text =
			'\nnot-a-checksum-line\n' +
			'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA  wayforge-win32-x64.exe\n'
		const parsed = parseChecksums(text)

		expect(parsed.size).toBe(1)
		expect(parsed.get('wayforge-win32-x64.exe')).toBe(
			'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		)
	})

	it('resolves bare asset names from a dist/-prefixed checksum file', () => {
		const text =
			'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  dist/wayforge-linux-x64\n'
		const parsed = parseChecksums(text)

		expect(parsed.get('wayforge-linux-x64')).toBe(
			'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		)
		expect(parsed.get('dist/wayforge-linux-x64')).toBeUndefined()
	})
})

describe('sha256File', () => {
	it('hashes file contents', async () => {
		const dir = makeTempDir('hash')
		const file = path.join(dir, 'blob.bin')
		fs.writeFileSync(file, 'wayforge', 'utf8')

		const expected = crypto.createHash('sha256').update('wayforge').digest('hex')

		expect(await sha256File(file)).toBe(expected)
	})
})

describe('replaceInstall', () => {
	it('replaces share and binary and leaves backups for cleanup', async () => {
		const prefix = makeTempDir('replace-')
		const shareDir = path.join(prefix, 'share', 'wayforge')
		writeFixtureShare(shareDir, '1.0.0')
		const binaryName = process.platform === 'win32' ? 'wfg.exe' : 'wfg'
		fs.mkdirpSync(path.join(prefix, 'bin'))
		fs.writeFileSync(path.join(prefix, 'bin', binaryName), 'old', 'utf8')

		const extracted = makeTempDir('extracted-')
		const extractedShare = path.join(extracted, 'wayforge')
		writeFixtureShare(extractedShare, '9.0.0')
		const newBinary = path.join(extracted, binaryName)
		fs.writeFileSync(newBinary, 'new', 'utf8')

		await replaceInstall({ prefix, extractedShareDir: extractedShare, newBinaryPath: newBinary })

		expect(fs.readFileSync(path.join(shareDir, 'VERSION'), 'utf8').trim()).toBe('9.0.0')
		expect(fs.readFileSync(path.join(prefix, 'bin', binaryName), 'utf8')).toBe('new')
		const shareEntries = fs.readdirSync(path.join(prefix, 'share'))
		expect(shareEntries.some((n) => /^wayforge\.old-\d+$/.test(n))).toBe(true)
	})

	it('restores the original share and binary when replacement fails', async () => {
		const prefix = makeTempDir('rollback-')
		const shareDir = path.join(prefix, 'share', 'wayforge')
		writeFixtureShare(shareDir, '1.0.0')
		const binaryName = process.platform === 'win32' ? 'wfg.exe' : 'wfg'
		fs.mkdirpSync(path.join(prefix, 'bin'))
		fs.writeFileSync(path.join(prefix, 'bin', binaryName), 'old', 'utf8')

		const extracted = makeTempDir('extracted-')
		const extractedShare = path.join(extracted, 'wayforge')
		writeFixtureShare(extractedShare, '9.0.0')

		await expect(
			replaceInstall({
				prefix,
				extractedShareDir: extractedShare,
				newBinaryPath: path.join(extracted, 'does-not-exist'),
			}),
		).rejects.toThrow()

		expect(fs.readFileSync(path.join(shareDir, 'VERSION'), 'utf8').trim()).toBe('1.0.0')
		expect(fs.readFileSync(path.join(prefix, 'bin', binaryName), 'utf8')).toBe('old')
		const shareEntries = fs.readdirSync(path.join(prefix, 'share'))
		expect(shareEntries.some((n) => /^wayforge\.old-\d+$/.test(n))).toBe(false)
	})

	it('rolls the share back when the binary backup rename fails', async () => {
		const prefix = makeTempDir('binbackup-')
		const shareDir = path.join(prefix, 'share', 'wayforge')
		writeFixtureShare(shareDir, '1.0.0')
		const binaryName = process.platform === 'win32' ? 'wfg.exe' : 'wfg'
		const binaryPath = path.join(prefix, 'bin', binaryName)
		fs.mkdirpSync(path.join(prefix, 'bin'))
		fs.writeFileSync(binaryPath, 'old', 'utf8')

		const extracted = makeTempDir('extracted-')
		const extractedShare = path.join(extracted, 'wayforge')
		writeFixtureShare(extractedShare, '9.0.0')
		const newBinary = path.join(extracted, binaryName)
		fs.writeFileSync(newBinary, 'new', 'utf8')

		await expect(
			replaceInstall({
				prefix,
				extractedShareDir: extractedShare,
				newBinaryPath: newBinary,
				rename: (from, to) => {
					if (from === binaryPath) {
						throw new Error('injected binary backup failure')
					}
					fs.renameSync(from, to)
				},
			}),
		).rejects.toThrow('injected binary backup failure')

		expect(fs.readFileSync(path.join(shareDir, 'VERSION'), 'utf8').trim()).toBe('1.0.0')
		expect(fs.readFileSync(binaryPath, 'utf8')).toBe('old')
		expect(fs.readdirSync(path.join(prefix, 'share'))).toEqual(['wayforge'])
		expect(fs.readdirSync(path.join(prefix, 'bin'))).toEqual([binaryName])
		expect(fs.readFileSync(path.join(extractedShare, 'VERSION'), 'utf8').trim()).toBe('9.0.0')
	})
})

describe('cleanupStaleBackups', () => {
	it('removes backup artifacts older than 7 days and keeps fresh ones', () => {
		const prefix = makeTempDir('stale-')
		const binDir = path.join(prefix, 'bin')
		const shareDir = path.join(prefix, 'share')
		fs.mkdirpSync(binDir)
		fs.mkdirpSync(shareDir)

		const oldBinary = path.join(binDir, 'wfg.exe.old-111')
		const freshBinary = path.join(binDir, 'wfg.exe.old-222')
		const oldShare = path.join(shareDir, 'wayforge.old-111')
		const freshShare = path.join(shareDir, 'wayforge.old-222')
		for (const target of [oldBinary, freshBinary, oldShare, freshShare]) {
			fs.ensureDirSync(target)
			fs.writeFileSync(path.join(target, 'x'), 'x', 'utf8')
		}
		const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
		fs.utimesSync(oldBinary, old, old)
		fs.utimesSync(oldShare, old, old)

		cleanupStaleBackups(prefix)

		expect(fs.pathExistsSync(oldBinary)).toBe(false)
		expect(fs.pathExistsSync(oldShare)).toBe(false)
		expect(fs.pathExistsSync(freshBinary)).toBe(true)
		expect(fs.pathExistsSync(freshShare)).toBe(true)
	})
})

describe('selfUpdate', () => {
	it('refuses to run from a dev checkout', async () => {
		const { lines, log } = collectLogs()

		const result = await selfUpdate({ log })

		expect(result.outcome).toBe('dev-checkout')
		expect(lines[0]).toContain('self-update only works for an installed wayforge CLI')
	})

	it('reports the resolved prefix error when the layout is missing', async () => {
		installFixture()
		vi.stubEnv('WAYFORGE_INSTALL_DIR', path.join(makeTempDir('empty-')))
		const { lines, log } = collectLogs()

		const result = await selfUpdate({ log })

		expect(result.outcome).toBe('no-prefix')
		expect(lines[0]).toContain('could not resolve the install prefix')
	})

	it('reports up-to-date when the latest release is not newer', async () => {
		installFixture('9.0.0')
		const { lines, log } = collectLogs()

		const result = await selfUpdate({
			log,
			releaseRoot: 'http://127.0.0.1:1/releases',
			fetchImpl: (async () => ({
				ok: true,
				url: 'http://127.0.0.1:1/releases/tag/v9.0.0',
			})) as unknown as typeof fetch,
		})

		expect(result.outcome).toBe('up-to-date')
		expect(lines[0]).toContain('up to date')
	})

	it('--check reports current and latest without downloading', async () => {
		installFixture()
		const { lines, log } = collectLogs()

		const result = await selfUpdate({
			checkOnly: true,
			log,
			releaseRoot: 'http://127.0.0.1:1/releases',
			fetchImpl: (async () => ({
				ok: true,
				url: 'http://127.0.0.1:1/releases/tag/v9.0.0',
			})) as unknown as typeof fetch,
		})

		expect(result.outcome).toBe('check')
		expect(lines).toEqual([
			'current version: v1.0.0',
			'latest version: v9.0.0',
		])
	})

	it('--check reports both versions when up to date', async () => {
		installFixture('9.0.0')
		const { lines, log } = collectLogs()

		const result = await selfUpdate({
			checkOnly: true,
			log,
			releaseRoot: 'http://127.0.0.1:1/releases',
			fetchImpl: (async () => ({
				ok: true,
				url: 'http://127.0.0.1:1/releases/tag/v9.0.0',
			})) as unknown as typeof fetch,
		})

		expect(result.outcome).toBe('check')
		expect(lines).toEqual([
			'current version: v9.0.0',
			'latest version: v9.0.0',
			'wayforge is up to date',
		])
	})

	it('leaves stale backups untouched for --check/--dry-run and cleans them on a real update', async () => {
		const prefix = installFixture()
		const binaryName = process.platform === 'win32' ? 'wfg.exe' : 'wfg'
		const staleBinary = path.join(prefix, 'bin', `${binaryName}.old-999`)
		const staleShare = path.join(prefix, 'share', 'wayforge.old-999')
		const staleStaged = path.join(prefix, 'bin', '.wfg-download-999')
		fs.ensureDirSync(staleShare)
		fs.writeFileSync(staleBinary, 'stale', 'utf8')
		fs.writeFileSync(staleStaged, 'stale', 'utf8')
		fs.writeFileSync(path.join(staleShare, 'x'), 'x', 'utf8')
		const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
		fs.utimesSync(staleBinary, old, old)
		fs.utimesSync(staleStaged, old, old)
		fs.utimesSync(staleShare, old, old)

		const readOnlyFetch = (async () => ({
			ok: true,
			url: 'http://127.0.0.1:1/releases/tag/v9.0.0',
		})) as unknown as typeof fetch

		await selfUpdate({
			checkOnly: true,
			releaseRoot: 'http://127.0.0.1:1/releases',
			fetchImpl: readOnlyFetch,
			log: () => {},
		})
		expect(fs.pathExistsSync(staleBinary)).toBe(true)
		expect(fs.pathExistsSync(staleStaged)).toBe(true)
		expect(fs.pathExistsSync(staleShare)).toBe(true)

		await selfUpdate({
			dryRun: true,
			releaseRoot: 'http://127.0.0.1:1/releases',
			fetchImpl: readOnlyFetch,
			log: () => {},
		})
		expect(fs.pathExistsSync(staleBinary)).toBe(true)
		expect(fs.pathExistsSync(staleStaged)).toBe(true)
		expect(fs.pathExistsSync(staleShare)).toBe(true)

		const fixture = makeTempDir('fixture-')
		const archive = path.join(fixture, 'share.tar.gz')
		const fixtureShare = path.join(fixture, 'share')
		writeFixtureShare(fixtureShare, '9.0.0')
		buildShareArchive(fixtureShare, archive, ['base', 'VERSION'])
		const archiveBytes = fs.readFileSync(archive)
		const binaryBytes = Buffer.from('new-binary')
		const server = await startServer({
			'/releases/tag/v9.0.0': { body: Buffer.from('') },
			'/releases/download/v9.0.0/wayforge-checksums.txt': {
				body: Buffer.from(
					checksumsText([
						[binaryAssetName(), binaryBytes],
						[shareAssetName('v9.0.0'), archiveBytes],
					]),
				),
			},
			[`/releases/download/v9.0.0/${binaryAssetName()}`]: { body: binaryBytes },
			[`/releases/download/v9.0.0/${shareAssetName('v9.0.0')}`]: {
				body: archiveBytes,
			},
		})
		vi.stubEnv('WAYFORGE_RELEASE_ROOT', server.url)

		const result = await selfUpdate({ yes: true, prefix, log: () => {} })
		await server.close()

		expect(result.outcome).toBe('updated')
		expect(fs.pathExistsSync(staleBinary)).toBe(false)
		expect(fs.pathExistsSync(staleStaged)).toBe(false)
		expect(fs.pathExistsSync(staleShare)).toBe(false)
	})

	it('--dry-run reports the target version and asset URLs without downloading', async () => {
		installFixture()
		const { lines, log } = collectLogs()

		const result = await selfUpdate({
			dryRun: true,
			log,
			releaseRoot: 'http://127.0.0.1:1/releases',
			fetchImpl: (async () => ({
				ok: true,
				url: 'http://127.0.0.1:1/releases/tag/v9.0.0',
			})) as unknown as typeof fetch,
		})

		expect(result.outcome).toBe('dry-run')
		expect(result.binaryUrl).toBe(
			`http://127.0.0.1:1/releases/download/v9.0.0/${binaryAssetName()}`,
		)
		expect(result.shareUrl).toBe(
			`http://127.0.0.1:1/releases/download/v9.0.0/${shareAssetName('v9.0.0')}`,
		)
		expect(lines[0]).toContain('DRY-RUN: would update wayforge v1.0.0 -> v9.0.0')
	})

	it('prompts unless --yes and honours a decline', async () => {
		installFixture()
		const questions: string[] = []
		const { log } = collectLogs()

		const declined = await selfUpdate({
			log,
			releaseRoot: 'http://127.0.0.1:1/releases',
			fetchImpl: (async () => ({
				ok: true,
				url: 'http://127.0.0.1:1/releases/tag/v9.0.0',
			})) as unknown as typeof fetch,
			promptFn: async (question) => {
				questions.push(question)
				return false
			},
		})

		expect(questions).toEqual(['Update wayforge v1.0.0 -> v9.0.0? [y/N] '])
		expect(declined.outcome).toBe('declined')
	})

	it('aborts on a checksum mismatch without touching the install', async () => {
		const prefix = installFixture()
		const fixture = makeTempDir('fixture-')
		const archive = path.join(fixture, 'share.tar.gz')
		const fixtureShare = path.join(fixture, 'share')
		writeFixtureShare(fixtureShare, '9.0.0')
		buildShareArchive(fixtureShare, archive, ['base', 'VERSION'])
		const archiveBytes = fs.readFileSync(archive)
		const binaryBytes = Buffer.from('new-binary')

		const server = await startServer({
			'/releases/tag/v9.0.0': { body: Buffer.from('') },
			[`/releases/download/v9.0.0/wayforge-checksums.txt`]: {
				body: Buffer.from(
					checksumsText([
						[binaryAssetName(), binaryBytes],
						[shareAssetName('v9.0.0'), Buffer.from('tampered')],
					]),
				),
			},
			[`/releases/download/v9.0.0/${binaryAssetName()}`]: { body: binaryBytes },
			[`/releases/download/v9.0.0/${shareAssetName('v9.0.0')}`]: {
				body: archiveBytes,
			},
		})
		vi.stubEnv('WAYFORGE_RELEASE_ROOT', server.url)
		const { log } = collectLogs()

		await expect(selfUpdate({ yes: true, prefix, log })).rejects.toThrow(
			/checksum mismatch/,
		)
		await server.close()

		expect(
			fs.readFileSync(
				path.join(
					prefix,
					'bin',
					process.platform === 'win32' ? 'wfg.exe' : 'wfg',
				),
				'utf8',
			),
		).toBe('old-binary')
		expect(
			fs.readFileSync(path.join(prefix, 'share', 'wayforge', 'VERSION'), 'utf8').trim(),
		).toBe('1.0.0')
		expect(fs.readdirSync(path.join(prefix, 'share'))).toEqual(['wayforge'])
	})

	it('aborts when the checksum file has no entry for an asset', async () => {
		const prefix = installFixture()
		const server = await startServer({
			'/releases/tag/v9.0.0': { body: Buffer.from('') },
			'/releases/download/v9.0.0/wayforge-checksums.txt': {
				body: Buffer.from(''),
			},
			[`/releases/download/v9.0.0/${binaryAssetName()}`]: {
				body: Buffer.from('new-binary'),
			},
			[`/releases/download/v9.0.0/${shareAssetName('v9.0.0')}`]: {
				body: Buffer.from('archive'),
			},
		})
		vi.stubEnv('WAYFORGE_RELEASE_ROOT', server.url)
		const { log } = collectLogs()

		await expect(selfUpdate({ yes: true, prefix, log })).rejects.toThrow(
			/no entry for/,
		)
		await server.close()
	})

	it('rejects a share archive without base/ or with a wrong VERSION', async () => {
		const prefix = installFixture()
		const fixture = makeTempDir('fixture-')
		const badArchive = path.join(fixture, 'bad.tar.gz')
		const noBase = path.join(fixture, 'nobase')
		fs.mkdirpSync(noBase)
		fs.writeFileSync(path.join(noBase, 'VERSION'), '9.0.0\n', 'utf8')
		buildShareArchive(noBase, badArchive, ['VERSION'])
		const badBytes = fs.readFileSync(badArchive)
		const binaryBytes = Buffer.from('new-binary')

		const server = await startServer({
			'/releases/tag/v9.0.0': { body: Buffer.from('') },
			'/releases/download/v9.0.0/wayforge-checksums.txt': {
				body: Buffer.from(
					checksumsText([
						[binaryAssetName(), binaryBytes],
						[shareAssetName('v9.0.0'), badBytes],
					]),
				),
			},
			[`/releases/download/v9.0.0/${binaryAssetName()}`]: { body: binaryBytes },
			[`/releases/download/v9.0.0/${shareAssetName('v9.0.0')}`]: {
				body: badBytes,
			},
		})
		vi.stubEnv('WAYFORGE_RELEASE_ROOT', server.url)
		const { log } = collectLogs()

		await expect(selfUpdate({ yes: true, prefix, log })).rejects.toThrow(
			/missing base\//,
		)
		await server.close()

		expect(
			fs.readFileSync(path.join(prefix, 'share', 'wayforge', 'VERSION'), 'utf8').trim(),
		).toBe('1.0.0')
	})

	it('updates the prefix from a local HTTP release and removes backups', async () => {
		const prefix = installFixture()
		const fixture = makeTempDir('fixture-')
		const archive = path.join(fixture, 'share.tar.gz')
		const fixtureShare = path.join(fixture, 'share')
		writeFixtureShare(fixtureShare, '9.0.0')
		buildShareArchive(fixtureShare, archive, ['base', 'VERSION'])
		const archiveBytes = fs.readFileSync(archive)
		const binaryBytes = Buffer.from('new-binary')

		const server = await startServer({
			'/releases/tag/v9.0.0': { body: Buffer.from('') },
			'/releases/download/v9.0.0/wayforge-checksums.txt': {
				body: Buffer.from(
					checksumsText([
						[binaryAssetName(), binaryBytes],
						[shareAssetName('v9.0.0'), archiveBytes],
					]),
				),
			},
			[`/releases/download/v9.0.0/${binaryAssetName()}`]: { body: binaryBytes },
			[`/releases/download/v9.0.0/${shareAssetName('v9.0.0')}`]: {
				body: archiveBytes,
			},
		})
		vi.stubEnv('WAYFORGE_RELEASE_ROOT', server.url)
		const { lines, log } = collectLogs()

		const result = await selfUpdate({ yes: true, prefix, log })
		await server.close()

		expect(result.outcome).toBe('updated')
		expect(lines).toContain(`updated wayforge to v9.0.0`)
		expect(
			fs.readFileSync(
				path.join(
					prefix,
					'bin',
					process.platform === 'win32' ? 'wfg.exe' : 'wfg',
				),
				'utf8',
			),
		).toBe('new-binary')
		expect(
			fs.readFileSync(path.join(prefix, 'share', 'wayforge', 'VERSION'), 'utf8').trim(),
		).toBe('9.0.0')
		expect(fs.pathExistsSync(path.join(prefix, 'share', 'wayforge', 'base'))).toBe(true)
		const shareEntries = fs.readdirSync(path.join(prefix, 'share'))
		expect(shareEntries).toEqual(['wayforge'])
		const binEntries = fs.readdirSync(path.join(prefix, 'bin'))
		expect(binEntries.every((n) => !/\.old-\d+$/.test(n))).toBe(true)
		expect(binEntries.every((n) => !n.startsWith('.wfg-download-'))).toBe(true)
	})
})
