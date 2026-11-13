import ExcelJS from 'exceljs'
import { mkdtemp, readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { exportMissingReport } from '../export-missing-report'

describe('exportMissingReport', () => {
	it('writes a readable workbook from both async collection cursors', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'warehouse-report-'))
		const filename = path.join(directory, 'missing.xlsx')
		try {
			async function* manufacturingOrders() {
				yield {
					mo_no: '14001',
					size_ledger: {
						'08': { order_qty: 10, stocked_in_qty: 8, total_recall_tx: 1, total_return_tx: 0, shipped_out_qty: 5 }
					}
				}
			}
			async function* purchaseOrders() {
				yield { po: 'PO1', shipping_progress: { '08': { order_qty: 10, shipped_out_qty: 7 } } }
			}
			const summary = await exportMissingReport(manufacturingOrders(), purchaseOrders(), filename)
			expect(summary).toEqual({
				manufacturingOrders: 1,
				purchaseOrders: 1,
				missingManufacturingOrders: 1,
				missingPurchaseOrders: 1
			})
			const workbook = new ExcelJS.Workbook()
			await workbook.xlsx.load(await readFile(filename))
			expect(workbook.getWorksheet('manufacturing_orders').getCell('H2').value).toBe(3)
			expect(workbook.getWorksheet('purchase_orders').getCell('E2').value).toBe(3)
		} finally {
			await rm(filename, { force: true })
			await rmdir(directory)
		}
	})

	it('rejects empty source collections rather than producing a misleading report', async () => {
		await expect(exportMissingReport([], [], path.join(tmpdir(), 'unused-warehouse-report.xlsx'))).rejects.toThrow(
			/no manufacturing orders/i
		)
	})

	it('does not replace an existing report and cleans up its temporary file', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'warehouse-report-'))
		const filename = path.join(directory, 'missing.xlsx')
		try {
			await writeFile(filename, 'previous report')
			const mo = [{ mo_no: '14001', size_ledger: {} }]
			const po = [{ po: 'PO1', shipping_progress: {} }]
			await expect(exportMissingReport(mo, po, filename)).rejects.toMatchObject({ code: 'EEXIST' })
			expect(await readFile(filename, 'utf8')).toBe('previous report')
			expect(await readdir(directory)).toEqual(['missing.xlsx'])
		} finally {
			await rm(filename, { force: true })
			await rmdir(directory)
		}
	})

	it('rejects an empty purchase order source', async () => {
		await expect(
			exportMissingReport(
				[{ mo_no: '14001', size_ledger: {} }],
				[],
				path.join(tmpdir(), 'unused-warehouse-report.xlsx')
			)
		).rejects.toThrow(/no purchase orders/i)
	})
})
