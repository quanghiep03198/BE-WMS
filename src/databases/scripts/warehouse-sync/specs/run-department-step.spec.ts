import { type mongo } from 'mongoose'
import { Readable } from 'node:stream'
import { runDepartmentStep } from '../run-department-step'

describe('runDepartmentStep', () => {
	it('localizes assembly and sewing names after removing Chinese characters', async () => {
		const writes: Array<{ code: string; name: unknown }> = []
		const pool = {
			request: () => ({
				input: () => undefined,
				toReadableStream: () => Readable.from([
					{ group: 'ASBL', code: 'A', name: '二廠成型A線' },
					{ group: 'SEW', code: 'B', name: '二廠針車01組' }
				]),
				query: async () => undefined,
				cancel: () => true
			})
		}
		const database = {
			collection: () => ({
				createIndex: async () => undefined,
				updateOne: async (filter: { code: string }, update: { $set: { name: unknown } }) => {
					writes.push({ code: filter.code, name: update.$set.name })
					return { acknowledged: true }
				}
			})
		} as unknown as mongo.Db
		expect(await runDepartmentStep(pool, database, 'VB2')).toEqual({ departments: 2 })
		expect(writes).toEqual([
			{ code: 'A', name: { cn: '成型A', en: 'Assembly A', vi: 'Thành hình A' } },
			{ code: 'B', name: { cn: '針車01', en: 'Sewing 01', vi: 'May 01' } }
		])
	})

	it('rejects names with no characters remaining after sanitization', async () => {
		const pool = {
			request: () => ({
				input: () => undefined,
				toReadableStream: () => Readable.from([{ group: 'ASBL', code: 'A', name: '成型線' }]),
				query: async () => undefined,
				cancel: () => true
			})
		}
		const updateOne = jest.fn()
		const database = {
			collection: () => ({ createIndex: async () => undefined, updateOne })
		} as unknown as mongo.Db
		await expect(runDepartmentStep(pool, database, 'VB2')).rejects.toThrow(
			'Invalid department name after removing Chinese characters: A'
		)
		expect(updateOne).not.toHaveBeenCalled()
	})
})
