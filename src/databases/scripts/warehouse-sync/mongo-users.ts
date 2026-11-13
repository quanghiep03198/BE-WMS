import { compare, hash } from 'bcrypt'
import { type mongo } from 'mongoose'

export interface UserSource {
	username: string
	password: string
	email: string | null
	display_name: string | null
}

export async function syncMongoUsers(
	database: mongo.Db,
	rows: Iterable<UserSource> | AsyncIterable<UserSource>,
	saltRounds: number
): Promise<{ users: number }> {
	if (!Number.isInteger(saltRounds) || saltRounds < 4 || saltRounds > 31) throw new Error('Invalid bcrypt salt rounds')
	const users = database.collection('users')
	await users.createIndex({ username: 1 }, { name: 'idx_username', unique: true })
	const seen = new Set<string>()
	let count = 0
	let duplicates = 0
	for await (const row of rows) {
		if (typeof row.username !== 'string' || !row.username.trim()) throw new Error('Invalid source username')
		const username = row.username.trim()
		if (seen.has(username)) {
			duplicates++
			continue
		}
		seen.add(username)
		if (typeof row.password !== 'string' || !row.password || Buffer.byteLength(row.password, 'utf8') > 72) {
			throw new Error(`Invalid source password for user ${username}`)
		}
		if (row.email !== null && typeof row.email !== 'string') throw new Error(`Invalid email for user ${username}`)
		if (row.display_name !== null && typeof row.display_name !== 'string') {
			throw new Error(`Invalid display name for user ${username}`)
		}
		const existing = await users.findOne({ username })
		if (existing && typeof existing.password !== 'string')
			throw new Error(`Invalid stored password for user ${username}`)
		const password =
			existing && (await compare(row.password, existing.password))
				? existing.password
				: await hash(row.password, saltRounds)
		const now = new Date()
		const result = await users.updateOne(
			{ username },
			{
				$set: {
					password,
					email: row.email,
					display_name: row.display_name,
					is_system_user: username === 'quanghiep',
					deleted: false,
					updated_at: now
				},
				$setOnInsert: { created_at: now }
			},
			{ upsert: true }
		)
		if (!result.acknowledged) throw new Error(`Unacknowledged user write for ${username}`)
		count++
	}
	if (duplicates) console.warn(`Skipped ${duplicates} duplicate source user row(s)`)
	return { users: count }
}
