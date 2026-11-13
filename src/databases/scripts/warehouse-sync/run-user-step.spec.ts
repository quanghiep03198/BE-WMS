import { compare } from 'bcrypt'
import type { mongo } from 'mongoose'
import { Readable } from 'node:stream'
import { runUserStep } from './run-user-step'

describe('runUserStep', () => {
	it('keeps the first ordered source user for each trimmed username across reruns', async () => {
		const rows = [
			{ username: ' 0808009 ', password: 'first', email: 'first@example.invalid', display_name: 'First' },
			{ username: 'other', password: 'other', email: null, display_name: 'Other' },
			{ username: '0808009', password: 'second', email: 'second@example.invalid', display_name: 'Second' }
		]
		const stored = new Map<string, { password: string; email: string | null; display_name: string | null }>()
		const collection = {
			createIndex: async () => undefined,
			findOne: async ({ username }: { username: string }) => stored.get(username) ?? null,
			updateOne: async (
				{ username }: { username: string },
				update: { $set: { password: string; email: string | null; display_name: string | null } }
			) => {
				stored.set(username, update.$set)
				return { acknowledged: true }
			}
		}
		let sql = ''
		const pool = {
			request: () => ({
				input: () => undefined,
				toReadableStream: () => Readable.from(rows),
				query: async (query: string) => {
					sql = query
				},
				cancel: () => true
			})
		}
		const database = { collection: () => collection } as unknown as mongo.Db
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
		try {
			expect(await runUserStep(pool, database, 4)).toEqual({ users: 2 })
			expect(sql).toMatch(/ORDER BY\s+a\.keyid\s+ASC/i)
			expect(stored.size).toBe(2)
			expect(stored.get('0808009')).toMatchObject({ email: 'first@example.invalid', display_name: 'First' })
			expect(await compare('first', stored.get('0808009')!.password)).toBe(true)
			const firstHash = stored.get('0808009')!.password
			expect(await runUserStep(pool, database, 4)).toEqual({ users: 2 })
			expect(stored.get('0808009')!.password).toBe(firstHash)
			expect(warn).toHaveBeenCalledWith(expect.stringMatching(/1.*duplicate/i))
		} finally {
			warn.mockRestore()
		}
	})
})
