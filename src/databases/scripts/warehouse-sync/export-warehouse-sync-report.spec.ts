import ExcelJS from 'exceljs'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { exportWarehouseSyncReport } from './export-warehouse-sync-report'

describe('exportWarehouseSyncReport', () => {
	const root = path.join(process.cwd(), '.tmp', `task-6-${randomUUID()}`)

	beforeAll(async () => {
		await mkdir(root, { recursive: true })
	})

	afterAll(async () => {
		await rm(root, { recursive: true, force: true })
	})

	async function referenceFile(
		name: string,
		rows: Array<[string, number | null]>,
		headers = ['mo_no', 'accumulated_qty']
	) {
		const workbook = new ExcelJS.Workbook()
		const sheet = workbook.addWorksheet('ngày 12')
		sheet.addRow(headers)
		for (const row of rows) sheet.addRow(row)
		const filename = path.join(root, name)
		await workbook.xlsx.writeFile(filename)
		return filename
	}

	function databaseWith(
		manufacturingOrders: object[],
		purchaseOrders: object[],
		onClose: (collection: string) => void = () => undefined
	) {
		const documents = { manufacturing_orders: manufacturingOrders, purchase_orders: purchaseOrders }
		const database = {
			collection: (name: keyof typeof documents) => ({
				find: () => {
					const rows = documents[name]
					return {
						toArray: async () => rows,
						close: async () => onClose(name)
					}
				}
			})
		}
		return database as never
	}

	const manufacturingOrders = [
		{
			mo_no: 'M1',
			size_ledger: {
				'08': {
					order_qty: 12,
					stocked_in_qty: 5,
					total_recall_tx: 0,
					total_return_tx: 0,
					shipped_out_qty: 2
				}
			}
		},
		{
			mo_no: 'M2',
			size_ledger: {
				'08': {
					order_qty: 3,
					stocked_in_qty: 3,
					total_recall_tx: 0,
					total_return_tx: 0,
					shipped_out_qty: 3
				}
			}
		},
		{
			mo_no: 'M3',
			size_ledger: {
				'08': {
					order_qty: 2,
					stocked_in_qty: 2,
					total_recall_tx: 0,
					total_return_tx: 0,
					shipped_out_qty: 1
				}
			}
		}
	]
	const purchaseOrders = [
		{ po: 'P1', shipping_progress: { '08': { order_qty: 10, shipped_out_qty: 7 } } },
		{ po: 'P2', shipping_progress: { '08': { order_qty: 1, shipped_out_qty: 1 } } }
	]

	it('writes all three sheets and reports comparison and missing-quantity totals', async () => {
		const reference = await referenceFile('reference.xlsx', [
			['M1', 5],
			['M2', 1],
			['M3', null],
			['M4', null],
			['M5', 5]
		])
		const output = path.join(root, 'combined.xlsx')
		const closed: string[] = []

		const counts = await exportWarehouseSyncReport(
			databaseWith(manufacturingOrders, purchaseOrders, (name) => closed.push(name)),
			reference,
			'ngày 12',
			output
		)

		expect(counts).toEqual({
			match: 1,
			difference: 1,
			missing_mo: 1,
			missing_reference: 1,
			missing_mo_and_reference: 1,
			manufacturingOrders: 3,
			purchaseOrders: 2,
			missingManufacturingOrders: 1,
			missingPurchaseOrders: 1
		})
		expect(closed.sort()).toEqual(['manufacturing_orders', 'purchase_orders'])

		const workbook = new ExcelJS.Workbook()
		await workbook.xlsx.load(await readFile(output))
		expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
			'accumulated_comparison',
			'manufacturing_orders',
			'purchase_orders'
		])
		const comparison = workbook.getWorksheet('accumulated_comparison')
		expect(comparison?.getRow(1).values).toEqual([
			undefined,
			'reference_row',
			'mo_no',
			'accumulated_qty',
			'actual_accumulated_qty',
			'difference',
			'status'
		])
		expect(comparison?.getRow(2).values).toEqual([undefined, 2, 'M1', 5, 5, 0, 'match'])
		expect(workbook.getWorksheet('manufacturing_orders')?.getCell('H2').value).toBe(7)
		expect(workbook.getWorksheet('purchase_orders')?.getCell('E2').value).toBe(3)
		expect(
			(await readdir(root)).filter((name) => name.startsWith('combined.xlsx.') && name.endsWith('.tmp'))
		).toEqual([])
	})

	it('rejects a missing reference workbook', async () => {
		await expect(
			exportWarehouseSyncReport(
				databaseWith(manufacturingOrders, purchaseOrders),
				path.join(root, 'missing.xlsx'),
				'ngày 12',
				path.join(root, 'missing-output.xlsx')
			)
		).rejects.toThrow()
	})

	it('rejects an invalid reference workbook', async () => {
		const invalid = path.join(root, 'invalid.xlsx')
		await writeFile(invalid, 'not an Excel workbook')
		await expect(
			exportWarehouseSyncReport(
				databaseWith(manufacturingOrders, purchaseOrders),
				invalid,
				'ngày 12',
				path.join(root, 'invalid-output.xlsx')
			)
		).rejects.toThrow()
	})

	it('rejects a reference workbook without the requested worksheet', async () => {
		const filename = path.join(root, 'wrong-sheet.xlsx')
		const workbook = new ExcelJS.Workbook()
		workbook.addWorksheet('other').addRow(['mo_no', 'accumulated_qty'])
		await workbook.xlsx.writeFile(filename)
		await expect(
			exportWarehouseSyncReport(
				databaseWith(manufacturingOrders, purchaseOrders),
				filename,
				'ngày 12',
				path.join(root, 'wrong-sheet-output.xlsx')
			)
		).rejects.toThrow(/reference sheet not found/i)
	})

	it('rejects missing accumulated-comparison headers', async () => {
		const filename = await referenceFile('wrong-headers.xlsx', [['M1', 5]], ['mo_no', 'quantity'])
		await expect(
			exportWarehouseSyncReport(
				databaseWith(manufacturingOrders, purchaseOrders),
				filename,
				'ngày 12',
				path.join(root, 'wrong-headers-output.xlsx')
			)
		).rejects.toThrow(/mo_no and accumulated_qty/i)
	})

	it('rejects empty manufacturing-order or purchase-order collections', async () => {
		const reference = await referenceFile('empty-sources.xlsx', [['M1', 5]])
		const closed: string[] = []
		await expect(
			exportWarehouseSyncReport(
				databaseWith([], purchaseOrders, (name) => closed.push(name)),
				reference,
				'ngày 12',
				path.join(root, 'empty-mo-output.xlsx')
			)
		).rejects.toThrow(/no manufacturing orders/i)
		expect(closed.sort()).toEqual(['manufacturing_orders', 'purchase_orders'])
		await expect(
			exportWarehouseSyncReport(
				databaseWith(manufacturingOrders, []),
				reference,
				'ngày 12',
				path.join(root, 'empty-po-output.xlsx')
			)
		).rejects.toThrow(/no purchase orders/i)
	})

	it('preserves an existing output and removes its temporary workbook on collision', async () => {
		const reference = await referenceFile('collision-reference.xlsx', [['M1', 5]])
		const output = path.join(root, 'collision.xlsx')
		await writeFile(output, 'existing output')

		await expect(
			exportWarehouseSyncReport(databaseWith(manufacturingOrders, purchaseOrders), reference, 'ngày 12', output)
		).rejects.toMatchObject({ code: 'EEXIST' })

		expect(await readFile(output, 'utf8')).toBe('existing output')
		expect((await readdir(root)).filter((name) => name.includes('.tmp'))).toEqual([])
	})
})
