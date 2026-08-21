import path from 'path'

export function resolveSourceDir(): string {
	if (process.env.AI_CONFIG_HOME) {
		return path.resolve(process.env.AI_CONFIG_HOME)
	}
	if (process.versions.bun) {
		return path.dirname(process.execPath)
	}
	return path.resolve(__dirname, '..', '..', '..')
}
