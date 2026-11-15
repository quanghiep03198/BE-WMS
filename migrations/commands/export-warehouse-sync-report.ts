import ExcelJS from 'exceljs'
import { type mongo } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { link, open, unlink } from 'node:fs/promises'
import {
	buildMissingQuantityWorkbook,
	type ManufacturingOrderReportSource,
	type PurchaseOrderReportSource
} from './missing-quantity-report'

interface Cursor<T> {
	toArray(): Promise<T[]>
	close(): Promise<void>
}

function mergeConsecutiveEqualCells(sheet: ExcelJS.Worksheet, column: number): void {
	let startRow = 2
	let value = sheet.getCell(startRow, column).value

	for (let rowNumber = startRow + 1; rowNumber <= sheet.rowCount + 1; rowNumber++) {
		const nextValue = rowNumber <= sheet.rowCount ? sheet.getCell(rowNumber, column).value : undefined
		if (nextValue === value) continue
		if (rowNumber - startRow > 1 && value !== null && value !== undefined) {
			sheet.mergeCells(startRow, column, rowNumber - 1, column)
		}
		startRow = rowNumber
		value = nextValue
	}
}

export type WarehouseSyncReportCounts = {
	manufacturingOrders: number
	purchaseOrders: number
	missingManufacturingOrders: number
	missingPurchaseOrders: number
}

export async function exportWarehouseSyncReport(
	database: mongo.Db,
	outputFile: string
): Promise<WarehouseSyncReportCounts> {
	let manufacturingOrdersCursor: Cursor<ManufacturingOrderReportSource> | undefined
	let purchaseOrdersCursor: Cursor<PurchaseOrderReportSource> | undefined
	try {
		manufacturingOrdersCursor = database
			.collection<ManufacturingOrderReportSource>('manufacturing_orders')
			.find({}, { projection: { _id: 0, mo_no: 1, size_ledger: 1 } })
		purchaseOrdersCursor = database
			.collection<PurchaseOrderReportSource>('purchase_orders')
			.find({}, { projection: { _id: 0, po: 1, shipping_progress: 1 } })

		const [manufacturingOrders, purchaseOrders] = await Promise.all([
			manufacturingOrdersCursor.toArray(),
			purchaseOrdersCursor.toArray()
		])
		if (!manufacturingOrders.length) throw new Error('Cannot export: no manufacturing orders')
		if (!purchaseOrders.length) throw new Error('Cannot export: no purchase orders')

		const counts: WarehouseSyncReportCounts = {
			manufacturingOrders: manufacturingOrders.length,
			purchaseOrders: purchaseOrders.length,
			missingManufacturingOrders: 0,
			missingPurchaseOrders: 0
		}

		const report = new ExcelJS.Workbook()
		const missingWorkbook = await buildMissingQuantityWorkbook(manufacturingOrders, purchaseOrders)
		for (const name of ['manufacturing_orders', 'purchase_orders'] as const) {
			const source = missingWorkbook.getWorksheet(name)
			if (!source) throw new Error(`Missing workbook sheet: ${name}`)
			const target = report.addWorksheet(name)
			source.eachRow((row) => target.addRow(row.values))
		}

		const manufacturingSheet = report.getWorksheet('manufacturing_orders')
		const purchaseSheet = report.getWorksheet('purchase_orders')
		if (!manufacturingSheet || !purchaseSheet) throw new Error('Missing workbook sheets')
		const manufacturingOrderIds = new Set<string>()
		const purchaseOrderIds = new Set<string>()
		manufacturingSheet.eachRow((row, index) => {
			if (index > 1) manufacturingOrderIds.add(String(row.getCell(1).value))
		})
		purchaseSheet.eachRow((row, index) => {
			if (index > 1) purchaseOrderIds.add(String(row.getCell(1).value))
		})
		counts.missingManufacturingOrders = manufacturingOrderIds.size
		counts.missingPurchaseOrders = purchaseOrderIds.size

		mergeConsecutiveEqualCells(manufacturingSheet, 1)
		mergeConsecutiveEqualCells(manufacturingSheet, manufacturingSheet.columnCount)
		mergeConsecutiveEqualCells(purchaseSheet, 1)
		mergeConsecutiveEqualCells(purchaseSheet, purchaseSheet.columnCount)

		const temporary = `${outputFile}.${randomUUID()}.tmp`
		const handle = await open(temporary, 'wx')
		try {
			await handle.close()
			await report.xlsx.writeFile(temporary)
			await link(temporary, outputFile)
		} finally {
			await unlink(temporary)
		}
		return counts
	} finally {
		await Promise.allSettled(
			[manufacturingOrdersCursor?.close(), purchaseOrdersCursor?.close()].filter(
				(cursor): cursor is Promise<void> => cursor !== undefined
			)
		)
	}
}
