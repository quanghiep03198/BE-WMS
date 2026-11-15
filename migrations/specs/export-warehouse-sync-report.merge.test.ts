import ExcelJS from 'exceljs'
import { type mongo } from 'mongoose'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportWarehouseSyncReport } from '../commands/export-warehouse-sync-report'

function manufacturingOrder(mo_no: string, missingBySize: Array<[string, number]>) {
	return {
		mo_no,
		size_ledger: Object.fromEntries(
			missingBySize.map(([size, missing]) => [
				size,
				{
					order_qty: missing,
					stocked_in_qty: 0,
					total_recall_tx: 0,
					total_return_tx: 0,
					shipped_out_qty: 0
				}
			])
		)
	}
}

function purchaseOrder(po: string, missingBySize: Array<[string, number]>) {
	return {
		po,
		shipping_progress: Object.fromEntries(
			missingBySize.map(([size, missing]) => [size, { order_qty: missing, shipped_out_qty: 0 }])
		)
	}
}

describe('exportWarehouseSyncReport cell merging', () => {
	it('merges adjacent equal order identifiers and total missing quantities', async () => {
		const manufacturingOrders = [
			manufacturingOrder('MO-1', [
				['S', 2],
				['M', 2]
			]),
			manufacturingOrder('MO-2', [['S', 4]]),
			manufacturingOrder('MO-3', [['S', 3]]),
			manufacturingOrder('MO-4', [['S', 4]])
		]
		const purchaseOrders = [
			purchaseOrder('PO-1', [
				['S', 2],
				['M', 2]
			]),
			purchaseOrder('PO-2', [['S', 4]]),
			purchaseOrder('PO-3', [['S', 3]]),
			purchaseOrder('PO-4', [['S', 4]])
		]
		const collections = {
			manufacturing_orders: manufacturingOrders,
			purchase_orders: purchaseOrders
		}
		const database = {
			collection: (name: keyof typeof collections) => ({
				find: () => ({
					toArray: async () => collections[name],
					close: async () => {}
				})
			})
		} as unknown as mongo.Db
		const directory = await mkdtemp(join(tmpdir(), 'warehouse-sync-report-'))
		const outputFile = join(directory, 'report.xlsx')

		try {
			const counts = await exportWarehouseSyncReport(database, outputFile)
			expect(counts).toEqual({
				manufacturingOrders: 4,
				purchaseOrders: 4,
				missingManufacturingOrders: 4,
				missingPurchaseOrders: 4
			})
			const workbook = new ExcelJS.Workbook()
			await workbook.xlsx.readFile(outputFile)

			const manufacturingSheet = workbook.getWorksheet('manufacturing_orders')
			const purchaseSheet = workbook.getWorksheet('purchase_orders')
			expect(manufacturingSheet).toBeDefined()
			expect(purchaseSheet).toBeDefined()
			if (!manufacturingSheet || !purchaseSheet) throw new Error('Missing workbook sheets')

			expect(manufacturingSheet.getCell('A2').master.address).toBe('A2')
			expect(manufacturingSheet.getCell('A3').master.address).toBe('A2')
			expect(manufacturingSheet.getCell('A4').isMerged).toBe(false)
			expect(manufacturingSheet.getCell('I2').master.address).toBe('I2')
			expect(manufacturingSheet.getCell('I4').master.address).toBe('I2')
			expect(manufacturingSheet.getCell('I6').isMerged).toBe(false)

			expect(purchaseSheet.getCell('A2').master.address).toBe('A2')
			expect(purchaseSheet.getCell('A3').master.address).toBe('A2')
			expect(purchaseSheet.getCell('A4').isMerged).toBe(false)
			expect(purchaseSheet.getCell('F2').master.address).toBe('F2')
			expect(purchaseSheet.getCell('F4').master.address).toBe('F2')
			expect(purchaseSheet.getCell('F6').isMerged).toBe(false)
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	})
})
