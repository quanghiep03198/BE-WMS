import ExcelJS from 'exceljs'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { exportWarehouseSyncReport } from '../commands/export-warehouse-sync-report'

describe('exportWarehouseSyncReport', () => {
	const root = path.join(process.cwd(), '.tmp', `task-6-${randomUUID()}`)

	beforeAll(async () => {
		await mkdir(root, { recursive: true })
	})

	afterAll(async () => {
		await rm(root, { recursive: true, force: true })
	})

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

	it('exports the missing quantity sheets without a reference workbook', async () => {
		const output = path.join(root, 'without-reference.xlsx')
		await exportWarehouseSyncReport(databaseWith(manufacturingOrders, purchaseOrders), output)
		const workbook = new ExcelJS.Workbook()
		await workbook.xlsx.load(await readFile(output))
		expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['manufacturing_orders', 'purchase_orders'])
		expect(workbook.getWorksheet('purchase_orders')?.getCell('E2').value).toBe(3)
	})

	it('writes both sheets and reports missing-quantity totals', async () => {
		const output = path.join(root, 'combined.xlsx')
		const closed: string[] = []

		const counts = await exportWarehouseSyncReport(
			databaseWith(manufacturingOrders, purchaseOrders, (name) => closed.push(name)),
			output
		)

		expect(counts).toEqual({
			manufacturingOrders: 3,
			purchaseOrders: 2,
			missingManufacturingOrders: 1,
			missingPurchaseOrders: 1
		})
		expect(closed.sort()).toEqual(['manufacturing_orders', 'purchase_orders'])

		const workbook = new ExcelJS.Workbook()
		await workbook.xlsx.load(await readFile(output))
		expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['manufacturing_orders', 'purchase_orders'])
		expect(workbook.getWorksheet('manufacturing_orders')?.getCell('H2').value).toBe(7)
		expect(workbook.getWorksheet('purchase_orders')?.getCell('E2').value).toBe(3)
		expect(
			(await readdir(root)).filter((name) => name.startsWith('combined.xlsx.') && name.endsWith('.tmp'))
		).toEqual([])
	})

	it('rejects empty manufacturing-order or purchase-order collections', async () => {
		const closed: string[] = []
		await expect(
			exportWarehouseSyncReport(
				databaseWith([], purchaseOrders, (name) => closed.push(name)),
				path.join(root, 'empty-mo-output.xlsx')
			)
		).rejects.toThrow(/no manufacturing orders/i)
		expect(closed.sort()).toEqual(['manufacturing_orders', 'purchase_orders'])
		await expect(
			exportWarehouseSyncReport(databaseWith(manufacturingOrders, []), path.join(root, 'empty-po-output.xlsx'))
		).rejects.toThrow(/no purchase orders/i)
	})

	it('preserves an existing output and removes its temporary workbook on collision', async () => {
		const output = path.join(root, 'collision.xlsx')
		await writeFile(output, 'existing output')

		await expect(
			exportWarehouseSyncReport(databaseWith(manufacturingOrders, purchaseOrders), output)
		).rejects.toMatchObject({ code: 'EEXIST' })

		expect(await readFile(output, 'utf8')).toBe('existing output')
		expect((await readdir(root)).filter((name) => name.includes('.tmp'))).toEqual([])
	})
})
