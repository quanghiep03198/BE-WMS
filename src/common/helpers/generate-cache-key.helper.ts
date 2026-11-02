import crypto from 'crypto'
import { flatten } from 'flat'

export function generateCacheKey(filter: AnyObject): string {
	const flat = flatten<AnyObject, AnyObject>(filter)

	const sortedFilter = Object.keys(flat)
		.sort()
		.reduce<Record<string, unknown>>((acc, key) => {
			acc[key] = flat[key]
			return acc
		}, {})

	return crypto.createHash('md5').update(JSON.stringify(sortedFilter)).digest('hex')
}
