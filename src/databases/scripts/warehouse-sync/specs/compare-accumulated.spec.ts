import ExcelJS from 'exceljs'
import { compareAccumulated } from '../compare-accumulated'

describe('compareAccumulated', () => {
	it('compares cached accumulated quantity to net inbound across all MO sizes', async () => {
		const workbook = new ExcelJS.Workbook()
		const sheet = workbook.addWorksheet('ngày 12')
		sheet.addRow(['mo_no', 'accumulated_qty'])
		sheet.addRow(['14ABC', { formula: "'[1]ngày 11'!E2", result: 13 }])
		const rows = await compareAccumulated(sheet, [
			{
				mo_no: '14ABC',
				size_ledger: {
					'5': { stocked_in_qty: 10, total_recall_tx: 2, total_return_tx: 1 },
					'6': { stocked_in_qty: 4, total_recall_tx: 0, total_return_tx: 0 }
				}
			}
		])
		expect(rows).toEqual([{ row: 2, mo_no: '14ABC', reference: 13, actual: 13, difference: 0, status: 'match' }])
	})

	it('reports discrepancies, missing orders and uncached formula results separately', async () => {
		const workbook = new ExcelJS.Workbook()
		const sheet = workbook.addWorksheet('ngày 12')
		sheet.addRow(['mo_no', 'accumulated_qty'])
		sheet.addRow(['14A', 1])
		sheet.addRow(['14B', 5])
		sheet.addRow(['14C', { formula: 'A1' }])
		const rows = await compareAccumulated(sheet, [
			{ mo_no: '14A', size_ledger: { '5': { stocked_in_qty: 3, total_recall_tx: 0, total_return_tx: 0 } } },
			{ mo_no: '14C', size_ledger: { '5': { stocked_in_qty: 2, total_recall_tx: 0, total_return_tx: 0 } } }
		])
		expect(rows).toEqual([
			{ row: 2, mo_no: '14A', reference: 1, actual: 3, difference: 2, status: 'difference' },
			{ row: 3, mo_no: '14B', reference: 5, actual: null, difference: null, status: 'missing_mo' },
			{ row: 4, mo_no: '14C', reference: null, actual: 2, difference: null, status: 'missing_reference' }
		])
	})
})
