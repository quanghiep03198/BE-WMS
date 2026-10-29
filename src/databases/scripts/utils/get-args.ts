import { parseArgs, type ParseArgsConfig } from 'node:util'

type ArgValues<T extends ParseArgsConfig['options']> = {
	[K in keyof T]: T[K] extends { type: 'string' }
		? string
		: T[K] extends { type: 'boolean' }
			? boolean
			: T[K] extends { type: 'array' }
				? Array<string | boolean>
				: undefined
}

export function getArgs<T extends ParseArgsConfig['options']>(options: T): ArgValues<T> {
	const { values } = parseArgs({
		args: process.argv,
		options,
		strict: true,
		allowPositionals: true
	})
	return values as unknown as ArgValues<T>
}
