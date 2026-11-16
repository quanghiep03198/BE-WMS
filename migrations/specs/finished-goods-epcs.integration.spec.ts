import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { runFinishedGoodsEpcStep } from '../commands/finished-goods-epcs'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('finished goods EPC staging and merge', () => {
	it('refuses another EPC run while the target is locked and leaves that lock untouched', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			const locks = database.collection<{ _id: string; owner: string }>('warehouse_sync_locks')
			await locks.insertOne({ _id: 'finished_goods_epcs', owner: 'other-run' })
			const pool = {
				request: () => {
					throw new Error('SQL must not be queried')
				}
			}
			await expect(
				runFinishedGoodsEpcStep(pool, database, { inboundDeviceSn: 'IN', outboundDeviceSn: 'OUT' })
			).rejects.toThrow(/already running/i)
			expect((await locks.findOne({ _id: 'finished_goods_epcs' }))?.owner).toBe('other-run')
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})

	it('uses insert mode only for an empty target and allows later upserts', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			await database.collection('manufacturing_orders').insertOne({ mo_no: '14MO' })
			await database.collection('storage_locations').insertOne({ storage_num: 'S01' })
			await database.collection('departments').insertOne({ code: 'D01' })
			await database.collection('finished_goods_epcs_match').insertOne({
				epc: 'EPC1',
				factory_shoes_style: ' STYLE ',
				color_sn: ' BLACK ',
				size_numcode: ' 08 '
			})
			const scan = {
				epc: 'EPC1',
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
			const pool = {
				request: () => ({
					input: () => undefined,
					toReadableStream: () => Readable.from([scan]),
					query: async () => undefined,
					cancel: () => true
				})
			}
			const options = { inboundDeviceSn: 'IN', outboundDeviceSn: 'OUT', writeMode: 'insert' as const }
			await expect(runFinishedGoodsEpcStep(pool, database, options)).resolves.toEqual({ epcs: 1 })
			const target = database.collection('finished_goods_epcs')
			const first = await target.findOne({ epc: 'EPC1' })
			expect(first).toMatchObject({
				factory_shoes_style: 'STYLE',
				color_sn: 'BLACK',
				size_numcode: '08',
				scannable: true,
				deleted: false
			})
			expect(first?.created_at).toBeInstanceOf(Date)
			await expect(runFinishedGoodsEpcStep(pool, database, options)).rejects.toThrow(/empty/i)
			await runFinishedGoodsEpcStep(pool, database, { inboundDeviceSn: 'IN', outboundDeviceSn: 'OUT' })
			expect((await target.findOne({ epc: 'EPC1' }))?._id).toEqual(first?._id)
		} finally {
			info.mockRestore()
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})

	it('rejects duplicate EPCs across concurrent batches but permits a later retry', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			await database.collection('manufacturing_orders').insertOne({ mo_no: '14MO' })
			await database.collection('storage_locations').insertOne({ storage_num: 'S01' })
			await database.collection('departments').insertOne({ code: 'D01' })
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
			let epcs = ['EPC1', 'EPC2', 'EPC1']
			const pool = {
				request: () => ({
					input: () => undefined,
					toReadableStream: () => Readable.from(epcs.map((epc) => ({ ...scan, epc }))),
					query: async () => undefined,
					cancel: () => true
				})
			}
			const options = { inboundDeviceSn: 'IN', outboundDeviceSn: 'OUT', batchSize: 2, concurrency: 2 }
			await expect(runFinishedGoodsEpcStep(pool, database, options)).rejects.toThrow(/duplicate|E11000/i)
			epcs = ['EPC1', 'EPC2']
			await expect(runFinishedGoodsEpcStep(pool, database, options)).resolves.toEqual({ epcs: 0 })
		} finally {
			info.mockRestore()
			warn.mockRestore()
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})

	it('enriches raw scans, drops staging after success, and retains staging after a failed run', async () => {
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
			expect(await database.listCollections({ name: 'finished_goods_epcs_staging' }).hasNext()).toBe(false)
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
			expect(await database.listCollections({ name: 'finished_goods_epcs_staging' }).hasNext()).toBe(true)
			expect(await database.collection('finished_goods_epcs_staging').findOne({ epc: 'EPC1' })).toMatchObject({
				epc: 'EPC1'
			})
		} finally {
			info.mockRestore()
			warn.mockRestore()
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
