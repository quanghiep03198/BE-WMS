import { parseArgs, type ParseArgsConfig } from 'node:util'

export function getArgs<T extends ParseArgsConfig['options']>(options: T): ReturnType<typeof parseArgs>['values'] {
	const { values } = parseArgs({
		args: process.argv,
		options,
		strict: true,
		allowPositionals: true
	})
	return values
}
