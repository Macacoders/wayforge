import { errorMessage } from '../lib/errors.js'
import { checkForUpdate } from '../lib/release.js'
import { displayVersion } from '../lib/version.js'

export async function updateCommand(): Promise<void> {
	try {
		const { current, latest, updateAvailable } = await checkForUpdate()
		process.stdout.write(`current version: ${displayVersion(current)}\n`)
		process.stdout.write(`latest version: ${displayVersion(latest)}\n`)
		process.stdout.write(
			updateAvailable
				? "update available: run 'wfg upgrade'\n"
				: 'wayforge is up to date\n',
		)
	} catch (error) {
		console.error(`error: update check failed: ${errorMessage(error)}`)
		process.exit(1)
	}
}
