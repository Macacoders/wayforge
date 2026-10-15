import path from 'path'
import fs from 'fs-extra'

export function resolveSourceDir(): string {
	if (process.env.WAYFORGE_HOME) {
		return path.resolve(process.env.WAYFORGE_HOME)
	}
	const locationBased = path.join(
		path.dirname(process.execPath),
		'..',
		'share',
		'wayforge',
	)
	if (fs.pathExistsSync(path.join(locationBased, 'base'))) {
		return locationBased
	}
	return path.resolve(__dirname, '..', '..', '..')
}
