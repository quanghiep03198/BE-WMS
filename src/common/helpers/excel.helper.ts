import { Worksheet } from 'exceljs'
import { ExcelColorPalette } from '../constants/excel-color-palette'

export type AutoFitColumnOptions = { minWidth: number; excludeColumns?: string[] }

export function autoFitColumns(this: Worksheet, { minWidth = 6, excludeColumns }: AutoFitColumnOptions) {
	this.columns.forEach((column) => {
		let maxWidth: number = 0
		if (column) {
			column.eachCell({ includeEmpty: true }, (cell) => {
				const cellWidth = cell.text.length
				maxWidth = Math.max(maxWidth, minWidth, cellWidth)
			})
			column.width = Array.isArray(excludeColumns) && excludeColumns.includes(column.key) ? minWidth : maxWidth + 2
		}
	})
}

export function getLastColumnLetter(columnCount: number): string {
	let result = ''
	let n = columnCount
	while (n > 0) {
		n--
		result = String.fromCharCode(65 + (n % 26)) + result
		n = Math.floor(n / 26)
	}
	return result
}

export function applyCommonStyles(this: Worksheet) {
	// * Cell styles

	this.eachRow({ includeEmpty: false }, (row) => {
		row.alignment = { vertical: 'middle' }
		row.eachCell({ includeEmpty: true }, (cell) => {
			cell.font = { ...cell.font, name: 'Calibri', family: 1 }
			cell.alignment = {
				horizontal: typeof cell.value === 'string' ? 'left' : typeof cell.value === 'number' ? 'right' : 'center',
				vertical: 'middle'
			}
			cell.border = {
				top: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
				left: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
				bottom: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
				right: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } }
			}
		})
	})

	this.eachColumnKey((col) => {
		col.alignment = {
			vertical: 'middle',
			horizontal: col.values.some((value) => typeof value === 'number')
				? 'right'
				: col.values.some((value) => typeof value === 'string')
					? 'left'
					: 'center'
		}
	})
}
