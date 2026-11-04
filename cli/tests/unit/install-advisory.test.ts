import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { doInstall } from '../../src/commands/install.js'

vi.mock('../../src/lib/prompt.js', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('../../src/lib/prompt.js')>()
	return {
		...actual,
		isInteractive: vi.fn(),
	}
})

import { isInteractive } from '../../src/lib/prompt.js'
import { captureLogs, installOptions, sourceDir } from '../helpers/install.js'

describe('issue credential advisory', () => {
	let tmpDir: string
	let repo: string
	let previousHome: string | undefined

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(
			path.join(os.tmpdir(), 'wayforge-advisory-test-'),
		)
		repo = path.join(tmpDir, 'repo')
		fs.mkdirpSync(repo)
		previousHome = process.env.WAYFORGE_HOME
		process.env.WAYFORGE_HOME = sourceDir
	})

	afterEach(() => {
		vi.restoreAllMocks()
		if (previousHome === undefined) {
			delete process.env.WAYFORGE_HOME
		} else {
			process.env.WAYFORGE_HOME = previousHome
		}
		fs.removeSync(tmpDir)
	})

	it('logs credential guidance after a successful interactive install', async () => {
		vi.mocked(isInteractive).mockReturnValue(true)
		const logs = captureLogs()

		await doInstall(installOptions(repo, 'opencode'))

		const output = logs.join('\n')
		expect(output).toContain('To use /issue')
		expect(output).toContain('Issues: read/write')
		expect(output).toContain('gh auth login')
	})

	it('stays silent after a successful non-interactive install', async () => {
		vi.mocked(isInteractive).mockReturnValue(false)
		const logs = captureLogs()

		await doInstall(installOptions(repo, 'opencode'))

		expect(logs.join('\n')).not.toContain('To use /issue')
	})
})
