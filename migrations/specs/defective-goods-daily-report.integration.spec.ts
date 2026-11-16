import {
	DefectiveGoodsDailyReport,
	DefectiveGoodsDailyReportSchema
} from '@modules/defective-goods/infrastructure/persistence/mongodb/schemas/defective-goods-daily-report.schema'
import mongoose, { type mongo } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { runDefectiveGoodsStep, type DefectiveDescriptionDependencies } from '../commands/defective-goods'

jest.mock('file-type/node', () => ({ fileTypeFromBuffer: jest.fn(), fileTypeStream: jest.fn() }))

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

function row(keyid: number, overrides: Record<string, unknown> = {}) {
	return {
		keyid,
		epc: String(keyid).padStart(24, '0'),
		ri_type: 'uhf',
		unit: 'prs',
		mo_no: 'MO-01',
		po: 'PO-01',
		brand_name: 'brand',
		factory_shoes_style: 'STYLE',
		cust_shoes_style: 'CUST',
		color_sn: 'BLACK',
		size_code: '42',
		defective_category: 'B',
		defective_location: 'A',
		defective_description: 'Defective shoe',
		shoe_source: 'A',
		assembly_line: 'Assembly A',
		sewing_line: null,
		storage_location: 'RACK-01',
		inbound_date: new Date('2026-01-02T03:04:05.000Z'),
		outbound_date: null,
		outbound_purpose: null,
		ri_cancel: 0,
		isactive: 'Y',
		user_code_created: null,
		user_code_updated: null,
		...overrides
	}
}

function pool(rows: ReturnType<typeof row>[]) {
	return {
		request: () => ({
			input: () => undefined,
			toReadableStream: () => Readable.from(rows),
			query: async () => undefined,
			cancel: () => true
		})
	}
}

