import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { syncMongoDailyPoProgress } from '../mongo-daily-po-progress'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('syncMongoDailyPoProgress', () => {
	it('stores one referenced PO/day ledger and keeps transaction ids across reruns', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			await database.collection('manufacturing_orders').insertOne({ mo_no: '14001' })
			await database.collection('purchase_orders').insertOne({ po: 'PO1' })
			const scans = [
				{ po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 1 },
				{ po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 2 }
			]
			expect(await syncMongoDailyPoProgress(database, scans, () => '123456')).toEqual({
				scans: 2,
				documents: 1,
				quantity: 3
			})
			await syncMongoDailyPoProgress(database, scans, () => '654321')
			const document = await database.collection('daily_po_shipping_progress').findOne({ po: 'PO1' })
			expect(document.shipping_progress).toEqual({ '14001': { '08': 3 } })
			expect(document.transaction_history).toEqual({
				'123456': { time: '10:24', packing: { '14001': { '08': 3 } }, voided: false }
			})
			expect(document.migration_source).toBe('mssql-outbound-scans-by-minute')
			expect(await database.collection('daily_po_shipping_progress').countDocuments()).toBe(1)
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})

	it('rejects missing references and refuses to replace a ledger not produced by this migration', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			const scans = [{ po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: 1 }]
			await expect(syncMongoDailyPoProgress(database, scans, () => '123456')).rejects.toThrow(/purchase order/i)
			await database.collection('purchase_orders').insertOne({ po: 'PO1' })
			await expect(syncMongoDailyPoProgress(database, scans, () => '123456')).rejects.toThrow(/manufacturing order/i)
			await database.collection('manufacturing_orders').insertOne({ mo_no: '14001' })
			await database.collection('daily_po_shipping_progress').insertOne({
				po: 'PO1',
				date: '2026-11-10',
				transaction_history: {},
				shipping_progress: { existing: true }
			})
			await expect(syncMongoDailyPoProgress(database, scans, () => '123456')).rejects.toThrow(/not created/i)
			expect(
				(await database.collection('daily_po_shipping_progress').findOne({ po: 'PO1' })).shipping_progress
			).toEqual({
				existing: true
			})
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
