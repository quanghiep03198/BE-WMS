import { Types } from 'mongoose'

export function referenceLookup(
	rows: Array<{ _id: Types.ObjectId; key: unknown }>,
	collection: string,
	normalize: (key: string) => string
): { ids: Map<string, Types.ObjectId>; fallback: Types.ObjectId } {
	if (!rows.length) throw new Error(`Empty ${collection} reference collection`)
	for (const row of rows) {
		if (!(row._id instanceof Types.ObjectId)) throw new Error(`Invalid ${collection} reference ObjectId`)
		if (row.key != null && typeof row.key !== 'string') throw new Error(`Invalid ${collection} reference code`)
	}
	rows.sort((left, right) => left._id.toHexString().localeCompare(right._id.toHexString()))
	const ids = new Map<string, Types.ObjectId>()
	const duplicates = new Set<string>()
	for (const row of rows) {
		if (typeof row.key !== 'string' || !row.key.trim()) continue
		const key = normalize(row.key.trim())
		if (ids.has(key)) duplicates.add(key)
		else ids.set(key, row._id)
	}
	if (duplicates.size) {
		console.warn(`Duplicate ${collection} reference codes: ${duplicates.size}; using lowest ObjectId`)
	}
	return { ids, fallback: rows[0]._id }
}