integration('defective goods daily report migration', () => {
	let client: mongo.MongoClient
	let database: mongo.Db
	let dependencies: DefectiveDescriptionDependencies

	beforeEach(async () => {
		client = new mongoose.mongo.MongoClient(uri)
		await client.connect()
		database = client.db(`warehouse_sync_test_${randomUUID().replaceAll('-', '')}`)
		dependencies = {
			files: {
				upload: async () => {
					throw new Error('Unexpected image')
				},
				syncImageRefs: async () => undefined
			},
			withTransaction: async (operation) => {
				const session = client.startSession()
				try {
					await session.withTransaction(() => operation(session))
				} finally {
					await session.endSession()
				}
			}
		}
		await database.collection('departments').insertOne({
			_id: new mongoose.Types.ObjectId('650000000000000000000021'),
			name: { cn: 'Assembly A' }
		})
	})

	afterEach(async () => {
		await database.dropDatabase()
		await client.close()
	})

	it('rebuilds inbound and outbound reports for all dates after import, including deleted rows', async () => {
		const reports = database.collection('defective_goods_daily_report')
		await reports.insertMany([
			{ date: '2026-01-02', type: 'inbound', marker: 'stale' },
			{ date: '2025-01-01', type: 'inbound', marker: 'untouched' }
		])
		const rows = [
			row(1),
			row(2, { size_code: '43', ri_cancel: 1 }),
			row(3, {
				inbound_date: new Date('2026-01-03T03:00:00Z'),
				outbound_date: new Date('2026-01-04T03:00:00Z'),
				outbound_purpose: 'SHIPPING'
			}),
			row(4, { storage_location: null, inbound_date: new Date('2026-01-05T03:00:00Z') })
		]

		await runDefectiveGoodsStep(pool(rows), database, dependencies)
		let result = await reports.find({}).sort({ date: 1, type: 1 }).toArray()
		expect(result).toHaveLength(4)
		expect(result[0]).toMatchObject({ date: '2025-01-01', marker: 'untouched' })
		expect(result[1]).toMatchObject({
			date: '2026-01-02',
			type: 'inbound',
			brand_name: 'BRAND',
			storage_location: 'RACK-01',
			assembly_line: { name: { cn: 'Assembly A' } },
			size_ledger: expect.arrayContaining([
				{ size_numcode: '42', qty: 1 },
				{ size_numcode: '43', qty: 1 }
			])
		})
		expect(result[2]).toMatchObject({
			date: '2026-01-03',
			type: 'inbound',
			size_ledger: [{ size_numcode: '42', qty: 1 }]
		})
		expect(result[3]).toMatchObject({ date: '2026-01-04', type: 'outbound', outbound_purpose: 'SHIPPING' })
		const connection = new mongoose.Mongoose().createConnection().setClient(client).useDb(database.databaseName)
		const model = connection.model(DefectiveGoodsDailyReport.name, DefectiveGoodsDailyReportSchema)
		const storedReport = await model.findOne({ date: '2026-01-02', type: 'inbound' }).lean({ virtuals: true })
		expect(storedReport).toMatchObject({
			total_qty: 2,
			assembly_line: { name: { cn: 'Assembly A' } }
		})

		await runDefectiveGoodsStep(pool(rows), database, dependencies)
		result = await reports.find({}).toArray()
		expect(result).toHaveLength(4)
		expect(result.filter((item) => item.date === '2026-01-02')).toHaveLength(1)
	})

	it('does not replace reports when the source import fails', async () => {
		const reports = database.collection('defective_goods_daily_report')
		await reports.insertOne({ date: '2026-01-02', type: 'inbound', marker: 'original' })
		await expect(
			runDefectiveGoodsStep(pool([row(1, { factory_shoes_style: '' })]), database, dependencies)
		).rejects.toThrow()
		expect(await reports.findOne({ date: '2026-01-02' })).toMatchObject({ marker: 'original' })
		expect(
			(await database.listCollections().toArray()).filter((item) =>
				item.name.startsWith('defective_goods_report_staging_')
			)
		).toHaveLength(0)
	})

	it('includes records from the current date without limiting reports to the past', async () => {
		const now = new Date()
		const date = now.toISOString().slice(0, 10)
		await runDefectiveGoodsStep(pool([row(1, { inbound_date: now })]), database, dependencies)
		expect(
			await database.collection('defective_goods_daily_report').findOne({ date, type: 'inbound' })
		).toMatchObject({
			size_ledger: [{ size_numcode: '42', qty: 1 }]
		})
	})

	it('removes stale reports for a day whose imported rows no longer qualify', async () => {
		const reports = database.collection('defective_goods_daily_report')
		await runDefectiveGoodsStep(pool([row(1)]), database, dependencies)
		expect(await reports.countDocuments({ date: '2026-01-02', type: 'inbound' })).toBe(1)

		await runDefectiveGoodsStep(pool([row(1, { storage_location: null })]), database, dependencies)
		expect(await reports.countDocuments({ date: '2026-01-02', type: 'inbound' })).toBe(0)
	})

	it('rolls back deletion when inserting a replacement report fails', async () => {
		const reports = database.collection('defective_goods_daily_report')
		await reports.insertOne({ date: '2026-01-02', type: 'inbound', marker: 'original' })
		await database.command({
			collMod: 'defective_goods_daily_report',
			validator: { marker: { $exists: true } }
		})

		await expect(runDefectiveGoodsStep(pool([row(1)]), database, dependencies)).rejects.toThrow()
		expect(await reports.findOne({ date: '2026-01-02', type: 'inbound' })).toMatchObject({ marker: 'original' })
	})

	it('includes historical outbound records even if the source TTL expires them during import', async () => {
		const stream = {
			request: () => ({
				input: () => undefined,
				toReadableStream: () =>
					Readable.from(
						(async function* () {
							yield row(1, {
								outbound_date: new Date('2026-01-04T03:00:00Z'),
								outbound_purpose: 'SHIPPING'
							})
							for (let attempt = 0; attempt < 200; attempt++) {
								if (await database.collection('defective_goods').findOne({ source_keyid: 1 })) break
								await new Promise((resolve) => setTimeout(resolve, 10))
							}
							await database.collection('defective_goods').deleteOne({ source_keyid: 1 })
							yield row(2)
						})()
					),
				query: async () => undefined,
				cancel: () => true
			})
		}

		await runDefectiveGoodsStep(stream, database, dependencies)
		expect(
			await database.collection('defective_goods_daily_report').findOne({
				date: '2026-01-04',
				type: 'outbound'
			})
		).toMatchObject({ size_ledger: [{ size_numcode: '42', qty: 1 }] })
	})

	it('does not double-count a source record that expires after the snapshot but before it is reimported', async () => {
		await runDefectiveGoodsStep(pool([row(1)]), database, dependencies)
		const stream = {
			request: () => ({
				input: () => undefined,
				toReadableStream: () =>
					Readable.from(
						(async function* () {
							await database.collection('defective_goods').deleteOne({ source_keyid: 1 })
							yield row(1)
						})()
					),
				query: async () => undefined,
				cancel: () => true
			})
		}

		await runDefectiveGoodsStep(stream, database, dependencies)
		const report = await database.collection('defective_goods_daily_report').findOne({
			date: '2026-01-02',
			type: 'inbound'
		})
		expect(report).toMatchObject({ size_ledger: [{ size_numcode: '42', qty: 1 }] })
	})
})
