import path from 'path'
import fs from 'fs-extra'

export function shareDirFromPrefix(prefix: string): string {
	return path.join(prefix, 'share', 'wayforge')
}

export function resolveSourceDir(): string {
	if (process.env.WAYFORGE_HOME) {
		return path.resolve(process.env.WAYFORGE_HOME)
	}
	const locationBased = shareDirFromPrefix(
		path.join(path.dirname(process.execPath), '..'),
	)
	if (fs.pathExistsSync(path.join(locationBased, 'base'))) {
		return locationBased
	}
	return path.resolve(__dirname, '..', '..', '..')
}
