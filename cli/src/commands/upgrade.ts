import { errorMessage } from '../lib/errors.js'
import { upgrade } from '../lib/upgrade.js'

const INSTALL_SH_COMMAND =
	'curl -fsSL https://github.com/Macacoders/wayforge/releases/latest/download/install.sh | sh'
const INSTALL_PS1_COMMAND =
	'powershell -c "irm https://github.com/Macacoders/wayforge/releases/latest/download/install.ps1 | iex"'

export interface UpgradeCommandOptions {
	yes?: boolean
}

export async function upgradeCommand(
	options: UpgradeCommandOptions,
): Promise<void> {
	try {
		await upgrade({ yes: options.yes })
	} catch (error) {
		console.error(`error: upgrade failed: ${errorMessage(error)}`)
		console.error(
			'The upgrade did not complete; the existing install was left in place where possible.',
		)
		console.error(
			'If the install needs repair, run the one-shot installer:',
		)
		console.error(`  ${INSTALL_SH_COMMAND}`)
		console.error(`  ${INSTALL_PS1_COMMAND}`)
		process.exit(1)
	}
}
