import path from 'path'
import fs from 'fs-extra'

export function resolveSourceDir(): string {
	if (process.env.AI_CONFIG_HOME) {
		return path.resolve(process.env.AI_CONFIG_HOME)
	}
	const locationBased = path.join(
		path.dirname(process.execPath),
		'..',
		'share',
		'ai-config',
	)
	if (fs.pathExistsSync(path.join(locationBased, 'base'))) {
		return locationBased
	}
	return path.resolve(__dirname, '..', '..', '..')
}
