import ExcelJS from 'exceljs'
import { mkdtemp, readFile, readdir, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { exportAccumulatedComparison } from '../export-accumulated-comparison'

describe('exportAccumulatedComparison', () => {
	it('writes reference and actual quantities without overwriting the input workbook', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'warehouse-compare-'))
		const reference = path.join(directory, 'reference.xlsx')
		const output = path.join(directory, 'comparison.xlsx')
		try {
			const workbook = new ExcelJS.Workbook()
			const sheet = workbook.addWorksheet('ngày 12')
			sheet.addRow(['mo_no', 'accumulated_qty'])
			sheet.addRow(['14ABC', { formula: '1+1', result: 2 }])
			await workbook.xlsx.writeFile(reference)
			const before = await readFile(reference)
			const result = await exportAccumulatedComparison(
				reference,
				'ngày 12',
				[{ mo_no: '14ABC', size_ledger: { '5': { stocked_in_qty: 3, total_recall_tx: 0, total_return_tx: 0 } } }],
				output
			)
			expect(result).toEqual({
				match: 0,
				difference: 1,
				missing_mo: 0,
				missing_reference: 0,
				missing_mo_and_reference: 0
			})
			const report = new ExcelJS.Workbook()
			await report.xlsx.readFile(output)
			const row = report.getWorksheet('comparison')?.getRow(2)
			expect([1, 2, 3, 4, 5, 6].map((column) => row?.getCell(column).value)).toEqual([
				2,
				'14ABC',
				2,
				3,
				1,
				'difference'
			])
			expect(await readFile(reference)).toEqual(before)
			await expect(exportAccumulatedComparison(reference, 'ngày 12', [], output)).rejects.toMatchObject({
				code: 'EEXIST'
			})
			expect((await readdir(directory)).sort()).toEqual(['comparison.xlsx', 'reference.xlsx'])
		} finally {
			await rm(reference, { force: true })
			await rm(output, { force: true })
			await rmdir(directory)
		}
	})
})
