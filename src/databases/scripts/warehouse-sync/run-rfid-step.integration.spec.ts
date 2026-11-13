import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { runRfidStep } from './run-rfid-step'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('runRfidStep', () => {
	it('writes localized RFID device fields for the requested factory', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			let factory = ''
			let nameVi: string | null = 'VN'
			let nameEn: string | null = 'EN'
			let nameCn: string | null = 'CN'
			const pool = {
				request: () => ({
					input: (_name: string, value: string) => {
						factory = value
					},
					toReadableStream: () =>
						Readable.from([
							{
								device_sn: 'SERIAL',
								station_no: 'CUS_VB2_WH101',
								name_vi: nameVi,
								name_en: nameEn,
								name_cn: nameCn,
								tcp_ip: '127.0.0.1',
								tcp_port: 9000,
								device_type: 'antenna'
							}
						]),
					query: async () => undefined,
					cancel: () => true
				})
			}
			expect(await runRfidStep(pool, database, 'VB2')).toEqual({ devices: 1 })
			expect(factory).toBe('VB2')
			expect(await database.collection('rfid_devices').findOne({ device_sn: 'SERIAL' })).toMatchObject({
				station_no: 'CUS_VB2_WH101',
				tcp_port: '9000',
				device_name: { vi: 'VN', en: 'EN', cn: 'CN' },
				device_type: 'antenna'
			})
			nameVi = null
			nameEn = ''
			nameCn = 'Changed'
			const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
			try {
				await runRfidStep(pool, database, 'VB2')
				expect(await database.collection('rfid_devices').findOne({ device_sn: 'SERIAL' })).toMatchObject({
					device_name: { vi: 'VN', en: 'EN', cn: 'Changed' }
				})
				await database.collection('rfid_devices').deleteOne({ device_sn: 'SERIAL' })
				nameCn = null
				await runRfidStep(pool, database, 'VB2')
				expect(await database.collection('rfid_devices').findOne({ device_sn: 'SERIAL' })).toMatchObject({
					device_name: {}
				})
			} finally {
				warn.mockRestore()
			}
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
