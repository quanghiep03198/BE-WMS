import type ExcelJS from 'exceljs'

interface SizeLedger {
	stocked_in_qty: number
	total_recall_tx: number
	total_return_tx: number
}

export interface AccumulatedOrder {
	mo_no: string
	size_ledger: Record<string, SizeLedger>
}

export interface AccumulatedComparison {
	row: number
	mo_no: string
	reference: number | null
	actual: number | null
	difference: number | null
	status: 'match' | 'difference' | 'missing_mo' | 'missing_reference' | 'missing_mo_and_reference'
}

export async function compareAccumulated(
	sheet: ExcelJS.Worksheet,
	orders: Iterable<AccumulatedOrder> | AsyncIterable<AccumulatedOrder>
): Promise<AccumulatedComparison[]> {
	const headers = new Map<string, number>()
	sheet.getRow(1).eachCell((cell, index) => {
		if (typeof cell.value === 'string') {
			const header = cell.value.trim()
			if (headers.has(header)) throw new Error(`Duplicate reference header ${header}`)
			headers.set(header, index)
		}
	})
	const moColumn = headers.get('mo_no')
	const accumulatedColumn = headers.get('accumulated_qty')
	if (!moColumn || !accumulatedColumn) throw new Error('Reference workbook must contain mo_no and accumulated_qty')

	const source = new Map<string, number>()
	for await (const order of orders) {
		if (typeof order.mo_no !== 'string' || !order.mo_no.trim()) throw new Error('Invalid manufacturing order MO')
		const mo = order.mo_no.trim()
		if (source.has(mo)) throw new Error(`Duplicate manufacturing order ${mo}`)
		if (!order.size_ledger || typeof order.size_ledger !== 'object' || Array.isArray(order.size_ledger)) {
			throw new Error(`Invalid size ledger for ${mo}`)
		}
		let total = 0
		for (const [size, quantities] of Object.entries(order.size_ledger)) {
			if (!size || !quantities || typeof quantities !== 'object') throw new Error(`Invalid size ledger for ${mo}`)
			const { stocked_in_qty, total_recall_tx, total_return_tx } = quantities
			if (
				![stocked_in_qty, total_recall_tx, total_return_tx].every(
					(value) => typeof value === 'number' && Number.isFinite(value)
				)
			) {
				throw new Error(`Invalid size quantities for ${mo}, size ${size}`)
			}
			total += stocked_in_qty - total_recall_tx + total_return_tx
		}
		source.set(mo, total)
	}

	const results: AccumulatedComparison[] = []
	const seen = new Set<string>()
	sheet.eachRow((row, rowNumber) => {
		if (rowNumber === 1) return
		const value = row.getCell(moColumn).value
		if (value === null || value === '') return
		if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid MO at reference row ${rowNumber}`)
		const mo_no = value.trim()
		if (seen.has(mo_no)) throw new Error(`Duplicate reference MO ${mo_no}`)
		seen.add(mo_no)
		const cell = row.getCell(accumulatedColumn).value
		const raw = cell && typeof cell === 'object' && 'formula' in cell ? cell.result : cell
		let reference: number | null = null
		if (raw !== null && raw !== undefined) {
			if (typeof raw !== 'number' || !Number.isFinite(raw)) {
				throw new Error(`Invalid accumulated_qty at reference row ${rowNumber}`)
			}
			reference = raw
		}
		const actual = source.get(mo_no) ?? null
		const difference = reference === null || actual === null ? null : actual - reference
		const status =
			actual === null && reference === null
				? 'missing_mo_and_reference'
				: actual === null
					? 'missing_mo'
					: reference === null
						? 'missing_reference'
						: difference === 0
							? 'match'
							: 'difference'
		results.push({ row: rowNumber, mo_no, reference, actual, difference, status })
	})
	if (!results.length) throw new Error('Reference workbook contains no manufacturing orders')
	return results
}
