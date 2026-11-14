import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { runFinishedGoodsEpcStep } from '../finished-goods-epcs'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('finished goods EPC staging and merge', () => {
	it('enriches raw scans, keeps missing matches staged, uses fallback references, and preserves existing fields on rerun', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			const location = new mongoose.Types.ObjectId()
			const department = new mongoose.Types.ObjectId()
			await database.collection('manufacturing_orders').insertOne({ mo_no: '14MO' })
			await database.collection('storage_locations').insertOne({ _id: location, storage_num: 'S01' })
			await database.collection('departments').insertOne({ _id: department, code: 'D01' })
			await database.collection('finished_goods_epcs_match').insertMany([
				{ epc: 'EPC1', factory_shoes_style: ' STYLE ', color_sn: ' BLACK ', size_numcode: ' 08 ' },
				{ epc: 'EPC2', factory_shoes_style: 'STYLE2', color_sn: 'WHITE', size_numcode: '09' }
			])
			const target = database.collection('finished_goods_epcs')
			await target.createIndex({ epc: 1 }, { unique: true })
			await target.insertOne({ epc: 'EPC1', scannable: false, deleted: true, created_at: new Date('2020-01-01') })
			const scan = {
				mo_no: '14MO',
				po: null,
				inbound_device_sn: 'IN',
				outbound_device_sn: null,
				last_scanned_at: '2026-11-11T03:00:00.000Z',
				inbound_at: '2026-11-11T03:00:00.000Z',
				outbound_at: null,
				storage_location: 'S01',
				assembly_line: 'D01',
				status: 'instock'
			}
			let query = ''
			const pool = {
				request: () => ({
					input: () => undefined,
					toReadableStream: () =>
						Readable.from([
							{ ...scan, epc: 'EPC1' },
							{ ...scan, epc: 'EPC2', storage_location: 'MISSING', assembly_line: 'MISSING' },
							{ ...scan, epc: 'EPC3' }
						]),
					query: async (sql: string) => {
						query = sql
					},
					cancel: () => true
				})
			}
			const options = { inboundDeviceSn: 'IN', outboundDeviceSn: 'OUT' }
			await runFinishedGoodsEpcStep(pool, database, options)
			expect(query).not.toMatch(/dv_rfidmatchmst_cust|dv_warehouseccodedet/i)
			expect(query).toMatch(/m\.mo_no\s*=\s*a\.mo_no/i)
			expect(await target.findOne({ epc: 'EPC1' })).toMatchObject({
				mo_no: '14MO',
				factory_shoes_style: 'STYLE',
				color_sn: 'BLACK',
				size_numcode: '08',
				assembly_line: department,
				storage_location: location,
				scannable: false,
				deleted: true,
				created_at: new Date('2020-01-01')
			})
			expect(await target.findOne({ epc: 'EPC2' })).toMatchObject({
				assembly_line: department,
				storage_location: location
			})
			expect(await target.findOne({ epc: 'EPC3' })).toBeNull()
			expect(await database.collection('finished_goods_epcs_staging').findOne({ epc: 'EPC3' })).toMatchObject({
				epc: 'EPC3',
				assembly_line: 'D01',
				storage_location: 'S01'
			})
			expect(warn.mock.calls.flat().join(' ')).toMatch(/match.*1/i)
			await database.collection('finished_goods_epcs_match').insertOne({
				epc: 'EPC3',
				factory_shoes_style: 'STYLE3',
				color_sn: 'BLUE',
				size_numcode: '10'
			})
			await runFinishedGoodsEpcStep(pool, database, options)
			expect(await target.findOne({ epc: 'EPC3' })).toMatchObject({
				factory_shoes_style: 'STYLE3',
				assembly_line: department,
				storage_location: location
			})
			expect(await target.countDocuments()).toBe(3)
			const beforeFailedRun = await target.findOne({ epc: 'EPC1' })
			await database
				.collection('finished_goods_epcs_match')
				.updateOne({ epc: 'EPC3' }, { $set: { size_numcode: '   ' } })
			await expect(runFinishedGoodsEpcStep(pool, database, options)).rejects.toThrow(/size_numcode/)
			expect(await target.findOne({ epc: 'EPC1' })).toEqual(beforeFailedRun)
		} finally {
			info.mockRestore()
			warn.mockRestore()
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
