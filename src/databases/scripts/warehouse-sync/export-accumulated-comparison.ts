import ExcelJS from 'exceljs'
import { randomUUID } from 'node:crypto'
import { link, open, unlink } from 'node:fs/promises'
import { compareAccumulated, type AccumulatedComparison, type AccumulatedOrder } from './compare-accumulated'

export async function exportAccumulatedComparison(
	referenceFile: string,
	sheetName: string,
	orders: Iterable<AccumulatedOrder> | AsyncIterable<AccumulatedOrder>,
	outputFile: string
): Promise<Record<AccumulatedComparison['status'], number>> {
	const reference = new ExcelJS.Workbook()
	await reference.xlsx.readFile(referenceFile)
	const sheet = reference.getWorksheet(sheetName)
	if (!sheet) throw new Error(`Reference sheet not found: ${sheetName}`)
	const rows = await compareAccumulated(sheet, orders)
	const counts: Record<AccumulatedComparison['status'], number> = {
		match: 0,
		difference: 0,
		missing_mo: 0,
		missing_reference: 0,
		missing_mo_and_reference: 0
	}
	const report = new ExcelJS.Workbook()
	const output = report.addWorksheet('comparison')
	output.addRow(['reference_row', 'mo_no', 'accumulated_qty', 'actual_accumulated_qty', 'difference', 'status'])
	for (const row of rows) {
		counts[row.status]++
		output.addRow([row.row, row.mo_no, row.reference, row.actual, row.difference, row.status])
	}
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
}
