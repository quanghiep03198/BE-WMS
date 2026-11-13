import ExcelJS from 'exceljs'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { exportMongoMissingReport } from './export-mongo-report'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('exportMongoMissingReport', () => {
	it('exports both MongoDB collections to the expected workbook', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const dbName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		const directory = await mkdtemp(path.join(tmpdir(), 'warehouse-mongo-report-'))
		const filename = path.join(directory, 'missing.xlsx')
		let connected = false
		try {
			await client.connect()
			connected = true
			const db = client.db(dbName)
			await db.collection('manufacturing_orders').insertOne({
				mo_no: '14001',
				size_ledger: {
					'08': { order_qty: 12, stocked_in_qty: 8, total_recall_tx: 1, total_return_tx: 2, shipped_out_qty: 4 }
				}
			})
			await db.collection('purchase_orders').insertOne({
				po: 'PO1',
				shipping_progress: { '08': { order_qty: 12, shipped_out_qty: 9 } }
			})
			await db.collection('manufacturing_orders').insertOne({
				mo_no: '14002',
				size_ledger: {
					'08': { order_qty: 2, stocked_in_qty: 3, total_recall_tx: 0, total_return_tx: 0, shipped_out_qty: 0 }
				}
			})
			await db.collection('purchase_orders').insertOne({
				po: 'PO2',
				shipping_progress: { '08': { order_qty: 2, shipped_out_qty: 3 } }
			})
			expect(await exportMongoMissingReport(db, filename)).toEqual({
				manufacturingOrders: 2,
				purchaseOrders: 2,
				missingManufacturingOrders: 2,
				missingPurchaseOrders: 2
			})
			const workbook = new ExcelJS.Workbook()
			await workbook.xlsx.load(await readFile(filename))
			expect(workbook.getWorksheet('manufacturing_orders').getCell('H2').value).toBe(3)
			expect(workbook.getWorksheet('purchase_orders').getCell('E2').value).toBe(3)
			expect(workbook.getWorksheet('manufacturing_orders').getCell('H3').value).toBe(-1)
			expect(workbook.getWorksheet('purchase_orders').getCell('E3').value).toBe(-1)
		} finally {
			if (connected) await client.db(dbName).dropDatabase()
			await client.close()
			await rm(filename, { force: true })
			await rmdir(directory)
		}
	})
})
