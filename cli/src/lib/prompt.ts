import readline from 'node:readline/promises'

export function isInteractive(): boolean {
	return process.stdin.isTTY && process.stdout.isTTY
}

export async function promptYesNo(question: string): Promise<boolean> {
	if (!isInteractive()) {
		return false
	}

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})

	try {
		for (;;) {
			const input = (await rl.question(question)).trim().toLowerCase()
			if (input === '' || input === 'n' || input === 'no') {
				return false
			}
			if (input === 'y' || input === 'yes') {
				return true
			}
		}
	} finally {
		rl.close()
	}
}
