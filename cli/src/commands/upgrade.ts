import {
	INSTALL_PS1_COMMAND,
	INSTALL_SH_COMMAND,
	upgrade,
} from '../lib/upgrade.js'

export interface UpgradeCommandOptions {
	yes?: boolean
}

export async function upgradeCommand(
	options: UpgradeCommandOptions,
): Promise<void> {
	try {
		const result = await upgrade({ yes: Boolean(options.yes) })
		if (
			result.outcome === 'dev-checkout' ||
			result.outcome === 'no-prefix'
		) {
			process.exit(1)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(`error: upgrade failed: ${message}`)
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
