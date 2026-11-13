import ExcelJS from 'exceljs'
import { buildMissingQuantityWorkbook } from '../missing-quantity-report'

describe('missing quantity report', () => {
	it('includes orders with negative discrepancies even when no size is positive', async () => {
		const workbook = await buildMissingQuantityWorkbook(
			[
				{
					mo_no: '14003',
					size_ledger: {
						'8': { order_qty: 1, stocked_in_qty: 2, total_recall_tx: 0, total_return_tx: 0, shipped_out_qty: 0 }
					}
				}
			],
			[{ po: 'PO3', shipping_progress: { '8': { order_qty: 1, shipped_out_qty: 2 } } }]
		)
		expect(workbook.getWorksheet('manufacturing_orders').getCell('H2').value).toBe(-1)
		expect(workbook.getWorksheet('purchase_orders').getCell('E2').value).toBe(-1)
	})

	it('includes orders with at least one missing size and calculates each document total from all sizes', async () => {
		const workbook = await buildMissingQuantityWorkbook(
			[
				{
					mo_no: '14001',
					size_ledger: {
						'8': { order_qty: 10, stocked_in_qty: 6, total_recall_tx: 2, total_return_tx: 1, shipped_out_qty: 3 },
						'9': { order_qty: 3, stocked_in_qty: 5, total_recall_tx: 0, total_return_tx: 0, shipped_out_qty: 0 }
					}
				},
				{
					mo_no: '14002',
					size_ledger: {
						'8': { order_qty: 1, stocked_in_qty: 1, total_recall_tx: 0, total_return_tx: 0, shipped_out_qty: 0 }
					}
				}
			],
			[
				{
					po: 'PO1',
					shipping_progress: {
						'8': { order_qty: 10, shipped_out_qty: 7 },
						'9': { order_qty: 2, shipped_out_qty: 4 }
					}
				},
				{ po: 'PO2', shipping_progress: { '8': { order_qty: 1, shipped_out_qty: 1 } } }
			]
		)

		const bytes = await workbook.xlsx.writeBuffer()
		const restored = new ExcelJS.Workbook()
		await restored.xlsx.load(bytes)
		const mo = restored.getWorksheet('manufacturing_orders')
		const po = restored.getWorksheet('purchase_orders')
		expect(mo.rowCount).toBe(3)
		expect((mo.getRow(2).values as ExcelJS.CellValue[]).slice(1)).toEqual(['14001', '8', 10, 6, 2, 1, 3, 5, 3])
		expect((mo.getRow(3).values as ExcelJS.CellValue[]).slice(1)).toEqual(['14001', '9', 3, 5, 0, 0, 0, -2, 3])
		expect(po.rowCount).toBe(3)
		expect((po.getRow(2).values as ExcelJS.CellValue[]).slice(1)).toEqual(['PO1', '8', 10, 7, 3, 1])
		expect((po.getRow(3).values as ExcelJS.CellValue[]).slice(1)).toEqual(['PO1', '9', 2, 4, -2, 1])
	})

	it('rejects missing or non-numeric quantity values instead of silently reporting zero', async () => {
		await expect(
			buildMissingQuantityWorkbook(
				[
					{
						mo_no: '14001',
						size_ledger: {
							'8': {
								order_qty: 10,
								stocked_in_qty: NaN,
								total_recall_tx: 0,
								total_return_tx: 0,
								shipped_out_qty: 0
							}
						}
					}
				],
				[]
			)
		).rejects.toThrow('14001')
	})
})
