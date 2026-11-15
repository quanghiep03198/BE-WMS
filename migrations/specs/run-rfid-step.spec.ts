import { Types, type mongo } from 'mongoose'
import { Readable } from 'node:stream'
import { runRfidStep } from '../commands/run-rfid-step'

function testDatabase(
	writes: Array<Record<string, unknown>>,
	users: Array<{ username: string; _id: Types.ObjectId }>
) {
	return {
		collection: (name: string) =>
			name === 'users'
				? {
						findOne: async ({ username }: { username: string }) =>
							users.find((user) => user.username === username) ?? null
					}
				: {
						createIndex: async () => undefined,
						updateOne: async (_filter: unknown, update: Record<string, unknown>) => {
							writes.push(update)
							return { acknowledged: true }
						}
					}
	} as unknown as mongo.Db
}

describe('runRfidStep', () => {
	it('defaults null and blank localized names to Unknown', async () => {
		const fallbackId = new Types.ObjectId()
		const writes: Array<Record<string, unknown>> = []
		const pool = {
			request: () => ({
				input: () => undefined,
				toReadableStream: () =>
					Readable.from([
						{
							device_sn: 'SN1',
							station_no: 'CUS_VB2_WH101',
							name_vi: null,
							name_en: '  ',
							name_cn: ' 中文 ',
							tcp_ip: '127.0.0.1',
							tcp_port: 9000,
							device_type: 'antenna'
						}
					]),
				query: async () => undefined,
				cancel: () => true
			})
		}
		const database = testDatabase(writes, [{ username: 'fallback', _id: fallbackId }])
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
		try {
			expect(await runRfidStep(pool, database, 'VB2', 'fallback')).toEqual({ devices: 1 })
			expect(writes[0].$set).toMatchObject({
				'device_name.vi': 'Unknown',
				'device_name.en': 'Unknown',
				'device_name.cn': '中文',
				created_by: fallbackId
			})
			expect(warn).not.toHaveBeenCalled()
		} finally {
			warn.mockRestore()
		}
	})

	it('defaults all localized names to Unknown when the source languages are absent', async () => {
		const fallbackId = new Types.ObjectId()
		const writes: Array<Record<string, unknown>> = []
		const pool = {
			request: () => ({
				input: () => undefined,
				toReadableStream: () =>
					Readable.from([
						{
							device_sn: 'SN1',
							station_no: 'CUS_VB2_WH101',
							tcp_ip: '127.0.0.1',
							tcp_port: 9000,
							device_type: 'antenna'
						}
					]),
				query: async () => undefined,
				cancel: () => true
			})
		}
		const database = testDatabase(writes, [{ username: 'fallback', _id: fallbackId }])

		expect(await runRfidStep(pool, database, 'VB2', 'fallback')).toEqual({ devices: 1 })
		expect(writes[0].$set).toMatchObject({
			'device_name.vi': 'Unknown',
			'device_name.cn': 'Unknown',
			'device_name.en': 'Unknown',
			created_by: fallbackId
		})
	})

	it('uses the matching source creator and falls back to the configured user', async () => {
		const fallbackId = new Types.ObjectId()
		const creatorId = new Types.ObjectId()
		const writes: Array<Record<string, unknown>> = []
		const pool = {
			request: () => ({
				input: () => undefined,
				toReadableStream: () =>
					Readable.from(
						['creator', 'missing'].map((user_code_created, index) => ({
							device_sn: `SN${index}`,
							station_no: 'CUS_VB2_WH101',
							name_vi: 'VN',
							name_en: 'EN',
							name_cn: 'CN',
							tcp_ip: '127.0.0.1',
							tcp_port: 9000,
							device_type: 'antenna',
							user_code_created
						}))
					),
				query: async () => undefined,
				cancel: () => true
			})
		}
		const database = {
			collection: (name: string) =>
				name === 'users'
					? {
							findOne: async ({ username }: { username: string }) =>
								username === 'fallback'
									? { _id: fallbackId }
									: username === 'creator'
										? { _id: creatorId }
										: null
						}
					: {
							createIndex: async () => undefined,
							updateOne: async (_filter: unknown, update: Record<string, unknown>) => {
								writes.push(update)
								return { acknowledged: true }
							}
						}
		} as unknown as mongo.Db

		expect(await runRfidStep(pool, database, 'VB2', 'fallback')).toEqual({ devices: 2 })
		expect(writes.map((write) => (write.$set as Record<string, unknown>).created_by)).toEqual([
			creatorId,
			fallbackId
		])
	})

	it('fails explicitly when the configured fallback user does not exist', async () => {
		const pool = { request: jest.fn() }
		const database = testDatabase([], [])

		await expect(runRfidStep(pool, database, 'VB2', 'missing-fallback')).rejects.toThrow(
			'Missing fallback user missing-fallback'
		)
		expect(pool.request).not.toHaveBeenCalled()
	})

	it('uses the Chinese source column and retains only the first row for a trimmed serial', async () => {
		const fallbackId = new Types.ObjectId()
		const row = {
			device_sn: ' SN1 ',
			station_no: 'CUS_VB2_WH101',
			name_vi: 'VN',
			name_en: 'EN',
			name_cn: '中文',
			tcp_ip: '127.0.0.1',
			tcp_port: 9000,
			device_type: 'antenna'
		}
		let sql = ''
		const writes: Array<{ filter: { device_sn: string }; update: { $set: { device_name: object } } }> = []
		const pool = {
			request: () => ({
				input: () => undefined,
				toReadableStream: () => Readable.from([row, { ...row, device_sn: 'SN1', name_cn: null }]),
				query: async (value: string) => {
					sql = value
				},
				cancel: () => true
			})
		}
		const database = {
			collection: (name: string) =>
				name === 'users'
					? { findOne: async () => ({ _id: fallbackId }) }
					: {
							createIndex: async () => undefined,
							updateOne: async (
								filter: { device_sn: string },
								update: { $set: { device_name: object } }
							) => {
								writes.push({ filter, update })
								return { acknowledged: true }
							}
						}
		} as unknown as mongo.Db
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
		try {
			expect(await runRfidStep(pool, database, 'VB2', 'fallback')).toEqual({ devices: 1 })
			expect(writes).toHaveLength(1)
			expect(writes[0]).toMatchObject({
				filter: { device_sn: 'SN1' },
				update: { $set: { 'device_name.vi': 'VN', 'device_name.en': 'EN', 'device_name.cn': '中文' } }
			})
			expect(sql).toMatch(/SimplifiedChinese\s+AS\s+name_cn/i)
			expect(sql).toMatch(/\buser_code_created\b/i)
			expect(sql).toMatch(/ORDER BY\s+id\s+ASC/i)
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('1 duplicate'))
		} finally {
			warn.mockRestore()
		}
	})
})
