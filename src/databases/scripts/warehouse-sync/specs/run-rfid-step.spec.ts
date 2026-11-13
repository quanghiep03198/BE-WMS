import { type mongo } from 'mongoose'
import { Readable } from 'node:stream'
import { runRfidStep } from '../run-rfid-step'

describe('runRfidStep', () => {
	it('omits null and blank localized names without overwriting existing names', async () => {
		const writes: Array<Record<string, unknown>> = []
		const pool = {
			request: () => ({
				input: () => undefined,
				toReadableStream: () => Readable.from([{
					device_sn: 'SN1', station_no: 'CUS_VB2_WH101',
					name_vi: null, name_en: '  ', name_cn: ' 中文 ',
					tcp_ip: '127.0.0.1', tcp_port: 9000, device_type: 'antenna'
				}]),
				query: async () => undefined,
				cancel: () => true
			})
		}
		const database = { collection: () => ({
			createIndex: async () => undefined,
			updateOne: async (_filter: unknown, update: Record<string, unknown>) => {
				writes.push(update)
				return { acknowledged: true }
			}
		}) } as unknown as mongo.Db
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
		try {
			expect(await runRfidStep(pool, database, 'VB2')).toEqual({ devices: 1 })
			expect(writes[0].$set).toMatchObject({ 'device_name.cn': '中文' })
			expect(writes[0].$set).not.toHaveProperty('device_name.vi')
			expect(writes[0].$set).not.toHaveProperty('device_name.en')
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('2'))
		} finally {
			warn.mockRestore()
		}
	})

	it('uses the Chinese source column and retains only the first row for a trimmed serial', async () => {
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
				query: async (value: string) => { sql = value },
				cancel: () => true
			})
		}
		const database = {
			collection: () => ({
				createIndex: async () => undefined,
				updateOne: async (filter: { device_sn: string }, update: { $set: { device_name: object } }) => {
					writes.push({ filter, update })
					return { acknowledged: true }
				}
			})
		} as unknown as mongo.Db
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
		try {
			expect(await runRfidStep(pool, database, 'VB2')).toEqual({ devices: 1 })
			expect(writes).toHaveLength(1)
			expect(writes[0]).toMatchObject({
				filter: { device_sn: 'SN1' },
				update: { $set: { 'device_name.vi': 'VN', 'device_name.en': 'EN', 'device_name.cn': '中文' } }
			})
			expect(sql).toMatch(/SimplifiedChinese\s+AS\s+name_cn/i)
			expect(sql).toMatch(/ORDER BY\s+id\s+ASC/i)
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('1'))
		} finally {
			warn.mockRestore()
		}
	})
})
